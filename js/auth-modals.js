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

    // Handle Doctor Login Simulation -> Redirects to doctor-dashboard.html
    const doctorForm = document.getElementById('doctor-login-form');
    if (doctorForm) {
      doctorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const submitBtn = doctorForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Memverifikasi SIP & 2FA Token...';

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Masuk ke Clinical Workspace';
          closeModal();
          if (window.showToast) {
            window.showToast('✓ Berhasil Masuk: Membuka Workspace dr. Hendra, Sp.KJ...', 'success');
          }
          setTimeout(() => {
            window.location.href = 'doctor-dashboard.html';
          }, 400);
        }, 800);
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
