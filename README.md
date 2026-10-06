# Dashboard Pribadi · Strategi & Evaluasi

Dashboard pribadi Officer Strategi & Evaluasi DIV GA, di-host di GitHub Pages. Datanya disimpan **terenkripsi** (`data/tracker.enc.json`), jadi meski repo dan situs ini publik, isinya hanya bisa dibaca dengan kata sandi. Status tugas, CR, CoC dan KPI berasal dari tracker privat di claude.ai; eviden bisa diunggah langsung dari dashboard dan agenda diambil dari Google Calendar.

## View (sidebar kiri; tautan `#view` bisa dipakai langsung)

| View | Isi |
|---|---|
| `#kalender` | Agenda 14 hari dari Google Calendar (rapat CR, tenggat MoM, milestone CR, rutin) dengan status tugas terkait; daftar tugas yang belum ada di kalender + tombol **+ Google Calendar** |
| `#eviden` | Unggah eviden (dienkripsi di browser, disimpan ke `eviden/`), arsip eviden (buka/unduh), koneksi GitHub, perbarui data dashboard dari file |
| `#ringkasan` | CR terlambat + narasi otomatis; 4 KPI (progres tugas minggu ini, tugas lewat tenggat, indeks kemajuan CoC, status KPI 4b bulan berjalan); grafik progres CR; agenda 14 hari; komposisi status komitmen CoC; item Reengineering per laporan KPI 4b |
| `#rutin` | Matriks rutin Sen–Jum (MoM/Rekap CoC, weekly CR) + tren 4 minggu |
| `#cr` | Daftar CR: progres, milestone berikut, status jadwal, milestone, isu & sumber |
| `#coc` | Kartu CoC Sen–Kam + rincian komitmen, catatan evaluasi |
| `#kpi` | Eviden KPI 4b: tepat waktu/terlambat/proses, Managed Service & Reengineering, catatan |
| `#tugas` | Daftar tugas: hari ini / minggu ini / terlambat / aktif / selesai |

## Isi repo

| File | Fungsi |
|---|---|
| `index.html` | Halaman + layar kunci (CSP `script-src 'self'`, `noindex`) |
| `assets/dashboard.css`, `assets/dashboard.js` | Tampilan, grafik, dekripsi WebCrypto; tanpa CDN |
| `data/tracker.enc.json` | Data terenkripsi (AES-256-GCM, kunci PBKDF2-SHA256 600.000 iterasi) |
| `tools/ekspor_tracker.py` | Dump database tracker → JSON polos (profil `lengkap`) |
| `tools/validasi-data.mjs` | Cek struktur JSON polos sebelum enkripsi, atau cek amplop terenkripsi |
| `tools/kalender_gcal.py` | Acara Google Calendar (list_events) → blok `kalender` di data |
| `data/eviden.enc.json` | Indeks eviden terenkripsi (daftar file, jenis, tanggal, tugas terkait) |
| `eviden/YYYY/MM/*.bin` | File eviden terenkripsi (format `DSE1` + salt + iv + AES-256-GCM) |
| `tools/enkripsi-data.mjs` | JSON polos → `tracker.enc.json` (dan `--buka` untuk uji dekripsi) |
| `.github/workflows/validasi.yml` | Cek otomatis: data tetap terenkripsi, tidak ada file polos/aset eksternal |

## Keamanan

- Enkripsi dan dekripsi terjadi di browser/komputer; kata sandi tidak pernah dikirim ke server mana pun dan tidak disimpan di repo.
- "Ingat di perangkat ini" menyimpan kata sandi di `localStorage` browser itu saja. Tanpa centang, kata sandi hanya bertahan sampai tab ditutup. Tombol **Kunci dashboard** menghapusnya.
- Situs `joshfrans.github.io` memakai satu origin untuk semua repo Pages Anda, jadi jangan centang "Ingat" di komputer bersama.
- Riwayat commit menyimpan versi data lama yang terenkripsi dengan kata sandi yang sama. Jika kata sandi bocor, ganti kata sandi **dan** anggap data lama ikut terbaca.
- Token GitHub hanya berlaku untuk repo ini dengan izin Contents. Jika perangkat hilang, cabut token di github.com → Settings → Personal access tokens.
- CSP hanya mengizinkan koneksi ke situs sendiri dan `api.github.com`.
- `.gitignore` menolak `data/tracker.json` polos. Workflow juga gagal jika ada JSON polos di `data/`.

## Unggah eviden dari dashboard

1. Buat token GitHub sekali: github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → *Generate new token*. Repository access: **Only select repositories → dashboard-pribadi**. Permissions → Repository → **Contents: Read and write**. Expiration 90 hari.
2. Di dashboard → **Unggah eviden** → **Koneksi GitHub** → tempel token → **Uji & simpan token**. Token disimpan di perangkat itu saja, terenkripsi dengan kata sandi dashboard.
3. Pilih jenis eviden, tanggal, keterangan, file → **Unggah eviden**. File dienkripsi di browser lalu disimpan ke `eviden/`; indeks `data/eviden.enc.json` diperbarui; tugas terkait (MoM/Rekap CoC, MoM weekly CR, KPI 4b) otomatis ditandai selesai.
4. Nama file asli, jenis dan keterangan hanya ada di indeks terenkripsi. Di repo publik yang terlihat hanya nama acak seperti `eviden/2026/10/20261007-xxxx.bin`.

Agar eviden juga masuk tracker claude.ai dan dievaluasi otomatis, minta Claude: **"sinkronkan eviden dashboard"**.

## Google Calendar

Agenda di menu **Kalender** diambil Claude dari Google Calendar setiap kali data diperbarui (`tools/kalender_gcal.py`), lalu ikut dienkripsi. Setiap acara punya tombol **Buka** ke Google Calendar. Tugas yang belum ada di kalender punya tombol **+ Google Calendar** (membuka formulir acara yang sudah terisi).

## Memperbarui data

Minta Claude: **"perbarui dashboard pribadi"**. Claude mengekspor tracker dan agenda Google Calendar, memvalidasi, mengenkripsi, lalu mengirim `tracker.enc.json` baru.
Di dashboard → **Unggah eviden** → **Perbarui data dashboard** → pilih file itu → **Perbarui data**. (Cara lama tetap bisa: unggah ke folder `data/` di github.com.)

Manual:

```bash
python3 tools/kalender_gcal.py events.json kalender.json
python3 tools/ekspor_tracker.py <folder_dump> data/tracker.json --profil lengkap --kalender kalender.json
node tools/validasi-data.mjs data/tracker.json
DSE_SANDI='kata sandi' node tools/enkripsi-data.mjs data/tracker.json data/tracker.enc.json
rm data/tracker.json
```

Cache-busting `?v=YYYYMMDD-N` di `index.html` dinaikkan setiap kali `dashboard.css`/`dashboard.js` berubah.
