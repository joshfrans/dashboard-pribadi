# Dashboard Pribadi · Strategi & Evaluasi

Dashboard pribadi Officer Strategi & Evaluasi DIV GA, di-host di GitHub Pages. Datanya disimpan **terenkripsi** (`data/tracker.enc.json`), jadi meski repo dan situs ini publik, isinya hanya bisa dibaca dengan kata sandi. Sumber kebenaran tetap tracker privat di claude.ai; dashboard ini untuk dibaca saja.

## View (sidebar kiri; tautan `#view` bisa dipakai langsung)

| View | Isi |
|---|---|
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
| `tools/enkripsi-data.mjs` | JSON polos → `tracker.enc.json` (dan `--buka` untuk uji dekripsi) |
| `.github/workflows/validasi.yml` | Cek otomatis: data tetap terenkripsi, tidak ada file polos/aset eksternal |

## Keamanan

- Enkripsi dan dekripsi terjadi di browser/komputer; kata sandi tidak pernah dikirim ke server mana pun dan tidak disimpan di repo.
- "Ingat di perangkat ini" menyimpan kata sandi di `localStorage` browser itu saja. Tanpa centang, kata sandi hanya bertahan sampai tab ditutup. Tombol **Kunci dashboard** menghapusnya.
- Situs `joshfrans.github.io` memakai satu origin untuk semua repo Pages Anda, jadi jangan centang "Ingat" di komputer bersama.
- Riwayat commit menyimpan versi data lama yang terenkripsi dengan kata sandi yang sama. Jika kata sandi bocor, ganti kata sandi **dan** anggap data lama ikut terbaca.
- `.gitignore` menolak `data/tracker.json` polos. Workflow juga gagal jika ada JSON polos di `data/`.

## Memperbarui data

Minta Claude: **"perbarui dashboard pribadi"**. Claude mengekspor tracker, memvalidasi, mengenkripsi, lalu mengirim `tracker.enc.json` baru.
Unggah file itu ke folder `data/` (Add file → Upload files → Commit). Dashboard memeriksa perubahan setiap 60 detik.

Manual:

```bash
python3 tools/ekspor_tracker.py <folder_dump> data/tracker.json --profil lengkap
node tools/validasi-data.mjs data/tracker.json
DSE_SANDI='kata sandi' node tools/enkripsi-data.mjs data/tracker.json data/tracker.enc.json
rm data/tracker.json
```

Cache-busting `?v=YYYYMMDD-N` di `index.html` dinaikkan setiap kali `dashboard.css`/`dashboard.js` berubah.
