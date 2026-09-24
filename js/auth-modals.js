/* Auth Modals & RBAC JS */
(function () {
  'use strict';
  const doctorModal = document.getElementById('doctor-login-modal');
  const adminModal = document.getElementById('admin-login-modal');
  const openDoctorBtns = document.querySelectorAll('.trigger-doctor-portal');
  const openAdminBtns = document.querySelectorAll('.trigger-admin-portal');
  const closeBtns = document.querySelectorAll('.modal-close-btn');
  const adminTestAccessBtn = document.getElementById('btn-admin-test-rbac');
  const adminRbacForbiddenAlert = document.getElementById('admin-rbac-forbidden-alert');

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (doctorModal) doctorModal.classList.remove('active');
    if (adminModal) adminModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  function init() {
    openDoctorBtns.forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); openModal(doctorModal); }));
    openAdminBtns.forEach(btn => btn.addEventListener('click', (e) => { e.preventDefault(); openModal(adminModal); }));
    closeBtns.forEach(btn => btn.addEventListener('click', closeModal));

    [doctorModal, adminModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) closeModal();
        });
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // -------------------------------------------------------------------------
    // Doctor 2FA & Okta Verify Interactions
    // -------------------------------------------------------------------------
    const oktaCard = document.getElementById('okta-setup-card');
    const toggleOktaBtn = document.getElementById('btn-toggle-okta-card');
    const copyKeyBtn = document.getElementById('btn-copy-2fa-key');
    const doc2faInput = document.getElementById('doc-2fa');
    const doc2faErrorAlert = document.getElementById('doctor-2fa-error-alert');
    const doc2faErrorText = document.getElementById('doctor-2fa-error-text');

    if (toggleOktaBtn && oktaCard) {
      toggleOktaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isHidden = oktaCard.style.display === 'none';
        oktaCard.style.display = isHidden ? 'block' : 'none';
        toggleOktaBtn.textContent = isHidden ? 'Tutup Panduan Setup' : '📱 Bantuan Okta Verify';
      });
    }

    if (copyKeyBtn) {
      copyKeyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const rawSecret = 'KVKFKRCPNZQUYMLX';
        navigator.clipboard.writeText(rawSecret).then(() => {
          copyKeyBtn.innerHTML = '✓ Tersalin!';
          copyKeyBtn.style.background = 'rgba(16, 185, 129, 0.25)';
          copyKeyBtn.style.color = '#34d399';
          setTimeout(() => {
            copyKeyBtn.innerHTML = '📋 Salin';
            copyKeyBtn.style.background = 'rgba(56, 189, 248, 0.2)';
            copyKeyBtn.style.color = '#38bdf8';
          }, 2000);
        }).catch(() => {
          prompt('Salin Kunci Rahasia Okta Verify:', rawSecret);
        });
      });
    }

    if (doc2faInput) {
      doc2faInput.addEventListener('input', (e) => {
        // Enforce 6-digit numeric only
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
        if (doc2faErrorAlert) doc2faErrorAlert.style.display = 'none';
      });
    }

    // Handle Doctor Login with Real Live TOTP Verification
    const doctorForm = document.getElementById('doctor-login-form');
    if (doctorForm) {
      doctorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('doc-email')?.value?.trim() || 'dr.hendra@klinikjiwa.id';
        const licenseId = document.getElementById('doc-license-id')?.value?.trim() || '';
        const token2fa = doc2faInput?.value?.trim() || '';
        const submitBtn = doctorForm.querySelector('button[type="submit"]');

        if (doc2faErrorAlert) doc2faErrorAlert.style.display = 'none';

        if (token2fa.length !== 6) {
          if (doc2faErrorAlert && doc2faErrorText) {
            doc2faErrorText.textContent = 'Silakan masukkan 6 digit angka kode aktif dari aplikasi Okta Verify.';
            doc2faErrorAlert.style.display = 'block';
          }
          if (doc2faInput) doc2faInput.focus();
          return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Memvalidasi 2FA Okta Verify...';

        try {
          const response = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              username: 'dr.hendra',
              email: email,
              sip: licenseId,
              password: 'password123',
              token2fa: token2fa
            })
          });

          const data = await response.json();

          if (!response.ok || !data.success) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Masuk ke Clinical Workspace';

            const errMsg = data.message || 'Kode 2FA tidak valid atau telah kedaluwarsa. Silakan periksa aplikasi Okta Verify Anda.';
            if (doc2faErrorAlert && doc2faErrorText) {
              doc2faErrorText.textContent = errMsg;
              doc2faErrorAlert.style.display = 'block';
            }

            if (doc2faInput) {
              doc2faInput.style.borderColor = '#ef4444';
              doc2faInput.focus();
              doc2faInput.select();
              setTimeout(() => {
                doc2faInput.style.borderColor = '';
              }, 2500);
            }

            if (window.showToast) {
              window.showToast('⛔ ' + errMsg, 'error');
            }
            return;
          }

          // Successful 2FA Login
          submitBtn.innerHTML = '✓ 2FA Terverifikasi! Mengalihkan...';
          sessionStorage.setItem('mindscribe_auth_token', data.token);
          if (data.user) {
            sessionStorage.setItem('mindscribe_user', JSON.stringify(data.user));
          }

          if (window.showToast) {
            window.showToast('✓ Berhasil Masuk: Membuka Workspace dr. Hendra, Sp.KJ...', 'success');
          }

          setTimeout(() => {
            closeModal();
            window.location.href = 'doctor-dashboard.html';
          }, 600);

        } catch (err) {
          console.error('Login request failed:', err);
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Masuk ke Clinical Workspace';
          if (doc2faErrorAlert && doc2faErrorText) {
            doc2faErrorText.textContent = 'Gagal menghubungi server otentikasi. Pastikan backend server aktif.';
            doc2faErrorAlert.style.display = 'block';
          }
        }
      });
    }

    // Handle Admin Login Simulation -> Redirects to admin-dashboard.html
    const adminForm = document.getElementById('admin-login-form');
    if (adminForm) {
      adminForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = adminForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Memvalidasi Kredensial Staf...';

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Masuk ke Portal Operasional';
          closeModal();
          if (window.showToast) {
            window.showToast('✓ Berhasil Masuk: Membuka Portal Admin Operasional...', 'info');
          }
          setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
          }, 400);
        }, 800);
      });
    }

    // Admin RBAC Violation Simulation
    if (adminTestAccessBtn && adminRbacForbiddenAlert) {
      adminTestAccessBtn.addEventListener('click', (e) => {
        e.preventDefault();
        adminRbacForbiddenAlert.style.display = 'block';
        if (window.showToast) {
          window.showToast('⛔ HTTP 403 Forbidden: Modul rekam medis menolak akses ROLE_ADMIN!', 'error');
        }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
