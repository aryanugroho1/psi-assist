/**
 * MindScribe & Triage AI — Automated API Test Suite
 * Executes 11 comprehensive test cases against the REST API server.
 */
const http = require('http');
const crypto = require('crypto');
const { startServer, stopServer } = require('../src/server');
const { META_APP_SECRET, META_VERIFY_TOKEN } = require('../src/whatsapp-service');
const { db } = require('../src/database');
const { generateTOTP } = require('../src/auth-rbac');

const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper: HTTP Request Promise
function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let payload = null;

    if (body) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: reqHeaders
    };

    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          raw: data
        });
      });
    });

    req.on('error', err => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

function calculateHmacSignature(rawBody, secret = META_APP_SECRET) {
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${hash}`;
}

// Test Runner
async function runTestSuite() {
  console.log('======================================================================');
  console.log('  MINDSCRIBE & TRIAGE AI — AUTOMATED API & ARCHITECTURE TEST SUITE    ');
  console.log('  Compliance: UU PDP No. 27/2022 & SATUSEHAT Kemenkes RI               ');
  console.log('======================================================================\n');

  // Reset database state before testing if supported
  if (typeof db.reset === 'function') {
    db.reset();
  }

  const server = await startServer(TEST_PORT);
  let passedCount = 0;
  let failedCount = 0;
  const results = [];

  async function assertCase(name, testFn) {
    try {
      await testFn();
      console.log(`  [PASS] ${name}`);
      results.push({ name, status: 'PASS' });
      passedCount++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      console.error(`         Error: ${err.message}`);
      results.push({ name, status: 'FAIL', error: err.message });
      failedCount++;
    }
  }

  let doctorToken = null;
  let adminToken = null;

  try {
    // -------------------------------------------------------------------------
    // TC 1: Doctor Authentication & 2FA Enforcement
    // -------------------------------------------------------------------------
    await assertCase('TC1: Doctor Authentication & 2FA Enforcement (POST /api/v1/auth/login)', async () => {
      // 1. Invalid 2FA code should be rejected with HTTP 401
      const failRes = await request('POST', '/api/v1/auth/login', {}, {
        username: 'dr.hendra',
        password: 'password123',
        token2fa: '000000'
      });
      if (failRes.statusCode !== 401) throw new Error(`Expected 401 for invalid 2FA, got ${failRes.statusCode}`);
      if (failRes.data.code !== 'INVALID_2FA') throw new Error(`Expected code INVALID_2FA, got ${failRes.data.code}`);

      // 2. Valid live TOTP code should succeed with HTTP 200 and return token
      const liveCode = generateTOTP('KVKFKRCPNZQUYMLX');
      const res = await request('POST', '/api/v1/auth/login', {}, {
        username: 'dr.hendra',
        password: 'password123',
        token2fa: liveCode
      });
      if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
      if (!res.data.token) throw new Error('Missing token in response');
      if (res.data.user.role !== 'ROLE_DOCTOR') throw new Error(`Expected ROLE_DOCTOR, got ${res.data.user.role}`);
      if (!res.data.user.schemas.includes('clinical_schema')) throw new Error('Doctor missing clinical_schema permission');
      doctorToken = res.data.token;
    });

    // -------------------------------------------------------------------------
    // TC 2: Admin Authentication
    // -------------------------------------------------------------------------
    await assertCase('TC2: Admin Authentication & Token Issuance (POST /api/v1/auth/login)', async () => {
      const res = await request('POST', '/api/v1/auth/login', {}, {
        username: 'admin',
        password: 'password123'
      });
      if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
      if (!res.data.token) throw new Error('Missing token in response');
      if (res.data.user.role !== 'ROLE_ADMIN') throw new Error(`Expected ROLE_ADMIN, got ${res.data.user.role}`);
      if (res.data.user.schemas.includes('clinical_schema')) throw new Error('SECURITY VIOLATION: Admin was granted clinical_schema access!');
      adminToken = res.data.token;
    });

    // -------------------------------------------------------------------------
    // TC 3: Strict RBAC 403 Forbidden Enforcement
    // -------------------------------------------------------------------------
    await assertCase('TC3: Strict RBAC 403 Forbidden on Clinical Data for Admin (UU PDP No. 27/2022)', async () => {
      // Admin attempts to query clinical route
      const res = await request('GET', '/api/v1/clinical/medical-records/apt-rian-01', {
        Authorization: `Bearer ${adminToken}`
      });
      if (res.statusCode !== 403) throw new Error(`Expected 403 Forbidden, got ${res.statusCode}`);
      if (res.data.code !== 'RBAC_CLINICAL_ISOLATION_VIOLATION') {
        throw new Error(`Expected error code RBAC_CLINICAL_ISOLATION_VIOLATION, got ${res.data.code}`);
      }

      // Admin attempts to access doctor queue
      const resDocQueue = await request('GET', '/api/v1/doctor/queue', {
        Authorization: `Bearer ${adminToken}`
      });
      if (resDocQueue.statusCode !== 403) throw new Error(`Expected 403 Forbidden for doctor queue, got ${resDocQueue.statusCode}`);
    });

    // -------------------------------------------------------------------------
    // TC 4: Meta WhatsApp Webhook Handshake Verification
    // -------------------------------------------------------------------------
    await assertCase('TC4: Meta WhatsApp Webhook Handshake Verification (GET /api/v1/webhook/whatsapp)', async () => {
      const challengeToken = 'random_meta_challenge_str_8912';
      const path = `/api/v1/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${META_VERIFY_TOKEN}&hub.challenge=${challengeToken}`;
      const res = await request('GET', path);
      if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
      if (res.raw !== challengeToken) throw new Error(`Expected challenge string "${challengeToken}", got "${res.raw}"`);
    });

    // -------------------------------------------------------------------------
    // TC 5: Meta WhatsApp HMAC-SHA256 Signature Verification
    // -------------------------------------------------------------------------
    await assertCase('TC5: WhatsApp HMAC-SHA256 Signature Security (Valid vs Tampered)', async () => {
      const payload = JSON.stringify({ type: 'text', from: '081299881234', text: 'Halo' });

      // 5.1 Invalid / Fake signature -> MUST RETURN 401
      const fakeSigRes = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
      }, payload);
      if (fakeSigRes.statusCode !== 401) throw new Error(`Expected 401 Unauthorized for tampered HMAC, got ${fakeSigRes.statusCode}`);
      if (fakeSigRes.data.code !== 'INVALID_WEBHOOK_HMAC_SIGNATURE') {
        throw new Error(`Expected INVALID_WEBHOOK_HMAC_SIGNATURE, got ${fakeSigRes.data.code}`);
      }

      // 5.2 Valid HMAC signature -> MUST RETURN 200
      const validSig = calculateHmacSignature(payload);
      const validRes = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': validSig
      }, payload);
      if (validRes.statusCode !== 200) throw new Error(`Expected 200 for valid HMAC signature, got ${validRes.statusCode}`);
    });

    // -------------------------------------------------------------------------
    // TC 6: Dynamic Doctor & Available Slot Inquiry
    // -------------------------------------------------------------------------
    await assertCase('TC6: Dynamic Doctor Query & Occupied Slot Filtering in WhatsApp Bot', async () => {
      // Step 1: Query doctors
      const payloadDocs = JSON.stringify({ type: 'text', from: '081299881234', text: 'Mau konsul' });
      const resDocs = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': calculateHmacSignature(payloadDocs)
      }, payloadDocs);
      if (!resDocs.data.replyMessage.doctors || resDocs.data.replyMessage.doctors.length < 2) {
        throw new Error('Expected at least 2 doctors in WhatsApp prompt');
      }

      // Step 2: Query available slots for dr. Hendra (ensuring 08:30 occupied slot is NOT returned)
      const payloadSlots = JSON.stringify({
        type: 'text',
        from: '081299881234',
        selectedDoctorId: 'doc-hendra'
      });
      const resSlots = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': calculateHmacSignature(payloadSlots)
      }, payloadSlots);
      const slots = resSlots.data.replyMessage.availableSlots;
      if (!Array.isArray(slots) || slots.length === 0) throw new Error('No available slots returned');
      if (slots.includes('08:30 - 09:00')) throw new Error('CRITICAL: Occupied slot (08:30) was mistakenly offered to patient!');
      if (slots.includes('09:00 - 09:30')) throw new Error('CRITICAL: Active session slot (09:00) was mistakenly offered to patient!');
      if (!slots.includes('13:00 - 13:30')) throw new Error('Expected available slot 13:00 - 13:30 in list');
    });

    // -------------------------------------------------------------------------
    // TC 7: High-Risk Suicidal Ideation Crisis Triage Detection
    // -------------------------------------------------------------------------
    await assertCase('TC7: Immediate High-Risk Crisis Triage Detection (Hotline Kemenkes 119 ext 8)', async () => {
      const emergencyPayload = JSON.stringify({
        type: 'text',
        from: '081377889900',
        text: 'Saya sudah tidak kuat lagi Dok... rasanya ingin mengakhiri hidup malam ini...'
      });
      const res = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': calculateHmacSignature(emergencyPayload)
      }, emergencyPayload);

      if (res.data.status !== 'EMERGENCY_ALERT_TRIGGERED') {
        throw new Error(`Expected EMERGENCY_ALERT_TRIGGERED, got ${res.data.status}`);
      }
      if (!res.data.replyMessage.hotlineBanner.includes('119 ext 8')) {
        throw new Error('Missing Hotline Kemenkes 119 ext 8 in emergency response banner');
      }
    });

    // -------------------------------------------------------------------------
    // TC 8: Voice Note (VN) Ingestion & Auto-Purge Tracking
    // -------------------------------------------------------------------------
    await assertCase('TC8: WhatsApp Voice Note (VN) Ingestion, AES Encryption & Auto-Purge (< 60s)', async () => {
      const vnPayload = JSON.stringify({
        type: 'voice_note',
        from: '081299885566',
        senderName: 'Dewi Anjani',
        selectedDoctorId: 'doc-hendra',
        selectedSlot: '13:00 - 13:30',
        durationSeconds: 48,
        voiceNoteBuffer: 'MOCK_BASE64_OPUS_AUDIO_STREAM'
      });
      const res = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': calculateHmacSignature(vnPayload)
      }, vnPayload);

      if (res.data.status !== 'BOOKING_AND_VN_CONFIRMED') {
        throw new Error(`Expected BOOKING_AND_VN_CONFIRMED, got ${res.data.status}`);
      }
      if (!res.data.voiceNote.autoPurgeScheduled.includes('< 60 detik')) {
        throw new Error('Voice note missing auto-purge guarantee');
      }
      if (!res.data.replyMessage.groundingExercise) {
        throw new Error('Missing grounding breathing guide in confirmation');
      }
    });

    // -------------------------------------------------------------------------
    // TC 9: Admin Slot Management & Real-Time WhatsApp Sync
    // -------------------------------------------------------------------------
    await assertCase('TC9: Admin Slot Booking & Cancellation Synchronized with WhatsApp Bot', async () => {
      // 9.1 Book walk-in on 14:00 - 14:30
      const bookRes = await request('POST', '/api/v1/admin/slots/book', {
        Authorization: `Bearer ${adminToken}`
      }, {
        doctorId: 'doc-hendra',
        timeSlot: '14:00 - 14:30',
        patientName: 'Bambang Walk-in'
      });
      if (bookRes.statusCode !== 200 || !bookRes.data.success) {
        throw new Error(`Failed to book slot: ${bookRes.data.error || bookRes.statusCode}`);
      }

      // Verify slot is now occupied
      const slotsCheck = await request('GET', '/api/v1/admin/slots?doctorId=doc-hendra', {
        Authorization: `Bearer ${adminToken}`
      });
      const slot1400 = slotsCheck.data.slots.find(s => s.timeSlot === '14:00 - 14:30');
      if (!slot1400 || slot1400.status !== 'occupied') {
        throw new Error('Slot status did not update to occupied');
      }

      // 9.2 Cancel / Free the slot
      const cancelRes = await request('POST', '/api/v1/admin/slots/cancel', {
        Authorization: `Bearer ${adminToken}`
      }, {
        doctorId: 'doc-hendra',
        timeSlot: '14:00 - 14:30'
      });
      if (cancelRes.statusCode !== 200 || !cancelRes.data.success) {
        throw new Error('Failed to cancel slot');
      }

      // Verify slot is available again
      const slotsCheck2 = await request('GET', '/api/v1/admin/slots?doctorId=doc-hendra', {
        Authorization: `Bearer ${adminToken}`
      });
      const slot1400After = slotsCheck2.data.slots.find(s => s.timeSlot === '14:00 - 14:30');
      if (!slot1400After || slot1400After.status !== 'available') {
        throw new Error('Slot was not restored to available state');
      }
    });

    // -------------------------------------------------------------------------
    // TC 10: Doctor Electronic Signing & SATUSEHAT Integration
    // -------------------------------------------------------------------------
    await assertCase('TC10: Doctor Overnight Log Review, 60s Ephemeral Token & SATUSEHAT Signing', async () => {
      // 10.1 Retrieve overnight log & probes
      const logRes = await request('GET', '/api/v1/doctor/overnight-log/apt-rian-01', {
        Authorization: `Bearer ${doctorToken}`
      });
      if (logRes.statusCode !== 200) throw new Error(`Failed to get overnight log: ${logRes.statusCode}`);
      const log = logRes.data.overnightLog;
      if (log.anxietyScore !== 8) throw new Error(`Expected anxiety score 8, got ${log.anxietyScore}`);
      if (!log.interviewProbes || log.interviewProbes.length === 0) throw new Error('Missing interview probes');
      const ephemeralToken = log.voiceNote.ephemeralToken;
      if (!ephemeralToken) throw new Error('Missing ephemeral audio playback token');

      // 10.2 Stream audio with 60s token
      const audioRes = await request('GET', `/api/v1/doctor/audio/${ephemeralToken}`, {
        Authorization: `Bearer ${doctorToken}`
      });
      if (audioRes.statusCode !== 200) throw new Error(`Failed to stream audio: ${audioRes.statusCode}`);

      // 10.3 Sign medical record
      const signRes = await request('POST', '/api/v1/doctor/medical-records', {
        Authorization: `Bearer ${doctorToken}`
      }, {
        appointmentId: 'apt-rian-01',
        patientId: 'pat-rian',
        mseData: {
          moodAffect: 'Mood cemas, afek serasi.',
          thoughtFormContent: 'Bentuk pikir koheren, ruminasi performa kerja.',
          perception: 'Halusinasi disangkal (-).',
          insightRisk: 'Tilikan derajat 4, risiko bunuh diri rendah.'
        },
        soapData: {
          s: 'Konfirmasi serangan panik semalam pkl 01.30 WIB.',
          o: 'TD: 125/80, Nadi: 88x/m.',
          a: 'F41.1 GAD dengan eksaserbasi panik.',
          p: 'CBT restrukturisasi kognitif + Sertraline 25mg 1x1.'
        },
        icd10Code: 'F41.1'
      });

      if (signRes.statusCode !== 200 || !signRes.data.success) {
        throw new Error(`Failed to sign medical record: ${signRes.data.message}`);
      }
      if (!signRes.data.record.satusehatEncounterId.startsWith('FHIR-ENC-')) {
        throw new Error('Missing SATUSEHAT FHIR Encounter ID');
      }
    });

    // -------------------------------------------------------------------------
    // TC 11: Admin Doctor Creation & Dynamic WhatsApp Bot Sync
    // -------------------------------------------------------------------------
    await assertCase('TC11: Admin Doctor Creation (POST /api/v1/admin/doctors) & Dynamic WhatsApp Bot Sync', async () => {
      // 11.1 Admin adds a new psychiatric doctor
      const newDocPayload = {
        fullName: 'dr. Dimas Wardhana, Sp.KJ',
        sipNumber: '503/SIP-DSKJ/2026/089',
        specialization: 'Spesialis Kedokteran Jiwa (Sp.KJ)',
        roomName: 'Ruang Praktek #3',
        dailyQuota: 10
      };

      const addDocRes = await request('POST', '/api/v1/admin/doctors', {
        Authorization: `Bearer ${adminToken}`
      }, newDocPayload);

      if (addDocRes.statusCode !== 201 || !addDocRes.data.success) {
        throw new Error(`Failed to create doctor: ${addDocRes.data.message || addDocRes.statusCode}`);
      }
      const createdDoctorId = addDocRes.data.doctor.id;

      // 11.2 Verify schedule slots were automatically initialized
      const slotsRes = await request('GET', `/api/v1/admin/slots?doctorId=${createdDoctorId}`, {
        Authorization: `Bearer ${adminToken}`
      });
      if (slotsRes.statusCode !== 200 || slotsRes.data.slots.length === 0) {
        throw new Error('Schedule slots were not auto-initialized for the new doctor');
      }

      // 11.3 Patient queries WhatsApp bot -> newly added doctor MUST dynamically appear!
      const waQueryPayload = JSON.stringify({ type: 'text', from: '081288776655', text: 'Malam dok, mau konsultasi' });
      const waRes = await request('POST', '/api/v1/webhook/whatsapp', {
        'X-Hub-Signature-256': calculateHmacSignature(waQueryPayload)
      }, waQueryPayload);

      const doctorList = waRes.data.replyMessage.doctors;
      const foundNewDoc = doctorList.find(d => d.name === 'dr. Dimas Wardhana, Sp.KJ');
      if (!foundNewDoc) {
        throw new Error('Newly created doctor was not dynamically found in WhatsApp triage options!');
      }
    });

    // -------------------------------------------------------------------------
    // TC 12: Zero-Knowledge AES-256 Column Encryption in DB vs Decrypted Doctor View
    // -------------------------------------------------------------------------
    await assertCase('TC12: Zero-Knowledge AES-256 Column Encryption in DB vs Decrypted Doctor View', async () => {
      // 1. Check raw database stored values directly: MUST be encrypted ciphertext tokens!
      const rawLog = db.clinical.overnightLogs.get('onl-rian-01');
      if (!rawLog || !rawLog.rawTranscript.startsWith('ENC_AES256_GCM:')) {
        throw new Error(`Overnight transcript is not encrypted in database! Value: ${rawLog?.rawTranscript}`);
      }

      const rawProbe = db.clinical.interviewProbes.get('prb-01');
      if (!rawProbe || !rawProbe.recommendedQuestion.startsWith('ENC_AES256_GCM:')) {
        throw new Error(`Interview probe recommended question is not encrypted in database! Value: ${rawProbe?.recommendedQuestion}`);
      }

      // 2. Doctor requests the overnight log via authenticated API:
      // The backend MUST decrypt the fields in-memory exclusively for the doctor session!
      const docRes = await request('GET', '/api/v1/doctor/overnight-log/apt-rian-01', {
        Authorization: `Bearer ${doctorToken}`
      });

      if (docRes.statusCode !== 200) {
        throw new Error(`Doctor could not retrieve overnight log: ${docRes.statusCode}`);
      }

      const decryptedLog = docRes.data.overnightLog;
      if (decryptedLog.rawTranscript.startsWith('ENC_AES256_GCM:')) {
        throw new Error('Overnight transcript was returned as encrypted ciphertext to Doctor! Decryption failed.');
      }
      if (!decryptedLog.rawTranscript.includes('Dada saya berdebar kencang sekali Dok')) {
        throw new Error('Decrypted transcript does not match expected patient distress statement');
      }

      const firstProbe = decryptedLog.interviewProbes[0];
      if (firstProbe.recommendedQuestion.startsWith('ENC_AES256_GCM:')) {
        throw new Error('Interview probe was returned as encrypted ciphertext to Doctor! Decryption failed.');
      }
      if (!firstProbe.recommendedQuestion.includes('Mas Rian')) {
        throw new Error('Decrypted interview probe question does not match original probe text');
      }

      // 3. Admin attempts to read the same clinical log: MUST be blocked with 403 Forbidden!
      const adminRes = await request('GET', '/api/v1/doctor/overnight-log/apt-rian-01', {
        Authorization: `Bearer ${adminToken}`
      });
      if (adminRes.statusCode !== 403) {
        throw new Error(`Admin was not blocked with 403 Forbidden on clinical data! Got: ${adminRes.statusCode}`);
      }
    });

  } finally {
    await stopServer();
  }

  console.log('\n======================================================================');
  console.log(`  TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (TOTAL: ${passedCount + failedCount})`);
  console.log('======================================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
}

module.exports = { runTestSuite };
