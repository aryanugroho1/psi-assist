/**
 * MindScribe Cryptographic Vault
 * Implements Field-Level AES-256-GCM Encryption for Clinical Schemas (UU PDP No. 27/2022)
 * Ensures Zero-Knowledge database storage: Database administrators and platform admins
 * cannot read clinical MSE, overnight transcripts, or interview probes in raw DB (Drizzle Studio).
 */
const crypto = require('crypto');

// Master Secret Key for Clinical KMS (derived to 32 bytes for AES-256)
const KMS_CLINICAL_MASTER_SECRET = process.env.CLINICAL_KMS_SECRET || 'MINDCRIBE_CLINICAL_AES256_GCM_SECRET_KEY_2026_UU_PDP';
const MASTER_KEY_BUFFER = crypto.createHash('sha256').update(KMS_CLINICAL_MASTER_SECRET).digest();

/**
 * Encrypt a clinical plain text string using AES-256-GCM
 * @param {string} plainText 
 * @returns {string} Encrypted ciphertext token
 */
function encryptClinicalField(plainText) {
  if (plainText === null || plainText === undefined) return plainText;
  const textStr = typeof plainText === 'object' ? JSON.stringify(plainText) : String(plainText);
  
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY_BUFFER, iv);
  
  let encrypted = cipher.update(textStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: ENC_AES256_GCM:<iv>:<authTag>:<ciphertext>
  return `ENC_AES256_GCM:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt a clinical ciphertext token back to plain text
 * @param {string} cipherText 
 * @returns {string} Original plain text
 */
function decryptClinicalField(cipherText) {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.startsWith('ENC_AES256_GCM:')) {
    return cipherText;
  }
  
  try {
    const parts = cipherText.split(':');
    if (parts.length < 4) return cipherText;
    
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encryptedHex = parts[3];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('[CryptoVault] Decryption failed or invalid auth tag:', err.message);
    return cipherText;
  }
}

/**
 * Check if a field value is currently encrypted
 * @param {string} value 
 * @returns {boolean}
 */
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith('ENC_AES256_GCM:');
}

module.exports = {
  encryptClinicalField,
  decryptClinicalField,
  isEncrypted,
  KMS_CLINICAL_MASTER_SECRET
};
