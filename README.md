# MFlash Data Center

Aplikasi web untuk menggabungkan data Accurate seluruh cabang MFlash (Daftar Pelanggan dan Rincian Faktur Penjualan), menampilkan **Dashboard Gross Profit** per pilar dan per cabang, serta mengunduh data gabungan ke Excel.

- **Hosting:** Cloudflare Pages (dari GitHub), sama seperti dashboard sewa
- **Database:** Supabase (project baru, terpisah dari dashboard sewa)
- **Tanpa login:** siapa pun yang punya alamat aplikasi bisa membuka dashboard, melihat data, dan mengunggah
- **Tanpa build:** cukup file `index.html`, `app.js`, dan `config.js`

## Isi paket

| File | Fungsi |
|---|---|
| `index.html` | Tampilan aplikasi |
| `app.js` | Logika aplikasi: unggah, dashboard, data, kualitas data |
| `config.js` | Alamat dan kunci Supabase (**wajib diisi**) |
| `supabase/schema.sql` | Struktur database, aturan akses, dan fungsi dashboard |

## Keamanan tanpa login

Aplikasi ini sengaja dibuat **tanpa login**. Akibatnya:
- Siapa pun yang mengetahui alamat aplikasi bisa melihat seluruh data, termasuk nama dan nomor WA pelanggan, serta bisa mengunggah data untuk cabang mana pun. Bagikan alamatnya hanya ke tim internal.
- Data **tidak bisa dihapus atau diubah langsung** dari aplikasi maupun lewat API. Faktur hanya bisa diganti dengan mengunggah ulang faktur bernomor sama. Kunci ini dipasang di database.
- Setiap unggahan mencatat **nama pengunggah** (diisi sendiri) di Riwayat unggah.

**Opsional, bila nanti ingin dibatasi tanpa mengubah aplikasi:** pasang **Cloudflare Access** di depan alamat aplikasi (Cloudflare → Zero Trust → Access → Applications). Pengunjung cukup memasukkan email kantor lalu menerima kode, tanpa akun atau kata sandi di aplikasi. Layanan ini gratis untuk tim kecil.

---

## Langkah pemasangan (sekali saja, sekitar 20 menit)

### 1. Buat project Supabase baru
1. Masuk ke https://supabase.com/dashboard, lalu klik **New project**.
2. Beri nama, misalnya `mflash-data-center`. Pilih region **Southeast Asia (Singapore)**, buat password database, dan simpan password itu.
3. Tunggu sampai project siap.

### 2. Pasang struktur database
1. Buka menu **SQL Editor**, lalu klik **New query**.
2. Buka file `supabase/schema.sql`, salin seluruh isinya, tempel ke editor, lalu klik **Run**.
3. Pastikan hasilnya *Success*. File ini aman dijalankan ulang kalau nanti ada pembaruan, termasuk bila versi berlogin sebelumnya sudah sempat dipasang (data tidak hilang).

### 3. Isi `config.js`
1. Di Supabase, buka **Project Settings → API** (atau **Data API**).
2. Salin **Project URL** dan **anon public key**.
3. Buka `config.js`, lalu ganti kedua isian:
   ```js
   window.MFLASH_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGciOi..."
   };
   ```
   Aplikasi memakai *anon key* ini untuk membaca dan mengunggah data; hak hapus dan ubah langsung tetap dikunci di database. Jangan pernah memasukkan **service_role key** ke file ini.

### 4. Unggah ke GitHub
1. Buat repository baru di GitHub, misalnya `MFlash-Data-Center` (sebaiknya **Private**).
2. Klik **Add file → Upload files**, lalu tarik semua isi folder ini (`index.html`, `app.js`, `config.js`, `README.md`, dan folder `supabase`). Klik **Commit changes**.

### 5. Hubungkan ke Cloudflare Pages
1. Masuk ke Cloudflare, lalu buka **Workers & Pages → Create → Pages → Connect to Git**.
2. Pilih repository `MFlash-Data-Center`.
3. Atur build sebagai berikut:
   - **Framework preset:** None
   - **Build command:** kosongkan
   - **Build output directory:** `/`
4. Klik **Save and Deploy**. Setelah selesai, aplikasi bisa dibuka di alamat `https://<nama-project>.pages.dev`.

Setiap kali file di GitHub diubah, Cloudflare akan memperbarui aplikasinya secara otomatis.

### 6. Unggah data pertama
1. Buka alamat aplikasi.
2. Buka menu **Unggah Data**, isi **Nama pengunggah**, tarik file export Accurate (Daftar Pelanggan dan Rincian Faktur Penjualan) dari semua cabang, lalu klik **Unggah ke server**.
3. Buka **Dashboard Gross Profit**. Angkanya langsung tampil.

---

## Isi menu
- **Dashboard Gross Profit:** filter cabang, bulan, dan pilar. Berisi GP per pilar, tren harian, laporan per cabang, GP per kategori, barang penyumbang GP terbesar, dan penjualan rugi.
- **Tab Sewa:** GP pilar SEWA ditambah **jumlah unit (total QTY)** per cabang, per hari, dan per pelanggan.
- **Tab Service & Maintenance:** GP pilar Service/Maintenance ditambah **jumlah transaksi corporate termaintenance** (faktur ke pelanggan berkategori Corporate) dan jumlah perusahaan corporate-nya.

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
- **Menghapus data** (misalnya pelanggan yang sudah dihapus di Accurate, atau salah unggah cabang) hanya bisa dilakukan oleh pemilik project Supabase lewat Supabase → Table Editor.
