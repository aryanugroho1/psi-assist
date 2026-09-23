# MindScribe & Triage AI Platform (`psi-assist`)

[![Release](https://img.shields.io/badge/version-1.1.0-teal.svg)](https://github.com/aryanugroho1/psi-assist)
[![Compliance](https://img.shields.io/badge/compliance-UU%20PDP%20No.%2027%2F2022-blue.svg)](https://github.com/aryanugroho1/psi-assist)
[![Standard](https://img.shields.io/badge/standard-Kemenkes%20SATUSEHAT%20%2F%20FHIR-emerald.svg)](https://github.com/aryanugroho1/psi-assist)
[![Security](https://img.shields.io/badge/encryption-AES--256--GCM-indigo.svg)](https://github.com/aryanugroho1/psi-assist)

Platform asisten rekam medis psikiatri berbasis AI (*evidence-grounded* Mental Status Examination / SOAP) yang dilengkapi kanal *triage* krisis malam hari terenkripsi via WhatsApp untuk menghubungkan pasien secara aman ke sesi tatap muka faskes.

---

## 🌟 Fitur Utama

### 1. Doctor Clinical Dashboard (`doctor-dashboard.html`)
- **Overnight Distress Log Ingestion:** Tinjauan keluhan krisis malam hari dari pesan suara WhatsApp yang telah terenkripsi zero-knowledge.
- **Evidence-Grounded AI Scribe:** Draf MSE dan SOAP otomatis dengan *click-to-verify timestamp* yang merujuk langsung ke transkrip rekaman suara sesi tatap muka.
- **Zero-Knowledge Encryption Inspector:** Modal visualisasi pembuktian enkripsi ciphertext `AES-256-GCM` di level database vs teks terdekripsi di layar dokter DPJP.

### 2. Admin & Faskes Operations Dashboard (`admin-dashboard.html`)
- **Manajemen Antrean & Registrasi Pasien:** Pencatatan pasien *walk-in* maupun hasil *triage* malam hari dengan proteksi isolasi skema (UU PDP No. 27/2022).
- **Interactive Doctor Slot Management:** Pengaturan slot jam konsultasi dokter secara real-time, deteksi jam *occupied* (terisi), dan penjadwalan ISHOMA.
- **Kasir & Billing Transaksi:** Rekap pembayaran QRIS Dinamis (Webhook ASPI), Tunai, dan Asuransi/BPJS dengan penerbitan nota kwitansi.
- **Strict Clinical RBAC (HTTP 403 Forbidden):** Perlindungan data rekam medis sensitif dari akses staf non-medis.

### 3. Patient Landing & Emergency Triage Portal (`index.html`)
- **Protokol Darurat Hotline 119 Ext 8:** Penanganan krisis kegawatdaruratan psikiatri dengan panduan rujukan IGD RSJ terdekat.
- **Simulasi Edukasi & Kalkulator ROI Faskes:** Estimasi penghematan waktu dokumentasi klinis hingga 70%.

### 4. Backend Gateway & Database Layer (`backend/` & `drizzle/`)
- **Database Schema via Drizzle ORM:** Pemisahan ketat antara `ops_schema` (antrean, dokter, transaksi) dan `clinical_schema` (rekam medis, transkrip krisis terenkripsi).
- **Crypto Vault:** Enkripsi simetris AES-256-GCM untuk seluruh data klinis pasien.
- **RESTful API:** Endpoint otentikasi JWT, antrean, jadwal dokter, kasir, dan integrasi WhatsApp Service.

---

## 🏗️ Struktur Repositori

```plaintext
psi-assist/
├── index.html                   # Landing page, simulator & triage portal
├── doctor-dashboard.html        # Dashboard klinis dokter spesialis jiwa (Sp.KJ)
├── admin-dashboard.html         # Dashboard operasional, antrean, jadwal & kasir
├── css/
│   ├── components.css           # UI components, badges, modals, cards
│   ├── design-tokens.css        # CSS variables, color palettes, spacing
│   ├── main.css                 # Core styles
│   └── responsive.css           # Mobile & tablet responsiveness
├── js/
│   ├── app.js                   # Application controller & theme switcher
│   ├── auth-modals.js           # Authentication & login dialog handlers
│   ├── roi-calculator.js        # Clinic ROI & time-saving calculation
│   ├── scribe-demo.js           # Interactive AI scribe demonstration
│   └── whatsapp-demo.js         # WhatsApp triage simulator
├── backend/
│   ├── database/                # Database configuration & clients
│   ├── src/
│   │   ├── auth-rbac.js         # JWT & role-based access control
│   │   ├── crypto-vault.js      # AES-256-GCM encryption helpers
│   │   ├── database.js          # In-memory & SQLite data access layer
│   │   ├── server.js            # Express API gateway
│   │   └── whatsapp-service.js  # WhatsApp webhook & messaging logic
│   └── tests/
│       └── test-api-suite.js    # Automated API integration test suite
├── drizzle/
│   ├── schema.js                # Drizzle ORM relational schema definition
│   └── seed.js                  # Database seeder with realistic test data
├── drizzle.config.js            # Drizzle Kit configuration
├── PRD.md                       # Comprehensive Product Requirements Document
├── package.json                 # Project manifest (v1.1.0)
└── .gitignore                   # Git ignore rules for node_modules & databases
```

---

## 📋 Changelog Versioning

### [v1.1.0] - 2026-09-23
- **Feat (Backend & Database):** Integrasi Drizzle ORM schema untuk isolasi `ops_schema` dan `clinical_schema`.
- **Feat (Security):** Implementasi `crypto-vault.js` dengan enkripsi AES-256-GCM zero-knowledge untuk transkrip krisis dan data MSE.
- **Feat (Admin Dashboard):**
  - Manajemen ketersediaan slot konsultasi per dokter dengan status *Occupied*, *Available*, dan *ISHOMA*.
  - Pembaruan modal ubah alur status operasional antrean (*Waiting*, *Called*, *In Session*, *Completed*, *Cancelled*).
  - Pendaftaran pasien walk-in langsung ke slot dokter.
  - Modul kasir dan rekap kwitansi dengan opsi QRIS Dinamis, Tunai, dan Asuransi/BPJS.
- **Feat (Doctor Dashboard):** Penambahan modal inspektur enkripsi zero-knowledge untuk audit kepatuhan UU PDP No. 27/2022.
- **Docs:** Pembaruan dokumentasi README dan manifest versioning `v1.1.0`.

### [v1.0.0] - 2026-09-22
- Rilis inisial platform *MindScribe & Triage AI* (Landing page, Doctor Dashboard, Admin Dashboard, WhatsApp Triage Simulator, dan PRD komprehensif).

---

## 🔒 Standar Kepatuhan & Privasi
- **UU Perlindungan Data Pribadi No. 27/2022:** Pemisahan akses berbasis peran (RBAC) di mana staf operasional non-medis dibatasi aksesnya ke data klinis.
- **SATUSEHAT / FHIR Kemenkes:** Format data encounter klinis dirancang selaras dengan standar interoperabilitas faskes nasional.
