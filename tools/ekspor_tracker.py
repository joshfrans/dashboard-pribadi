#!/usr/bin/env python3
"""Ubah dump database tracker (folder JSON per koleksi) menjadi data/tracker.json untuk halaman GitHub.

Pakai:
  python3 ekspor_tracker.py <folder_dump> <keluaran.json> [--profil publik|lengkap] [--kalender kalender.json]

<folder_dump> berisi subfolder tasks/, coc/, cr/, kpi/ dengan satu file JSON per dokumen
(format keluaran ArtifactData out_dir). Profil:
  publik  (bawaan) — aman untuk repo publik: angka agregat, status, milestone. Tanpa isi komitmen,
          catatan evaluasi, rekomendasi, isu CR, nama file, ID aset.
  lengkap — semua isi teks. Hanya untuk repo privat yang aksesnya dibatasi.
"""
import json, sys, pathlib, datetime

STATUS = ["Selesai", "Maju", "Sebagian", "Tetap", "Mundur", "Tidak dilaporkan", "Baru"]


def muat(folder, nama):
    out = {}
    for f in sorted((folder / nama).glob("*.json")):
        try:
            out[f.stem] = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            print(f"lewati {f}: bukan JSON valid", file=sys.stderr)
    return out


def tugas(d):
    keep = ["title", "cat", "due", "time", "prio", "status", "progress", "routine", "doneAt", "cr"]
    return {k: d.get(k) for k in keep if k in d}


def cr(d, lengkap):
    keep = ["nama", "aplikasi", "fase", "progres", "progresKet", "statusJadwal", "ringkasan", "milestones", "update", "urut", "rencana"]
    if lengkap:
        keep += ["isu", "sumber"]
    return {k: d.get(k) for k in keep if k in d}


def coc(d, lengkap):
    kom = d.get("komitmen") or []
    hitung = {s: 0 for s in STATUS}
    for r in kom:
        if r.get("status") in hitung:
            hitung[r["status"]] += 1
    lama = len(kom) - hitung["Baru"]
    maju = hitung["Selesai"] + hitung["Maju"]
    ev = d.get("evaluasi") or {}
    o = {
        "date": d.get("date"), "bidang": d.get("bidang"), "periode": d.get("periode"),
        "jumlahKomitmen": len(kom), "status": hitung,
        "indeks": {"maju": maju, "lama": lama, "persen": round(maju / lama * 100) if lama else None},
        "eviden": sorted({f.get("kind") for f in (d.get("files") or []) if f.get("kind")}),
        "evaluasi": {k: ev.get(k) for k in ["status", "dibuat", "slide", "ringkas"] if k in ev} or None,
        "jumlahCatatan": len(d.get("catatan") or []),
        "jumlahTindakLanjut": len(d.get("tindakLanjut") or []),
    }
    if ev.get("rekap"):
        o["evaluasi"]["slideRekap"] = ev["rekap"].get("slide")
    if lengkap:
        o["rapat"] = d.get("rapat")
        o["komitmen"] = [{k: r.get(k) for k in ["no", "kelompok", "lingkup", "posisi", "target", "status", "langkah"]} for r in kom]
        o["tindakLanjut"] = d.get("tindakLanjut") or []
        o["catatan"] = d.get("catatan") or []
        if ev.get("rekomendasi"):
            o["evaluasi"]["rekomendasi"] = ev["rekomendasi"]
    return o


def kpi(d, lengkap):
    keep = ["judul", "tanggal", "tenggat", "proses", "prosesSejak", "managed", "reeng"]
    o = {k: d.get(k) for k in keep if k in d}
    o["adaLaporan"] = bool(d.get("files"))
    if lengkap:
        o["catatan"] = d.get("catatan") or []
    return o


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    profil = sys.argv[sys.argv.index("--profil") + 1] if "--profil" in sys.argv else "publik"
    if profil not in ("publik", "lengkap"):
        sys.exit("profil harus publik atau lengkap")
    lengkap = profil == "lengkap"
    data = {
        "meta": {
            "skema": 1,
            "profil": profil,
            "diekspor": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "sumber": "Tracker Strategi & Evaluasi (claude.ai)",
            "zonaWaktu": "Asia/Jakarta",
        },
        "tasks": {k: tugas(v) for k, v in muat(src, "tasks").items() if v.get("title") and v.get("due")},
        "cr": {k: cr(v, lengkap) for k, v in muat(src, "cr").items() if v.get("nama")},
        "coc": {k: coc(v, lengkap) for k, v in muat(src, "coc").items() if v.get("date")},
        "kpi": {k: kpi(v, lengkap) for k, v in muat(src, "kpi").items() if v.get("tenggat")},
    }
    if "--kalender" in sys.argv:
        kal = json.loads(pathlib.Path(sys.argv[sys.argv.index("--kalender") + 1]).read_text(encoding="utf-8"))
        if lengkap:
            data["kalender"] = kal
        else:
            print("kalender dilewati: hanya untuk profil lengkap (data terenkripsi)", file=sys.stderr)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"OK {dst} · profil {profil} · {len(data['tasks'])} tugas, {len(data['cr'])} CR, {len(data['coc'])} CoC, {len(data['kpi'])} KPI, {len(data.get('kalender', {}).get('acara', []))} acara kalender")


if __name__ == "__main__":
    main()
