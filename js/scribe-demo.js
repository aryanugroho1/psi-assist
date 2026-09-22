/* ==========================================================================
   MindScribe & Triage AI - Nocturnal Voice Note Analyzer & Interview Guide
   Analyzes 01:30 AM Crisis Voice Note with Evidence Grounding & Interview Probes
   ========================================================================== */

(function () {
  'use strict';

  // Nocturnal Crisis Voice Note Transcript segments (sent at 01:32 AM)
  const vnSegments = [
    { id: 'vn-seg-1', time: 5, timestampStr: '00:05', text: 'Halo admin klinik... maaf saya kirim VN malam-malam pkl 01.30...' },
    { id: 'vn-seg-2', time: 14, timestampStr: '00:14', text: 'Tiba-tiba dada saya berdebar kencang sekali, sesak napas, dan tangan saya gemetar hebat saat mau tidur.' },
    { id: 'vn-seg-3', time: 26, timestampStr: '00:26', text: 'Pikiran saya terus berputar kalut mikirin kerjaan besok, takut ada kesalahan fatal yang berujung dipecat.' },
    { id: 'vn-seg-4', time: 38, timestampStr: '00:38', text: 'Rasanya mau mati atau ada bahaya besar yang akan menimpa saya... saya butuh ketemu psikiater besok pagi.' }
  ];

  const totalDuration = 42; // 00:42 Voice Note
  let currentTime = 14;
  let isPlaying = false;
  let playInterval = null;
  let audioCtx = null;

  const playBtn = document.getElementById('scribe-play-btn');
  const playIcon = document.getElementById('play-icon');
  const pauseIcon = document.getElementById('pause-icon');
  const timeCurrentEl = document.getElementById('time-current');
  const timeTotalEl = document.getElementById('time-total');
  const canvas = document.getElementById('waveform-canvas');
  const signBtn = document.getElementById('btn-approve-sign');
  const signStatus = document.getElementById('sign-status-text');

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function drawWaveform() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.parentElement.clientWidth;
    const height = canvas.height = 38;
    ctx.clearRect(0, 0, width, height);

    const barWidth = 3;
    const gap = 2;
    const totalBars = Math.floor(width / (barWidth + gap));
    const progressRatio = currentTime / totalDuration;

    for (let i = 0; i < totalBars; i++) {
      const x = i * (barWidth + gap);
      const barRatio = i / totalBars;
      const seed = Math.sin(i * 0.38) * 0.5 + Math.cos(i * 0.8) * 0.5;
      const barHeight = Math.max(4, Math.abs(seed) * (height - 8));
      const y = (height - barHeight) / 2;

      ctx.fillStyle = (barRatio <= progressRatio) ? '#14B8A6' : 'rgba(255, 255, 255, 0.2)';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }

  function playTone(freq = 440) {
    try {
      if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  }

  function updateTranscript() {
    vnSegments.forEach(seg => {
      const el = document.getElementById(seg.id);
      if (el) {
        if (currentTime >= seg.time && currentTime < (seg.time + 12)) {
          el.classList.add('highlighted');
        } else {
          el.classList.remove('highlighted');
        }
      }
    });
  }

  function seekTo(seconds, badgeEl = null) {
    currentTime = seconds;
    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(currentTime);
    drawWaveform();
    updateTranscript();
    playTone(587.33);

    document.querySelectorAll('.verify-timestamp-badge').forEach(b => b.classList.remove('active'));
    if (badgeEl) badgeEl.classList.add('active');

    const matched = vnSegments.find(s => Math.abs(s.time - seconds) < 10);
    if (matched) {
      const targetEl = document.getElementById(matched.id);
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (window.showToast) {
      window.showToast(`🔍 Terverifikasi: Ditambatkan ke VN krisis malam hari detik ${formatTime(seconds)}`, 'info');
    }
  }

  function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
      playTone(523.25);
      playInterval = setInterval(() => {
        currentTime += 1;
        if (currentTime > totalDuration) currentTime = 0;
        if (timeCurrentEl) timeCurrentEl.textContent = formatTime(currentTime);
        drawWaveform();
        updateTranscript();
      }, 1000);
    } else {
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      clearInterval(playInterval);
    }
  }

  function init() {
    if (timeTotalEl) timeTotalEl.textContent = formatTime(totalDuration);
    if (timeCurrentEl) timeCurrentEl.textContent = formatTime(currentTime);
    drawWaveform();
    updateTranscript();

    window.addEventListener('resize', drawWaveform);
    if (playBtn) playBtn.addEventListener('click', togglePlay);
    if (canvas) {
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        seekTo(Math.floor(ratio * totalDuration));
      });
    }

    document.querySelectorAll('.verify-timestamp-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        const timeStr = badge.getAttribute('data-timestamp') || badge.textContent.replace(/[\[\]]/g, '').trim();
        const parts = timeStr.split(':');
        if (parts.length === 2) {
          const secs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
          seekTo(secs, badge);
        }
      });
    });

    // Tab switching between Deep Dive Interview Guide & Clinical Draft
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const guideView = document.getElementById('guide-view');
        const draftView = document.getElementById('draft-view');
        if (guideView) guideView.style.display = (tab === 'guide') ? 'block' : 'none';
        if (draftView) draftView.style.display = (tab === 'draft') ? 'block' : 'none';
      });
    });

    if (signBtn) {
      signBtn.addEventListener('click', () => {
        signBtn.disabled = true;
        signBtn.innerHTML = 'Menyimpan & Menandatangani Keputusan Medis...';
        setTimeout(() => {
          signBtn.style.background = '#059669';
          signBtn.innerHTML = '✓ Keputusan Klinis Disahkan (dr. Hendra, Sp.KJ)';
          if (signStatus) {
            signStatus.innerHTML = '<span style="color:#10B981;font-weight:700;">✓ Rekam Medis Disahkan DPJP</span> &bull; Terkirim ke SATUSEHAT (FHIR-ENC-90812) &bull; Ruang Konsultasi Bebas Rekaman.';
          }
          if (window.showToast) window.showToast('✓ Keputusan klinis DPJP resmi disahkan dan tersinkronisasi SATUSEHAT!', 'success');
        }, 800);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.seekTo = seekTo;
})();
