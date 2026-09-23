-- =============================================================================
-- MindScribe & Triage AI — Production Database Schema & DDL
-- Dual-Schema Isolation Compliant with UU PDP No. 27/2022 & SATUSEHAT Kemenkes RI
-- Target RDBMS: PostgreSQL 14+ with pgcrypto
-- =============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. SCHEMAS
CREATE SCHEMA IF NOT EXISTS ops_schema;
CREATE SCHEMA IF NOT EXISTS clinical_schema;

-- =============================================================================
-- 3. POSTGRESQL NATIVE ROLES & PERMISSION BOUNDARIES (RBAC)
-- =============================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mindscribe_admin_role') THEN
        CREATE ROLE mindscribe_admin_role;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mindscribe_doctor_role') THEN
        CREATE ROLE mindscribe_doctor_role;
    END IF;
END $$;

-- ops_schema: Admin & Doctor have operational access
GRANT USAGE ON SCHEMA ops_schema TO mindscribe_admin_role, mindscribe_doctor_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ops_schema TO mindscribe_admin_role;
GRANT SELECT, UPDATE ON ALL TABLES IN SCHEMA ops_schema TO mindscribe_doctor_role;

-- clinical_schema: ONLY Doctors and Medical AI services have access.
-- STRICT REVOCATION for Admin Role (Complies with UU PDP No. 27/2022 Art. 28)
GRANT USAGE ON SCHEMA clinical_schema TO mindscribe_doctor_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA clinical_schema TO mindscribe_doctor_role;
REVOKE ALL PRIVILEGES ON SCHEMA clinical_schema FROM mindscribe_admin_role;

-- =============================================================================
-- 4. OPS_SCHEMA TABLES (Operational, Schedules, Receptionist & Billing)
-- =============================================================================

-- 4.1 Doctors Registry
CREATE TABLE IF NOT EXISTS ops_schema.doctors (
    id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    sip_number VARCHAR(60) NOT NULL UNIQUE,
    specialization VARCHAR(100) DEFAULT 'Spesialis Kedokteran Jiwa (Sp.KJ)',
    room_name VARCHAR(50) NOT NULL,
    daily_quota INT DEFAULT 12,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4.2 Doctor Availability Schedules & Real-time Slots
CREATE TABLE IF NOT EXISTS ops_schema.doctor_schedules (
    id VARCHAR(36) PRIMARY KEY,
    doctor_id VARCHAR(36) NOT NULL REFERENCES ops_schema.doctors(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL, -- e.g. '09:00 - 09:30'
    status VARCHAR(20) NOT NULL DEFAULT 'available', -- 'available', 'occupied', 'session', 'break'
    locked_by_admin BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doctor_slot UNIQUE (doctor_id, schedule_date, time_slot)
);

-- 4.3 Patient Demographics
CREATE TABLE IF NOT EXISTS ops_schema.patients (
    id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    age INT,
    phone_whatsapp VARCHAR(25) NOT NULL UNIQUE,
    registration_source VARCHAR(30) DEFAULT 'whatsapp_triage', -- 'whatsapp_triage', 'walk_in', 'pwa_intake', 'referral'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4.4 Clinic Consultation Appointments
CREATE TABLE IF NOT EXISTS ops_schema.appointments (
    id VARCHAR(36) PRIMARY KEY,
    queue_number VARCHAR(10) NOT NULL, -- e.g. '#A-01'
    patient_id VARCHAR(36) NOT NULL REFERENCES ops_schema.patients(id) ON DELETE RESTRICT,
    doctor_id VARCHAR(36) NOT NULL REFERENCES ops_schema.doctors(id) ON DELETE RESTRICT,
    appointment_date DATE NOT NULL,
    time_slot VARCHAR(20) NOT NULL,
    operational_status VARCHAR(30) DEFAULT 'scheduled', -- 'scheduled', 'waiting', 'in_session', 'completed', 'cancelled'
    has_overnight_log BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4.5 Billing Transactions & Cashier
CREATE TABLE IF NOT EXISTS ops_schema.billing_transactions (
    id VARCHAR(36) PRIMARY KEY,
    appointment_id VARCHAR(36) NOT NULL REFERENCES ops_schema.appointments(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL, -- 'qris', 'cash', 'insurance', 'pending'
    payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid', -- 'paid', 'unpaid', 'refunded'
    invoice_number VARCHAR(50) UNIQUE,
    paid_at TIMESTAMP WITH TIME ZONE
);

-- 4.6 Immutable Security Audit Trail
CREATE TABLE IF NOT EXISTS ops_schema.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    resource_accessed VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45),
    details TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 5. CLINICAL_SCHEMA TABLES (Medical Records, Voice Notes & Evidence Grounding)
-- =============================================================================

-- 5.1 Overnight Crisis Distress Ingestion
CREATE TABLE IF NOT EXISTS clinical_schema.overnight_logs (
    id VARCHAR(36) PRIMARY KEY,
    appointment_id VARCHAR(36) NOT NULL UNIQUE,
    patient_id VARCHAR(36) NOT NULL,
    distress_time TIMESTAMP WITH TIME ZONE NOT NULL,
    anxiety_score INT CHECK (anxiety_score BETWEEN 1 AND 10),
    somatic_symptoms JSONB, -- ['palpitation', 'tremor', 'insomnia']
    raw_transcript_encrypted BYTEA, -- Encrypted using pgp_sym_encrypt
    crisis_level VARCHAR(20) DEFAULT 'moderate', -- 'mild', 'moderate', 'severe_suicidal'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5.2 Voice Notes (Encrypted Storage & Zero Data Retention Purge Tracking)
CREATE TABLE IF NOT EXISTS clinical_schema.voice_notes (
    id VARCHAR(36) PRIMARY KEY,
    overnight_log_id VARCHAR(36) NOT NULL REFERENCES clinical_schema.overnight_logs(id) ON DELETE CASCADE,
    duration_seconds INT NOT NULL,
    audio_storage_uri TEXT NOT NULL, -- Encrypted S3/Vault URI
    encryption_key_id VARCHAR(64) NOT NULL,
    whatsapp_message_id VARCHAR(100),
    whatsapp_purged_at TIMESTAMP WITH TIME ZONE, -- Proof of < 60s deletion from Meta WhatsApp API
    ephemeral_playback_token VARCHAR(64),
    token_expires_at TIMESTAMP WITH TIME ZONE, -- Max 60-second TTL
    auto_purge_scheduled_at TIMESTAMP WITH TIME ZONE, -- Max 24h after consultation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5.3 Click-to-Verify Deep Dive Interview Probes
CREATE TABLE IF NOT EXISTS clinical_schema.interview_probes (
    id VARCHAR(36) PRIMARY KEY,
    overnight_log_id VARCHAR(36) NOT NULL REFERENCES clinical_schema.overnight_logs(id) ON DELETE CASCADE,
    probe_order INT NOT NULL,
    badge_title VARCHAR(100) NOT NULL,
    timestamp_badge VARCHAR(10) NOT NULL, -- e.g. '[00:14]'
    audio_offset_seconds FLOAT NOT NULL,
    recommended_question TEXT NOT NULL,
    clinical_rationale TEXT NOT NULL
);

-- 5.4 Medical Records (MSE & SOAP JSONB + SATUSEHAT Encounter Tracking)
CREATE TABLE IF NOT EXISTS clinical_schema.medical_records (
    id VARCHAR(36) PRIMARY KEY,
    appointment_id VARCHAR(36) NOT NULL UNIQUE,
    doctor_id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NOT NULL,
    mse_data JSONB NOT NULL,
    soap_data JSONB NOT NULL,
    icd10_code VARCHAR(20) NOT NULL, -- e.g. 'F41.1'
    satusehat_encounter_id VARCHAR(64), -- 'FHIR-ENC-XXXXX'
    satusehat_sync_status VARCHAR(20) DEFAULT 'synced',
    signed_by_doctor_name VARCHAR(100) NOT NULL,
    signed_by_doctor_sip VARCHAR(60) NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_locked BOOLEAN DEFAULT TRUE
);

-- =============================================================================
-- 6. PERFORMANCE & AUDIT INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_patients_phone ON ops_schema.patients(phone_whatsapp);
CREATE INDEX IF NOT EXISTS idx_schedules_date_status ON ops_schema.doctor_schedules(doctor_id, schedule_date, status);
CREATE INDEX IF NOT EXISTS idx_appointments_date_doc ON ops_schema.appointments(appointment_date, doctor_id);
CREATE INDEX IF NOT EXISTS idx_overnight_appointment ON clinical_schema.overnight_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_appointment ON clinical_schema.medical_records(appointment_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON ops_schema.audit_logs(timestamp DESC);

-- =============================================================================
-- 7. INITIAL CLINICAL SEED DATA
-- =============================================================================

-- Seed Doctors
INSERT INTO ops_schema.doctors (id, full_name, sip_number, specialization, room_name, daily_quota)
VALUES
    ('doc-hendra', 'dr. Hendra, Sp.KJ', '503/SIP-DSKJ/2026/042', 'Spesialis Kedokteran Jiwa (Sp.KJ)', 'Ruang Praktek #1', 12),
    ('doc-rina', 'dr. Rina Suryani, Sp.KJ', '503/SIP-DSKJ/2026/058', 'Kepala Rawat Jalan & Psikiater', 'Ruang Praktek #2', 10)
ON CONFLICT (id) DO NOTHING;

-- Seed Patient (Rian)
INSERT INTO ops_schema.patients (id, full_name, age, phone_whatsapp, registration_source)
VALUES
    ('pat-rian', 'Rian', 27, '081299881234', 'whatsapp_triage')
ON CONFLICT (id) DO NOTHING;

-- Seed Appointment (Rian with dr. Hendra)
INSERT INTO ops_schema.appointments (id, queue_number, patient_id, doctor_id, appointment_date, time_slot, operational_status, has_overnight_log)
VALUES
    ('apt-rian-01', '#A-01', 'pat-rian', 'doc-hendra', CURRENT_DATE, '09:00 - 09:30', 'in_session', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Billing (Rian)
INSERT INTO ops_schema.billing_transactions (id, appointment_id, amount, payment_method, payment_status, invoice_number, paid_at)
VALUES
    ('bill-rian-01', 'apt-rian-01', 450000.00, 'qris', 'paid', 'INV-20260922-001', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Seed Doctor Schedule Slots for dr. Hendra (Today)
INSERT INTO ops_schema.doctor_schedules (id, doctor_id, schedule_date, time_slot, status)
VALUES
    ('sch-h-1', 'doc-hendra', CURRENT_DATE, '08:30 - 09:00', 'occupied'),
    ('sch-h-2', 'doc-hendra', CURRENT_DATE, '09:00 - 09:30', 'session'),
    ('sch-h-3', 'doc-hendra', CURRENT_DATE, '09:45 - 10:15', 'occupied'),
    ('sch-h-4', 'doc-hendra', CURRENT_DATE, '10:30 - 11:00', 'occupied'),
    ('sch-h-5', 'doc-hendra', CURRENT_DATE, '11:15 - 11:45', 'occupied'),
    ('sch-h-6', 'doc-hendra', CURRENT_DATE, '12:00 - 13:00', 'break'),
    ('sch-h-7', 'doc-hendra', CURRENT_DATE, '13:00 - 13:30', 'available'),
    ('sch-h-8', 'doc-hendra', CURRENT_DATE, '13:30 - 14:00', 'occupied'),
    ('sch-h-9', 'doc-hendra', CURRENT_DATE, '14:00 - 14:30', 'available'),
    ('sch-h-10', 'doc-hendra', CURRENT_DATE, '14:30 - 15:00', 'occupied'),
    ('sch-h-11', 'doc-hendra', CURRENT_DATE, '15:00 - 15:30', 'available'),
    ('sch-h-12', 'doc-hendra', CURRENT_DATE, '15:30 - 16:00', 'available')
ON CONFLICT (doctor_id, schedule_date, time_slot) DO NOTHING;

-- Seed Overnight Distress Log for Rian
INSERT INTO clinical_schema.overnight_logs (id, appointment_id, patient_id, distress_time, anxiety_score, somatic_symptoms, crisis_level)
VALUES
    ('onl-rian-01', 'apt-rian-01', 'pat-rian', CURRENT_TIMESTAMP - INTERVAL '7 hours', 8, '["palpitasi hebat", "tremor tangan", "insomnia", "ruminasi kerja"]', 'moderate')
ON CONFLICT (id) DO NOTHING;

-- Seed Voice Note metadata with WhatsApp purge confirmation
INSERT INTO clinical_schema.voice_notes (id, overnight_log_id, duration_seconds, audio_storage_uri, encryption_key_id, whatsapp_message_id, whatsapp_purged_at, ephemeral_playback_token, token_expires_at)
VALUES
    ('vn-rian-01', 'onl-rian-01', 42, 'vault://encrypted/2026/09/22/vn-rian-01.aes', 'kms-key-psi-0922', 'wamid.HBgLMDg5ODcx...==', CURRENT_TIMESTAMP - INTERVAL '6 hours 59 minutes', 'ephem-tok-89123-valid', CURRENT_TIMESTAMP + INTERVAL '60 seconds')
ON CONFLICT (id) DO NOTHING;

-- Seed Interview Probes for Evidence Grounding
INSERT INTO clinical_schema.interview_probes (id, overnight_log_id, probe_order, badge_title, timestamp_badge, audio_offset_seconds, recommended_question, clinical_rationale)
VALUES
    ('prb-01', 'onl-rian-01', 1, 'Gejala Somatik Panik (Palpitasi & Tremor)', '[00:14]', 14.2, 'Mas Rian, di rekaman suara semalam Anda mengeluhkan dada berdebar kencang dan tangan gemetar hebat saat mau tidur. Berapa lama debarannya berlangsung semalam?', 'Membedakan eksaserbasi panic attack nokturnal dengan aritmia kardiologi, serta evaluasi respons otonom.'),
    ('prb-02', 'onl-rian-01', 2, 'Pemicu Kognitif & Ruminasi Masa Depan', '[00:26]', 26.5, 'Semalam Anda menyebutkan pikiran terus berputar takut membuat kesalahan di tempat kerja sampai takut dipecat. Apakah ada kejadian nyata kemarin di kantor?', 'Mengukur derajat ruminasi cemas (GAD) vs distorsi kognitif katastrofik.'),
    ('prb-03', 'onl-rian-01', 3, 'Klarifikasi Afek Kematian vs Impuls Suisidal', '[00:38]', 38.0, 'Di akhir pesan suara, Anda sempat berucap rasanya mau mati. Saya ingin memastikan: apakah itu rasa takut fisik karena panik hebat, atau ada keputusasaan untuk mengakhiri hidup?', 'Validasi mutlak penapisan risiko bunuh diri; membedakan kepanikan fisik ekstrem dengan ide bunuh diri aktif.')
ON CONFLICT (id) DO NOTHING;
