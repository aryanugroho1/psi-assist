const { sqliteTable, text, integer, real } = require('drizzle-orm/sqlite-core');

// =============================================================================
// OPS_SCHEMA TABLES (Operational, Receptionist, Doctor Schedules & Billing)
// =============================================================================

const opsDoctors = sqliteTable('ops_doctors', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  sipNumber: text('sip_number').notNull().unique(),
  specialization: text('specialization').default('Spesialis Kedokteran Jiwa (Sp.KJ)'),
  roomName: text('room_name').notNull(),
  dailyQuota: integer('daily_quota').default(12),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

const opsDoctorSchedules = sqliteTable('ops_doctor_schedules', {
  id: text('id').primaryKey(),
  doctorId: text('doctor_id').notNull().references(() => opsDoctors.id),
  scheduleDate: text('schedule_date').notNull(),
  timeSlot: text('time_slot').notNull(), // e.g. "09:00 - 09:30"
  status: text('status').notNull().default('available'), // available, occupied, session, break
  patientName: text('patient_name'),
  lockedByAdmin: integer('locked_by_admin', { mode: 'boolean' }).default(false),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

const opsPatients = sqliteTable('ops_patients', {
  id: text('id').primaryKey(),
  fullName: text('full_name').notNull(),
  age: integer('age'),
  phoneWhatsApp: text('phone_whatsapp').notNull().unique(),
  registrationSource: text('registration_source').default('whatsapp_triage'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

const opsAppointments = sqliteTable('ops_appointments', {
  id: text('id').primaryKey(),
  queueNumber: text('queue_number').notNull(),
  patientId: text('patient_id').notNull().references(() => opsPatients.id),
  doctorId: text('doctor_id').notNull().references(() => opsDoctors.id),
  appointmentDate: text('appointment_date').notNull(),
  timeSlot: text('time_slot').notNull(),
  operationalStatus: text('operational_status').default('scheduled'),
  paymentStatus: text('payment_status').default('unpaid'),
  hasOvernightLog: integer('has_overnight_log', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

const opsBillingTransactions = sqliteTable('ops_billing_transactions', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().references(() => opsAppointments.id),
  amount: real('amount').notNull(),
  paymentMethod: text('payment_method').notNull(), // qris, cash, insurance
  paymentStatus: text('payment_status').default('unpaid'),
  invoiceNumber: text('invoice_number').unique(),
  paidAt: text('paid_at')
});

const opsAuditLogs = sqliteTable('ops_audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull(),
  userRole: text('user_role').notNull(),
  actionType: text('action_type').notNull(),
  resourceAccessed: text('resource_accessed').notNull(),
  details: text('details'),
  timestamp: text('timestamp').default('CURRENT_TIMESTAMP')
});

const opsFacilities = sqliteTable('ops_facilities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  facilityCode: text('facility_code').notNull().unique(),
  enrollmentCode: text('enrollment_code').notNull().unique(),
  enrollmentActive: integer('enrollment_active', { mode: 'boolean' }).default(true),
  maxStaffQuota: integer('max_staff_quota').default(15),
  leadAdminName: text('lead_admin_name'),
  leadAdminEmail: text('lead_admin_email'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

const opsFacilityStaff = sqliteTable('ops_facility_staff', {
  id: text('id').primaryKey(),
  facilityId: text('facility_id').notNull().references(() => opsFacilities.id),
  staffIdCode: text('staff_id_code').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  role: text('role').notNull().default('ROLE_ADMIN'), // ROLE_ADMIN, ROLE_ADMIN_LEAD
  jobTitle: text('job_title').default('Staf Pendaftaran & Kasir'),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

// =============================================================================
// CLINICAL_SCHEMA TABLES (Medical Records, Voice Notes & Evidence Grounding)
// =============================================================================

const clinicalOvernightLogs = sqliteTable('clinical_overnight_logs', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().unique(),
  patientId: text('patient_id').notNull(),
  distressTime: text('distress_time').notNull(),
  anxietyScore: integer('anxiety_score').notNull(), // 1 - 10
  somaticSymptoms: text('somatic_symptoms').notNull(), // JSON string
  rawTranscript: text('raw_transcript'),
  crisisLevel: text('crisis_level').default('moderate'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

const clinicalVoiceNotes = sqliteTable('clinical_voice_notes', {
  id: text('id').primaryKey(),
  overnightLogId: text('overnight_log_id').notNull().references(() => clinicalOvernightLogs.id),
  durationSeconds: integer('duration_seconds').notNull(),
  audioStorageUri: text('audio_storage_uri').notNull(),
  encryptionKeyId: text('encryption_key_id').notNull(),
  whatsappMessageId: text('whatsapp_message_id'),
  whatsappPurgedAt: text('whatsapp_purged_at'), // Proof of < 60s auto-delete on WhatsApp API
  ephemeralPlaybackToken: text('ephemeral_playback_token'),
  tokenExpiresAt: integer('token_expires_at'),
  autoPurgeScheduledAt: text('auto_purge_scheduled_at'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

const clinicalInterviewProbes = sqliteTable('clinical_interview_probes', {
  id: text('id').primaryKey(),
  overnightLogId: text('overnight_log_id').notNull().references(() => clinicalOvernightLogs.id),
  probeOrder: integer('probe_order').notNull(),
  badgeTitle: text('badge_title').notNull(),
  timestampBadge: text('timestamp_badge').notNull(), // e.g. "[00:14]"
  audioOffsetSeconds: real('audio_offset_seconds').notNull(),
  recommendedQuestion: text('recommended_question').notNull(),
  clinicalRationale: text('clinical_rationale').notNull()
});

const clinicalMedicalRecords = sqliteTable('clinical_medical_records', {
  id: text('id').primaryKey(),
  appointmentId: text('appointment_id').notNull().unique(),
  doctorId: text('doctor_id').notNull(),
  patientId: text('patient_id').notNull(),
  mseData: text('mse_data').notNull(), // JSON string
  soapData: text('soap_data').notNull(), // JSON string
  icd10Code: text('icd10_code').notNull(), // e.g. "F41.1"
  satusehatEncounterId: text('satusehat_encounter_id'), // FHIR-ENC-XXXXX
  satusehatSyncStatus: text('satusehat_sync_status').default('synced'),
  signedByDoctorName: text('signed_by_doctor_name').notNull(),
  signedByDoctorSip: text('signed_by_doctor_sip').notNull(),
  signedAt: text('signed_at').default('CURRENT_TIMESTAMP'),
  isLocked: integer('is_locked', { mode: 'boolean' }).default(true)
});

module.exports = {
  opsDoctors,
  opsDoctorSchedules,
  opsPatients,
  opsAppointments,
  opsBillingTransactions,
  opsAuditLogs,
  opsFacilities,
  opsFacilityStaff,
  clinicalOvernightLogs,
  clinicalVoiceNotes,
  clinicalInterviewProbes,
  clinicalMedicalRecords
};
