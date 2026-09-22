/* ROI Calculator JS */
(function () {
  'use strict';
  const patientSlider = document.getElementById('slider-patients-count');
  const timeSlider = document.getElementById('slider-baseline-time');
  const patientValLabel = document.getElementById('val-patients-count');
  const timeValLabel = document.getElementById('val-baseline-time');
  const hoursSavedResult = document.getElementById('result-hours-saved');
  const slotsUnlockedResult = document.getElementById('result-slots-unlocked');
  const burnoutDropResult = document.getElementById('result-burnout-drop');

  function calculateROI() {
    if (!patientSlider || !timeSlider) return;
    const patients = parseInt(patientSlider.value, 10);
    const baseline = parseInt(timeSlider.value, 10);
    const savedPerPatient = Math.max(0, baseline - 3);
    const totalMinutes = patients * savedPerPatient * 22;
    const hours = Math.round(totalMinutes / 60);
    const extraSlots = Math.floor(totalMinutes / 30);
    const drop = Math.min(85, Math.round((savedPerPatient / baseline) * 100));

    if (patientValLabel) patientValLabel.textContent = `${patients} Pasien / Hari`;
    if (timeValLabel) timeValLabel.textContent = `${baseline} Menit / Pasien`;
    if (hoursSavedResult) hoursSavedResult.textContent = `${hours} Jam`;
    if (slotsUnlockedResult) slotsUnlockedResult.textContent = `+${extraSlots} Sesi Baru`;
    if (burnoutDropResult) burnoutDropResult.textContent = `-${drop}%`;
  }

  function init() {
    if (patientSlider && timeSlider) {
      patientSlider.addEventListener('input', calculateROI);
      timeSlider.addEventListener('input', calculateROI);
      calculateROI();
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();
