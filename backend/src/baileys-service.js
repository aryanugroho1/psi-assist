/**
 * Baileys Self-Hosted WhatsApp Gateway Engine
 * MindScribe AI Psychiatry & Triage Platform
 * 
 * Complies with UU PDP No. 27/2022 & SATUSEHAT security guidelines:
 * - Direct peer-to-peer WebSocket encryption with WhatsApp Web protocol.
 * - Zero 3rd party SaaS intermediaries holding patient clinical data.
 * - Local encrypted session persistence in persistent Docker volume (/app/data/baileys_auth).
 * - Anti-ban safety: Presence simulation (typing indicator), natural jitter delay, deduplication.
 */

const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  downloadContentFromMessage,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const { handleConversationalTriage, conversationSessions } = require('./whatsapp-service');
const { db } = require('./database');

// Configuration
const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || path.resolve(__dirname, '..', '..', 'data', 'baileys_auth');
const logger = pino({ level: process.env.BAILEYS_LOG_LEVEL || 'silent' });

// Global State
let sock = null;
let connectionStatus = 'DISCONNECTED'; // 'DISCONNECTED' | 'QR_READY' | 'CONNECTING' | 'CONNECTED'
let lastQrString = null;
let lastQrDataUrl = null;
let connectedUser = null;
let isInitializing = false;

// Anti-replay / Deduplication cache (5-minute TTL)
const processedMessageIds = new Map();
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > 300000) {
      processedMessageIds.delete(id);
    }
  }
}, 60000);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Natural jitter delay helper to prevent machine-like instant replies
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Initialize or reconnect Baileys socket
 */
async function initBaileysSocket() {
  if (isInitializing) {
    console.log('[Baileys] Socket initialization already in progress...');
    return;
  }

  isInitializing = true;
  connectionStatus = 'CONNECTING';

  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    let version = [2, 3000, 1015901307];
    try {
      const latest = await fetchLatestBaileysVersion();
      if (latest && latest.version) {
        version = latest.version;
      }
    } catch (e) {
      // Use fallback version if network check fails
    }

    sock = makeWASocket({
      version,
      logger,
      auth: state,
      printQRInTerminal: false, // We print manually formatted
      browser: ['MindScribe Clinic', 'Chrome', '124.0.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: 60000
    });

    // Save auth credentials automatically
    sock.ev.on('creds.update', saveCreds);

    // Monitor connection lifecycle
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        lastQrString = qr;
        connectionStatus = 'QR_READY';
        console.log('\n======================================================');
        console.log(' [Baileys] SCAN QR CODE DI WHATSAPP HP ANDA:');
        console.log(' Menu WhatsApp -> Titik Tiga / Settings -> Perangkat Tertaut');
        console.log('======================================================\n');
        
        try {
          qrcodeTerminal.generate(qr, { small: true });
        } catch (e) {
          // Terminal renderer fallback
        }

        try {
          lastQrDataUrl = await QRCode.toDataURL(qr);
        } catch (err) {
          console.error('[Baileys] Failed to generate QR data URL:', err.message);
        }
      }

      if (connection === 'close') {
        connectionStatus = 'DISCONNECTED';
        lastQrString = null;
        lastQrDataUrl = null;
        connectedUser = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.warn(`[Baileys] Koneksi terputus. Status code: ${statusCode}. Auto reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.warn('[Baileys] Session logged out. Membersihkan folder auth untuk scan ulang...');
          try {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          } catch (e) {
            console.error('[Baileys] Gagal membersihkan auth dir:', e.message);
          }
        }

        if (shouldReconnect) {
          setTimeout(() => {
            isInitializing = false;
            initBaileysSocket();
          }, 5000);
        } else {
          isInitializing = false;
        }
      } else if (connection === 'open') {
        connectionStatus = 'CONNECTED';
        lastQrString = null;
        lastQrDataUrl = null;
        isInitializing = false;
        connectedUser = sock.user?.id || 'Connected User';

        const displayPhone = String(connectedUser).split(':')[0];
        console.log(`\n✅ [Baileys] WHATSAPP TERHUBUNG SUKSES! Nomor Bot: +${displayPhone}`);
        console.log('[Baileys] Bot MindScribe siap menerima pesan triage pasien.');
      }
    });

    // Inbound Message Listener
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      for (const msg of messages) {
        try {
          // Ignore outdated historical sync messages (older than 10 minutes)
          const nowSeconds = Math.floor(Date.now() / 1000);
          const msgTimestamp = msg.messageTimestamp ? Number(msg.messageTimestamp) : nowSeconds;
          if (nowSeconds - msgTimestamp > 600) {
            continue;
          }

          await handleIncomingBaileysMessage(msg);
        } catch (err) {
          console.error('[Baileys] Error handling inbound message:', err);
        }
      }
    });

  } catch (err) {
    connectionStatus = 'DISCONNECTED';
    isInitializing = false;
    console.error('[Baileys] Socket initialization failed:', err.message);
  }
}

/**
 * Handle individual incoming WhatsApp message
 */
async function handleIncomingBaileysMessage(msg) {
  // 1. Safety Filters: Ignore self messages & status updates
  if (!msg.message || msg.key.fromMe) return;

  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.endsWith('@g.us')) {
    // We only triage direct patient chats (1-on-1)
    return;
  }

  // 2. Anti-replay deduplication
  const msgId = msg.key.id;
  if (processedMessageIds.has(msgId)) return;
  processedMessageIds.set(msgId, Date.now());

  // 3. Extract Sender & Message Type (Unwrap ephemeral & viewOnce containers)
  const senderPhone = remoteJid.replace('@s.whatsapp.net', '');
  const senderName = msg.pushName || 'Pasien WhatsApp';

  let m = msg.message;
  while (m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m?.documentWithCaptionMessage?.message) {
    m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.documentWithCaptionMessage?.message;
  }

  let msgText = '';
  let msgType = 'text';
  let audioBuffer = null;
  let audioDuration = 40;

  if (m?.conversation) {
    msgText = m.conversation.trim();
  } else if (m?.extendedTextMessage?.text) {
    msgText = m.extendedTextMessage.text.trim();
  } else if (m?.audioMessage) {
    msgType = 'voice_note';
    msgText = 'Pesan Suara (Voice Note)';
    audioDuration = m.audioMessage.seconds || 35;
    try {
      console.log(`[Baileys] Mengunduh audio Voice Note dari pasien ${senderPhone}...`);
      
      // Layer 1: Direct stream download from unwrapped audio message
      try {
        const stream = await downloadContentFromMessage(m.audioMessage, 'audio');
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        audioBuffer = Buffer.concat(chunks);
      } catch (directErr) {
        console.warn('[Baileys] downloadContentFromMessage direct download error:', directErr.message);
      }

      // Layer 2: Fallback to downloadMediaMessage if Layer 1 was empty
      if (!audioBuffer || audioBuffer.length === 0) {
        audioBuffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
      }

      console.log(`[Baileys] Audio Voice Note berhasil diunduh (${audioBuffer ? audioBuffer.length : 0} bytes)`);
    } catch (downloadErr) {
      console.error('[Baileys] Gagal mengunduh audio buffer:', downloadErr.message);
    }
  } else {
    msgText = 'Halo';
  }

  // 4. Session management
  let session = conversationSessions.get(senderPhone) || { step: 'INIT' };

  // 5. Run Clinical Triage Pipeline
  const triageResult = handleConversationalTriage({
    from: senderPhone,
    senderName: senderName,
    type: msgType,
    text: msgText,
    session: session,
    voiceNoteBuffer: audioBuffer,
    durationSeconds: audioDuration
  });

  // Save session state
  conversationSessions.set(senderPhone, session);

  // 6. Send Reply with Natural Typing Simulation
  if (triageResult && triageResult.replyText) {
    try {
      // Show "typing..." indicator in WhatsApp
      await sock.sendPresenceUpdate('composing', remoteJid);
      
      // Jitter delay between 1.5s to 2.5s for natural dialogue feel & anti-ban protection
      const jitterMs = 1500 + Math.floor(Math.random() * 1000);
      await sleep(jitterMs);

      // Send the clinical triage response (do NOT quote VN to avoid leaving audio preview in quote bubble)
      const sendOptions = msgType === 'voice_note' ? {} : { quoted: msg };
      await sock.sendMessage(remoteJid, { text: triageResult.replyText }, sendOptions);
      
      // Clear typing indicator
      await sock.sendPresenceUpdate('paused', remoteJid);

      console.log(`[Baileys Outbound] Triage response successfully sent to +${senderPhone}`);
    } catch (sendErr) {
      console.error(`[Baileys Outbound] Failed to send reply to ${remoteJid}:`, sendErr.message);
    }
  }

  // 7. Auto-Purge Voice Note from WhatsApp Hotline (UU PDP No. 27/2022 & Medical Confidentiality)
  if (msgType === 'voice_note' && sock) {
    try {
      console.log(`[Baileys Privacy Purge] Menghapus Voice Note ${msg.key.id} dari hotline WhatsApp...`);

      // 7.1 Immediate deleteMessageForMe with deleteMedia: true on hotline device
      await sock.chatModify({
        deleteForMe: {
          timestamp: msg.messageTimestamp || Math.floor(Date.now() / 1000),
          key: msg.key,
          deleteMedia: true
        }
      }, remoteJid);

      // 7.2 Secondary protocol-level delete attempt
      try {
        await sock.sendMessage(remoteJid, { delete: msg.key });
      } catch (_) {}

      console.log(`[Baileys Privacy Purge] ✅ Sukses! Voice Note ${msg.key.id} terhapus dari perangkat WhatsApp hotline.`);
    } catch (purgeErr) {
      console.error('[Baileys Privacy Purge] Peringatan saat purge VN dari hotline:', purgeErr.message);
    }
  }
}

/**
 * Purge / clear chat and media for a specific phone number or chat from hotline device
 */
async function purgeChatMedia(targetPhone) {
  if (!sock) return { success: false, message: 'WhatsApp socket tidak terhubung.' };
  try {
    const cleanPhone = String(targetPhone).replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;
    await sock.chatModify({
      clear: true,
      lastMessages: []
    }, jid);
    return { success: true, message: `Chat dan media untuk +${cleanPhone} berhasil dibersihkan dari hotline WhatsApp.` };
  } catch (err) {
    return { success: false, message: `Gagal membersihkan chat hotline: ${err.message}` };
  }
}

/**
 * Get current Baileys status & QR for Web/UI dashboards
 */
function getBaileysStatus() {
  return {
    status: connectionStatus,
    connectedPhone: connectedUser ? String(connectedUser).split(':')[0] : null,
    qrReady: Boolean(lastQrString),
    qrDataUrl: lastQrDataUrl,
    authDir: AUTH_DIR
  };
}

/**
 * Logout and clear session
 */
async function logoutBaileys() {
  try {
    if (sock) {
      await sock.logout();
    }
    connectionStatus = 'DISCONNECTED';
    lastQrString = null;
    lastQrDataUrl = null;
    connectedUser = null;
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    return { success: true, message: 'Baileys session logged out and cleared.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  initBaileysSocket,
  getBaileysStatus,
  logoutBaileys,
  handleIncomingBaileysMessage,
  purgeChatMedia
};
