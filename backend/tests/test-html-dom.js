const fs = require('fs');

const adminHtml = fs.readFileSync('admin-dashboard.html', 'utf8');
const doctorHtml = fs.readFileSync('doctor-dashboard.html', 'utf8');

console.log('admin-dashboard.html length:', adminHtml.length);
console.log('doctor-dashboard.html length:', doctorHtml.length);

const adminChecks = [
  'admin-change-status-modal',
  'btn-save-status-modal',
  'btn-ishoma-slot',
  'badge-op-status',
  'form-add-doctor',
  '+ Pasien',
  '☕ ISHOMA'
];

adminChecks.forEach(c => {
  if (!adminHtml.includes(c)) throw new Error('Missing in admin-dashboard.html: ' + c);
  console.log('✓ Admin includes: ' + c);
});

const doctorChecks = [
  'patientsData',
  'renderPatient',
  'data-patient-id="siti"',
  'tab-history-btn',
  'patient-history-timeline',
  'field-soap-a',
  'btn-doctor-sign',
  'Siti Nurhaliza (22 thn)',
  'Voice Note Pasien Saat Krisis Insomnia (Pukul 02:15 WIB)',
  'BARU SAJA DISAHKAN & TERENKRIPSI'
];

doctorChecks.forEach(c => {
  if (!doctorHtml.includes(c)) throw new Error('Missing in doctor-dashboard.html: ' + c);
  console.log('✓ Doctor includes: ' + c);
});

console.log('✅ ALL DOM COMPONENT VERIFICATIONS PASSED SUCCESSFULLY!');
