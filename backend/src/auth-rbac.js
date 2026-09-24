/**
 * Authentication & Role-Based Access Control (RBAC) Module
 * Implements strict schema protection under UU PDP No. 27/2022.
 */
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'mindscribe-super-secure-secret-key-2026';

// Registered mock system users
const SYSTEM_USERS = [
  {
    id: 'doc-hendra',
    username: 'dr.hendra',
    email: 'dr.hendra@klinikjiwa.id',
    password: 'password123',
    role: 'ROLE_DOCTOR',
    name: 'dr. Hendra, Sp.KJ',
    sip: '503/SIP-DSKJ/2026/042',
    twoFactorSecret: 'KVKFKRCPNZQUYMLX', // Base32 TOTP secret compatible with Okta Verify & Google Authenticator
    schemas: ['ops_schema', 'clinical_schema']
  },
  {
    id: 'doc-rina',
    username: 'dr.rina',
    email: 'dr.rina@klinikjiwa.id',
    password: 'password123',
    role: 'ROLE_DOCTOR',
    name: 'dr. Rina Suryani, Sp.KJ',
    sip: '503/SIP-DSKJ/2026/058',
    twoFactorSecret: 'KVKFKRCPNZQUYMLX',
    schemas: ['ops_schema', 'clinical_schema']
  },
  {
    id: 'adm-siti',
    username: 'admin',
    email: 'admin@klinikjiwa.id',
    password: 'password123',
    role: 'ROLE_ADMIN',
    name: 'Siti Rahma',
    title: 'Staf Pendaftaran & Kasir',
    twoFactorSecret: null,
    schemas: ['ops_schema'] // STRICTLY EXCLUDED FROM clinical_schema
  },
  // Convenience alias for dashboard auto-login & internal tasks
  {
    id: 'doc-hendra',
    username: 'doctor',
    email: 'dr.hendra@klinikjiwa.id',
    password: 'password123',
    role: 'ROLE_DOCTOR',
    name: 'dr. Hendra, Sp.KJ',
    sip: '503/SIP-DSKJ/2026/042',
    twoFactorSecret: null, // Bypasses 2FA for internal background jobs
    schemas: ['ops_schema', 'clinical_schema']
  }
];

// ============================================================================
// TOTP (RFC 6238) Engine for Okta Verify & Authenticator Apps
// ============================================================================

function base32Decode(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let cleaned = (base32 || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = alphabet.indexOf(cleaned[i]);
    if (val === -1) throw new Error('Invalid base32 character: ' + cleaned[i]);
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secretBase32, timeStepSeconds = 30, digits = 6, forTime = Date.now()) {
  const key = base32Decode(secretBase32);
  const epoch = Math.floor(forTime / 1000);
  const counter = Math.floor(epoch / timeStepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) |
               ((hmac[offset + 1] & 0xff) << 16) |
               ((hmac[offset + 2] & 0xff) << 8) |
               (hmac[offset + 3] & 0xff);
  return (code % (10 ** digits)).toString().padStart(digits, '0');
}

function verifyTOTP(secretBase32, token, window = 1, timeStepSeconds = 30) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (cleanToken.length !== 6 || !/^\d{6}$/.test(cleanToken)) return false;
  const now = Date.now();
  for (let errorStep = -window; errorStep <= window; errorStep++) {
    const stepTime = now + (errorStep * timeStepSeconds * 1000);
    const expected = generateTOTP(secretBase32, timeStepSeconds, 6, stepTime);
    if (expected === cleanToken) return true;
  }
  return false;
}

function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    sub: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    sip: user.sip || null,
    schemas: user.schemas,
    exp: Date.now() + 15 * 60 * 1000 // 15-minute idle session expiry per PRD
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > data.exp) return null; // Expired
    return data;
  } catch (e) {
    return null;
  }
}

function authenticateCredentials(identifier, password, token2fa) {
  const cleanId = (identifier || '').trim().toLowerCase();
  const user = SYSTEM_USERS.find(u => {
    const matchesUser = u.username.toLowerCase() === cleanId;
    const matchesEmail = u.email && u.email.toLowerCase() === cleanId;
    const matchesSip = u.sip && u.sip.toLowerCase() === cleanId;
    return (matchesUser || matchesEmail || matchesSip) && u.password === password;
  });

  if (!user) {
    return {
      success: false,
      code: 'INVALID_CREDENTIALS',
      message: 'Kombinasi kredensial (Email/SIP/Username) atau password salah.'
    };
  }

  // 2FA Verification for clinical accounts
  if (user.twoFactorSecret) {
    if (!token2fa || typeof token2fa !== 'string' || token2fa.trim().length === 0) {
      return {
        success: false,
        code: 'REQUIRE_2FA',
        message: 'Kode 2FA Authenticator (Okta Verify) diperlukan untuk akun dokter.'
      };
    }

    const isValid = verifyTOTP(user.twoFactorSecret, token2fa);
    if (!isValid) {
      return {
        success: false,
        code: 'INVALID_2FA',
        message: 'Kode 2FA tidak valid atau telah kedaluwarsa. Silakan periksa kode 6 digit terbaru pada aplikasi Okta Verify Anda.'
      };
    }
  }

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      sip: user.sip || null,
      email: user.email || null,
      schemas: user.schemas
    },
    token: generateToken(user)
  };
}

module.exports = {
  SYSTEM_USERS,
  generateToken,
  verifyToken,
  authenticateCredentials,
  base32Decode,
  generateTOTP,
  verifyTOTP,
  JWT_SECRET
};
