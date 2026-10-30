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
- Data tidak bisa diubah langsung. Penghapusan hanya lewat menu **Hapus / Reset data** dengan konfirmasi, dan bisa dilindungi **PIN hapus** (lihat di bawah).
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
2. Buka menu **Unggah Data**, isi **Nama pengunggah**, tarik file export Accurate (Daftar Pelanggan, Rincian Faktur Penjualan, Rincian Faktur Pembelian, Rincian Pemindahan Barang) dari semua cabang, lalu klik **Unggah ke server**.
3. Buka **Dashboard Gross Profit**. Angkanya langsung tampil.

---

## Isi menu
- **Dashboard Gross Profit:** di paling atas ada **highlight KPI**: *Unit tersewa* (dengan progres target 918 unit/bulan) dan *Gross profit Service & Maintenance Corporate* (dengan jumlah corporate termaintenance, target 162/bulan). Progres target tampil saat filter satu bulan dan semua cabang; saat memilih satu cabang tampil peringkat cabang. Target bisa diubah di `app.js` (`KPI_TARGET`). Di bawahnya: filter cabang, bulan, dan pilar, GP per pilar, tren harian, laporan per cabang, GP per kategori, barang penyumbang GP terbesar, dan penjualan rugi.
- **Tab Sewa:** GP pilar SEWA ditambah **jumlah unit (total QTY)** per cabang, per hari, dan per pelanggan, tabel biaya vendor & unit milik sendiri, serta **Unit milik sendiri yang tersewa** (nama barang dari Rincian Pemindahan Barang).
- **Tab Service & Maintenance Corporate:** hanya pilar yang namanya mengandung MAINTENANCE (pilar SERVICE biasa tidak ikut). GP pilar ini ditambah **corporate termaintenance** = jumlah pelanggan (perusahaan) yang bertransaksi di pilar ini; satu perusahaan dihitung satu walau punya beberapa transaksi.

## Pencapaian Sales & insentif sewa
Menu **Pencapaian Sales**: peringkat GP dan unit sewa per sales, plus laporan per sales (faktur, pelanggan, omzet, GP, unit sewa, GP maintenance, corporate maintenance, insentif). Ikut filter cabang, bulan, dan pilar. Nama sales bisa diambil dari kolom **Nama Default Penjual** atau **Yang Menyerahkan / Menjual** (pilihan di kanan atas). Nama ditulis huruf besar supaya ejaan berbeda huruf tidak terpisah.

**Insentif sewa = unit tersewa (QTY pilar SEWA) × tarif per unit.** Tarif diisi di kotak "Pengali insentif" (menu Pencapaian Sales atau tab Sewa) lalu klik **Simpan tarif**; tarif tersimpan di database dan berlaku untuk semua pengguna. Bila PIN hapus dipasang, mengubah tarif juga wajib PIN. Tombol **Unduh Excel pencapaian** menghasilkan file berisi pencapaian per sales dan rincian insentif sewa.

## Unduh Laporan (rekonsiliasi dengan Accurate)
Menu **Unduh Laporan** (atau tombol **Unduh Excel rekonsiliasi** di tab Sewa / Service & Maintenance Corporate): pilih laporan, cabang, dan bulan, lalu unduh. File Excel berisi sheet Keterangan, Ringkasan per Cabang, Rincian Faktur Penjualan per baris (dengan NO FAKTUR dan baris TOTAL), ditambah Pembelian SEWA & Biaya Vendor per Bulan untuk laporan Sewa, atau Daftar Corporate untuk laporan Maintenance. Cocokkan NO FAKTUR dan TOTAL HARGA dengan laporan Accurate pada filter yang sama.

## Hapus / Reset data (pembaruan harian)
Menu **Unggah Data → Hapus / Reset data**:
- Pilih cabang (atau semua cabang) dan jenis data (semua, faktur saja, atau pelanggan saja), ketik **HAPUS**, lalu klik **Hapus data**. Setelah itu unggah ulang file Accurate terbaru.
- Di **Riwayat unggah**, tombol **Hapus** (klik dua kali) menghapus data dari satu unggahan.
- Data yang dihapus tidak bisa dikembalikan.

**PIN hapus (disarankan, karena aplikasi tanpa login).** Jalankan di Supabase → SQL Editor (ganti 1234):
```sql
insert into public.app_setting values ('pin_hapus','1234')
on conflict (kunci) do update set nilai = excluded.nilai;
```
Setelah dipasang, penghapusan wajib memasukkan PIN. Untuk mematikan PIN: `delete from public.app_setting where kunci = 'pin_hapus';`

## Tarikan otomatis dari hub MFlash (pelengkap unggah Excel)
Setiap hari 03.15 WIB, Edge Function **tarik-mflash** menarik faktur penjualan semua cabang dari hub MFlash (satu baris per faktur: tanggal, cabang, kategori, pilar, sales, teknisi, harga beli, total) ke tabel `hub_faktur`. Tiga hari terakhir selalu ditarik ulang, jadi koreksi/hapus faktur di Accurate ikut terbawa.
- Faktur yang **belum diunggah lewat Excel** langsung ikut dashboard (GP, pilar, unit sewa, pencapaian sales) dengan **Sumber data = Hub**.
- Begitu Excel Rincian Faktur Penjualan cabang itu diunggah, baris rinci dari Excel yang dipakai (nama barang, QTY per barang, ID pelanggan, No WA). Jadi unggah Excel tetap perlu untuk detail, tetapi dashboard tidak lagi menunggu unggahan.
- Status tarikan dan jumlah faktur yang belum ada di Excel tampil di **Unggah Data** dan **Kualitas Data**. Di **Faktur Penjualan** ada filter "Dari hub (belum diunggah Excel)".

Selain faktur penjualan, fungsi yang sama juga menarik **Faktur Pembelian** (untuk biaya sewa vendor) dan **Pemindahan Barang** (unit milik sendiri). Aturannya sama: unggahan Excel dipakai lebih dulu, data hub mengisi yang belum diunggah (pembelian per nomor faktur pembelian, pemindahan per cabang + tanggal). Dari hub, arah pindah diketahui: hanya pemindahan **ke** gudang sewa yang dihitung sebagai unit milik sendiri yang tersewa; pemindahan **kembali dari** gudang sewa tidak dihitung.

**Pemasangan (sekali):**
1. Jalankan `supabase/schema.sql` terbaru (membuat tabel `hub_faktur`, `hub_log`, dan menyambungkannya ke dashboard).
2. Supabase → **Edge Functions → Secrets**: tambah `MFLASH_KUNCI` = kunci akses dari MFlash. Jangan tulis kunci di kode atau di chat.
3. Supabase → **Edge Functions → Deploy a new function → Via Editor**: nama `tarik-mflash`, tempel isi `supabase/functions/tarik-mflash/index.ts`, Deploy. (Atau lewat CLI: `supabase functions deploy tarik-mflash`.)
4. Buka `supabase/jadwal-tarik-mflash.sql`, isi alamat project & anon key, jalankan di SQL Editor. Langkah 3 di file itu langsung menjalankan uji pertama.
5. Buka aplikasi → Unggah Data: kotak "Tarikan otomatis dari hub MFlash" harus berstatus **Berjalan** dengan jumlah faktur masuk akal.

Bila project memakai kunci publik format baru (`sb_publishable_...`), deploy fungsi dengan opsi **Verify JWT dimatikan**. Kalau ada nama cabang hub yang tidak cocok, aplikasi menampilkannya di kotak status; tambahkan/ubah nama cabang di tabel `cabang`.

## Cara kerja data
- **Kolom CABANG** selalu menjadi kolom pertama. Cabang dikenali dari nama file Accurate (misal `003mflashbintar` → Bintara) dan bisa diubah sebelum diunggah.
- **Pelanggan** dicocokkan dengan **Cabang + ID Pelanggan**, karena ID yang sama bisa dipakai cabang lain untuk orang berbeda. Unggah ulang akan memperbarui data pelanggan yang sudah ada.
- **Faktur** dengan nomor yang sama di cabang yang sama akan diganti versi terbaru. Jadi aman mengunggah periode yang tumpang tindih, misalnya export mingguan yang mencakup awal bulan.
- **Saling melengkapi:** faktur mendapat No WA, kecamatan, kota, dan referensi dari Data Pelanggan. Pelanggan mendapat riwayat transaksi (jumlah faktur, total belanja, total GP, faktur terakhir) dari faktur.
- **Gross Profit = TOTAL HARGA − HARGA BELI − biaya sewa vendor.** HARGA BELI diambil dari faktur penjualan.
- **Biaya sewa vendor** diambil dari **Rincian Faktur Pembelian** (unggah lewat menu Unggah Data; jenis "Faktur Pembelian" dikenali otomatis dari nama file). Baris dengan nama barang mengandung **SEWA** (mis. SEWA LAPTOP) atau kategori SEWA dijumlah per cabang per bulan, lalu dipotong dari penjualan pilar SEWA cabang & bulan yang sama, dibagi ke tiap transaksi sesuai QTY. Tab Sewa menampilkan tabel "Biaya sewa vendor" untuk mengecek pencocokannya.
- **Rincian Pemindahan Barang** (unit milik sendiri): laporan cetak Accurate ini dikenali otomatis. Baris barang dengan *Gudang Tujuan/Dari* mengandung kata **SEWA** dihitung sebagai unit milik sendiri yang tersewa, lalu dicocokkan ke faktur sewa cabang & tanggal yang sama (laporan ini tidak memuat nomor faktur). Mengunggah ulang file mengganti data pemindahan cabang itu untuk periode di file (baris "Dari … s/d …"), jadi tidak dobel.
- **Tanggal Excel** dibaca persis seperti di Accurate, tanpa bergeser karena zona waktu.

## Hal yang perlu diketahui
- **Nomor WA:** di data contoh, kolom "NOMOR TELP 1" Sawangan Depok berisi pekerjaan, dan di Bintara sejak pertengahan 2024 berisi sumber info (REKLAME, dll.). Menu **Kualitas Data** menandai cabang seperti ini. Perbaiki template laporan Daftar Pelanggan di Accurate agar memuat kolom No. Handphone/WhatsApp yang benar.
- **Kapasitas Supabase gratis (500 MB):** Data Pelanggan memakai sekitar 0,5 KB per pelanggan, dan faktur sekitar 1,5–2 KB per baris. Untuk 18 cabang, ruang gratis kemungkinan cukup untuk beberapa bulan data faktur. Pantau di **Project Settings → Usage**. Jika mendekati batas, naikkan ke paket berbayar (cek harga terbaru di supabase.com/pricing).
- **Supabase gratis** akan menjeda project yang tidak dipakai selama 7 hari. Selama aplikasi dipakai rutin, hal ini tidak terjadi.
- **Menghapus data** (misalnya pelanggan yang sudah dihapus di Accurate, atau salah unggah cabang) hanya bisa dilakukan oleh pemilik project Supabase lewat Supabase → Table Editor.
