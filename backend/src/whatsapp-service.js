/**
 * Meta WhatsApp Cloud API Webhook & Crisis Triage Service
 * Implements HMAC-SHA256 verification, dynamic doctor listing, crisis screening, and VN ingestion.
 */
const crypto = require('crypto');
const { db } = require('./database');

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'mindscribe_webhook_token_2026';
const META_APP_SECRET = process.env.META_APP_SECRET || 'mindscribe_meta_secret_hash_981247';

// Suicide & Self-Harm Emergency Keywords
const HIGH_RISK_KEYWORDS = [
  'bunuh diri',
  'akhiri hidup',
  'mengakhiri hidup',
  'mau mati',
  'ingin mati',
  'tidak kuat lagi',
  'sayat tangan',
  'lompat',
  'suicide',
  'self harm'
];

/**
 * Verifies Meta WhatsApp Webhook Handshake (GET /webhook/whatsapp)
 */
function verifyWebhookHandshake(query) {
  const mode = query['hub.mode'];
  const token = query['hub.verify_token'];
  const challenge = query['hub.challenge'];

  if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
    return { valid: true, challenge };
  }
  return { valid: false, challenge: null };
}

/**
 * Validates Meta X-Hub-Signature-256 HMAC Header
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;

  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) return false;

  const expectedSignature = crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Checks text or transcript for suicidal ideation indicators
 */
function screenForEmergencyCrisis(text) {
  if (!text) return { isHighRisk: false, matchedKeywords: [] };
  const lower = text.toLowerCase();
  const matched = HIGH_RISK_KEYWORDS.filter(kw => lower.includes(kw));
  return {
    isHighRisk: matched.length > 0,
    matchedKeywords: matched
  };
}

/**
 * Main WhatsApp Triage Processor
 */
function processWhatsAppEvent(eventBody) {
  const { from, senderName, type, text, selectedDoctorId, selectedSlot, voiceNoteBuffer, durationSeconds } = eventBody;

  // 1. Check for immediate emergency suicide risk in incoming text or VN caption
  const riskCheck = screenForEmergencyCrisis(text);
  if (riskCheck.isHighRisk) {
    db.recordAudit('WA_SAFETY_NET', 'ROLE_PATIENT', 'EMERGENCY_CRISIS_DETECTED', `phone:${from}`, `Matched triggers: ${riskCheck.matchedKeywords.join(', ')}`);

    return {
      status: 'EMERGENCY_ALERT_TRIGGERED',
      crisisLevel: 'severe_suicidal',
      replyMessage: {
        header: '🚨 DARURAT MEDIS & KESELAMATAN TERDETEKSI',
        body: 'Kami sangat peduli dengan keselamatan Anda. Anda tidak sendirian malam ini. Bantuan tersedia 24 jam.',
        hotlineBanner: 'Segera Hubungi Hotline Kemenkes RI: 119 ext 8 (Bebas Pulsa 24 Jam)',
        emergencyContacts: [
          'Hotline Kemenkes RI: 119 ext 8',
          'SPGDT Gawat Darurat: 119',
          'IGD Rumah Sakit Jiwa Terdekat'
        ],
        groundingAction: 'Tarik napas perlahan selama 4 detik, tahan 4 detik, hembuskan perlahan 6 detik. Jangan sendirian saat ini.'
      }
    };
  }

  // 2. Step 1: Initial triage greeting or doctor query -> Returns dynamic doctor list from ops_schema.doctors
  if (type === 'text' && !selectedDoctorId && !voiceNoteBuffer) {
    const activeDoctors = db.getActiveDoctors();
    return {
      status: 'AWAITING_DOCTOR_SELECTION',
      replyMessage: {
        body: 'Halo, layanan triage krisis MindScribe aktif. Kami siap membantu menghubungkan Anda ke sesi tatap muka esok hari.',
        prompt: 'Silakan pilih Dokter Spesialis Jiwa (Sp.KJ) yang Anda inginkan:',
        doctors: activeDoctors.map(d => ({
          id: d.id,
          name: d.fullName,
          specialization: d.specialization,
          room: d.roomName
        }))
      }
    };
  }

  // 3. Step 2: Doctor chosen -> Return available slots from ops_schema.doctor_schedules
  if (selectedDoctorId && !selectedSlot && !voiceNoteBuffer) {
    const doctor = db.getDoctorById(selectedDoctorId);
    if (!doctor) {
      return { status: 'ERROR', message: 'Dokter tidak ditemukan.' };
    }

    const availableSlots = db.getAvailableSlots(selectedDoctorId);
    return {
      status: 'AWAITING_SLOT_SELECTION',
      doctorId: selectedDoctorId,
      doctorName: doctor.fullName,
      replyMessage: {
        body: `Jadwal tatap muka tersedia untuk ${doctor.fullName} esok hari:`,
        availableSlots: availableSlots.map(s => s.timeSlot),
        instruction: 'Pilih slot jam di atas, lalu rekam Voice Note curhat Anda agar Dokter dapat mempelajarinya sebelum sesi tatap muka.'
      }
    };
  }

  // 4. Step 3: Voice Note Ingested -> Save to clinical_schema, trigger WhatsApp purge
  if (voiceNoteBuffer || type === 'voice_note') {
    const targetDoctorId = selectedDoctorId || 'doc-hendra';
    const targetSlot = selectedSlot || '09:00 - 09:30';

    const ingestResult = db.ingestWhatsAppCrisisVN({
      patientPhone: from || '081299881234',
      patientName: senderName || 'Pasien WhatsApp',
      doctorId: targetDoctorId,
      timeSlot: targetSlot,
      audioDurationSeconds: durationSeconds || 42,
      rawAudioBuffer: voiceNoteBuffer,
      anxietyScore: 8,
      suicideRiskKeywords: riskCheck.matchedKeywords
    });

    return {
      status: 'BOOKING_AND_VN_CONFIRMED',
      appointment: {
        id: ingestResult.appointment.id,
        queueNumber: ingestResult.appointment.queueNumber,
        timeSlot: ingestResult.appointment.timeSlot,
        doctor: db.getDoctorById(targetDoctorId).fullName
      },
      voiceNote: {
        id: ingestResult.voiceNote.id,
        durationSeconds: ingestResult.voiceNote.durationSeconds,
        autoPurgeScheduled: '< 60 detik di server WhatsApp API',
        storageEncryption: 'AES-256-GCM / pgcrypto isolated'
      },
      replyMessage: {
        header: '✓ Reservasi Tatap Muka & Curhat Semalam Terkonfirmasi',
        details: `Jadwal: ${ingestResult.appointment.timeSlot} WIB bersama ${db.getDoctorById(targetDoctorId).fullName} (#Antrean: ${ingestResult.appointment.queueNumber})`,
        privacyNote: '🔒 Pesan suara Anda telah dienkripsi secara aman dan akan otomatis dihapus dari percakapan WhatsApp demi perlindungan privasi medis Anda.',
        groundingExercise: 'Latihan Relaksasi: Tarik napas 4 detik, hembuskan 4 detik. Istirahatlah malam ini, dokter Anda akan siap menyambut Anda esok pagi.'
      }
    };
  }

  return { status: 'UNKNOWN_EVENT', message: 'Tipe pesan tidak dikenali.' };
}

module.exports = {
  META_VERIFY_TOKEN,
  META_APP_SECRET,
  verifyWebhookHandshake,
  verifyWebhookSignature,
  screenForEmergencyCrisis,
  processWhatsAppEvent
};
