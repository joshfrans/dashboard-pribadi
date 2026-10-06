# Pasang Dashboard Pribadi di GitHub Pages (±10 menit, sekali saja)

## 1. Buat repo baru

1. Buka github.com → **New repository**.
2. Nama: `dashboard-pribadi`. Visibilitas: **Public**. GitHub Pages gratis hanya untuk repo publik; isi data tetap aman karena terenkripsi.
3. Jangan centang "Add a README". Klik **Create repository**.

## 2. Unggah file

1. Ekstrak `dashboard-pribadi.zip`.
2. Di halaman repo baru, klik **uploading an existing file**. Seret **seluruh isi** folder hasil ekstrak (bukan foldernya):
   `index.html`, `assets/`, `data/`, `tools/`, `README.md`, `.gitignore`, `.github/`.
3. Folder `.github` dan file `.gitignore` tersembunyi di Windows Explorer. Aktifkan **View → Show → Hidden items**, atau tambahkan keduanya belakangan lewat **Add file → Create new file**: ketik nama `.github/workflows/validasi.yml`, lalu tempel isinya.
4. Pesan commit: `Dashboard pribadi strategi & evaluasi`, lalu klik **Commit changes** ke `main`. Ini repo baru milik Anda sendiri, jadi aman langsung ke `main`.

## 3. Nyalakan GitHub Pages

1. **Settings → Pages**.
2. Source: **Deploy from a branch** · Branch: `main` · Folder: `/ (root)`, lalu klik **Save**.
3. Tunggu 1–2 menit, lalu buka `https://joshfrans.github.io/dashboard-pribadi/`.
4. Masukkan kata sandi yang diberikan Claude di chat. Centang **Ingat di perangkat ini** hanya di laptop/HP pribadi.

## 4. Cek otomatis

Tab **Actions** → workflow **Validasi dashboard** harus hijau. Workflow ini gagal jika ada data polos yang ikut terunggah atau aset dari luar.

## 5. Memperbarui data

Minta Claude: **"perbarui dashboard pribadi"**. Claude mengirim `tracker.enc.json` baru.
Di repo, buka folder `data` → **Add file → Upload files**, unggah file itu (menimpa yang lama) → **Commit changes**.

Jangan pernah mengunggah file `tracker.json` polos.
