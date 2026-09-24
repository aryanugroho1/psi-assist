# Panduan Deployment Menggunakan Docker

Dokumentasi ini menjelaskan cara mengemas (*containerize*) dan menjalankan seluruh komponen aplikasi **MindScribe & Triage AI Platform** menggunakan Docker dan Docker Compose.

---

## 📦 Komponen dalam Container

Container ini menggabungkan seluruh arsitektur sistem secara terpadu:
1. **Frontend & Gateway Server (Port 3000)**:
   - Landing Page Pasien (`index.html`)
   - Dashboard Dokter DPJP (`doctor-dashboard.html`)
   - Dashboard Admin & Kasir (`admin-dashboard.html`)
   - API REST Gateway (`/api/v1/...`)
2. **Drizzle Studio (Port 4983)**:
   - Web GUI Database Inspector SQLite real-time
3. **Persistent SQLite Database (`/app/data/mindscribe.db`)**:
   - Skema ganda terisolasi (`ops_schema` dan `clinical_schema`) dengan enkripsi AES-256 (UU PDP No. 27/2022).

---

## 🚀 Cara Menjalankan (Rekomendasi: Docker Compose)

Pastikan **Docker Desktop** atau Docker Engine telah terpasang di komputer Anda.

### 1. Jalankan dengan Satu Perintah
Buka terminal (PowerShell, Command Prompt, atau Bash) di root folder proyek ini, lalu jalankan:

```bash
docker compose up -d --build
```

> Flag `-d` menjalankan container di background (*detached mode*), dan `--build` memastikan container meng-compile native SQLite bindings secara optimal.

### 2. Buka di Browser
Setelah container berjalan (sekitar 5-10 detik), buka URL berikut di peramban web:

- 🩺 **Doctor Dashboard**: [http://localhost:3000/doctor-dashboard.html](http://localhost:3000/doctor-dashboard.html)
- 📋 **Admin & Kasir Dashboard**: [http://localhost:3000/admin-dashboard.html](http://localhost:3000/admin-dashboard.html)
- 🌐 **Landing Page & Triage**: [http://localhost:3000](http://localhost:3000)
- 🗄️ **Drizzle Studio GUI**: [http://localhost:4983](http://localhost:4983)

---

## 🛠️ Cara Menjalankan Manual (Menggunakan Dockerfile)

Jika Anda ingin mem-build dan menjalankan image tanpa Docker Compose:

### 1. Build Image
```bash
docker build -t psi-assist:latest .
```

### 2. Buat Volume untuk Database
Agar data rekam medis, antrean, dan jadwal tidak hilang saat container direstart:
```bash
docker volume create psi_database_data
```

### 3. Jalankan Container
```bash
docker run -d \
  --name psi-assist-platform \
  -p 3000:3000 \
  -p 4983:4983 \
  -v psi_database_data:/app/data \
  --restart unless-stopped \
  psi-assist:latest
```

---

## 📋 Perintah Pemeliharaan Berguna

### Melihat Log Real-Time
```bash
# Jika menggunakan docker compose:
docker compose logs -f

# Jika menggunakan docker run:
docker logs -f psi-assist-platform
```

### Memeriksa Status Kesehatan (*Healthcheck*)
```bash
docker ps
```
Status akan menampilkan `(healthy)` setelah container berhasil merespons endpoint `/api/v1/health`.

### Menghentikan Container
```bash
# Menghentikan sementara:
docker compose stop

# Menghentikan dan menghapus container (data volume tetap aman):
docker compose down
```

### Masuk ke Dalam Shell Container
Untuk debugging atau memeriksa file di dalam container:
```bash
docker exec -it psi-assist-platform sh
```

### Melakukan Seed Ulang Database (Reset Data Awal)
Jika ingin mengembalikan database ke kondisi awal 13 pasien simulasi + data historis analitik:
```bash
docker exec -it psi-assist-platform npm run db:seed
```
