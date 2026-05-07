# E-SIAP (Sistem Izin Pelita Nusantara)

E-SIAP adalah platform digital modern yang dirancang khusus untuk mempermudah proses administrasi perizinan siswa (sakit & izin) di SMK Plus Pelita Nusantara. Sistem ini mendukung alur persetujuan terstruktur yang melibatkan Siswa, Wali Kelas, dan Guru Piket, lengkap dengan fitur tanda tangan digital dan pembuatan laporan otomatis.

## 🚀 Fitur Utama

*   **Autentikasi Multi-Peran**: 
    *   Halaman login terpisah untuk **Siswa** dan **Guru Piket** (Admin).
    *   Sistem keamanan menggunakan JWT (JSON Web Token) dan enkripsi password `bcryptjs`.
*   **Alur Perizinan Cerdas**:
    *   Siswa mengajukan izin/sakit melalui dashboard.
    *   Otomatis membuat *shareable link* (tautan yang bisa dibagikan) ke Wali Kelas untuk meminta tanda tangan digital.
    *   Setelah Wali Kelas menyetujui, surat izin otomatis diteruskan ke antrean Guru Piket untuk persetujuan akhir.
*   **Tanda Tangan Digital**: Integrasi kanvas interaktif yang memungkinkan Wali Kelas dan Guru Piket menandatangani surat secara elektronik tanpa perlu membuat akun khusus untuk Wali Kelas (berbasis URL aman).
*   **Laporan & Ekspor Otomatis**:
    *   **Cetak PDF**: Mengekspor surat izin individual ke format PDF beserta detail, tanda tangan, dan cap waktu.
    *   **Laporan Excel**: Guru Piket dapat mengekspor rekap aktivitas perizinan secara kolektif berdasarkan filter rentang tanggal ke dalam format Excel (`.xlsx`).
*   **Desain Modern (Paduka UI)**: Antarmuka *Light Theme* yang sangat profesional, responsif, dan mudah digunakan (menggunakan Tailwind CSS dengan *color tokens* spesifik SMK Plus Pelita Nusantara).

## 🛠️ Teknologi yang Digunakan

**Frontend:**
*   React 19 (TypeScript)
*   Vite
*   Tailwind CSS (Styling & Utilities)
*   Framer Motion (Animasi UI)
*   Lucide React (Ikon)
*   React Signature Canvas
*   jsPDF & XLSX (Export Laporan)

**Backend:**
*   Node.js & Express.js (TypeScript)
*   MySQL (Database Relasional)
*   JSON Web Token (Manajemen Sesi)
*   Bcrypt.js (Hashing Password)

## ⚙️ Prasyarat Instalasi

Pastikan Anda telah menginstal *tools* berikut sebelum menjalankan aplikasi:
1.  [Node.js](https://nodejs.org/) (versi 18 ke atas)
2.  [MySQL Server](https://dev.mysql.com/downloads/mysql/) (XAMPP atau MySQL native)
3.  [Git](https://git-scm.com/)

## 🏃 Cara Menjalankan Secara Lokal

1.  **Clone repositori ini:**
    ```bash
    git clone https://github.com/DevacctoRPL/siap-penus.git
    cd siap-penus
    ```

2.  **Instal dependensi:**
    ```bash
    npm install
    ```

3.  **Konfigurasi Database (.env):**
    Buat file `.env` di root folder (bisa menyalin dari `.env.example`) dan sesuaikan dengan konfigurasi MySQL lokal Anda:
    ```env
    DB_HOST=localhost
    DB_PORT=3306
    DB_USER=root
    DB_PASSWORD=password_mysql_anda
    DB_NAME=siap_db
    PORT=3000
    JWT_SECRET=rahasia_jwt_anda
    ```

4.  **Siapkan Database:**
    Buat database kosong bernama `siap_db` di MySQL Anda. Aplikasi ini dilengkapi dengan skrip yang akan **secara otomatis membuat tabel dan melakukan *seeding* data awal** saat server pertama kali dijalankan.

5.  **Jalankan Server Mode Pengembangan:**
    ```bash
    npm run dev
    ```
    Aplikasi akan berjalan secara paralel (Vite Frontend & Express Backend) di `http://localhost:3000`.

## 👨‍💻 Kredensial Uji Coba

Saat server pertama kali berjalan, sistem akan menyuntikkan beberapa pengguna default untuk testing:

*   **Siswa (Student):**
    *   NIS: `12345`
    *   Password: `murid123`
*   **Guru Piket (Admin):**
    *   Pilih nama Guru Piket di halaman login
    *   Password: `guru123`

## 📦 Deployment (Production)

Untuk melakukan *build* ke produksi:
```bash
npm run build
```
Perintah ini akan menggabungkan *frontend* ke folder `dist`. *Backend* akan secara otomatis menyajikan (*serve*) file statis tersebut pada *port* yang sama.

## ©️ Lisensi & Kredit
Dikembangkan dengan ❤️ oleh **Devacto IT RPL - SMK Plus Pelita Nusantara** (2026).
