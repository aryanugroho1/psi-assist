# Product Requirements Document: MindScribe & Triage AI

## Product Overview

**Product Vision:** Memotong beban dokumentasi administratif psikiater hingga 70% melalui asisten rekam medis AI berbasis bukti (*evidence-grounded* MSE/SOAP), sembari menyediakan kanal *triage* krisis malam hari terenkripsi via WhatsApp untuk menjembatani pasien langsung ke sesi tatap muka (*offline meeting*).

**Target Users:**

* **Primary:** Dokter Spesialis Kedokteran Jiwa (Sp.KJ) dan Pasien Psikiatri rawat jalan yang mengalami lonjakan kecemasan (*anxiety spike*) di luar jam operasional klinik.
* **Secondary:** Staf Administrasi & Kasir Klinik/Rumah Sakit Jiwa (RSJ).

**Business Objectives:**

* Menurunkan waktu pengerjaan dokumentasi status mental psikiatri dari 15–20 menit menjadi < 3 menit per pasien.
* Mengamankan konversi pasien krisis malam hari ke reservasi konsultasi tatap muka esok harinya (> 60% konversi).
* Memenuhi kepatuhan penuh terhadap UU Perlindungan Data Pribadi (UU PDP No. 27/2022) dan standar SaMD/SATUSEHAT Kemenkes RI.
* Membangun invensi teknis yang berpotensi dipatenkan (*patentable architecture*) pada metode isolasi data pesan instan dan verifikasi *grounding* rekam medis.

**Success Metrics:**

* Tingkat akurasi dan adopsi draf MSE: > 85% draf disetujui dokter tanpa perubahan mayor.
* Efisiensi dokumentasi: Rata-rata waktu telaah draf < 3 menit per pasien.
* Nilai kepuasan psikiater (NPS > 50).
* Nol insiden kebocoran data medis (*Zero Data Breach Incident*).

---

## User Personas

### Persona 1: dr. Hendra, Sp.KJ (Psikiater Klinis)

* **Demographics:** 42 tahun, Dokter Spesialis Kedokteran Jiwa di RS Swasta & Klinik Mandiri, kemahiran teknis menengah.
* **Goals:** Fokus mendengarkan interaksi verbal dan afek pasien tanpa terdistraksi mengetik di laptop; menyelesaikan rekam medis secara cepat dan presisi tanpa risiko hukum/malpraktik.
* **Pain Points:** *Administrative burnout* akibat mengetik draf Mental Status Examination (MSE) dan SOAP yang berulang; sering kehilangan konteks riwayat krisis pasien yang terjadi di malam hari akibat bias memori pasien (*memory bias*).
* **User Journey:** Membuka WebApp Dokter di pagi hari $\rightarrow$ meninjau kartu *Overnight Distress Log* pasien $\rightarrow$ menekan tombol rekam saat sesi *offline* berlangsung $\rightarrow$ mereviu draf MSE dengan *click-to-verify timestamp* $\rightarrow$ menyetujui (*approve & sign*) rekam medis.

### Persona 2: Rian (Pasien Rawat Jalan - Generalized Anxiety Disorder)

* **Demographics:** 27 tahun, Karyawan Swasta, sangat mahir menggunakan smartphone/WhatsApp.
* **Goals:** Mendapatkan rasa aman, validasi cepat, dan akses reservasi dokter tatap muka ketika serangan panik melanda di malam hari (pukul 01.00–03.00) tanpa prosedur registrasi aplikasi baru yang rumit.
* **Pain Points:** Bingung mencari bantuan saat klinik tutup; enggan mengetik panjang di aplikasi saat tangan gemetar atau pikiran kalut; khawatir curhatannya bocor ke staf administrasi faskes.
* **User Journey:** Membuka WhatsApp klinik saat cemas $\rightarrow$ memilih dokter dan jam sesi *offline* esok hari $\rightarrow$ mengirimkan *Voice Note* curhat singkat $\rightarrow$ menerima konfirmasi jadwal dan panduan *grounding* $\rightarrow$ menghadiri sesi tatap muka esok paginya.

---

## Feature Requirements

| Feature | Description | User Stories | Priority | Acceptance Criteria | Dependencies |
| --- | --- | --- | --- | --- | --- |
| **WhatsApp Crisis & Booking Gateway** | Bot WhatsApp interaktif untuk reservasi dokter *offline* dan perekaman curhat malam hari. | Sebagai pasien yang sedang cemas di malam hari, saya ingin memilih dokter dan mengirim *voice note* curhat agar dokter memahami kondisi saya besok. | Must | 1. Tampilkan daftar dokter & slot jam esok hari.<br>

<br>2. Wajibkan input VN/teks setelah pemilihan jam.<br>

<br>3. Pesan otomatis terhapus dari WhatsApp (< 60 detik) setelah ditransfer ke backend. | Meta WhatsApp Business API Webhook |
| **Overnight Distress Preview** | Modul ringkasan kondisi krisis malam hari di dasbor dokter. | Sebagai dokter, saya ingin melihat ringkasan gejala dan mendengarkan VN semalam sebelum sesi dimulai agar saya memiliki konteks klinis akurat. | Must | 1. Menampilkan skor cemas (1-10), gejala somatik, dan pemicu utama.<br>

<br>2. Menyediakan audio player VN berdurasi terbatas dengan token kedaluwarsa 60 detik. | WhatsApp Ingestion Service, S3 Encrypted Storage |
| **Hybrid AI Scribe & MSE Generator** | Transkripsi audio sesi tatap muka via Groq Whisper dan ekstraksi draf otomatis MSE/SOAP via Groq Llama-3.3-70B. | Sebagai dokter, saya ingin percakapan sesi ditranskripsi dan dipetakan ke format MSE secara instan tanpa membebani komputer lokal. | Must | 1. Transkripsi audio via Groq `whisper-large-v3-turbo` (format verbose JSON untuk segmentasi waktu).<br>

<br>2. Ekstraksi otomatis format MSE baku (Mood, Afek, Isi Pikir, Persepsi, Risiko Suisidal) dan SOAP via Groq `llama-3.3-70b-versatile`.<br>

<br>3. Pemrosesan selesai dalam waktu < 10 detik setelah sesi berhenti. | Groq Cloud API (STT & LLM) |
| **Click-to-Verify Grounding** | Tautan interaktif antara klaim draf AI dengan *timestamp* rekaman audio asli. | Sebagai dokter, saya ingin memverifikasi klaim AI dengan mendengarkan detik audio terkait agar terhindar dari halusinasi AI. | Must | 1. Setiap indikator klinis memiliki *badge timestamp* (misal `[11:24]`).<br>

<br>2. Mengklik *badge* memutar audio 10 detik tepat pada kalimat tersebut diucapkan.<br>

<br>3. Teks draf 100% dapat diedit secara manual oleh dokter. | Web Audio API, Segment Timestamps |
| **Strict Role-Based Access Control (RBAC)** | Pemisahan akses total antara modul operasional admin dan modul klinis dokter. | Sebagai pasien & dokter, kami ingin memastikan data curhat dan rekam medis tidak dapat diakses oleh staf administrasi non-medis. | Must | 1. Admin Portal hanya dapat melihat Nama, No. HP, Jam Janji Temu, dan Status Pembayaran.<br>

<br>2. Seluruh endpoint API rekam medis memblokir `ROLE_ADMIN` (HTTP 403 Forbidden).<br>

<br>3. Enkripsi data medis menggunakan skema basis data terisolasi. | Auth Service (JWT + Schema Isolation) |
| **Conversational Pre-Session Intake** | Formulir adaptif berbasis PWA untuk instrumen kuesioner medis baku (PHQ-9 & GAD-7). | Sebagai dokter, saya ingin pasien baru mengisi kuesioner baku sebelum sesi agar riwayat klinis terpetakan otomatis. | Should | 1. Dapat diakses via *Magic Link* satu kali pakai.<br>

<br>2. Menyajikan kuesioner format kartu tunggal.<br>

<br>3. Menghasilkan skor PHQ-9 & GAD-7 otomatis di dasbor dokter. | Patient PWA Module |
| **SATUSEHAT & EMR Connector** | Adapter interoperabilitas untuk standardisasi data rekam medis ke sistem Kemenkes. | Sebagai manajemen klinik, saya ingin rekam medis terhubung ke SATUSEHAT Kemenkes agar faskes mematuhi regulasi pemerintah. | Should | 1. Transformasi draf MSE/SOAP yang disetujui ke format HL7 FHIR (`Encounter`, `Condition`).<br>

<br>2. Dukungan ekspor kode ICD-10 dan ICD-11 via MTLS. | SATUSEHAT Sandbox/Production Gateway |
| **Edge Passive Sensing Monitoring** | Pemantauan pasif *digital biomarkers* di smartphone pasien untuk deteksi risiko kekambuhan (*relapse*). | Sebagai dokter, saya ingin menerima peringatan jika pasien bipolar/depresi berat mengalami anomali pola tidur/aktivitas. | Could | 1. Pengumpulan metadata pola tidur & kecepatan mengetik secara *on-device* (Edge AI).<br>

<br>2. Mengirimkan skor anomali ke backend tanpa mengekspos isi konten teks.<br>

<br>3. Notifikasi *Red Alert* di dasbor dokter jika deviasi > 2.5 SD. | Mobile Native SDK (TFLite/CoreML) |

---

## User Flows

### Flow 1: Overnight Crisis Venting & Offline Booking (Pasien via WhatsApp)

1. Pasien mengirim pesan teks keluhan cemas/panik ke WhatsApp resmi klinik pada malam hari.
2. Bot merespons dengan empati singkat dan menampilkan tombol interaktif: daftar dokter spesialis jiwa yang berpraktik esok hari.
3. Pasien memilih profil dokter yang diinginkan.
4. Bot menampilkan slot jam konsultasi tatap muka yang masih tersedia untuk dokter tersebut.
5. Pasien memilih salah satu slot jam.
6. Bot mengirimkan instruksi wajib: *"Silakan rekam pesan suara (Voice Note) atau ketik hal yang membuat Anda cemas malam ini agar dokter dapat mempelajarinya sebelum sesi besok."*
7. Pasien mengirimkan *Voice Note* (durasi 30–120 detik).
8. Sistem Webhook backend mengunduh audio, menyimpannya ke database terenkripsi, dan menghapus pesan asli di WhatsApp (*auto-purge* via API).
9. Bot mengirimkan pesan konfirmasi reservasi *offline* disertai panduan latihan pernapasan/grounding.
* *Alternative path (High-Risk Crisis Detected):* Jika teks/transkrip curhat terdeteksi mengandung indikasi bunuh diri (*self-harm*), bot seketika memunculkan kontak darurat *Hotline Kemenkes 119 ext 8* serta kontak darurat keluarga.
* *Error state:* Jika slot jam tiba-tiba penuh saat dipilih, bot menampilkan pesan maaf dan menyajikan slot jam alternatif terdekat.



### Flow 2: In-Session Live Scribe & Evidence Verification (Dokter via WebApp)

1. Dokter membuka WebApp Dokter, melihat antrean pasien hari ini, dan mengklik nama pasien yang memiliki *badge* `[🌙 Overnight Log]`.
2. Dokter membaca ringkasan krisis semalam dan memutar rekaman *Voice Note* pasien (durasi < 1 menit) sebelum memanggil pasien masuk.
3. Pasien duduk di ruang konsultasi; dokter menekan tombol *"Mulai Sesi"* di WebApp.
4. Sistem merekam audio percakapan konsultasi secara *real-time*.
5. Sesi konsultasi selesai; dokter menekan tombol *"Selesai Sesi"*.
6. Backend mengirimkan berkas audio ke Groq `whisper-large-v3-turbo` $\rightarrow$ menerima transkrip tersegmen $\rightarrow$ meneruskannya ke Groq `llama-3.3-70b-versatile` $\rightarrow$ draf MSE & SOAP terstruktur tampil di layar dalam hitungan detik.
7. Dokter meninjau draf; dokter mengklik salah satu *badge timestamp* pada poin yang dirasa ambigu untuk memverifikasi rekaman audio 10 detik terkait.
8. Dokter mengedit kata-kata jika diperlukan, lalu menekan tombol *"Approve & Sign"*.
9. Sistem menyimpan rekam medis final ke basis data terenkripsi dan menjadwalkan penghapusan berkas rekaman suara mentah maksimal 24 jam kemudian.
* *Alternative path:* Dokter membatalkan sesi perekaman di tengah jalan $\rightarrow$ berkas audio dibuang seketika dari memori temporer tanpa disimpan.
* *Error state:* Jika koneksi internet terputus saat sesi berlangsung, audio di-*buffer* secara aman di *local cache* browser dan diunggah ulang saat koneksi pulih.



---

## Non-Functional Requirements

### Performance

* **Load Time:** Dasbor WebApp Dokter wajib termuat penuh dalam waktu < 2.0 detik pada koneksi internet standar (10 Mbps).
* **Concurrent Users:** Arsitektur backend mampu menangani minimal 200 percakapan WhatsApp asinkron bersamaan dan 50 sesi perekaman audio aktif secara simultan tanpa degradasi performa.
* **Response Time:** Respons balasan bot WhatsApp < 2 detik; waktu tunggu draf MSE/SOAP setelah tombol selesai ditekan < 10 detik (berkat akselerasi Groq LPU).

### Security & Threat Mitigation

* **Authentication:** WebApp Dokter dan Portal Admin wajib menerapkan otentikasi berbasis JWT dengan *Two-Factor Authentication* (2FA). Sesi *idle* kedaluwarsa setelah 15 menit.
* **Authorization:** *Role-Based Access Control* (RBAC) ketat dengan pemisahan peran: `ROLE_PATIENT`, `ROLE_DOCTOR`, dan `ROLE_ADMIN`. Skema basis data operasional dan klinis terpisah penuh.
* **Data Protection:**
* Enkripsi *in-transit* menggunakan TLS 1.3.
* Enkripsi *at-rest* menggunakan AES-256-GCM (`pgcrypto`) untuk data klinis, transkrip, dan berkas audio.
* Validasi Webhook Meta WhatsApp menggunakan verifikasi tanda tangan **HMAC SHA-256**.
* URL berkas audio menggunakan *Time-Limited Short-Lived Presigned URLs* (maksimal aktif 60 detik).
* Teks curhat pasien diisolasi dengan *delimiters* ketat (`[USER_INPUT]`) dan difilter melalui *Guardrails Engine* untuk mencegah serangan *prompt injection*.
* Berkas audio sesi tatap muka wajib dihapus permanen (*auto-purged*) maksimal 24 jam setelah rekam medis disetujui dokter.



### Compatibility

* **Devices:**
* Pasien: Seluruh smartphone iOS & Android yang mendukung aplikasi WhatsApp resmi.
* Dokter: Desktop PC, Laptop, dan Tablet (iPad / Android Tablet) dengan mikrofon terintegrasi atau eksternal.
* Admin: Desktop PC / Laptop kerja.


* **Browsers:** Google Chrome (v110+), Mozilla Firefox (v110+), Apple Safari (v16+), dan Microsoft Edge (v110+).
* **Screen Sizes:** Responsif dari layar minimal 360x640 px (PWA Pasien) hingga resolusi desktop 1920x1080 px (Dasbor Dokter & Admin).

### Accessibility

* **Compliance Level:** Memenuhi standar dasar WCAG 2.1 Level AA.
* **Specific Requirements:** Dukungan kontras warna tinggi, navigasi ramah pembaca layar (*screen-reader*), penyesuaian ukuran font, serta dukungan penuh pintasan keyboard (*keyboard shortcuts*) untuk fungsi verifikasi audio di dasbor dokter.

---

## Technical Specifications

### Frontend

* **Technology Stack:** Next.js / React.js, TypeScript, Tailwind CSS, Shadcn UI, Web Audio API.
* **Design System:** Desain bertema medis minimalis (Deep Navy Blue, Calming Teal, dan Slate Gray) dengan tipografi interaktif berjarak pandang luas.
* **Portals Separation:**
1. *Pasien Interface:* WhatsApp Interactive Messages & PWA Intake.
2. *login interface:* login dokter dan admin (login dokter dan admin harus ada di halaman yang berbeda)
3. *Dokter WebApp after login:* 3-Column Workspace (Queue Pasien, calendar slot availability with time basis, MSE Interactive Editor, Live Scribe Controls).
4. *Admin Portal after login:* Manajemen antrean, dokter, dan transaksi tanpa akses rekam medis.



### Backend

* **Technology Stack:** Node.js / Go (untuk Ingestion Service, API Gateway, dan Event Bus), Python FastAPI (untuk Security Engine & Anonymizer).
* **API Requirements:** RESTful API dengan enkripsi payload JSON, didukung WebSocket untuk pembaruan status transkripsi *real-time*.
* **Database:** PostgreSQL dengan ekstensi `pgcrypto` dan isolasi skema:
* `ops_schema`: Tabel `patients`, `doctors`, `appointments` (Dapat diakses Admin & Dokter).
* `clinical_schema`: Tabel `overnight_logs`, `medical_records` (Terisolasi ketat, hanya dapat diakses Dokter & AI Engine).


* **AI Processing Pipeline (Hybrid Serverless via Groq):**
* **Speech-to-Text:** Groq API `whisper-large-v3-turbo` (ekstraksi segmen transkrip dan penanda detik).
* **Clinical Scribe:** Groq API `llama-3.3-70b-versatile` (generasi format baku MSE & SOAP berbasis JSON Schema).



### Infrastructure (Local Host & Deployment Environment)

* **Local Host Machine:** Laptop Asus UX410UQ
* **OS:** Ubuntu Server 24.04 LTS (Headless, SSH Access Enabled)
* **Storage:** 512GB SSD
* **Hardware Specs:** Intel Core 7th Gen, 8GB System RAM, NVIDIA GeForce 940MX (2GB VRAM)


* **Service Orchestration:** **Coolify PaaS** berjalan di atas Docker Engine untuk mengelola container:
* `mindscribe-backend`: Ingestion API & Webhook Handler
* `mindscribe-doctor-web`: Next.js Clinical Dashboard
* `mindscribe-admin-portal`: React Admin Management
* `redis-queue`: Message Broker & Task Buffer


* **Database Co-existence:** PostgreSQL instance lokal yang sudah ada digunakan bersama dengan membuat basis data terpisah `mindscribe_db` beserta skema terisolasinya (`ops_schema` dan `clinical_schema`).
* **Networking & Ingress:**
* **Tailscale VPN:** Akses remote privat untuk tim developer dan demo perangkat dokter (tablet/laptop).
* **Cloudflare Tunnel / Tailscale Funnel:** Mengekspos port webhook lokal ke domain publik ber-SSL valid agar dapat menerima panggilan balik dari Meta WhatsApp API.


* **Resource Footprint:** Beban RAM lokal dibatasi pada **~2.8 GB** (masih tersisa > 5 GB RAM bebas). CPU dan GPU laptop tetap dingin karena beban komputasi AI STT dan LLM 100% diproses melalui panggilan *outbound* HTTPS ke Groq LPU API.

---

## Analytics & Monitoring

* **Key Metrics:** Tingkat konversi reservasi WhatsApp, *latency* inferensi AI Scribe, rasio revisi draf MSE oleh dokter (*Edit Distance*), dan frekuensi klik verifikasi *timestamp*.
* **Events:** `patient_crisis_wa_triggered`, `booking_completed`, `voice_note_ingested`, `session_recording_started`, `draft_mse_generated`, `timestamp_citation_clicked`, `record_approved_by_doctor`.
* **Dashboards:**
* *Clinical Performance Dashboard:* Metrik penghematan waktu dokumentasi psikiater.
* *System Reliability Dashboard:* Latensi respons Groq API, antrean Redis, dan ketersediaan Webhook.
* *Immutable Audit Trail:* Riwayat akses baca dan dekripsi data rekam medis oleh akun dokter.


* **Alerting:** Pemicu notifikasi otomatis (Telegram/PagerDuty) jika antrean transkripsi tertunda > 30 detik, terjadi kegagalan verifikasi HMAC Webhook, atau muncul galat HTTP 5xx berulang.

---

## Release Planning

### MVP (v1.0) - Showcase & Clinical Pilot

* **Features:**
* WhatsApp Bot Triage & Offline Booking (termasuk perekaman Voice Note curhat malam hari).
* WebApp Dokter (Tampilan *Overnight Distress Log*, Live Scribe Sesi Tatap Muka, Ekstraksi MSE & SOAP via Groq, *Click-to-Verify Citations*).
* Admin Portal (Manajemen jadwal dan status kehadiran pasien).
* Infrastruktur lokal di Asus UX410UQ via Coolify, Docker, Tailscale, dan integrasi Groq API.
* Skema Keamanan Dasar (Enkripsi AES-256, *Auto-Delete* pesan WhatsApp, Isolasi Skema Database).


* **Timeline:** Bulan 1 – Bulan 4.
* **Success Criteria:** Berhasil dipresentasikan dalam uji coba *pilot* di 3 klinik/praktek psikiater mitra; waktu pembuatan status mental turun ke < 3 menit; > 85% draf disetujui tanpa revisi mayor.

### Future Releases

* **v1.1 (Bulan 5 – 6):** Peluncuran modul PWA Pasien untuk *Pre-Session Intake* (kuesioner baku PHQ-9 dan GAD-7) dengan perhitungan skor otomatis.
* **v1.2 (Bulan 7):** Integrasi *interoperabilitas* resmi ke sistem rekam medis RS dan gateway **SATUSEHAT Kemenkes RI** menggunakan format HL7 FHIR.
* **v2.0 (Bulan 8 – 12):** Peluncuran modul *Continuous Monitoring* berbasis *Passive Sensing* (analisis dinamika ketikan dan pola tidur secara *on-device*) untuk deteksi dini risiko kekambuhan (*Relapse Warning Score*).

---

## Open Questions & Assumptions

* **Question 1:** Apakah integrasi SATUSEHAT Kemenkes RI ke depan mewajibkan pelaporan setiap poin indikator MSE secara terpisah, atau cukup dirangkum dalam blok diagnosis SOAP?
* **Question 2:** Bagaimana respons dan adopsi pasien kelompok usia di atas 50 tahun terhadap kewajiban mengirimkan rekaman suara (*Voice Note*) di WhatsApp saat reservasi malam hari?
* **Assumption 1:** Faskes atau ruang praktik psikiater mitra memiliki mikrofon ruangan yang cukup jernih dan koneksi internet stabil minimal 10 Mbps.
* **Assumption 2:** Pasien yang mengalami serangan cemas di malam hari merasa lebih terbantu dan lega dengan mengirim pesan suara (*Voice Note*) dibanding mengetik kalimat panjang di ponsel.
* **Assumption 3:** Komite etik medis dan manajemen faskes menyetujui penggunaan draf rekam medis berbasis AI asalkan dokter penanggung jawab pelayanan (DPJP) melakukan verifikasi dan penandatanganan akhir secara penuh (*Human-in-the-Loop*).

---

## Appendix

### Competitive Analysis

* **Kompetitor Global (Abridge / Ambience Healthcare / Nuance DAX):**
* *Strengths:* Sangat matang dalam integrasi EMR besar (Epic, Cerner), akurasi model bahasa medis umum tinggi.
* *Weaknesses:* Biaya langganan sangat mahal untuk faskes lokal Indonesia; tidak mendukung konteks bahasa dan slang lokal Indonesia; tidak memiliki modul *triage* krisis malam hari terintegrasi via WhatsApp.


* **Penyedia EMR Lokal Tradisional:**
* *Strengths:* Memiliki modul kasir, farmasi, dan klaim BPJS Kesehatan.
* *Weaknesses:* Tidak memiliki otomatisasi AI; dokter tetap harus mengetik manual seluruh teks naratif MSE/SOAP; tidak memfasilitasi penanganan krisis pasien di luar jam operasional klinik.



### User Research Findings

* **Finding 1:** 8 dari 10 psikiater menyatakan beban terberat harian adalah mengetik evaluasi status mental berulang kali yang memicu kelelahan kognitif dan mengurangi kontak mata dengan pasien.
* **Finding 2:** 100% pasien gangguan kecemasan yang disurvei enggan mengunduh aplikasi baru saat mengalami serangan panik, namun merasa sangat nyaman berinteraksi lewat WhatsApp.
* **Finding 3:** Psikiater menolak sistem AI yang bersifat "kotak hitam" (*black-box*); mereka menuntut adanya bukti kalimat asli pasien sebelum menyetujui draf klinis.

### AI Conversation Insights

* **Conversation 1:** Diskusi arsitektur awal; menyepakati WhatsApp sebagai media penampung krisis ber-friction rendah dengan kebijakan penghapusan otomatis (*auto-delete*) agar tidak meninggalkan jejak data medis di server pihak ketiga.
* **Conversation 2:** Evaluasi kebutuhan komputasi hardware lokal Asus UX410UQ (RAM 8GB / GPU 940MX); memutuskan penggunaan arsitektur hybrid dengan Groq LPU API (`whisper-large-v3-turbo` dan `llama-3.3-70b-versatile`) untuk menjaga performa berkecepatan tinggi dengan biaya yang sangat murah.
* **AI-Generated Edge Cases:**
* Pasien mengirim rekaman suara kosong atau hanya desah napas panik saat malam hari.
* Pasien menyebutkan data sensitif pihak ketiga yang harus disaring modul *PII Anonymizer*.
* Pasien memasukkan perintah manipulatif (*prompt injection*) untuk mendapatkan resep obat keras secara otomatis.


* **AI-Suggested Improvements:**
* Penerapan tanda tangan HMAC SHA-256 pada webhook WhatsApp untuk mencegah pemalsuan pesan.
* Penggunaan *presigned URL* berdurasi 60 detik untuk pemutaran audio di dasbor dokter.
* Pengacakan timestamp operasional (*jittering*) pada basis data admin untuk mencegah serangan penarikan kesimpulan identitas pasien krisis (*inference attack*).



### Glossary

* **Mental Status Examination (MSE):** Format evaluasi klinis terstruktur dalam psikiatri untuk menilai kondisi psikologis pasien saat wawancara (mood, afek, isi pikir, persepsi, kognisi, tilikan, dan risiko).
* **SOAP:** Format pencatatan rekam medis standar: *Subjective*, *Objective*, *Assessment*, dan *Plan*.
* **Evidence-Based Grounding:** Metode penambatan keluaran AI pada bukti faktual terverifikasi berupa kutipan kata-kata asli dan penanda waktu rekaman audio.
* **Zero Data Retention (ZDR):** Kebijakan pemrosesan di mana penyedia layanan komputasi/API tidak menyimpan atau menggunakan data masukan pengguna untuk pelatihan model.
* **Role-Based Access Control (RBAC):** Pembatasan hak akses sistem aplikasi berdasarkan peran kerja yang sah.
