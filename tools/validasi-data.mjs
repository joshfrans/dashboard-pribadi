// Validasi data dashboard: struktur + pemindaian kebocoran.
// Pakai: node tools/validasi-data.mjs <tracker.json polos>       (sebelum enkripsi, dijalankan Claude/lokal)
//        node tools/validasi-data.mjs data/tracker.enc.json     (amplop terenkripsi, dijalankan GitHub Action)
// Keluar dengan kode 1 jika ada galat. Peringatan tidak menggagalkan.
import { readFileSync } from "node:fs";

const path = process.argv[2] || new URL("../data/tracker.enc.json", import.meta.url).pathname;
const errors = [], warns = [];
let data;
try { data = JSON.parse(readFileSync(path, "utf8")); }
catch (e) { console.error(`GALAT: ${path} bukan JSON valid — ${e.message}`); process.exit(1); }

// Amplop terenkripsi: cek bentuknya saja (isi hanya bisa dibaca dengan kata sandi).
if (data && data.format) {
  const e = [];
  if (data.format !== "dse-aesgcm-v1") e.push("format amplop tidak dikenal");
  if (data.kdf?.name !== "PBKDF2" || data.kdf?.hash !== "SHA-256" || !(data.kdf?.iter >= 300000)) e.push("KDF harus PBKDF2-SHA256 ≥ 300.000 iterasi");
  const b = s => typeof s === "string" && /^[A-Za-z0-9+/]+=*$/.test(s);
  if (!b(data.kdf?.salt) || Buffer.from(data.kdf.salt, "base64").length < 16) e.push("salt harus ≥ 16 byte");
  if (!b(data.iv) || Buffer.from(data.iv, "base64").length !== 12) e.push("iv harus 12 byte");
  if (!b(data.ct) || Buffer.from(data.ct, "base64").length < 17) e.push("ciphertext kosong/rusak");
  const extra = Object.keys(data).filter(k => !["format", "kdf", "cipher", "iv", "ct"].includes(k));
  if (extra.length) e.push("field tambahan di luar enkripsi: " + extra.join(", "));
  if (e.length) { e.forEach(x => console.error("GALAT:", x)); process.exit(1); }
  console.log(`OK ${path} · amplop terenkripsi ${data.cipher} · ${Buffer.from(data.ct, "base64").length} byte`);
  process.exit(0);
}

const tgl = /^\d{4}-\d{2}-\d{2}$/;
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
for (const k of ["meta", "tasks", "cr", "coc", "kpi"]) if (!isObj(data[k])) errors.push(`bagian "${k}" tidak ada atau bukan objek`);
if (isObj(data.meta)) {
  if (data.meta.skema !== 1) errors.push("meta.skema harus 1");
  if (!["publik", "lengkap"].includes(data.meta.profil)) errors.push("meta.profil harus publik atau lengkap");
  if (isNaN(Date.parse(data.meta.diekspor))) errors.push("meta.diekspor bukan waktu ISO");
}
for (const [id, t] of Object.entries(data.tasks || {})) {
  if (!t.title) errors.push(`tasks/${id}: title kosong`);
  if (!tgl.test(t.due || "")) errors.push(`tasks/${id}: due bukan YYYY-MM-DD`);
  if (!["todo", "doing", "done"].includes(t.status)) errors.push(`tasks/${id}: status tidak dikenal (${t.status})`);
}
for (const [id, c] of Object.entries(data.cr || {})) {
  if (!c.nama) errors.push(`cr/${id}: nama kosong`);
  if (c.progres != null && (c.progres < 0 || c.progres > 100)) errors.push(`cr/${id}: progres di luar 0–100`);
  for (const m of c.milestones || []) if (m.tanggal && !tgl.test(m.tanggal)) errors.push(`cr/${id}: tanggal milestone tidak valid (${m.tanggal})`);
  if (c.rencana != null) {
    const it = c.rencana.item;
    if (!Array.isArray(it) || !it.length) errors.push(`cr/${id}: rencana.item harus daftar rentang jadwal sub-task`);
    else for (const r of it) if (r.mulai != null && (!tgl.test(r.mulai) || !tgl.test(r.selesai || "") || r.selesai < r.mulai)) errors.push(`cr/${id}: rentang rencana tidak valid (${r.mulai}–${r.selesai})`);
  }
}
for (const [id, c] of Object.entries(data.coc || {})) {
  if (!tgl.test(c.date || "")) errors.push(`coc/${id}: date tidak valid`);
  const jml = Object.values(c.status || {}).reduce((a, b) => a + b, 0);
  if (jml !== c.jumlahKomitmen) errors.push(`coc/${id}: jumlah status (${jml}) ≠ jumlahKomitmen (${c.jumlahKomitmen})`);
}
for (const [id, k] of Object.entries(data.kpi || {})) {
  if (!/^\d{4}-\d{2}$/.test(id)) errors.push(`kpi/${id}: id harus YYYY-MM`);
  if (!tgl.test(k.tenggat || "")) errors.push(`kpi/${id}: tenggat tidak valid`);
}

if (data.kalender) {
  if (!Array.isArray(data.kalender.acara)) errors.push("kalender.acara harus daftar");
  for (const a of data.kalender.acara || []) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.mulai || "")) errors.push(`kalender: waktu mulai tidak valid (${a.judul})`);
    if (a.link && !/^https:\/\/(www\.)?google\.com\/calendar\//.test(a.link)) errors.push(`kalender: tautan bukan Google Calendar (${a.judul})`);
  }
}

// Pemindaian kebocoran — berlaku untuk semua profil.
const text = JSON.stringify(data);
const leaks = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "alamat email"],
  [/https?:\/\/[^\s"]*(sharepoint|onedrive|drive\.google|docs\.google)[^\s"]*/gi, "tautan dokumen internal"],
  [/\b(?:10|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}(?:\.\d{1,3})?\b/g, "IP internal"],
  [/\b(ghp_|github_pat_|xox[bpa]-|AKIA|AIza)[A-Za-z0-9_-]{10,}/g, "token / kunci API"],
  [/\b[0-9a-f]{32}\b/g, "ID aset tracker"],
  [/\b(password|sandi|passwd)\s*[:=]/gi, "kata sandi"],
  [/\b\d{16}\b/g, "nomor kartu/rekening 16 digit"]
];
for (const [re, nama] of leaks) { const m = text.match(re); if (m) errors.push(`kebocoran: ${nama} (${[...new Set(m)].slice(0, 3).join(", ")})`); }

// Profil publik: tidak boleh memuat isi komitmen/catatan/rekomendasi/isu.
if (data.meta?.profil === "publik") {
  for (const [id, c] of Object.entries(data.coc || {})) for (const f of ["komitmen", "catatan", "tindakLanjut", "rapat"]) if (f in c) errors.push(`coc/${id}: field "${f}" tidak boleh ada di profil publik`);
  for (const [id, c] of Object.entries(data.coc || {})) if (c.evaluasi?.rekomendasi) errors.push(`coc/${id}: rekomendasi tidak boleh ada di profil publik`);
  for (const [id, c] of Object.entries(data.cr || {})) for (const f of ["isu", "sumber"]) if (f in c) errors.push(`cr/${id}: field "${f}" tidak boleh ada di profil publik`);
  for (const [id, k] of Object.entries(data.kpi || {})) if ("catatan" in k) errors.push(`kpi/${id}: catatan tidak boleh ada di profil publik`);
  const sensitif = text.match(/\b(kredensial|credential|token|rahasia|confidential)\b/gi);
  if (sensitif) warns.push(`kata sensitif muncul di profil publik: ${[...new Set(sensitif)].join(", ")} — cek ulang`);
}

const umurJam = (Date.now() - Date.parse(data.meta?.diekspor)) / 36e5;
if (umurJam > 96) warns.push(`data diekspor ${Math.round(umurJam / 24)} hari lalu`);

warns.forEach(w => console.warn("PERINGATAN:", w));
if (errors.length) { errors.forEach(e => console.error("GALAT:", e)); process.exit(1); }
console.log(`OK ${path} · profil ${data.meta.profil} · ${Object.keys(data.tasks).length} tugas, ${Object.keys(data.cr).length} CR, ${Object.keys(data.coc).length} CoC, ${Object.keys(data.kpi).length} KPI`);
