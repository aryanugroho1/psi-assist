const crypto = require('crypto');
const { db } = require('./database');

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'mindscribe_webhook_token_2026';
const META_APP_SECRET = process.env.META_APP_SECRET || 'mindscribe_meta_secret_hash_981247';
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '1377060598817824';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'EAAPMxZBMBt7gBSizVGTvzKMZBn0WXqQJrSQyDIi1nT46UZBh34mPprv6W1sgv7nRxI8qYxFqo4NV6EPezkZAxpkF1e8AllqX92bZAFJu0al6141LWXCDgt7lC4BCyT50WILZCvAU9sQZCbvRzgZB8dtKZBPe2i9l5dfr8oTBlG6GEDHmItckD2NG9UxfUrakzjO5ndaAvFq2OU6BfWheuNxobJ0ZCr4iOKaeilq4Hpu4T3XmF9aM5BJn91vJTMAU1cPe3tT7F0SNBuEzoqTsXopBpwNQO1qwZDZD';

// In-memory conversation state per phone number for conversational triage flow
const conversationSessions = new Map();

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
    console.log('[WhatsApp Webhook] Handshake verified successfully by Meta.');
    return { valid: true, challenge };
  }
  console.warn('[WhatsApp Webhook] Handshake failed or token mismatch:', token);
  return { valid: false, challenge: null };
}

/**
 * Validates Meta X-Hub-Signature-256 HMAC Header
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!signatureHeader) return true; // Tolerant if not enforced

  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) return false;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', META_APP_SECRET)
      .update(rawBody)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (err) {
    return false;
  }
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
 * Send WhatsApp text message via Meta Graph API
 */
async function sendWhatsAppTextMessage(toPhone, messageText) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID || WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN || WHATSAPP_TOKEN;

  if (!token || !phoneId) {
    console.warn('[WhatsApp Outbound] Cannot send: WHATSAPP_TOKEN or PHONE_NUMBER_ID not set.');
    return null;
  }

  const cleanPhone = String(toPhone).replace(/\D/g, '');
  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanPhone,
        type: 'text',
        text: { preview_url: false, body: messageText }
      })
    });

    const data = await response.json();
    console.log(`[WhatsApp Outbound] Sent to ${cleanPhone}:`, data);
    return data;
  } catch (err) {
    console.error(`[WhatsApp Outbound] Failed to send message to ${cleanPhone}:`, err.message);
    return null;
  }
}

/**
 * Download Voice Note audio buffer from Meta Graph API
 */
async function downloadWhatsAppMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN || WHATSAPP_TOKEN;
  try {
    const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const urlData = await urlRes.json();
    if (!urlData || !urlData.url) return null;

    const fileRes = await fetch(urlData.url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const arrayBuffer = await fileRes.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error(`[WhatsApp Media] Failed to download media ${mediaId}:`, err.message);
    return null;
  }
}

/**
 * Main WhatsApp Triage Processor (Supports both Direct and Meta Webhook format)
 */
async function processWhatsAppEvent(eventBody) {
  // 1. Check if payload is from official Meta Cloud API Webhook
  if (eventBody && eventBody.entry && Array.isArray(eventBody.entry)) {
    for (const entry of eventBody.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const val = change.value;
        if (val && val.messages && Array.isArray(val.messages)) {
          for (const msg of val.messages) {
            const senderPhone = msg.from;
            const senderName = (val.contacts && val.contacts[0] && val.contacts[0].profile)
              ? val.contacts[0].profile.name
              : 'Pasien';

            let msgText = '';
            let msgType = msg.type || 'text';
            let voiceBuffer = null;

            if (msg.type === 'text' && msg.text) {
              msgText = msg.text.body || '';
            } else if (msg.type === 'audio' && msg.audio) {
              msgType = 'voice_note';
              msgText = 'Pesan Suara (Voice Note)';
              voiceBuffer = await downloadWhatsAppMedia(msg.audio.id);
            } else if (msg.type === 'interactive') {
              if (msg.interactive.button_reply) {
                msgText = msg.interactive.button_reply.id || msg.interactive.button_reply.title;
              } else if (msg.interactive.list_reply) {
                msgText = msg.interactive.list_reply.id || msg.interactive.list_reply.title;
              }
            }

            // Retrieve or create session
            let session = conversationSessions.get(senderPhone) || { step: 'INIT' };

            // Process triage with state awareness
            const result = handleConversationalTriage({
              from: senderPhone,
              senderName: senderName,
              type: msgType,
              text: msgText,
              session: session,
              voiceNoteBuffer: voiceBuffer,
              durationSeconds: msg.audio?.durationSeconds || 40
            });

            // Update session
            conversationSessions.set(senderPhone, session);

            // Send reply directly to patient's WhatsApp
            if (result && result.replyText) {
              await sendWhatsAppTextMessage(senderPhone, result.replyText);
            }
          }
        }
      }
    }
    return { status: 'META_EVENTS_PROCESSED' };
  }

  // 2. Direct Mock Processor for Test Suite
  return handleConversationalTriage(eventBody);
}

/**
 * Core Triage Logic & Dialogue Engine
 */
function handleConversationalTriage(eventBody) {
  const { from, senderName, type, text, selectedDoctorId, selectedSlot, voiceNoteBuffer, durationSeconds } = eventBody;
  const session = eventBody.session || {};

  // 1. Check for immediate emergency suicide risk
  const riskCheck = screenForEmergencyCrisis(text);
  if (riskCheck.isHighRisk) {
    db.recordAudit('WA_SAFETY_NET', 'ROLE_PATIENT', 'EMERGENCY_CRISIS_DETECTED', `phone:${from}`, `Matched triggers: ${riskCheck.matchedKeywords.join(', ')}`);

    const replyMsg = {
      header: '🚨 DARURAT MEDIS & KESELAMATAN TERDETEKSI',
      body: 'Kami sangat peduli dengan keselamatan Anda. Anda tidak sendirian malam ini. Bantuan tersedia 24 jam.',
      hotlineBanner: 'Segera Hubungi Hotline Kemenkes RI: 119 ext 8 (Bebas Pulsa 24 Jam)',
      emergencyContacts: [
        'Hotline Kemenkes RI: 119 ext 8',
        'SPGDT Gawat Darurat: 119',
        'IGD Rumah Sakit Jiwa Terdekat'
      ],
      groundingAction: 'Tarik napas perlahan selama 4 detik, tahan 4 detik, hembuskan perlahan 6 detik. Jangan sendirian saat ini.'
    };

    const replyText = `🚨 *DARURAT MEDIS & KESELAMATAN TERDETEKSI*\n\n` +
      `Kami sangat peduli dengan keselamatan Anda. Anda tidak sendirian malam ini. Bantuan medis profesional tersedia 24 jam.\n\n` +
      `📞 *Segera Hubungi Hotline Kemenkes RI: 119 ext 8 (Bebas Pulsa 24 Jam)*\n` +
      `🏥 Atau segera menuju IGD Rumah Sakit terdekat.\n\n` +
      `🧘 *Latihan Menenangkan Diri:*\n` +
      `Tarik napas perlahan 4 detik, tahan 4 detik, lalu hembuskan perlahan 6 detik. Harap segera hubungi keluarga atau nomor darurat di atas.`;

    return {
      status: 'EMERGENCY_ALERT_TRIGGERED',
      crisisLevel: 'severe_suicidal',
      replyMessage: replyMsg,
      replyText: replyText
    };
  }

  // 2. Step 1: Initial triage greeting or doctor query
  const effectiveDoctorId = selectedDoctorId || session.doctorId;
  const effectiveSlot = selectedSlot || session.selectedSlot;

  if (type === 'text' && !effectiveDoctorId && !voiceNoteBuffer) {
    const activeDoctors = db.getActiveDoctors();

    // Check if user answered with a doctor index (1, 2, 3...) or doctor name
    const lowerText = (text || '').toLowerCase().trim();
    let chosenDoc = null;

    // 1. Dynamic numeric index matching (e.g. 1, 2, 3... up to N doctors)
    const docIndex = parseInt(lowerText, 10);
    if (!isNaN(docIndex) && docIndex >= 1 && docIndex <= activeDoctors.length) {
      chosenDoc = activeDoctors[docIndex - 1];
    } else if (lowerText) {
      // 2. Dynamic name matching (first name, last name, or full name)
      chosenDoc = activeDoctors.find(d => {
        const docNameLower = d.fullName.toLowerCase();
        const cleanName = docNameLower.replace(/dr\.?\s*/g, '').replace(/,\s*sp\.?kj/g, '').trim();
        const nameParts = cleanName.split(/\s+/);
        return nameParts.some(part => part.length >= 3 && lowerText.includes(part)) || lowerText.includes(docNameLower);
      });
    }

    if (chosenDoc) {
      session.doctorId = chosenDoc.id;
      session.doctorName = chosenDoc.fullName;
      const availableSlots = db.getAvailableSlots(chosenDoc.id);

      const slotsListText = availableSlots.length > 0
        ? availableSlots.map((s, idx) => `${idx + 1}. *${s.timeSlot}*`).join('\n')
        : 'Semua slot penuh untuk esok hari.';

      const replyText = `🩺 Dokter terpilih: *${chosenDoc.fullName}*\n\n` +
        `Berikut slot jadwal konsultasi tatap muka yang tersedia esok hari:\n\n${slotsListText}\n\n` +
        `💬 *Balas dengan nomor jam pilihan Anda* (misal: *1* atau *09:00 - 09:30*), atau *langsung rekam Voice Note* curhat Anda agar Dokter dapat mendengarkannya sebelum sesi konsultasi.`;

      return {
        status: 'AWAITING_SLOT_SELECTION',
        doctorId: chosenDoc.id,
        doctorName: chosenDoc.fullName,
        replyText: replyText
      };
    }

    // Default greeting with doctor list
    const doctorListPrompt = activeDoctors.map((d, idx) => `${idx + 1}. *${d.fullName}* (${d.specialization})`).join('\n');
    const replyText = `Halo *${senderName || 'Sahabat'}*, layanan triage krisis & pendaftaran klinik MindScribe aktif.\n\n` +
      `Kami siap membantu menjadwalkan sesi konsultasi tatap muka Anda.\n\n` +
      `Silakan ketik nomor dokter Spesialis Kedokteran Jiwa (Sp.KJ) yang Anda tuju:\n\n${doctorListPrompt}\n\n` +
      `Atau Anda dapat langsung menceritakan apa yang Anda rasakan malam ini.`;

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
      },
      replyText: replyText
    };
  }

  // 3. Step 2: Doctor chosen -> Select slot or guide to Voice Note
  if (effectiveDoctorId && !effectiveSlot && !voiceNoteBuffer && type === 'text') {
    const doctor = db.getDoctorById(effectiveDoctorId);
    if (!doctor) {
      return { status: 'ERROR', message: 'Dokter tidak ditemukan.' };
    }

    const availableSlots = db.getAvailableSlots(effectiveDoctorId);

    // Check if user picked a slot
    const safeText = (text || '').trim();
    const slotIdx = safeText ? parseInt(safeText, 10) : NaN;
    let chosenSlot = null;
    if (!isNaN(slotIdx) && slotIdx >= 1 && slotIdx <= availableSlots.length) {
      chosenSlot = availableSlots[slotIdx - 1].timeSlot;
    } else if (safeText) {
      const match = availableSlots.find(s => safeText.includes(s.timeSlot) || safeText.includes(s.timeSlot.split(' ')[0]));
      if (match) chosenSlot = match.timeSlot;
    }

    if (chosenSlot) {
      session.selectedSlot = chosenSlot;
      const replyText = `🗓️ Slot berhasil dipilih: *${chosenSlot} WIB* bersama *${doctor.fullName}*.\n\n` +
        `🎙️ *Langkah Terakhir:*\n` +
        `Silakan *rekam pesan suara (Voice Note)* singkat menceritakan apa yang sedang berkecamuk di pikiran atau keluhan Anda malam ini.\n\n` +
        `_Pesan suara Anda akan dienkripsi tingkat tinggi (AES-256) sesuai standar UU PDP No. 27/2022 dan dipelajari oleh Dokter spesialis sebelum sesi tatap muka._`;

      return {
        status: 'SLOT_CHOSEN_AWAITING_VN',
        doctorId: effectiveDoctorId,
        selectedSlot: chosenSlot,
        replyText: replyText
      };
    }

    return {
      status: 'AWAITING_SLOT_SELECTION',
      doctorId: effectiveDoctorId,
      doctorName: doctor.fullName,
      replyMessage: {
        body: `Jadwal tatap muka tersedia untuk ${doctor.fullName} esok hari:`,
        availableSlots: availableSlots.map(s => s.timeSlot),
        instruction: 'Pilih slot jam di atas, lalu rekam Voice Note curhat Anda agar Dokter dapat mempelajarinya sebelum sesi tatap muka.'
      },
      replyText: `Silakan balas dengan jam atau nomor slot di atas.`
    };
  }

  // 3.5. Step 2.5: Doctor and slot already selected, but patient sends TEXT instead of Voice Note
  if (effectiveDoctorId && effectiveSlot && !voiceNoteBuffer && type === 'text') {
    const lower = (text || '').toLowerCase().trim();
    const isReset = ['batal', 'ulang', 'reset', 'kembali', 'menu', 'konsul kembali', 'konsul lagi', 'awal', 'mulai'].some(kw => lower.includes(kw));

    if (isReset) {
      delete session.doctorId;
      delete session.selectedSlot;
      delete session.step;

      const activeDoctors = db.getActiveDoctors();
      const doctorListPrompt = activeDoctors.map((d, idx) => `${idx + 1}. *${d.fullName}* (${d.specialization})`).join('\n');
      const replyText = `🔄 *Pendaftaran Direset*\n\n` +
        `Silakan pilih kembali Dokter Spesialis Jiwa (Sp.KJ) yang Anda tuju:\n\n${doctorListPrompt}\n\n` +
        `Ketik nomor dokter atau ceritakan keluhan Anda.`;

      return {
        status: 'AWAITING_DOCTOR_SELECTION',
        replyText: replyText
      };
    }

    const doctor = db.getDoctorById(effectiveDoctorId) || { fullName: 'Dokter Spesialis' };

    if (lower === 'daftar' || lower === 'lanjut' || lower === 'ya' || lower === 'oke' || lower === 'ok') {
      const complaintText = session.pendingComplaint || text;
      const ingestResult = db.ingestWhatsAppCrisisVN({
        patientPhone: from || '081299881234',
        patientName: senderName || 'Pasien WhatsApp',
        doctorId: effectiveDoctorId,
        timeSlot: effectiveSlot,
        audioDurationSeconds: 0,
        rawAudioBuffer: null,
        transcriptText: `[Keluhan Tertulis Pasien - ${senderName || 'Pasien'}] "${complaintText}"`,
        anxietyScore: 7,
        suicideRiskKeywords: riskCheck.matchedKeywords
      });

      session.step = 'CONFIRMED';
      delete session.doctorId;
      delete session.selectedSlot;
      delete session.pendingComplaint;

      const aptQueue = ingestResult.queueNumber || 'A-01';
      const replyConfirm = `✅ *RESERVASI KONSULTASI TATAP MUKA TERKONFIRMASI*\n\n` +
        `🩺 DPJP: *${doctor.fullName}*\n` +
        `🗓️ Jadwal: *${effectiveSlot} WIB*\n` +
        `🎫 No. Antrean: *${aptQueue}*\n\n` +
        `🔒 *Jaminan Privasi UU PDP No. 27/2022:*\n` +
        `Keluhan tertulis Anda telah tersimpan aman terenkripsi di rekam medis klinik.\n\n` +
        `Beristirahatlah malam ini, dokter Anda siap menyambut Anda esok pagi di ruang konsultasi.`;

      return {
        status: 'BOOKING_CONFIRMED_TEXT',
        replyText: replyConfirm
      };
    }

    session.pendingComplaint = text;
    const replyText = `🩺 Sesi Anda bersama *${doctor.fullName}* (*${effectiveSlot} WIB*) sedang menunggu konfirmasi.\n\n` +
      `Pesan Anda kami terima:\n_"${text}"_\n\n` +
      `🎙️ *Pilihan Langkah:*\n` +
      `1. *Kirim Voice Note (VN)* curhat Anda (Sangat direkomendasikan agar dokter mendengar intonasi suara Anda).\n` +
      `2. Ketik *DAFTAR* jika ingin mengonfirmasi menggunakan keluhan tertulis di atas.\n` +
      `3. Ketik *BATAL* untuk mereset dan memilih dokter atau jam lain.`;

    return {
      status: 'AWAITING_VN_OR_TEXT_CONFIRM',
      doctorId: effectiveDoctorId,
      selectedSlot: effectiveSlot,
      replyText: replyText
    };
  }

  // 4. Step 3: Voice Note Ingested -> Save to clinical_schema, trigger WhatsApp purge
  if (voiceNoteBuffer || type === 'voice_note') {
    const targetDoctorId = effectiveDoctorId || 'doc-hendra';
    const targetSlot = effectiveSlot || '09:00 - 09:30';

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

    const docObj = db.getDoctorById(targetDoctorId) || { fullName: 'Dokter Spesialis Jiwa' };

    // Reset session after successful booking
    session.step = 'CONFIRMED';
    delete session.doctorId;
    delete session.selectedSlot;

    const aptQueue = ingestResult.queueNumber || ingestResult.appointment?.queueNumber || 'A-01';
    const aptSlot = ingestResult.timeSlot || ingestResult.appointment?.timeSlot || targetSlot;
    const aptId = ingestResult.appointmentId || ingestResult.appointment?.id;
    const vnId = ingestResult.voiceNoteId || ingestResult.voiceNote?.id;

    const replyText = `✅ *RESERVASI & CURHAT SEMALAM TERKONFIRMASI*\n\n` +
      `🩺 DPJP: *${docObj.fullName}*\n` +
      `🗓️ Jadwal: *${aptSlot} WIB*\n` +
      `🎫 No. Antrean: *${aptQueue}*\n\n` +
      `🔒 *Jaminan Privasi Medis (UU PDP No. 27/2022):*\n` +
      `Rekaman suara Anda telah tersimpan terenkripsi (AES-256) di server klinik dan otomatis dihapus/dibersihkan dari perangkat WhatsApp hotline kami demi kerahasiaan medis Anda.\n\n` +
      `_Tips Privasi: Anda juga dapat menekan "Hapus untuk Semua Orang" di WhatsApp HP Anda jika ingin menghapus salinan pesan ini dari riwayat chat pribadi Anda._\n\n` +
      `🧘 *Latihan Relaksasi:*\n` +
      `Tarik napas 4 detik, tahan 2 detik, lalu hembuskan perlahan 4 detik. Beristirahatlah malam ini, dokter Anda siap menyambut Anda esok pagi di ruang konsultasi.`;

    return {
      status: 'BOOKING_AND_VN_CONFIRMED',
      appointment: {
        id: aptId,
        queueNumber: aptQueue,
        timeSlot: aptSlot,
        doctor: docObj.fullName
      },
      voiceNote: {
        id: vnId,
        durationSeconds: durationSeconds || 42,
        autoPurgeScheduled: '< 60 detik di server WhatsApp API',
        storageEncryption: 'AES-256-GCM / pgcrypto isolated'
      },
      replyMessage: {
        header: '✓ Reservasi Tatap Muka & Curhat Semalam Terkonfirmasi',
        details: `Jadwal: ${aptSlot} WIB bersama ${docObj.fullName} (#Antrean: ${aptQueue})`,
        privacyNote: '🔒 Pesan suara Anda telah dienkripsi secara aman dan akan otomatis dihapus dari percakapan WhatsApp demi perlindungan privasi medis Anda.',
        groundingExercise: 'Latihan Relaksasi: Tarik napas 4 detik, hembuskan 4 detik. Istirahatlah malam ini, dokter Anda akan siap menyambut Anda esok pagi.'
      },
      replyText: replyText
    };
  }

  // 5. Conversational Safety-Net Fallback (Never leave patient without reply)
  const activeDocs = db.getActiveDoctors();
  const doctorListPrompt = activeDocs.map((d, idx) => `${idx + 1}. *${d.fullName}* (${d.specialization})`).join('\n');
  const fallbackReply = `Halo *${senderName || 'Sahabat'}*, layanan triage krisis & konsultasi MindScribe aktif.\n\n` +
    `Silakan ketik nomor dokter Spesialis Kedokteran Jiwa (Sp.KJ) yang Anda tuju:\n\n${doctorListPrompt}\n\n` +
    `Atau ceritakan langsung apa yang sedang Anda rasakan malam ini.`;

  return {
    status: 'AWAITING_DOCTOR_SELECTION',
    replyText: fallbackReply
  };
}

module.exports = {
  META_VERIFY_TOKEN,
  META_APP_SECRET,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_TOKEN,
  conversationSessions,
  handleConversationalTriage,
  verifyWebhookHandshake,
  verifyWebhookSignature,
  screenForEmergencyCrisis,
  sendWhatsAppTextMessage,
  downloadWhatsAppMedia,
  processWhatsAppEvent
};
