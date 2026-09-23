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
    password: 'password123',
    role: 'ROLE_DOCTOR',
    name: 'dr. Hendra, Sp.KJ',
    sip: '503/SIP-DSKJ/2026/042',
    schemas: ['ops_schema', 'clinical_schema']
  },
  {
    id: 'doc-rina',
    username: 'dr.rina',
    password: 'password123',
    role: 'ROLE_DOCTOR',
    name: 'dr. Rina Suryani, Sp.KJ',
    sip: '503/SIP-DSKJ/2026/058',
    schemas: ['ops_schema', 'clinical_schema']
  },
  {
    id: 'adm-siti',
    username: 'admin',
    password: 'password123',
    role: 'ROLE_ADMIN',
    name: 'Siti Rahma',
    title: 'Staf Pendaftaran & Kasir',
    schemas: ['ops_schema'] // STRICTLY EXCLUDED FROM clinical_schema
  },
  // Convenience alias for dashboard auto-login
  {
    id: 'doc-hendra',
    username: 'doctor',
    password: 'password123',
    role: 'ROLE_DOCTOR',
    name: 'dr. Hendra, Sp.KJ',
    sip: '503/SIP-DSKJ/2026/042',
    schemas: ['ops_schema', 'clinical_schema']
  }
];

function generateToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
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

function authenticateCredentials(username, password) {
  const user = SYSTEM_USERS.find(u => u.username === username && u.password === password);
  if (!user) return null;
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      sip: user.sip || null,
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
  JWT_SECRET
};
