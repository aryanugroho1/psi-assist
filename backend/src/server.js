/**
 * Standalone Zero-Dependency REST API Server
 * Built with native Node.js http, url, and crypto modules.
 */
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const { db } = require('./database');
const { authenticateCredentials, verifyToken } = require('./auth-rbac');
const {
  verifyWebhookHandshake,
  verifyWebhookSignature,
  processWhatsAppEvent
} = require('./whatsapp-service');

const PORT = process.env.PORT || 3000;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hub-Signature-256'
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      if (!body) return resolve({ raw: '', parsed: {} });
      try {
        const parsed = JSON.parse(body);
        resolve({ raw: body, parsed });
      } catch (e) {
        resolve({ raw: body, parsed: {} });
      }
    });
    req.on('error', err => reject(err));
  });
}

function extractAuthUser(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);
  if (!decoded) return null;
  if (!decoded.id && decoded.sub) decoded.id = decoded.sub;
  return decoded;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Hub-Signature-256'
    });
    return res.end();
  }

  try {
    // Serve Static Frontend Files (doctor-dashboard.html, admin-dashboard.html, index.html, css, js)
    if (!pathname.startsWith('/api/')) {
      const publicDir = path.resolve(__dirname, '..', '..');
      let reqPath = pathname === '/' ? '/index.html' : pathname;
      
      // Alias normalization for common URL patterns
      if (reqPath === '/admin_dashboard.html' || reqPath === '/admin-dashboard' || reqPath === '/admin_dashboard') {
        reqPath = '/admin-dashboard.html';
      } else if (reqPath === '/doctor_dashboard.html' || reqPath === '/doctor-dashboard' || reqPath === '/doctor_dashboard') {
        reqPath = '/doctor-dashboard.html';
      }

      const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(publicDir, safePath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.html': 'text/html; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.js': 'application/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        return fs.createReadStream(filePath).pipe(res);
      }
    }

    // -------------------------------------------------------------------------
    // 1. PUBLIC & AUTH ROUTES
    // -------------------------------------------------------------------------
    if (pathname === '/api/v1/health' && method === 'GET') {
      return sendJson(res, 200, {
        status: 'UP',
        app: 'MindScribe & Triage AI Backend Gateway',
        schemas: ['ops_schema', 'clinical_schema'],
        timestamp: new Date().toISOString()
      });
    }

    if (pathname === '/api/v1/auth/login' && method === 'POST') {
      const { parsed } = await parseBody(req);
      const identifier = parsed.username || parsed.email || parsed.sip;
      const auth = authenticateCredentials(identifier, parsed.password, parsed.token2fa);
      if (!auth || !auth.success) {
        return sendJson(res, 401, {
          status: 401,
          error: 'Unauthorized',
          code: auth ? auth.code : 'INVALID_CREDENTIALS',
          message: auth ? auth.message : 'Kombinasi email/username atau password salah.'
        });
      }
      return sendJson(res, 200, {
        status: 200,
        success: true,
        token: auth.token,
        user: auth.user
      });
    }

    if (pathname === '/api/v1/auth/2fa/setup' && method === 'GET') {
      return sendJson(res, 200, {
        status: 200,
        issuer: 'MindScribe AI',
        account: 'dr.hendra@klinikjiwa.id',
        secret: 'KVKFKRCPNZQUYMLX',
        formattedSecret: 'KVKF KRCP NZQU YMLX',
        otpauth: 'otpauth://totp/MindScribe:dr.hendra@klinikjiwa.id?secret=KVKFKRCPNZQUYMLX&issuer=MindScribe',
        instructions: {
          app: 'Okta Verify',
          step1: 'Buka aplikasi Okta Verify di smartphone',
          step2: 'Ketuk ikon (+) Tambah Akun -> Pilih "Other" atau "Organization"',
          step3: 'Scan QR Code atau pilih "Enter Key Manually" dengan kode: KVKF KRCP NZQU YMLX',
          step4: 'Masukkan 6 digit angka yang muncul pada aplikasi saat login'
        }
      });
    }

    if (pathname === '/api/v1/auth/me' && method === 'GET') {
      const user = extractAuthUser(req);
      if (!user) {
        return sendJson(res, 401, { status: 401, error: 'Unauthorized', message: 'Sesi tidak valid atau telah kedaluwarsa.' });
      }
      return sendJson(res, 200, { status: 200, user });
    }

    if (pathname === '/api/v1/auth/register-staff' && method === 'POST') {
      const { parsed } = await parseBody(req);
      if (!parsed.enrollmentCode || !parsed.fullName || !parsed.staffIdCode || !parsed.email || !parsed.password) {
        return sendJson(res, 400, {
          status: 400,
          error: 'Bad Request',
          message: 'Semua field (Kode Khusus Faskes, Nama Lengkap, ID Karyawan, Email, Password) wajib diisi.'
        });
      }
      const result = db.registerStaffViaEnrollmentCode({
        enrollmentCode: parsed.enrollmentCode,
        fullName: parsed.fullName,
        staffIdCode: parsed.staffIdCode,
        email: parsed.email,
        password: parsed.password,
        jobTitle: parsed.jobTitle || 'Staf Pendaftaran & Kasir'
      });
      if (!result.success) {
        return sendJson(res, 400, {
          status: 400,
          error: result.code || 'Registration Failed',
          message: result.message
        });
      }
      return sendJson(res, 201, {
        status: 201,
        success: true,
        message: 'Akun staf berhasil didaftarkan. Silakan login ke Portal Operasional.',
        staff: result.staff
      });
    }

    // -------------------------------------------------------------------------
    // 2. META WHATSAPP WEBHOOK GATEWAY
    // -------------------------------------------------------------------------
    if (pathname === '/api/v1/webhook/whatsapp' && method === 'GET') {
      const handshake = verifyWebhookHandshake(parsedUrl.query);
      if (handshake.valid) {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(handshake.challenge);
      }
      return sendJson(res, 403, { status: 403, error: 'Forbidden', message: 'Verifikasi Webhook Meta gagal.' });
    }

    if (pathname === '/api/v1/webhook/whatsapp' && method === 'POST') {
      const { raw, parsed } = await parseBody(req);
      const signatureHeader = req.headers['x-hub-signature-256'];

      // Enforce HMAC-SHA256 verification
      if (!verifyWebhookSignature(raw, signatureHeader)) {
        return sendJson(res, 401, {
          status: 401,
          error: 'Unauthorized',
          code: 'INVALID_WEBHOOK_HMAC_SIGNATURE',
          message: 'Tanda tangan X-Hub-Signature-256 tidak valid atau tidak cocok.'
        });
      }

      const triageResult = await processWhatsAppEvent(parsed);
      return sendJson(res, 200, triageResult);
    }

    // -------------------------------------------------------------------------
    // 3. ADMIN OPERATIONAL API (ops_schema)
    // -------------------------------------------------------------------------
    if (pathname.startsWith('/api/v1/admin/')) {
      const user = extractAuthUser(req);
      if (!user || (user.role !== 'ROLE_ADMIN' && user.role !== 'ROLE_ADMIN_LEAD')) {
        return sendJson(res, 403, {
          status: 403,
          error: 'Forbidden',
          message: 'Hanya peran administrasi faskes (ROLE_ADMIN / ROLE_ADMIN_LEAD) yang berhak mengakses endpoint operasional ini.'
        });
      }

      // 3.1 Get/Add Doctors
      if (pathname === '/api/v1/admin/doctors' && method === 'GET') {
        const doctors = db.getActiveDoctors();
        return sendJson(res, 200, { status: 200, count: doctors.length, doctors });
      }

      if (pathname === '/api/v1/admin/doctors' && method === 'POST') {
        const { parsed } = await parseBody(req);
        if (!parsed.fullName || !parsed.sipNumber) {
          return sendJson(res, 400, {
            status: 400,
            error: 'Bad Request',
            message: 'Nama lengkap dan nomor SIP wajib diisi.'
          });
        }
        const createdDoctor = db.createDoctor(parsed);
        return sendJson(res, 201, {
          status: 201,
          success: true,
          message: `Dokter ${createdDoctor.fullName} berhasil didaftarkan dan slot konsultasi telah diinisialisasi.`,
          doctor: createdDoctor
        });
      }

      // 3.1b Deactivate / Resign Doctor (Soft delete - preserves all DB records)
      const doctorDeactivateMatch = pathname.match(/^\/api\/v1\/admin\/doctors\/([\w-]+)$/);
      if (doctorDeactivateMatch && (method === 'DELETE' || method === 'POST')) {
        const docId = doctorDeactivateMatch[1];
        const result = db.deactivateDoctor(docId);
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Dokter ${result.doctor ? result.doctor.fullName : docId} dinonaktifkan (status resign). Rekam data historis tetap tersimpan.`,
          doctor: result.doctor
        });
      }

      // 3.2 Queue (Non-clinical)
      if (pathname === '/api/v1/admin/queue' && method === 'GET') {
        const queue = db.getAdminQueue();
        return sendJson(res, 200, { status: 200, count: queue.length, queue });
      }

      // 3.3 Slots Management
      if (pathname === '/api/v1/admin/slots' && method === 'GET') {
        const doctorId = parsedUrl.query.doctorId || 'doc-hendra';
        const date = parsedUrl.query.date;
        const slots = db.getDoctorSlots(doctorId, date);
        const occupied = slots.filter(s => s.status === 'occupied' || s.status === 'session');
        const available = slots.filter(s => s.status === 'available');

        return sendJson(res, 200, {
          status: 200,
          doctorId,
          totalSlots: slots.length,
          occupiedCount: occupied.length,
          availableCount: available.length,
          slots
        });
      }

      // 3.3a Add Custom Slot
      if (pathname === '/api/v1/admin/slots' && method === 'POST') {
        const { parsed } = await parseBody(req);
        const result = db.addDoctorSlot(
          parsed.doctorId,
          parsed.timeSlot,
          parsed.status || 'available',
          parsed.patientName,
          parsed.date
        );
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 201, {
          status: 201,
          success: true,
          message: `Slot jam ${parsed.timeSlot} berhasil ditambahkan.`,
          slot: result.slot,
          appointment: result.appointment
        });
      }

      // 3.3b Book a Slot (Walk-in Registration)
      if (pathname === '/api/v1/admin/slots/book' && method === 'POST') {
        const { parsed } = await parseBody(req);
        const result = db.bookSlot(
          parsed.doctorId,
          parsed.timeSlot,
          parsed.patientName,
          parsed.registrationSource || 'walk_in',
          parsed.date
        );
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Pasien ${parsed.patientName} berhasil didaftarkan pada slot ${parsed.timeSlot}.`,
          slot: result.slot,
          appointment: result.appointment
        });
      }

      // 3.3c Cancel / Release a Slot
      if (pathname === '/api/v1/admin/slots/cancel' && method === 'POST') {
        const { parsed } = await parseBody(req);
        const result = db.cancelSlot(parsed.doctorId, parsed.timeSlot, parsed.date);
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Slot jam ${parsed.timeSlot} berhasil dikosongkan dan tersedia kembali.`,
          slot: result.slot
        });
      }

      // 3.3d Lock / Unlock a Slot (e.g. ISHOMA)
      if (pathname === '/api/v1/admin/slots/lock' && method === 'POST') {
        const { parsed } = await parseBody(req);
        const result = db.lockSlot(parsed.doctorId, parsed.timeSlot, parsed.lock, parsed.date);
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Slot jam ${parsed.timeSlot} status diubah menjadi: ${result.slot.status}.`,
          slot: result.slot
        });
      }

      // 3.3e Reopen Slot (Make available again)
      if (pathname === '/api/v1/admin/slots/reopen' && method === 'POST') {
        const { parsed } = await parseBody(req);
        const result = db.reopenSlot(parsed.doctorId, parsed.timeSlot, parsed.date);
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Slot jam ${parsed.timeSlot} berhasil dibuka kembali dan berstatus available.`,
          slot: result.slot
        });
      }

      // 3.4 Queue Status & Payment Updates
      const queueStatusMatch = pathname.match(/^\/api\/v1\/admin\/queue\/([\w-]+)\/status$/);
      if (queueStatusMatch && method === 'PUT') {
        const appointmentId = queueStatusMatch[1];
        const { parsed } = await parseBody(req);
        const result = db.updateAppointmentStatus(appointmentId, parsed.status);
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Status antrian diperbarui menjadi: ${parsed.status}`,
          appointment: result.appointment
        });
      }

      const paymentStatusMatch = pathname.match(/^\/api\/v1\/admin\/queue\/([\w-]+)\/payment$/);
      if (paymentStatusMatch && method === 'PUT') {
        const appointmentId = paymentStatusMatch[1];
        const { parsed } = await parseBody(req);
        const result = db.updatePaymentStatus(
          appointmentId,
          parsed.paymentStatus,
          parsed.paymentMethod || 'cash',
          parsed.amount || 0
        );
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Status pembayaran diperbarui menjadi: ${parsed.paymentStatus}`,
          appointment: result.appointment
        });
      }

      // 3.5 Doctor-specific slot listing (by ID path param)
      const doctorSlotsMatch = pathname.match(/^\/api\/v1\/admin\/doctors\/([\w-]+)\/slots$/);
      if (doctorSlotsMatch && method === 'GET') {
        const doctorId = doctorSlotsMatch[1];
        const date = parsedUrl.query.date;
        const slots = db.getDoctorSlots(doctorId, date);
        return sendJson(res, 200, { status: 200, doctorId, count: slots.length, slots });
      }

      // 3.6 Billing & Audit
      if (pathname === '/api/v1/admin/billing' && method === 'GET') {
        const billing = db.getBillingSummary();
        return sendJson(res, 200, { status: 200, billing });
      }

      if (pathname === '/api/v1/admin/audit-logs' && method === 'GET') {
        const logs = db.getAuditLogs(30);
        return sendJson(res, 200, { status: 200, count: logs.length, logs });
      }

      // 3.7 Facility & Delegated Staff Management
      if (pathname === '/api/v1/admin/facility' && method === 'GET') {
        const facilityId = user.facilityId || 'fac-sejahtera';
        const facility = db.getFacilityInfo(facilityId);
        const staffList = db.getFacilityStaffList(facilityId);
        return sendJson(res, 200, {
          status: 200,
          facility,
          staffList,
          userRole: user.role
        });
      }

      if (pathname === '/api/v1/admin/facility/staff' && method === 'POST') {
        const { parsed } = await parseBody(req);
        if (!parsed.fullName || !parsed.staffIdCode || !parsed.email || !parsed.password) {
          return sendJson(res, 400, {
            status: 400,
            error: 'Bad Request',
            message: 'Nama lengkap, ID Karyawan, email, dan password wajib diisi.'
          });
        }
        const facilityId = user.facilityId || 'fac-sejahtera';
        const result = db.createStaffDirectly({
          facilityId,
          fullName: parsed.fullName,
          staffIdCode: parsed.staffIdCode,
          email: parsed.email,
          password: parsed.password,
          role: parsed.role || 'ROLE_ADMIN',
          jobTitle: parsed.jobTitle || 'Staf Operasional',
          requester: user.username || user.name
        });
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: result.code, message: result.message });
        }
        return sendJson(res, 201, {
          status: 201,
          success: true,
          message: `Staf ${result.staff.fullName} berhasil ditambahkan oleh Admin Utama Faskes.`,
          staff: result.staff
        });
      }

      if (pathname === '/api/v1/admin/facility/enrollment-code' && method === 'PUT') {
        const { parsed } = await parseBody(req);
        const facilityId = user.facilityId || 'fac-sejahtera';
        const result = db.updateFacilityEnrollmentCode(
          facilityId,
          parsed.newCode,
          parsed.isActive !== undefined ? parsed.isActive : true,
          user.username || user.name
        );
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: 'Update Failed', message: result.message });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: 'Kode registrasi khusus faskes berhasil diperbarui.',
          enrollmentCode: result.enrollmentCode,
          enrollmentActive: result.enrollmentActive
        });
      }

      const toggleStaffMatch = pathname.match(/^\/api\/v1\/admin\/facility\/staff\/([\w-]+)\/toggle$/);
      if (toggleStaffMatch && method === 'PUT') {
        const staffId = toggleStaffMatch[1];
        const { parsed } = await parseBody(req);
        const result = db.toggleStaffActiveStatus(staffId, parsed.isActive, user.username || user.name);
        if (!result.success) {
          return sendJson(res, 400, { status: 400, error: 'Toggle Failed', message: result.message });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Status aktif staf berhasil diubah menjadi ${result.isActive ? 'Aktif' : 'Nonaktif'}.`,
          staffId: result.staffId,
          isActive: result.isActive
        });
      }
    }

    // -------------------------------------------------------------------------
    // 4. DOCTOR CLINICAL WORKSPACE API (clinical_schema)
    // -------------------------------------------------------------------------
    if (pathname.startsWith('/api/v1/doctor/')) {
      const user = extractAuthUser(req);
      if (!user || user.role !== 'ROLE_DOCTOR') {
        return sendJson(res, 403, {
          status: 403,
          error: 'Forbidden',
          code: 'RBAC_CLINICAL_ISOLATION_VIOLATION',
          message: 'Akses ditolak: Akun non-dokter dilarang mengakses modul klinis psikiatri (clinical_schema) sesuai UU PDP No. 27/2022.'
        });
      }

      // 4.1 Doctor queue
      if (pathname === '/api/v1/doctor/queue' && method === 'GET') {
        const queue = db.getDoctorQueue(user.id);
        return sendJson(res, 200, { status: 200, count: queue.length, queue });
      }

      // 4.1b Doctor Summary & Clinical Statistics Dashboard
      if (pathname === '/api/v1/doctor/summary-statistics' && method === 'GET') {
        const stats = db.getDoctorSummaryStatistics(user.id, parsedUrl.query);
        return sendJson(res, 200, stats);
      }

      // 4.2 Overnight Log & Evidence Probes
      if (pathname.startsWith('/api/v1/doctor/overnight-log/') && method === 'GET') {
        const appointmentId = pathname.split('/').pop();
        const result = db.getClinicalOvernightLog(appointmentId, user.role, user.id);
        if (!result.allowed) {
          return sendJson(res, 403, {
            status: 403,
            error: 'Forbidden',
            code: result.error,
            message: 'Akses ditolak: Pelanggaran isolasi skema klinis.'
          });
        }
        if (!result.log) {
          return sendJson(res, 404, { status: 404, message: 'Tidak ada catatan krisis malam hari untuk pasien ini.' });
        }
        return sendJson(res, 200, { status: 200, overnightLog: result.log });
      }

      // 4.3 Ephemeral Voice Note Playback (60s limit)
      if (pathname.startsWith('/api/v1/doctor/audio/') && method === 'GET') {
        const token = pathname.split('/').pop();
        const result = db.verifyAndStreamVoiceNote(token, user.role);
        if (!result.allowed) {
          return sendJson(res, 403, {
            status: 403,
            error: 'Forbidden',
            code: result.error,
            message: result.error === 'TOKEN_EXPIRED_60S_LIMIT'
              ? 'Token pemutaran audio telah kedaluwarsa (> 60 detik). Silakan muat ulang token.'
              : 'Akses streaming audio ditolak.'
          });
        }
        res.writeHead(200, {
          'Content-Type': result.contentType,
          'Content-Length': result.audioBuffer.length,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store, max-age=0'
        });
        return res.end(result.audioBuffer);
      }

      // 4.4 Sign and Approve Medical Record
      if (pathname === '/api/v1/doctor/medical-records' && method === 'POST') {
        const { parsed } = await parseBody(req);
        const result = db.signAndApproveMedicalRecord(parsed.appointmentId, parsed, user);
        if (!result.allowed) {
          return sendJson(res, 403, { status: 403, error: 'Forbidden', code: result.error });
        }
        return sendJson(res, 200, {
          status: 200,
          success: true,
          message: `Rekam medis berhasil disahkan oleh ${user.name} dan disinkronkan ke SATUSEHAT (Encounter: ${result.record.satusehatEncounterId}).`,
          record: result.record
        });
      }

      // 4.5 Patient Medical History (clinical_schema — DOCTOR ONLY)
      const patientHistoryMatch = pathname.match(/^\/api\/v1\/doctor\/patients\/([\w-]+)\/history$/);
      if (patientHistoryMatch && method === 'GET') {
        const patientId = patientHistoryMatch[1];
        const result = db.getMedicalHistory(patientId, user.role);
        if (!result.allowed) {
          return sendJson(res, 403, { status: 403, error: 'Forbidden', code: result.error });
        }
        return sendJson(res, 200, { status: 200, ...result });
      }

      // 4.6 List all patients visible to doctor (ops_schema)
      if (pathname === '/api/v1/doctor/patients' && method === 'GET') {
        const patients = db.getAllPatients().map(p => ({
          id: p.id,
          fullName: p.fullName,
          age: p.age,
          phoneWhatsApp: p.phoneWhatsApp.replace(/(\d{4})\d{4}(\d{4})/, '$1-xxxx-$2'),
          registrationSource: p.registrationSource,
          createdAt: p.createdAt
        }));
        return sendJson(res, 200, { status: 200, count: patients.length, patients });
      }
    }

    // -------------------------------------------------------------------------
    // 5. STRICT RBAC TEST ENDPOINT FOR AUDIT
    // -------------------------------------------------------------------------
    if (pathname.startsWith('/api/v1/clinical/')) {
      const user = extractAuthUser(req);
      if (!user || user.role === 'ROLE_ADMIN' || user.role === 'ROLE_ADMIN_LEAD') {
        db.recordAudit(
          user ? user.username : 'ANONYMOUS',
          user ? user.role : 'UNKNOWN',
          'ILLEGAL_CLINICAL_SCHEMA_ATTEMPT',
          pathname,
          'BLOCKED with HTTP 403 Forbidden under UU PDP No. 27/2022'
        );
        return sendJson(res, 403, {
          status: 403,
          error: 'Forbidden',
          code: 'RBAC_CLINICAL_ISOLATION_VIOLATION',
          message: 'Akses ditolak: Akun staf administrasi dilarang mengakses skema klinis psikiatri (clinical_schema) sesuai UU PDP No. 27/2022.'
        });
      }
      return sendJson(res, 200, { status: 200, message: 'Akses klinis diberikan kepada dokter yang sah.' });
    }

    // 404 Route Not Found
    return sendJson(res, 404, { status: 404, error: 'Not Found', message: `Route ${method} ${pathname} tidak ditemukan.` });

  } catch (error) {
    return sendJson(res, 500, { status: 500, error: 'Internal Server Error', message: error.message });
  }
});

function startServer(port = PORT) {
  return new Promise((resolve) => {
    server.listen(port, () => {
      resolve(server);
    });
  });
}

function stopServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

if (require.main === module) {
  startServer(PORT).then(() => {
    console.log(`[MindScribe Backend] Server listening on http://localhost:${PORT}`);
  });
}

module.exports = { server, startServer, stopServer };
