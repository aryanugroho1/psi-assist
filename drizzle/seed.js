/**
 * Seed SQLite database for Drizzle Studio & MindScribe Platform
 * Fully synchronized dual schema (ops_schema & clinical_schema)
 */
const Database = require('better-sqlite3');
const path = require('path');
const { encryptClinicalField } = require('../backend/src/crypto-vault');

const dbPath = path.resolve(__dirname, '..', 'mindscribe.db');
const db = new Database(dbPath);

console.log(`[Seed] Initializing SQLite database at: ${dbPath}`);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// 1. Create tables
db.exec(`
  DROP TABLE IF EXISTS clinical_interview_probes;
  DROP TABLE IF EXISTS clinical_voice_notes;
  DROP TABLE IF EXISTS clinical_medical_records;
  DROP TABLE IF EXISTS clinical_overnight_logs;
  DROP TABLE IF EXISTS ops_billing_transactions;
  DROP TABLE IF EXISTS ops_appointments;
  DROP TABLE IF EXISTS ops_doctor_schedules;
  DROP TABLE IF EXISTS ops_patients;
  DROP TABLE IF EXISTS ops_doctors;
  DROP TABLE IF EXISTS ops_audit_logs;

  CREATE TABLE ops_doctors (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    sip_number TEXT NOT NULL UNIQUE,
    specialization TEXT DEFAULT 'Spesialis Kedokteran Jiwa (Sp.KJ)',
    room_name TEXT NOT NULL,
    daily_quota INTEGER DEFAULT 12,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE ops_doctor_schedules (
    id TEXT PRIMARY KEY,
    doctor_id TEXT NOT NULL REFERENCES ops_doctors(id) ON DELETE CASCADE,
    schedule_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    patient_name TEXT,
    locked_by_admin INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE ops_patients (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    age INTEGER,
    phone_whatsapp TEXT NOT NULL UNIQUE,
    registration_source TEXT DEFAULT 'whatsapp_triage',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE ops_appointments (
    id TEXT PRIMARY KEY,
    queue_number TEXT NOT NULL,
    patient_id TEXT NOT NULL REFERENCES ops_patients(id),
    doctor_id TEXT NOT NULL REFERENCES ops_doctors(id),
    appointment_date TEXT NOT NULL,
    time_slot TEXT NOT NULL,
    operational_status TEXT DEFAULT 'scheduled',
    payment_status TEXT DEFAULT 'unpaid',
    has_overnight_log INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE ops_billing_transactions (
    id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL REFERENCES ops_appointments(id),
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    payment_status TEXT DEFAULT 'unpaid',
    invoice_number TEXT UNIQUE,
    paid_at TEXT
  );

  CREATE TABLE ops_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL,
    action_type TEXT NOT NULL,
    resource_accessed TEXT NOT NULL,
    details TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE clinical_overnight_logs (
    id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL UNIQUE,
    patient_id TEXT NOT NULL,
    distress_time TEXT NOT NULL,
    anxiety_score INTEGER NOT NULL,
    somatic_symptoms TEXT NOT NULL,
    raw_transcript TEXT,
    crisis_level TEXT DEFAULT 'moderate',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE clinical_voice_notes (
    id TEXT PRIMARY KEY,
    overnight_log_id TEXT NOT NULL REFERENCES clinical_overnight_logs(id) ON DELETE CASCADE,
    duration_seconds INTEGER NOT NULL,
    audio_storage_uri TEXT NOT NULL,
    encryption_key_id TEXT NOT NULL,
    whatsapp_message_id TEXT,
    whatsapp_purged_at TEXT,
    ephemeral_playback_token TEXT,
    token_expires_at INTEGER,
    auto_purge_scheduled_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE clinical_interview_probes (
    id TEXT PRIMARY KEY,
    overnight_log_id TEXT NOT NULL REFERENCES clinical_overnight_logs(id) ON DELETE CASCADE,
    probe_order INTEGER NOT NULL,
    badge_title TEXT NOT NULL,
    timestamp_badge TEXT NOT NULL,
    audio_offset_seconds REAL NOT NULL,
    recommended_question TEXT NOT NULL,
    clinical_rationale TEXT NOT NULL
  );

  CREATE TABLE clinical_medical_records (
    id TEXT PRIMARY KEY,
    appointment_id TEXT NOT NULL UNIQUE,
    doctor_id TEXT NOT NULL,
    patient_id TEXT NOT NULL,
    mse_data TEXT NOT NULL,
    soap_data TEXT NOT NULL,
    icd10_code TEXT NOT NULL,
    satusehat_encounter_id TEXT,
    satusehat_sync_status TEXT DEFAULT 'synced',
    signed_by_doctor_name TEXT NOT NULL,
    signed_by_doctor_sip TEXT NOT NULL,
    signed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_locked INTEGER DEFAULT 1
  );
`);

console.log('[Seed] Tables created successfully.');

// 2. Insert Seed Data
const today = new Date().toISOString().split('T')[0];

// Doctors
const insertDoc = db.prepare(`INSERT INTO ops_doctors (id, full_name, sip_number, specialization, room_name, daily_quota) VALUES (?, ?, ?, ?, ?, ?)`);
insertDoc.run('doc-hendra', 'dr. Hendra, Sp.KJ', '503/SIP-DSKJ/2026/042', 'Spesialis Kedokteran Jiwa (Sp.KJ)', 'Ruang Praktek #1', 12);
insertDoc.run('doc-rina', 'dr. Rina Suryani, Sp.KJ', '503/SIP-DSKJ/2026/058', 'Kepala Rawat Jalan & Psikiater', 'Ruang Praktek #2', 10);
insertDoc.run('doc-dimas', 'dr. Dimas Wardhana, Sp.KJ', '503/SIP-DSKJ/2026/089', 'Spesialis Kedokteran Jiwa (Sp.KJ)', 'Ruang Praktek #3', 10);

// Patients (13 patients synchronized)
const insertPatient = db.prepare(`INSERT INTO ops_patients (id, full_name, age, phone_whatsapp, registration_source) VALUES (?, ?, ?, ?, ?)`);
const patients = [
  // dr. Hendra's patients (7)
  ['pat-budi', 'Budi Santoso', 45, '081299881001', 'walk_in'],
  ['pat-rian', 'Rian', 27, '081299881234', 'whatsapp_triage'],
  ['pat-dewi', 'Dewi Sartika', 34, '081299881002', 'whatsapp_triage'],
  ['pat-dimas', 'Dimas Prasetyo', 39, '081299881003', 'walk_in'],
  ['pat-siti', 'Siti Nurhaliza', 22, '081299881004', 'whatsapp_triage'],
  ['pat-maya', 'Maya Indah', 29, '081299881005', 'walk_in'],
  ['pat-kevin', 'Kevin Hartanto', 31, '081299881006', 'walk_in'],
  // dr. Rina's patients (6)
  ['pat-fauzi', 'Ahmad Fauzi', 41, '081388772001', 'walk_in'],
  ['pat-ratna', 'Ratna Sari', 28, '081388772002', 'whatsapp_triage'],
  ['pat-fajar', 'Fajar Nugraha', 35, '081388772003', 'walk_in'],
  ['pat-mega', 'Mega Utami', 26, '081388772004', 'walk_in'],
  ['pat-bambang', 'Bambang Susanto', 50, '081388772005', 'walk_in'],
  ['pat-cindy', 'Cindy Claudia', 23, '081388772006', 'whatsapp_triage']
];
patients.forEach(p => insertPatient.run(...p));

// Appointments (13 appointments)
const insertApt = db.prepare(`INSERT INTO ops_appointments (id, queue_number, patient_id, doctor_id, appointment_date, time_slot, operational_status, payment_status, has_overnight_log) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const appointments = [
  // dr. Hendra (7 appointments)
  ['apt-budi-00', '#A-00', 'pat-budi', 'doc-hendra', today, '08:30 - 09:00', 'completed', 'paid', 0],
  ['apt-rian-01', '#A-01', 'pat-rian', 'doc-hendra', today, '09:00 - 09:30', 'in_session', 'paid', 1],
  ['apt-dewi-02', '#A-02', 'pat-dewi', 'doc-hendra', today, '09:45 - 10:15', 'called', 'paid', 1],
  ['apt-dimas-03', '#A-03', 'pat-dimas', 'doc-hendra', today, '10:30 - 11:00', 'waiting', 'unpaid', 0],
  ['apt-siti-04', '#A-04', 'pat-siti', 'doc-hendra', today, '11:15 - 11:45', 'waiting', 'unpaid', 1],
  ['apt-maya-05', '#A-05', 'pat-maya', 'doc-hendra', today, '13:30 - 14:00', 'scheduled', 'unpaid', 0],
  ['apt-kevin-06', '#A-06', 'pat-kevin', 'doc-hendra', today, '14:30 - 15:00', 'scheduled', 'unpaid', 0],
  // dr. Rina (6 appointments)
  ['apt-fauzi-01', '#B-01', 'pat-fauzi', 'doc-rina', today, '10:00 - 10:30', 'completed', 'paid', 0],
  ['apt-ratna-02', '#B-02', 'pat-ratna', 'doc-rina', today, '10:30 - 11:00', 'in_session', 'paid', 1],
  ['apt-fajar-03', '#B-03', 'pat-fajar', 'doc-rina', today, '11:30 - 12:00', 'waiting', 'unpaid', 0],
  ['apt-mega-04', '#B-04', 'pat-mega', 'doc-rina', today, '13:00 - 13:30', 'scheduled', 'unpaid', 0],
  ['apt-bambang-05', '#B-05', 'pat-bambang', 'doc-rina', today, '13:30 - 14:00', 'scheduled', 'unpaid', 0],
  ['apt-cindy-06', '#B-06', 'pat-cindy', 'doc-rina', today, '14:30 - 15:00', 'scheduled', 'unpaid', 1]
];
appointments.forEach(a => insertApt.run(...a));

// Doctor Schedules (12 slots for Hendra, 11 slots for Rina = 23 slots total)
const insertSlot = db.prepare(`INSERT INTO ops_doctor_schedules (id, doctor_id, schedule_date, time_slot, status, patient_name, locked_by_admin) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const slots = [
  // dr. Hendra (12 slots: 7 occupied/session, 1 break, 4 available)
  ['sch-h-1', 'doc-hendra', today, '08:30 - 09:00', 'occupied', 'Budi Santoso (#A-00)', 0],
  ['sch-h-2', 'doc-hendra', today, '09:00 - 09:30', 'session', 'Rian (27 thn) - #A-01', 0],
  ['sch-h-3', 'doc-hendra', today, '09:45 - 10:15', 'occupied', 'Dewi Sartika (34 thn) - #A-02', 0],
  ['sch-h-4', 'doc-hendra', today, '10:30 - 11:00', 'occupied', 'Dimas Prasetyo (39 thn) - #A-03', 0],
  ['sch-h-5', 'doc-hendra', today, '11:15 - 11:45', 'occupied', 'Siti Nurhaliza (22 thn) - #A-04', 0],
  ['sch-h-6', 'doc-hendra', today, '12:00 - 13:00', 'break', 'ISHOMA (Istirahat Dokter)', 1],
  ['sch-h-7', 'doc-hendra', today, '13:00 - 13:30', 'available', null, 0],
  ['sch-h-8', 'doc-hendra', today, '13:30 - 14:00', 'occupied', 'Maya Indah (29 thn) - #A-05', 0],
  ['sch-h-9', 'doc-hendra', today, '14:00 - 14:30', 'available', null, 0],
  ['sch-h-10', 'doc-hendra', today, '14:30 - 15:00', 'occupied', 'Kevin Hartanto (31 thn) - #A-06', 0],
  ['sch-h-11', 'doc-hendra', today, '15:00 - 15:30', 'available', null, 0],
  ['sch-h-12', 'doc-hendra', today, '15:30 - 16:00', 'available', null, 0],

  // dr. Rina (11 slots: 6 occupied/session, 1 break, 4 available)
  ['sch-r-1', 'doc-rina', today, '10:00 - 10:30', 'occupied', 'Ahmad Fauzi (#B-01)', 0],
  ['sch-r-2', 'doc-rina', today, '10:30 - 11:00', 'occupied', 'Ratna Sari (#B-02)', 0],
  ['sch-r-3', 'doc-rina', today, '11:00 - 11:30', 'available', null, 0],
  ['sch-r-4', 'doc-rina', today, '11:30 - 12:00', 'occupied', 'Fajar Nugraha (#B-03)', 0],
  ['sch-r-5', 'doc-rina', today, '12:00 - 13:00', 'break', 'ISHOMA (Istirahat Dokter)', 1],
  ['sch-r-6', 'doc-rina', today, '13:00 - 13:30', 'occupied', 'Mega Utami (#B-04)', 0],
  ['sch-r-7', 'doc-rina', today, '13:30 - 14:00', 'occupied', 'Bambang Susanto (#B-05)', 0],
  ['sch-r-8', 'doc-rina', today, '14:00 - 14:30', 'available', null, 0],
  ['sch-r-9', 'doc-rina', today, '14:30 - 15:00', 'occupied', 'Cindy Claudia (#B-06)', 0],
  ['sch-r-10', 'doc-rina', today, '15:00 - 15:30', 'available', null, 0],
  ['sch-r-11', 'doc-rina', today, '15:30 - 16:00', 'available', null, 0]
];
slots.forEach(s => insertSlot.run(...s));

// Billing Transactions
const insertBill = db.prepare(`INSERT INTO ops_billing_transactions (id, appointment_id, amount, payment_method, payment_status, invoice_number, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
const bills = [
  ['bill-00', 'apt-budi-00', 400000, 'cash', 'paid', 'INV-20260922-000', new Date().toISOString()],
  ['bill-01', 'apt-rian-01', 450000, 'qris', 'paid', 'INV-20260922-001', new Date().toISOString()],
  ['bill-02', 'apt-dewi-02', 450000, 'qris', 'paid', 'INV-20260922-002', new Date().toISOString()],
  ['bill-03', 'apt-dimas-03', 400000, 'cash', 'unpaid', 'INV-20260922-003', null],
  ['bill-04', 'apt-siti-04', 450000, 'qris', 'unpaid', 'INV-20260922-004', null],
  ['bill-05', 'apt-maya-05', 400000, 'cash', 'unpaid', 'INV-20260922-005', null],
  ['bill-06', 'apt-kevin-06', 400000, 'cash', 'unpaid', 'INV-20260922-006', null],
  ['bill-07', 'apt-fauzi-01', 400000, 'cash', 'paid', 'INV-20260922-007', new Date().toISOString()],
  ['bill-08', 'apt-ratna-02', 450000, 'qris', 'paid', 'INV-20260922-008', new Date().toISOString()],
  ['bill-09', 'apt-fajar-03', 400000, 'cash', 'unpaid', 'INV-20260922-009', null],
  ['bill-10', 'apt-mega-04', 400000, 'cash', 'unpaid', 'INV-20260922-010', null],
  ['bill-11', 'apt-bambang-05', 400000, 'cash', 'unpaid', 'INV-20260922-011', null],
  ['bill-12', 'apt-cindy-06', 450000, 'qris', 'unpaid', 'INV-20260922-012', null]
];
bills.forEach(b => insertBill.run(...b));

// Audit Logs
const insertAudit = db.prepare(`INSERT INTO ops_audit_logs (user_id, user_role, action_type, resource_accessed, details, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
insertAudit.run('doc-hendra', 'ROLE_DOCTOR', 'AUTH_SUCCESS', 'clinical_schema', 'dr. Hendra connected to clinical workspace', new Date().toISOString());
insertAudit.run('adm-siti', 'ROLE_ADMIN', 'OPS_READ', 'ops_schema.appointments', 'Retrieved today queue (13 patients)', new Date().toISOString());
insertAudit.run('WA_GATEWAY', 'ROLE_PATIENT', 'VOICE_NOTE_INGESTED', 'clinical_schema.voice_notes', 'Patient Rian VN ingested and encrypted AES-256', new Date().toISOString());

// =========================================================================
// CLINICAL DATA SEEDING (AES-256-GCM COLUMN ENCRYPTED FOR UU PDP COMPLIANCE)
// In raw database & Drizzle Studio, all clinical text is encrypted ciphertext.
// Platform administrators cannot read patient crisis confessions or probes.
// =========================================================================

const rawDistressText = 'Dada saya berdebar kencang sekali Dok... rasanya seperti mau mati sesak napas... besok harus masuk kerja tapi takut sekali...';
const rawSomaticList = '["palpitasi hebat", "tremor tangan", "insomnia", "ruminasi kerja"]';

const insertOvernight = db.prepare(`INSERT INTO clinical_overnight_logs (id, appointment_id, patient_id, distress_time, anxiety_score, somatic_symptoms, raw_transcript, crisis_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
insertOvernight.run(
  'onl-rian-01',
  'apt-rian-01',
  'pat-rian',
  new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
  8,
  encryptClinicalField(rawSomaticList),
  encryptClinicalField(rawDistressText),
  'moderate'
);

const insertVN = db.prepare(`INSERT INTO clinical_voice_notes (id, overnight_log_id, duration_seconds, audio_storage_uri, encryption_key_id, whatsapp_message_id, whatsapp_purged_at, ephemeral_playback_token, token_expires_at, auto_purge_scheduled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
insertVN.run(
  'vn-rian-01',
  'onl-rian-01',
  42,
  'vault://encrypted/2026/09/22/vn-rian-01.aes',
  'kms-key-psi-0922',
  'wamid.HBgLMDg5ODcx...==',
  new Date(Date.now() - 6.9 * 3600 * 1000).toISOString(),
  'ephem-tok-89123-valid',
  Date.now() + 60000,
  new Date(Date.now() + 24 * 3600 * 1000).toISOString()
);

const insertProbe = db.prepare(`INSERT INTO clinical_interview_probes (id, overnight_log_id, probe_order, badge_title, timestamp_badge, audio_offset_seconds, recommended_question, clinical_rationale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

insertProbe.run(
  'prb-01',
  'onl-rian-01',
  1,
  'Gejala Somatik Panik (Palpitasi & Tremor)',
  '[00:14]',
  14.2,
  encryptClinicalField('Mas Rian, di rekaman suara semalam Anda mengeluhkan dada berdebar kencang dan tangan gemetar hebat saat mau tidur. Berapa lama debarannya berlangsung semalam?'),
  encryptClinicalField('Membedakan eksaserbasi panic attack nokturnal dengan aritmia kardiologi.')
);

insertProbe.run(
  'prb-02',
  'onl-rian-01',
  2,
  'Pemicu Kognitif & Ruminasi Masa Depan',
  '[00:26]',
  26.5,
  encryptClinicalField('Semalam Anda menyebutkan pikiran terus berputar takut membuat kesalahan di tempat kerja sampai takut dipecat. Apakah ada kejadian nyata kemarin di kantor?'),
  encryptClinicalField('Mengukur derajat ruminasi cemas (GAD) vs distorsi kognitif katastrofik.')
);

insertProbe.run(
  'prb-03',
  'onl-rian-01',
  3,
  'Klarifikasi Afek Kematian vs Impuls Suisidal',
  '[00:38]',
  38.0,
  encryptClinicalField('Di akhir pesan suara, Anda sempat berucap rasanya mau mati. Saya ingin memastikan: apakah itu rasa takut fisik karena panik hebat, atau ada pikiran keputusasaan untuk mengakhiri hidup?'),
  encryptClinicalField('Validasi mutlak penapisan risiko bunuh diri.')
);

// Additional overnight logs for Siti and Dewi
insertOvernight.run(
  'onl-dewi-01',
  'apt-dewi-02',
  'pat-dewi',
  new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
  7,
  encryptClinicalField('["insomnia kronis", "ketegangan otot leher", "kelelahan mental"]'),
  encryptClinicalField('Dok, sudah 3 minggu tidur saya terganggu sekali, tiap bangun kepala tegang dan berat untuk beraktivitas...'),
  'moderate'
);

insertOvernight.run(
  'onl-siti-01',
  'apt-siti-04',
  'pat-siti',
  new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  6,
  encryptClinicalField('["cemas ujian akhir", "mual pagi hari", "gangguan konsentrasi"]'),
  encryptClinicalField('Selamat pagi Dok, saya mahasiswa tingkat akhir, belakangan sangat cemas memikirkan skripsi dan sering mual mendadak saat mau bimbingan...'),
  'mild'
);

const insertMedRec = db.prepare(`INSERT INTO clinical_medical_records (id, appointment_id, doctor_id, patient_id, mse_data, soap_data, icd10_code, satusehat_encounter_id, satusehat_sync_status, signed_by_doctor_name, signed_by_doctor_sip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

const plainMSE = '{"moodAffect":"Mood cemas, afek serasi.","thoughtFormContent":"Bentuk pikir koheren, ruminasi kerja.","perception":"Halusinasi disangkal (-).","insightRisk":"Tilikan derajat 4, risiko bunuh diri rendah."}';
const plainSOAP = '{"s":"Pasien mengonfirmasi serangan panik semalam pkl 01.30 WIB.","o":"TD: 125/80 mmHg, Nadi: 88x/m.","a":"F41.1 Gangguan Cemas Menyeluruh (GAD)","p":"Psikoterapi CBT + Sertraline 25mg 1x1."}';

insertMedRec.run(
  'med-rec-01',
  'apt-budi-00',
  'doc-hendra',
  'pat-budi',
  encryptClinicalField('{"moodAffect":"Eutimik, stabil.","thoughtFormContent":"Koheren, tidak ada waham.","perception":"Halusinasi (-).","insightRisk":"Tilikan 6."}'),
  encryptClinicalField('{"s":"Kontrol rutin bulanan, tidur membaik.","o":"TD: 120/80 mmHg.","a":"F32.0 Episode Depresif Ringan (Remisi Parsial)","p":"Lanjut Escitalopram 10mg."}'),
  'F32.0',
  'FHIR-ENC-90100',
  'synced',
  'dr. Hendra, Sp.KJ',
  '503/SIP-DSKJ/2026/042'
);

insertMedRec.run(
  'med-rec-02',
  'apt-fauzi-01',
  'doc-rina',
  'pat-fauzi',
  encryptClinicalField('{"moodAffect":"Mood distimik, afek tumpul.","thoughtFormContent":"Koheren.","perception":"Halusinasi (-).","insightRisk":"Tilikan 5."}'),
  encryptClinicalField('{"s":"Pasien melaporkan semangat kerja mulai pulih.","o":"TD: 130/85 mmHg.","a":"F34.1 Distimia","p":"Psikoterapi suportif + Fluoxetine 20mg."}'),
  'F34.1',
  'FHIR-ENC-90200',
  'synced',
  'dr. Rina Suryani, Sp.KJ',
  '503/SIP-DSKJ/2026/058'
);

console.log('[Seed] Database seeded with 13 synchronized patients and schedules across both doctors successfully!');
db.close();
