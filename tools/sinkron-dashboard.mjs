#!/usr/bin/env node
// Ambil eviden & status tugas yang dibuat lewat dashboard (terenkripsi di repo publik), lalu dekripsi
// untuk disalin ke tracker privat. Dipakai tugas terjadwal "Sinkron Dashboard → Tracker".
//
// Pakai:
//   DSE_KUNCI=<base64 32 byte> node sinkron-dashboard.mjs <folder_keluaran> [--sudah sudah.json] [--repo pemilik/repo] [--dasar URL-uji/]
//   (opsional) DSE_SANDI=<kata sandi dashboard> untuk berkas lama format DSE1 / indeks lama.
//
// Keluaran: <folder>/sinkron.json  { indeks: "k2"|"sandi"|"tidak-terbaca"|"kosong", eviden: [...], status: {...}, ms: {"<idCR>::<milestone>": {...}},
//           catatanKerja: [{ id, kunci, objek: "tugas"|"cr"|"milestone", tugas?, cr?, milestone?, judul, jenis: "progres"|"tl"|"kendala"|"info", teks, progres?, sampai?, at }],
//           jadwal: {"<idTugas>": { aksi: "tunda"|"batal", ke?, alasan, at, judul }} }
//           <folder>/files/<id>.<ext>  berkas asli untuk eviden yang belum ada di --sudah (daftar id)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { webcrypto as crypto } from "node:crypto";
import path from "node:path";

const args = process.argv.slice(2);
const out = args[0];
if (!out) { console.error("pakai: DSE_KUNCI=... node sinkron-dashboard.mjs <folder> [--sudah sudah.json] [--repo pemilik/repo]"); process.exit(2); }
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const repo = opt("--repo", "joshfrans/dashboard-pribadi");
const sudah = new Set(args.includes("--sudah") ? JSON.parse(readFileSync(opt("--sudah"), "utf8")) : []);
const K = process.env.DSE_KUNCI ? Buffer.from(process.env.DSE_KUNCI.trim(), "base64") : null;
const PW = process.env.DSE_SANDI || null;
if (!K || K.length !== 32) { console.error("DSE_KUNCI (32 byte base64) wajib"); process.exit(2); }
const te = new TextEncoder();
const dasar = opt("--dasar", `https://raw.githubusercontent.com/${repo}/main/`);
const raw = p => dasar + p;

async function ambil(p) {
  const r = await fetch(raw(p) + "?t=" + Date.now(), { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${p}: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const k2 = crypto.subtle.importKey("raw", K, "AES-GCM", false, ["decrypt"]);
async function pwKey(salt, iter) {
  if (!PW) throw new Error("perlu DSE_SANDI");
  const base = await crypto.subtle.importKey("raw", te.encode(PW.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
async function bukaJSON(buf) {
  const e = JSON.parse(buf.toString("utf8"));
  const iv = Buffer.from(e.iv, "base64"), ct = Buffer.from(e.ct, "base64");
  if (e.format === "dse-k2-v1") return { mode: "k2", data: JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: te.encode(e.format) }, await k2, ct)).toString("utf8")) };
  if (e.format === "dse-aesgcm-v1" || e.format === "dse-aesgcm-gz-v1") {
    const k = await pwKey(Buffer.from(e.kdf.salt, "base64"), e.kdf.iter);
    const b = Buffer.from(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: te.encode(e.format) }, k, ct));
    return { mode: "sandi", data: JSON.parse((e.format === "dse-aesgcm-gz-v1" ? gunzipSync(b) : b).toString("utf8")) };
  }
  throw new Error("format amplop tidak dikenal: " + e.format);
}
async function bukaBerkas(u) {
  const hd = u.subarray(0, 4).toString("latin1");
  if (hd === "DSE2") return Buffer.from(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(4, 16), additionalData: te.encode("dse-file-v2") }, await k2, u.subarray(16)));
  if (hd === "DSE1") { const k = await pwKey(u.subarray(4, 20), 600000); return Buffer.from(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(20, 32), additionalData: te.encode("dse-file-v1") }, k, u.subarray(32))); }
  throw new Error("format berkas tidak dikenal");
}

mkdirSync(path.join(out, "files"), { recursive: true });
const hasil = { repo, diambil: new Date().toISOString(), indeks: "kosong", eviden: [], status: {}, ms: {}, statusMode: "kosong", catatanKerja: [], jadwal: {}, catatan: [] };

const idx = await ambil("data/eviden.enc.json");
if (idx) {
  try {
    const o = await bukaJSON(idx); hasil.indeks = o.mode;
    for (const x of o.data.eviden || []) {
      const item = { ...x, baru: !sudah.has(x.id) };
      // eviden lama/tanpa id tugas: turunkan dari jenis + tanggal (sama dengan dashboard)
      if (!item.tugas && item.tanggal) {
        if (["mom", "rekap", "cresppd", "crlayanan"].includes(item.jenis)) item.tugas = `${item.jenis}-${item.tanggal}`;
        else if (item.jenis === "kpi4b") item.tugas = `kpi4b-${item.tanggal.slice(0, 7)}`;
      }
      if (item.baru) {
        try {
          const b = await bukaBerkas(await ambil(x.path));
          const ext = path.extname(x.nama || "") || ".bin";
          item.file = path.join(out, "files", x.id + ext); writeFileSync(item.file, b); item.ukuranAsli = b.length;
        } catch (e) { item.galat = String(e.message || e); }
      }
      hasil.eviden.push(item);
    }
  } catch (e) { hasil.indeks = "tidak-terbaca"; hasil.catatan.push("indeks eviden: " + (e.message || e)); }
}
const st = await ambil("data/status.enc.json");
if (st) {
  try {
    const o = await bukaJSON(st); hasil.statusMode = o.mode; hasil.status = o.data.status || {}; hasil.ms = o.data.ms || {};
    // catatan progres & tindak lanjut dari tombol "Catatan" (kunci t:<tugas> · cr:<CR> · ms:<CR>::<milestone>)
    for (const [kunci, daftar] of Object.entries(o.data.catatan || {})) {
      for (const n of daftar || []) {
        const x = { id: n.id, kunci, objek: n.objek, judul: n.judul, jenis: n.jenis, teks: n.teks, at: n.at };
        if (kunci.startsWith("t:")) x.tugas = kunci.slice(2);
        else if (kunci.startsWith("cr:")) x.cr = kunci.slice(3);
        else if (kunci.startsWith("ms:")) { const i = kunci.indexOf("::"); x.cr = kunci.slice(3, i); x.milestone = kunci.slice(i + 2); }
        if (n.progres != null) x.progres = n.progres;
        if (n.sampai) x.sampai = n.sampai;
        hasil.catatanKerja.push(x);
      }
    }
    hasil.catatanKerja.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
    // agenda yang ditunda / dibatalkan dari tombol "Tunda/Batal"
    hasil.jadwal = o.data.jadwal || {};
  }
  catch (e) { hasil.statusMode = "tidak-terbaca"; hasil.catatan.push("status tugas: " + (e.message || e)); }
}
writeFileSync(path.join(out, "sinkron.json"), JSON.stringify(hasil, null, 1) + "\n");
const baru = hasil.eviden.filter(x => x.baru);
console.log(`OK indeks=${hasil.indeks} · ${hasil.eviden.length} eviden (${baru.length} baru, ${baru.filter(x => x.galat).length} galat) · status=${hasil.statusMode} ${Object.keys(hasil.status).length} tugas · ${Object.keys(hasil.ms).length} milestone CR · ${hasil.catatanKerja.length} catatan · ${Object.keys(hasil.jadwal).length} agenda ditunda/batal`);
for (const c of hasil.catatan) console.log("CATATAN:", c);
