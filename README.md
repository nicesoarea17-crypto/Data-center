# MFlash Data Center

Aplikasi web untuk menggabungkan data Accurate seluruh cabang MFlash (Daftar Pelanggan dan Rincian Faktur Penjualan), menampilkan **Dashboard Gross Profit** per pilar dan per cabang, serta mengunduh data gabungan ke Excel.

- **Hosting:** Cloudflare Pages (dari GitHub), sama seperti dashboard sewa
- **Database dan login:** Supabase (project baru, terpisah dari dashboard sewa)
- **Tanpa build:** cukup file `index.html`, `app.js`, dan `config.js`

## Isi paket

| File | Fungsi |
|---|---|
| `index.html` | Tampilan aplikasi |
| `app.js` | Logika aplikasi: login, unggah, dashboard, data, pengguna |
| `config.js` | Alamat dan kunci Supabase (**wajib diisi**) |
| `supabase/schema.sql` | Struktur database, aturan akses, dan fungsi dashboard |

## Peran pengguna

| Peran | Unggah data | Lihat dashboard dan data | Kelola pengguna |
|---|---|---|---|
| Super Admin | Semua cabang | Semua cabang | Ya |
| Divisi | Tidak | Semua cabang | Tidak |
| Cabang | Hanya cabangnya | Hanya cabangnya | Tidak |
| Belum aktif | Tidak | Tidak | Tidak |

Aturan ini dijaga di database (Row Level Security), bukan hanya di tampilan. Akun cabang tidak bisa menulis atau membaca data cabang lain walaupun mencoba langsung lewat API.

---

## Langkah pemasangan (sekali saja, sekitar 20 menit)

### 1. Buat project Supabase baru
1. Masuk ke https://supabase.com/dashboard, lalu klik **New project**.
2. Beri nama, misalnya `mflash-data-center`. Pilih region **Southeast Asia (Singapore)**, buat password database, dan simpan password itu.
3. Tunggu sampai project siap.

### 2. Pasang struktur database
1. Buka menu **SQL Editor**, lalu klik **New query**.
2. Buka file `supabase/schema.sql`, salin seluruh isinya, tempel ke editor, lalu klik **Run**.
3. Pastikan hasilnya *Success*. File ini aman dijalankan ulang kalau nanti ada pembaruan.

### 3. Matikan pendaftaran bebas
Buka **Authentication → Sign In / Providers**, lalu matikan **Allow new users to sign up**. Dengan begitu hanya Super Admin yang bisa membuat akun.

### 4. Buat akun Super Admin (akun Anda)
1. Buka **Authentication → Users → Add user → Create new user**.
2. Isi email dan kata sandi Anda, lalu centang **Auto Confirm User** dan klik **Create user**.
3. Kembali ke **SQL Editor**, lalu jalankan perintah ini (ganti emailnya):
   ```sql
   update public.profiles set peran = 'super_admin', nama = 'Toni Nugroho'
    where email = 'email-anda@contoh.com';
   ```

### 5. Isi `config.js`
1. Di Supabase, buka **Project Settings → API** (atau **Data API**).
2. Salin **Project URL** dan **anon public key**.
3. Buka `config.js`, lalu ganti kedua isian:
   ```js
   window.MFLASH_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi..."
   };
   ```
   *Anon key* memang aman diletakkan di sini, karena data tetap dilindungi aturan akses di database. Jangan pernah memasukkan **service_role key** ke file ini.

### 6. Unggah ke GitHub
1. Buat repository baru di GitHub, misalnya `MFlash-Data-Center` (sebaiknya **Private**).
2. Klik **Add file → Upload files**, lalu tarik semua isi folder ini (`index.html`, `app.js`, `config.js`, `README.md`, dan folder `supabase`). Klik **Commit changes**.

### 7. Hubungkan ke Cloudflare Pages
1. Masuk ke Cloudflare, lalu buka **Workers & Pages → Create → Pages → Connect to Git**.
2. Pilih repository `MFlash-Data-Center`.
3. Atur build sebagai berikut:
   - **Framework preset:** None
   - **Build command:** kosongkan
   - **Build output directory:** `/`
4. Klik **Save and Deploy**. Setelah selesai, aplikasi bisa dibuka di alamat `https://<nama-project>.pages.dev`.

Setiap kali file di GitHub diubah, Cloudflare akan memperbarui aplikasinya secara otomatis.

### 8. Masuk dan unggah data pertama
1. Buka alamat aplikasi dan masuk dengan akun Super Admin.
2. Buka menu **Unggah Data**, tarik file export Accurate (Daftar Pelanggan dan Rincian Faktur Penjualan) dari semua cabang, lalu klik **Unggah ke server**.
3. Buka **Dashboard Gross Profit**. Angkanya langsung tampil.

---

## Menambah pengguna (cabang dan divisi)
1. Buka Supabase → **Authentication → Users → Add user → Create new user**. Isi email dan kata sandi, lalu centang **Auto Confirm User**.
2. Di aplikasi, buka menu **Pengguna**. Akun baru muncul dengan peran "Belum aktif". Pilih perannya (**Cabang** beserta cabangnya, atau **Divisi** beserta nama divisinya), lalu klik **Simpan**.
3. Berikan email, kata sandi, dan alamat aplikasi kepada penggunanya. Mereka bisa mengganti kata sandi sendiri lewat tombol **Ubah sandi**.

## Cara kerja data
- **Kolom CABANG** selalu menjadi kolom pertama. Cabang dikenali dari nama file Accurate (misal `003mflashbintar` → Bintara) dan bisa diubah sebelum diunggah.
- **Pelanggan** dicocokkan dengan **Cabang + ID Pelanggan**, karena ID yang sama bisa dipakai cabang lain untuk orang berbeda. Unggah ulang akan memperbarui data pelanggan yang sudah ada.
- **Faktur** dengan nomor yang sama di cabang yang sama akan diganti versi terbaru. Jadi aman mengunggah periode yang tumpang tindih, misalnya export mingguan yang mencakup awal bulan.
- **Saling melengkapi:** faktur mendapat No WA, kecamatan, kota, dan referensi dari Data Pelanggan. Pelanggan mendapat riwayat transaksi (jumlah faktur, total belanja, total GP, faktur terakhir) dari faktur.
- **Gross Profit = TOTAL HARGA − HARGA BELI** per baris faktur. Baris jasa dan sewa yang HARGA BELI-nya 0 di Accurate akan memiliki GP sama dengan omzet.
- **Tanggal Excel** dibaca persis seperti di Accurate, tanpa bergeser karena zona waktu.

## Hal yang perlu diketahui
- **Nomor WA:** di data contoh, kolom "NOMOR TELP 1" Sawangan Depok berisi pekerjaan, dan di Bintara sejak pertengahan 2024 berisi sumber info (REKLAME, dll.). Menu **Kualitas Data** menandai cabang seperti ini. Perbaiki template laporan Daftar Pelanggan di Accurate agar memuat kolom No. Handphone/WhatsApp yang benar.
- **Kapasitas Supabase gratis (500 MB):** Data Pelanggan memakai sekitar 0,5 KB per pelanggan, dan faktur sekitar 1,5–2 KB per baris. Untuk 18 cabang, ruang gratis kemungkinan cukup untuk beberapa bulan data faktur. Pantau di **Project Settings → Usage**. Jika mendekati batas, naikkan ke paket berbayar (cek harga terbaru di supabase.com/pricing).
- **Supabase gratis** akan menjeda project yang tidak dipakai selama 7 hari. Selama aplikasi dipakai rutin, hal ini tidak terjadi.
- **Pelanggan yang dihapus di Accurate** tidak otomatis terhapus di Data Center. Super Admin bisa menghapusnya lewat Supabase → Table Editor.
