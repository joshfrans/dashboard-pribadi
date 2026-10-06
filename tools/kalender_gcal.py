#!/usr/bin/env python3
"""Ubah daftar acara Google Calendar (keluaran list_events, field `events`) menjadi blok `kalender` untuk dashboard.

Pakai: python3 kalender_gcal.py <events.json> <kalender.json>
<events.json> boleh berupa objek {"events":[...]} atau langsung list acara Google Calendar.
Jenis acara ditebak dari judul: rapat (Weekly CR / rapat), tenggat (⏰ / tenggat), milestone (🚦 / CR:),
rutin (📝 / evaluasi), kpi (KPI 4b). Deskripsi acara TIDAK disalin (bisa berisi tautan internal).
"""
import json, sys, re, datetime

def jenis(judul):
    j = judul.lower()
    if "⏰" in judul or "tenggat" in j: return "tenggat"
    if "🚦" in judul or j.startswith("cr:") or "milestone" in j: return "milestone"
    if "kpi 4b" in j: return "kpi"
    if "🗂" in judul or "weekly" in j or "rapat" in j: return "rapat"
    if "📝" in judul or "evaluasi" in j: return "rutin"
    return "lain"

def bersih(judul):
    return re.sub(r"^[^\w(]+", "", judul).strip()

def waktu(x):
    if "dateTime" in x:
        dt = datetime.datetime.fromisoformat(x["dateTime"]).astimezone(datetime.timezone(datetime.timedelta(hours=7)))
        return dt.strftime("%Y-%m-%dT%H:%M"), False
    d = x.get("date", "")[:10]
    return d + "T00:00", True

def main():
    src = json.load(open(sys.argv[1], encoding="utf-8"))
    ev = src.get("events", src) if isinstance(src, dict) else src
    acara = []
    for e in ev:
        if e.get("status") == "cancelled": continue
        mulai, allday = waktu(e["start"]); selesai, _ = waktu(e["end"])
        acara.append({"id": e.get("id"), "judul": bersih(e.get("summary", "(tanpa judul)")), "jenis": jenis(e.get("summary", "")),
                      "mulai": mulai, "selesai": None if allday else selesai, "sepanjangHari": allday,
                      "berulang": bool(e.get("recurringEventId")), "link": e.get("htmlLink")})
    acara.sort(key=lambda a: a["mulai"])
    out = {"kalender": "utama", "diambil": datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
           "zonaWaktu": "Asia/Jakarta", "acara": acara}
    json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"OK {sys.argv[2]} · {len(acara)} acara")

if __name__ == "__main__":
    main()
