// Enkripsi data dashboard (AES-256-GCM, kunci dari kata sandi lewat PBKDF2-SHA256 600.000 iterasi).
// Pakai:
//   DSE_SANDI='kata sandi' node tools/enkripsi-data.mjs <tracker.json polos> data/tracker.enc.json
//   DSE_SANDI='kata sandi' node tools/enkripsi-data.mjs --buka data/tracker.enc.json   (cek dekripsi)
// Kata sandi dibaca dari variabel lingkungan DSE_SANDI agar tidak tersimpan di riwayat shell.
// File polos JANGAN di-commit (sudah ada di .gitignore).
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const ITER = 600000;
const sandi = process.env.DSE_SANDI;
if (!sandi || sandi.length < 12) { console.error("Set DSE_SANDI (minimal 12 karakter)."); process.exit(2); }
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => Buffer.from(u8).toString("base64");
const unb64 = s => new Uint8Array(Buffer.from(s, "base64"));

async function kunci(salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(sandi.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

if (process.argv[2] === "--buka") {
  const env = JSON.parse(readFileSync(process.argv[3], "utf8"));
  const k = await kunci(unb64(env.kdf.salt), env.kdf.iter);
  let pt;
  try { pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv), additionalData: enc.encode(env.format) }, k, unb64(env.ct)); }
  catch { console.error("GAGAL: kata sandi salah atau file rusak."); process.exit(1); }
  const data = JSON.parse(dec.decode(pt));
  console.log(`OK dekripsi · profil ${data.meta.profil} · diekspor ${data.meta.diekspor} · ${Object.keys(data.tasks).length} tugas`);
  process.exit(0);
}

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.error("Pakai: node tools/enkripsi-data.mjs <polos.json> <keluaran.enc.json>"); process.exit(2); }
const polos = readFileSync(src, "utf8");
const data = JSON.parse(polos);
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const format = "dse-aesgcm-v1";
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(format) }, await kunci(salt, ITER), enc.encode(polos)));
const env = { format, kdf: { name: "PBKDF2", hash: "SHA-256", iter: ITER, salt: b64(salt) }, cipher: "AES-256-GCM", iv: b64(iv), ct: b64(ct) };
writeFileSync(dst, JSON.stringify(env) + "\n");
console.log(`OK ${dst} · ${ct.length} byte terenkripsi · profil ${data.meta?.profil}`);
