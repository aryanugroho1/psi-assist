/* WhatsApp Demo JS */
(function () {
  'use strict';
  let purgeCountdown = 59;
  let purgeInterval = null;
  let isVnPlaying = false;
  let vnAudioCtx = null;

  const chatContainer = document.getElementById('wa-messages-stream');
  const purgeValEl = document.getElementById('purge-countdown-val');
  const triggerCrisisBtn = document.getElementById('btn-simulate-crisis-alert');
  const resetDemoBtn = document.getElementById('btn-reset-wa-demo');

  function startPurgeTimer() {
    if (purgeInterval) clearInterval(purgeInterval);
    purgeCountdown = 59;
    purgeInterval = setInterval(() => {
      purgeCountdown--;
      if (purgeValEl) purgeValEl.textContent = `${purgeCountdown}s`;
      if (purgeCountdown <= 0) {
        clearInterval(purgeInterval);
        const purgePill = document.querySelector('.auto-purge-pill');
        if (purgePill) {
          purgePill.style.background = '#F3F4F6';
          purgePill.style.color = '#6B7280';
          purgePill.innerHTML = '✓ Pesan Asli Telah Dihapus dari WhatsApp (< 60s) & Tersimpan Terenkripsi.';
        }
      }
    }, 1000);
  }

  function setupVnPlayer() {
    const vnBtn = document.getElementById('wa-vn-play-btn');
    if (!vnBtn) return;
    vnBtn.addEventListener('click', () => {
      isVnPlaying = !isVnPlaying;
      if (isVnPlaying) {
        vnBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        if (window.showToast) window.showToast('🎧 Memutar Voice Note curhat malam pasien (Token kedaluwarsa 60s)', 'info');
        setTimeout(() => {
          isVnPlaying = false;
          vnBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        }, 5000);
      } else {
        vnBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      }
    });
  }

  function simulateHighRisk() {
    if (!chatContainer) return;
    const msg = document.createElement('div');
    msg.className = 'wa-msg user';
    msg.innerHTML = 'Saya sudah tidak kuat lagi Dok... rasanya ingin mengakhiri segalanya malam ini... tolong saya.<span class="wa-time">01:34 AM</span>';
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    setTimeout(() => {
      const alertMsg = document.createElement('div');
      alertMsg.className = 'wa-msg bot';
      alertMsg.style.borderColor = '#EF4444';
      alertMsg.style.borderWidth = '2px';
      alertMsg.style.borderStyle = 'solid';
      alertMsg.innerHTML = `
        <div style="color:#DC2626;font-weight:800;font-size:0.9rem;margin-bottom:6px;">🚨 DARURAT MEDIS TERDETEKSI</div>
        <p style="margin-bottom:8px;">Kami sangat peduli dengan keselamatan Anda. Anda tidak sendirian malam ini.</p>
        <div style="background:#FEE2E2;padding:10px;border-radius:8px;margin-bottom:8px;font-weight:700;color:#991B1B;">
          Segera Hubungi Hotline Kemenkes RI: <a href="tel:119" style="color:#DC2626;text-decoration:underline;">119 ext 8</a> (Bebas Pulsa 24 Jam)
        </div>
        <span class="wa-time">01:34 AM</span>
      `;
      chatContainer.appendChild(alertMsg);
      chatContainer.scrollTop = chatContainer.scrollHeight;
      if (window.showToast) window.showToast('🚨 Alert Darurat Kemenkes 119 ext 8 dipicu otomatis!', 'error');
    }, 1000);
  }

  function init() {
    startPurgeTimer();
    setupVnPlayer();
    const pickDoctorBtn = document.getElementById('wa-btn-choose-doc');
    const pickSlotBtn = document.getElementById('wa-btn-choose-slot');
    if (pickDoctorBtn) {
      pickDoctorBtn.addEventListener('click', () => {
        pickDoctorBtn.style.background = '#DCFCE7';
        pickDoctorBtn.innerHTML = '✓ dr. Hendra, Sp.KJ Dipilih';
      });
    }
    if (pickSlotBtn) {
      pickSlotBtn.addEventListener('click', () => {
        pickSlotBtn.style.background = '#DCFCE7';
        pickSlotBtn.innerHTML = '✓ Slot 09:00 - 09:30 Terpilih';
      });
    }
    if (triggerCrisisBtn) triggerCrisisBtn.addEventListener('click', simulateHighRisk);
    if (resetDemoBtn) resetDemoBtn.addEventListener('click', () => location.reload());
  }

  document.addEventListener('DOMContentLoaded', init);
})();
