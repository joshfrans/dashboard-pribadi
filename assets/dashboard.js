/* Dashboard Pribadi Strategi & Evaluasi — GitHub Pages, data terenkripsi (AES-256-GCM) (view: ringkasan, rutin, CR, CoC, KPI 4b, tugas).
   v10: tombol Catatan (progres · tindak lanjut · kendala · info) di setiap aksi, disimpan terenkripsi di data/status.enc.json.
   v11: Tunda/Batal agenda (CoC & tugas) · terlambat ikut jam tenggat · sinkron multi-perangkat · perbaikan aksesibilitas.
   v12: galat render tidak lagi menggagalkan unggah/simpan (sebelumnya tampil "Koneksi ke GitHub gagal") · cegah unggah ganda.
   v13: arsip eviden: penanda duplikat, tombol Hapus (2 langkah) dan "Rapikan duplikat" · arsip berbentuk kartu di HP · data dashboard terkompres (gzip) sebelum dienkripsi.
   Sumber data: data/tracker.enc.json (ekspor tracker claude.ai → tools/ekspor_tracker.py → tools/enkripsi-data.mjs).
   Semua teks dari data ditulis dengan textContent; tidak ada innerHTML berisi data. */
(function () {
  "use strict";

  var DATA_URL = "data/tracker.enc.json";
  var POLL_MS = 60000;
  var CAT = { mom: "MoM CoC", rekap: "Rekap CoC", cr: "Weekly CR", kpi: "KPI / RKM", dashboard: "Dashboard", lain: "Lainnya" };
  var ROUTINE = [
    { key: "mom", title: "Evaluasi MoM CoC tiap bidang", sub: "Sen–Kam · skill MoM PLN", days: [0, 1, 2, 3] },
    { key: "rekap", title: "Evaluasi rekapitulasi CoC tiap bidang", sub: "Sen–Kam · skill evaluasi & assessment", days: [0, 1, 2, 3] },
    { key: "cresppd", title: "Weekly CR ESPPD Re-Engineering + MoM", sub: "Kamis 09.00 · MoM paling lambat 16.00", days: [3] },
    { key: "crlayanan", title: "Weekly CR Aplikasi Layanan GA + MoM", sub: "Jumat 09.30 · MoM paling lambat 16.00", days: [4] }
  ];
  var DAYS = ["Sen", "Sel", "Rab", "Kam", "Jum"];
  var ST = [
    { k: "Selesai", v: "--st-selesai", i: "--ink-selesai" }, { k: "Maju", v: "--st-maju", i: "--ink-maju" }, { k: "Sebagian", v: "--st-sebagian", i: "--ink-sebagian" },
    { k: "Tetap", v: "--st-tetap", i: "--ink-tetap" }, { k: "Mundur", v: "--st-mundur", i: "--ink-mundur" }, { k: "Tidak dilaporkan", v: "--st-td", i: "--ink-td" }, { k: "Baru", v: "--st-baru", i: "--ink-baru" }
  ];
  var CRS = { "Terlambat": "s-late", "Berisiko": "s-risk", "Sesuai jadwal": "s-ok", "Selesai": "s-done", "Tertahan": "s-hold", "Perlu update": "s-stale", "Perlu konfirmasi": "s-check" };
  var MSC = { "Selesai": "s-done", "Berjalan": "s-ok", "Belum": "s-hold", "Terlambat": "s-late", "Perlu konfirmasi": "s-check", "Berisiko": "s-risk" };

  var $ = function (s) { return document.querySelector(s); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  // ---- tanggal (WIB) ----
  function todayStr() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()); }
  function P(s) { return new Date(s + "T00:00:00Z"); }
  function S(d) { return d.toISOString().slice(0, 10); }
  function addD(s, n) { var d = P(s); d.setUTCDate(d.getUTCDate() + n); return S(d); }
  function monday(s) { var d = P(s); return addD(s, -((d.getUTCDay() + 6) % 7)); }
  function fmt(s, o) { return new Intl.DateTimeFormat("id-ID", Object.assign({ timeZone: "UTC" }, o)).format(P(s)); }
  function shortD(s) { return fmt(s, { weekday: "short", day: "numeric", month: "short" }); }
  function daysTo(d) { return Math.round((P(d) - P(TODAY)) / 86400000); }

  var TODAY = todayStr();
  var weekStart = monday(TODAY);
  var D = { meta: {}, tasks: {}, cr: {}, coc: {}, kpi: {} };
  var loaded = false, filter = "today", crApp = "", crOpen = null, evSel = null, kpiOpen = null;
  var lastTag = null;

  // terlambat = belum selesai dan tanggal+jam tenggat (default 23.59 WIB) sudah lewat — sama dengan definisi ringkasan pagi
  function isLate(t) { return t.status !== "done" && (t.due < TODAY || (t.due === TODAY && (t.time || "23:59") < nowHM())); }
  function prog(t) { return t.status === "done" ? 100 : (+t.progress || 0); }
  function inWeek(t, ws) { return t.due >= ws && t.due <= addD(ws, 6); }
  function allTasks() { return Object.keys(D.tasks).map(function (id) { return Object.assign({ id: id }, D.tasks[id]); }); }

  // ---- ringkasan (view eksekutif) ----
  var SEV = { "Terlambat": 0, "Berisiko": 1, "Perlu konfirmasi": 2, "Perlu update": 3, "Tertahan": 4, "Sesuai jadwal": 5, "Selesai": 6 };
  function paintSt(node, s) { node.style.setProperty("--c", "var(" + s.v + ")"); node.style.setProperty("--ci", "var(" + s.i + ")"); node.dataset.k = s.k; }
  var stMark = paintSt;
  function weekPct(all, ws) { var w = all.filter(function (t) { return inWeek(t, ws); }); return w.length ? Math.round(w.reduce(function (a, t) { return a + prog(t); }, 0) / w.length) : null; }
  // rencana progres CR per hari ini: rata-rata porsi jadwal tiap sub-task yang sudah lewat (sumber: warna Gantt timeline)
  function planPct(c, day) {
    var it = c.rencana && c.rencana.item; if (!it || !it.length) return null;
    var t = P(day || TODAY), sum = 0;
    it.forEach(function (r) { if (!r || !r.mulai) return; var a = P(r.mulai), e = P(r.selesai), n = (e - a) / 864e5 + 1, k = (t - a) / 864e5 + 1; sum += Math.min(1, Math.max(0, k / n)); });
    return Math.round(sum / it.length * 100);
  }
  function cocIdx(ws) {
    var maju = 0, lama = 0, n = 0;
    [0, 1, 2, 3].forEach(function (i) { var c = D.coc[addD(ws, i)]; if (!c) return; n++; maju += (c.indeks || {}).maju || 0; lama += (c.indeks || {}).lama || 0; });
    return lama ? { pct: Math.round(maju / lama * 100), maju: maju, lama: lama, n: n } : null;
  }
  function delta(node, cur, prev) {
    if (cur == null || prev == null) { node.hidden = true; return; }
    var d = cur - prev; node.hidden = false;
    node.className = "dl " + (d > 0 ? "up" : d < 0 ? "down" : "eq");
    node.textContent = (d > 0 ? "▲ +" + d : d < 0 ? "▼ −" + Math.abs(d) : "= 0") + " poin vs minggu lalu (" + prev + "%)";
  }
  function nextWork(s) { var d = addD(s, 1); while ([0, 6].indexOf(P(d).getUTCDay()) >= 0) d = addD(d, 1); return d; }
  function jenisForTask(id) { var j = JENIS.filter(function (j) { return j.tugas && id.indexOf(j.tugas) === 0; })[0]; return j ? j.k : null; }
  function calTimeFor(t) {
    var a = kalList().filter(function (a) { if (a.jenis === "tenggat" || a.sepanjangHari) return false; var r = relatedTask(a); return r && r.id === t.id; })[0];
    return a ? a.mulai.slice(11, 16) : null;
  }
  function openUpload(jenis, tanggal) {
    location.hash = "eviden";
    $("#upJenis").value = jenis; $("#upTanggal").value = tanggal; syncUpHint();
    setTimeout(function () { var f = $("#upFile"); f.scrollIntoView({ block: "center" }); f.focus(); }, 60);
  }
  function focusRow(t, grp) {
    var done = t.status === "done", late = isLate(t), r = el("div", "fi" + (done ? " done" : late ? " late" : "")); r.setAttribute("role", "listitem");
    var ct = calTimeFor(t), when = el("span", "ft");
    when.appendChild(el("b", null, late ? fmt(t.due, { day: "numeric", month: "short" }) : ct || (t.time ? "≤ " + t.time : "–")));
    when.appendChild(el("small", null, late ? "lewat" : ct ? "jadwal" : "tenggat"));
    r.appendChild(when);
    var m = el("div", "fm"); m.appendChild(el("b", null, t.title)); m.appendChild(el("span", "sub", (CAT[t.cat] || "Tugas") + (t.prio === "tinggi" ? " · prioritas tinggi" : "") + (!done && t.time && ct ? " · tenggat " + t.time : "") + (t.ditundaDari && t.ditundaDari !== t.due ? " · ditunda dari " + shortD(t.ditundaDari) : ""))); r.appendChild(m);
    var side = el("div", "fs");
    if (done) side.appendChild(el("span", "chip s-done", t.viaEviden ? "Eviden masuk" : "Selesai"));
    else if (late) side.appendChild(el("span", "chip s-late", "Terlambat"));
    else if (t.status === "doing") side.appendChild(el("span", "chip s-risk", "Proses " + prog(t) + "%"));
    else if (grp === "today") side.appendChild(el("span", "chip s-due", "Belum"));
    var jk = jenisForTask(t.id);
    if (jk && !done && grp === "today") { var b = el("button", "btn sm", "Unggah eviden"); b.type = "button"; b.addEventListener("click", function () { openUpload(jk, t.due); }); side.appendChild(b); }
    actBtns(t, side, true);
    r.appendChild(side);
    return r;
  }
  function renderFocus(all) {
    var box = $("#focusList"); clear(box);
    var order = function (a, b) { return (a.status === "done") - (b.status === "done") || isLate(b) - isLate(a) || (b.routine ? 1 : 0) - (a.routine ? 1 : 0) || (b.prio === "tinggi") - (a.prio === "tinggi") || a.due.localeCompare(b.due); };
    var td = all.filter(function (t) { return t.due === TODAY || isLate(t); }).sort(order);
    var tmr = nextWork(TODAY), tm = all.filter(function (t) { return t.due === tmr && t.status !== "done"; }).sort(order);
    var open = td.filter(function (t) { return t.status !== "done"; }).length;
    $("#focusSub").textContent = open ? open + " belum selesai hari ini" : td.length ? "semua tugas hari ini selesai" : "";
    box.appendChild(el("div", "fg", "Hari ini · " + fmt(TODAY, { weekday: "long", day: "numeric", month: "short" })));
    if (!td.length) box.appendChild(el("div", "fi empty-f", "Tidak ada tugas bertenggat hari ini."));
    td.forEach(function (t) { box.appendChild(focusRow(t, "today")); });
    var TM = 3;
    box.appendChild(el("div", "fg", (daysTo(tmr) === 1 ? "Besok" : "Hari kerja berikut") + " · " + fmt(tmr, { weekday: "long", day: "numeric", month: "short" })));
    if (!tm.length) box.appendChild(el("div", "fi empty-f", "Belum ada tugas."));
    tm.slice(0, TM).forEach(function (t) { box.appendChild(focusRow(t, "next")); });
    if (tm.length > TM) { var a = el("a", "more", "+" + (tm.length - TM) + " tugas lain " + fmt(tmr, { weekday: "long" }) + " →"); a.href = "#tugas"; a.addEventListener("click", function () { filter = "open"; renderList(); }); box.appendChild(a); }
  }
  function tipOn(node, text) { node.dataset.tip = text; node.tabIndex = 0; node.setAttribute("aria-label", text); }
  function crList() { return Object.keys(D.cr).map(function (id) { return Object.assign({ id: id }, D.cr[id]); }); }
  function cocWeek() { var ws = monday(TODAY); return [0, 1, 2, 3].map(function (i) { return D.coc[addD(ws, i)]; }).filter(Boolean); }

  function renderOverview() {
    var all = allTasks(), ws = monday(TODAY), crs = crList();
    // hero: CR terlambat
    var late = crs.filter(function (c) { return c.statusJadwal === "Terlambat"; });
    var risk = crs.filter(function (c) { return c.statusJadwal === "Berisiko"; });
    var hn = $("#heroNum"); clear(hn);
    if (!loaded) { hn.textContent = "–"; return; }
    hn.textContent = String(late.length);
    var next = null;
    crs.forEach(function (c) { var m = nextMs(c); if (m && m.tanggal >= TODAY && (!next || m.tanggal < next.m.tanggal)) next = { c: c, m: m }; });
    var lateTasks = all.filter(isLate);
    var txt = (late.length ? "dari " + crs.length + " CR" : "Tidak ada CR terlambat dari " + crs.length + " CR") + (risk.length ? " · " + risk.length + " berisiko" : "") + ".";
    $("#heroText").textContent = txt;
    $(".hero").classList.toggle("is-bad", late.length > 0);
    var hl = $("#heroList"); clear(hl);
    late.concat(risk).forEach(function (c) {
      var li = el("li", c.statusJadwal === "Terlambat" ? "s-late" : "s-risk"), m = nextMs(c);
      li.appendChild(el("b", null, c.nama));
      li.appendChild(el("span", null, (c.statusJadwal === "Terlambat" ? "Terlambat" : "Berisiko") + " · " + (c.progres == null ? "n/a" : c.progres + "%") + (m && m.tanggal ? " · " + (daysTo(m.tanggal) < 0 ? "milestone lewat " + Math.abs(daysTo(m.tanggal)) + " hr" : "milestone " + shortD(m.tanggal)) : "")));
      hl.appendChild(li);
    });
    renderFocus(all);

    // KPI tiles
    var week = all.filter(function (t) { return inWeek(t, ws); });
    var wp = weekPct(all, ws), wpPrev = weekPct(all, addD(ws, -7));
    $("#kWeek").textContent = wp === null ? "n/a" : wp + "%";
    $("#kWeekBar").style.width = (wp || 0) + "%";
    $("#kWeekSub").textContent = week.length ? week.filter(function (t) { return t.status === "done"; }).length + " dari " + week.length + " tugas selesai" : "Belum ada tugas minggu ini";
    delta($("#kWeekDl"), wp, wpPrev);
    $("#kLate").textContent = String(lateTasks.length);
    $("#kLate").classList.toggle("is-bad", lateTasks.length > 0);
    $("#kLateSub").textContent = lateTasks.length ? "tertua: " + lateTasks.sort(function (a, b) { return a.due.localeCompare(b.due); })[0].title.slice(0, 60) : "semua tugas sesuai tenggat";
    var ci = cocIdx(ws), ciPrev = cocIdx(addD(ws, -7));
    $("#kCoc").textContent = ci ? ci.pct + "%" : "n/a";
    $("#kCocSub").textContent = ci ? ci.maju + " ÷ " + ci.lama + " komitmen lama Selesai/Maju · " + ci.n + " bidang" : "Belum ada eviden CoC minggu ini";
    delta($("#kCocDl"), ci && ci.pct, ciPrev && ciPrev.pct);
    var cw = cocWeek();
    var ym = TODAY.slice(0, 7), k = D.kpi[ym], kv = $("#kKpi");
    $("#kKpiL").textContent = "KPI 4b " + new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(P(ym + "-01"));
    kv.className = "v";
    if (k) {
      var st = k.tanggal ? (k.tanggal <= k.tenggat ? "Tepat waktu" : "Terlambat") : (k.proses || (k.tenggat < TODAY ? "Lewat tenggat" : "Belum ada"));
      var cls = st === "Tepat waktu" ? "st-ok" : st === "Terlambat" || st === "Lewat tenggat" ? "st-bad" : "st-warn";
      kv.textContent = st; kv.classList.add("v-st", cls);
      $("#kKpiSub").textContent = (k.tanggal ? "dikirim " + shortD(k.tanggal) + " · " : "") + "tenggat " + shortD(k.tenggat) + (k.reeng ? " · Reengineering " + k.reeng.done + "/" + k.reeng.total : "");
    } else { kv.textContent = "n/a"; $("#kKpiSub").textContent = "Belum ada data bulan ini"; }

    // grafik CR: batang horizontal satu skala 0–100 + milestone berikut (tanggal & selisih hari)
    var box = $("#crChart"); clear(box);
    crs.slice().sort(function (a, b) { return (SEV[a.statusJadwal] ?? 9) - (SEV[b.statusJadwal] ?? 9) || (a.progres || 0) - (b.progres || 0); }).forEach(function (c) {
      var row = el("a", "hb " + (CRS[c.statusJadwal] || "s-hold")); row.href = "#cr"; row.setAttribute("role", "listitem");
      row.addEventListener("click", function () { crOpen = c.id; });
      row.appendChild(el("span", "n", c.nama));
      var tr = el("span", "track");
      [25, 50, 75].forEach(function (g) { var l = el("i", "gl"); l.style.left = g + "%"; tr.appendChild(l); });
      if (c.progres != null) { var b = el("b"); b.style.width = c.progres + "%"; tr.appendChild(b); }
      var pp = planPct(c);
      if (pp != null) { var pm = el("i", "pm"); pm.style.left = pp + "%"; tr.appendChild(pm); }
      row.appendChild(tr);
      var vv = el("span", "v"); vv.appendChild(el("b", null, c.progres == null ? "n/a" : c.progres + "%"));
      if (pp != null) vv.appendChild(el("small", (c.progres || 0) < pp ? "behind" : null, "rcn " + pp + "%"));
      row.appendChild(vv);
      var m = nextMs(c), nx = el("span", "nx");
      if (m && m.tanggal) { var dd = daysTo(m.tanggal); nx.appendChild(el("b", dd < 0 ? "past" : dd <= 3 ? "soon" : null, shortD(m.tanggal) + " · " + (dd < 0 ? "lewat " + Math.abs(dd) + " hr" : dd === 0 ? "hari ini" : dd + " hr lagi"))); nx.appendChild(el("small", null, m.nama)); }
      else nx.appendChild(el("small", null, m ? m.nama + " · tanpa tanggal" : "–"));
      row.appendChild(nx);
      row.appendChild(el("span", "chip " + (CRS[c.statusJadwal] || "s-hold"), c.statusJadwal || "–"));
      tipOn(row, c.nama + ": " + (c.progres == null ? "n/a" : c.progres + "%") + " · " + (c.progresKet || "progres") + (pp != null ? " · rencana per hari ini " + pp + "% (" + ((c.progres || 0) - pp >= 0 ? "+" : "−") + Math.abs((c.progres || 0) - pp) + " poin)" : "") + " · " + (c.statusJadwal || "–") + (m ? " · berikut: " + m.nama + (m.tanggal ? " (" + shortD(m.tanggal) + ")" : "") : ""));
      box.appendChild(row);
    });
    var ax = $("#crAxis"); clear(ax);
    [0, 25, 50, 75, 100].forEach(function (v) { var s = el("span", null, v + "%"); s.style.left = v + "%"; ax.appendChild(s); });

    // agenda 14 hari (5 teratas)
    var ag = [], end = addD(TODAY, 14);
    crs.forEach(function (c) { (c.milestones || []).forEach(function (m) { if (m.tanggal && m.status !== "Selesai" && m.tanggal <= end && m.tanggal >= TODAY) ag.push({ d: m.tanggal, t: m.nama, s: c.nama, c: c, m: m }); }); });
    all.forEach(function (t) { if (t.status !== "done" && !t.routine && t.due >= TODAY && t.due <= end && t.prio === "tinggi") ag.push({ d: t.due, t: t.title, s: (CAT[t.cat] || "Tugas") + " · prioritas tinggi", task: t }); });
    ((D.kalender || {}).acara || []).forEach(function (a) { var d = a.mulai.slice(0, 10); if (a.jenis === "rapat" && d >= TODAY && d <= end) ag.push({ d: d, t: a.judul, s: "Rapat · " + (a.sepanjangHari ? "sepanjang hari" : a.mulai.slice(11, 16) + " WIB") }); });
    ag.sort(function (a, b) { return a.d.localeCompare(b.d); });
    var abox = $("#agenda"), AGN = 5; clear(abox);
    if (!ag.length) abox.appendChild(el("div", "empty", "Tidak ada agenda 14 hari ke depan."));
    ag.slice(0, AGN).forEach(function (a) {
      var dd = daysTo(a.d), r = el("div", "ag"), w = el("div", "when");
      w.appendChild(el("b", null, fmt(a.d, { day: "numeric", month: "short" }))); w.appendChild(document.createTextNode(dd === 0 ? "hari ini" : dd === 1 ? "besok" : dd + " hr lagi"));
      var wh = el("div", "what"); wh.appendChild(el("b", null, a.t)); wh.appendChild(el("span", null, a.s));
      r.appendChild(w); r.appendChild(wh);
      var ax2 = el("div", "ag-act"); if (a.m) msBtn(a.c, a.m, ax2, null, true); else if (a.task) taskBtn(a.task, ax2, null, true);
      if (ax2.childNodes.length) { r.classList.add("has-act"); r.appendChild(ax2); }
      abox.appendChild(r);
    });
    if (ag.length > AGN) { var more = el("a", "more", "+" + (ag.length - AGN) + " agenda lain di Kalender →"); more.href = "#kalender"; abox.appendChild(more); }

    // komposisi status CoC per bidang (minggu ini; jika kosong, 4 CoC terakhir)
    var lg = $("#cocLegend"); clear(lg);
    ST.forEach(function (s) { var sp = el("span", null, s.k); stMark(sp, s); lg.appendChild(sp); });
    var list = cw.length ? cw : Object.keys(D.coc).sort().reverse().slice(0, 4).map(function (id) { return D.coc[id]; });
    var cb = $("#cocChart"); clear(cb);
    if (!list.length) cb.appendChild(el("div", "empty", "Belum ada eviden CoC."));
    list.forEach(function (c) {
      var row = el("div", "comp-row"), t = el("div", "t"), ix = c.indeks || {};
      t.appendChild(el("b", null, c.bidang + " · " + fmt(c.date, { day: "numeric", month: "short" })));
      t.appendChild(el("span", null, "indeks " + (ix.persen == null ? "n/a" : ix.persen + "%") + " · " + (c.jumlahKomitmen || 0) + " komitmen"));
      var bar = el("div", "cbar"), tot = c.jumlahKomitmen || 0;
      ST.forEach(function (s) { var n = (c.status || {})[s.k] || 0; if (!n || !tot) return; var i = el("i"); i.setAttribute("role", "img"); i.style.flex = n + " 0 0"; stMark(i, s); tipOn(i, c.bidang + " · " + s.k + ": " + n + " dari " + tot + " (" + Math.round(n / tot * 100) + "%)"); bar.appendChild(i); });
      row.appendChild(t); row.appendChild(bar); cb.appendChild(row);
    });

    // kolom KPI 4b: item Reengineering Done per laporan (satu skala 0–total)
    var kc = $("#kpiChart"); clear(kc);
    var ks = Object.keys(D.kpi).sort().slice(-6).map(function (id) { return Object.assign({ id: id }, D.kpi[id]); }).filter(function (x) { return x.reeng; });
    if (!ks.length) { kc.appendChild(el("div", "empty", "Belum ada data KPI 4b.")); return; }
    var max = Math.max.apply(null, ks.map(function (x) { return x.reeng.total; }));
    var yax = el("div", "yax"), plot = el("div", "plot");
    [0, Math.round(max / 2), max].forEach(function (v) { var s = el("span", null, String(v)); s.style.bottom = (v / max * 100) + "%"; yax.appendChild(s); if (v) { var g = el("i", "gl"); g.style.bottom = (v / max * 100) + "%"; plot.appendChild(g); } });
    var goal = el("div", "goal"); goal.style.bottom = "100%"; goal.appendChild(el("span", null, "total " + max + " item")); plot.appendChild(goal);
    var xl = el("div", "xl");
    ks.forEach(function (x, i) {
      var col = el("div", "col " + (i === ks.length - 1 ? "cur" : "past")); col.style.height = (x.reeng.done / max * 100) + "%";
      col.appendChild(el("span", "cap", String(x.reeng.done)));
      tipOn(col, bln(x.id) + ": " + x.reeng.done + " dari " + x.reeng.total + " item Done" + (x.reeng.ket ? " · " + x.reeng.ket : ""));
      plot.appendChild(col);
      xl.appendChild(el("span", null, new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(P(x.id + "-01"))));
    });
    kc.appendChild(yax); kc.appendChild(plot); kc.appendChild(xl);
    var last = ks[ks.length - 1];
    $("#kpiNote").textContent = "Managed Service " + (last.managed ? last.managed.done + "/" + last.managed.total + " item Done" : "n/a") + " pada laporan " + bln(last.id) + ". Batang tegas = laporan terbaru.";
  }

  // ---- kinerja pribadi: target harian & mingguan ----
  var TARGET = { tepat: 90, rutin: 100, mom: 100, prio: 100 };
  function nowHM() { return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); }
  function wib(iso) {
    var d = new Date(iso); if (isNaN(d)) return null;
    var g = {}; new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).forEach(function (x) { g[x.type] = x.value; });
    return g.year + "-" + g.month + "-" + g.day + "T" + g.hour + ":" + g.minute;
  }
  function dueAt(t) { return t.due + "T" + (t.time || "23:59"); }
  function deadlinePassed(t) { return dueAt(t) < TODAY + "T" + nowHM(); }
  function onTime(t) { if (t.status !== "done") return false; var w = t.doneAt && wib(t.doneAt); return !w || w <= dueAt(t); }
  function judged(list) { return list.filter(function (t) { return t.status === "done" || deadlinePassed(t); }); }
  function rate(list) { var j = judged(list); return j.length ? { pct: Math.round(j.filter(onTime).length / j.length * 100), ok: j.filter(onTime).length, n: j.length } : null; }
  function isRutinCoc(t) { return /^(mom|rekap)-/.test(t.id); }
  function isMomCr(t) { return /^(cresppd|crlayanan)-/.test(t.id); }
  function weekTasks(all, ws) { var we = addD(ws, 4); return all.filter(function (t) { return t.due >= ws && t.due <= we; }); }
  function tgtRow(o) {
    var r = el("div", "tg"), nm = el("div", "tg-n"); r.setAttribute("role", "listitem"); nm.appendChild(el("b", null, o.nama)); nm.appendChild(el("span", "sub", o.sub)); r.appendChild(nm);
    var tr = el("div", "tg-bar");
    if (o.pct != null) { var t = el("span", "track"), b = el("b"); b.style.width = o.pct + "%"; t.appendChild(b); if (o.target != null) { var tk = el("i", "pm"); tk.style.left = o.target + "%"; t.appendChild(tk); } tr.appendChild(t); }
    r.appendChild(tr);
    var v = el("div", "tg-v"); v.appendChild(el("b", null, o.nilai)); v.appendChild(el("span", "sub", "target " + o.tgtTxt)); r.appendChild(v);
    r.appendChild(el("span", "chip " + o.st[0], o.st[1]));
    tipOn(r, o.nama + ": " + o.nilai + " · target " + o.tgtTxt + " · " + o.st[1]);
    return r;
  }
  function renderKinerja() {
    var box = $("#tgtList"); if (!box) return; clear(box);
    if (!loaded) return;
    var all = allTasks(), ws = monday(TODAY), wk = weekTasks(all, ws), rows = [];
    $("#kinWeek").textContent = fmt(ws, { day: "numeric", month: "short" }) + " – " + fmt(addD(ws, 4), { day: "numeric", month: "short" }) + " · dinilai sampai " + fmt(TODAY, { weekday: "long" }) + " " + nowHM() + " WIB";
    function rateRow(nama, list, target, sisa) {
      var r = rate(list), tot = list.length;
      if (!r) return { nama: nama, sub: tot ? tot + " terjadwal minggu ini · belum ada yang jatuh tempo" : "tidak ada jadwal minggu ini", pct: null, nilai: "–", tgtTxt: target + "%", st: ["s-hold", "Belum dinilai"] };
      return { nama: nama, sub: r.ok + " dari " + r.n + " jatuh tempo selesai tepat waktu · " + tot + " terjadwal minggu ini" + (sisa ? sisa : ""), pct: r.pct, target: target, nilai: r.pct + "%", tgtTxt: (target === 100 ? "" : "≥ ") + target + "%", st: r.pct >= target ? ["s-done", "Sesuai target"] : ["s-late", "Di bawah target"] };
    }
    rows.push(rateRow("Rutin CoC tepat waktu", wk.filter(isRutinCoc), TARGET.rutin));
    rows.push(rateRow("MoM Weekly CR ≤ 16.00", wk.filter(isMomCr), TARGET.mom));
    rows.push(rateRow("Semua tugas tepat waktu", wk, TARGET.tepat));
    var hp = wk.filter(function (t) { return t.prio === "tinggi"; }), hd = hp.filter(function (t) { return t.status === "done"; }).length, hdue = judged(hp).length;
    rows.push(hp.length ? { nama: "Prioritas tinggi selesai", sub: hd + " dari " + hp.length + " tugas prioritas tinggi minggu ini · " + hdue + " sudah jatuh tempo", pct: Math.round(hd / hp.length * 100), target: TARGET.prio, nilai: hd + "/" + hp.length, tgtTxt: "semua sebelum Jumat 16.00", st: hd === hp.length ? ["s-done", "Tercapai"] : hd >= hdue ? ["s-ok", "On track"] : ["s-late", "Perlu percepatan"] } : { nama: "Prioritas tinggi selesai", sub: "tidak ada tugas prioritas tinggi minggu ini", pct: null, nilai: "–", tgtTxt: "100%", st: ["s-hold", "Belum dinilai"] });
    var lt = all.filter(isLate).length;
    rows.push({ nama: "Tugas lewat tenggat", sub: "semua tugas yang belum selesai dan sudah lewat tenggat", pct: null, nilai: String(lt), tgtTxt: "0", st: lt ? ["s-late", "Di bawah target"] : ["s-done", "Sesuai target"] });
    var ym = TODAY.slice(0, 7), k = D.kpi[ym];
    rows.push(k ? { nama: "KPI 4b " + bln(ym) + " tepat waktu", sub: k.tanggal ? "dikirim " + shortD(k.tanggal) + ", tenggat " + shortD(k.tenggat) : "belum dikirim · tenggat " + shortD(k.tenggat), pct: null, nilai: k.tanggal ? (k.tanggal <= k.tenggat ? "Tepat" : "Terlambat " + Math.round((P(k.tanggal) - P(k.tenggat)) / 864e5) + " hr") : "–", tgtTxt: "hari kerja ke-3", st: k.tanggal ? (k.tanggal <= k.tenggat ? ["s-done", "Sesuai target"] : ["s-late", "Di bawah target"]) : (k.tenggat < TODAY ? ["s-late", "Lewat tenggat"] : ["s-hold", "Belum dinilai"]) } : { nama: "KPI 4b bulan ini", sub: "belum ada data", pct: null, nilai: "–", tgtTxt: "hari kerja ke-3", st: ["s-hold", "Belum dinilai"] });
    rows.forEach(function (o) { box.appendChild(tgtRow(o)); });
    var ev = rows.filter(function (o) { return o.st[0] !== "s-hold"; }), met = ev.filter(function (o) { return o.st[0] === "s-done" || o.st[0] === "s-ok"; }).length;
    var sc = $("#kScore"); clear(sc);
    sc.appendChild(el("b", null, ev.length ? met + "/" + ev.length : "–"));
    sc.appendChild(el("span", null, ev.length ? "target tercapai atau on track · " + (rows.length - ev.length) + " belum dinilai" : "belum ada target yang bisa dinilai"));
    $(".kin-score").classList.toggle("is-bad", ev.length > 0 && met < ev.length);

    // hari ini
    var td = all.filter(function (t) { return t.due === TODAY; }), tdd = td.filter(function (t) { return t.status === "done"; }), open = td.filter(function (t) { return t.status !== "done"; }).sort(function (a, b) { return dueAt(a).localeCompare(dueAt(b)); });
    var hs = $("#kinToday"); clear(hs);
    var tl = $("#kinTodayList"); if (!tl) { tl = el("div", "kin-tl"); tl.id = "kinTodayList"; tl.setAttribute("role", "list"); hs.parentNode.insertBefore(tl, hs.nextSibling); }
    clear(tl);
    var tlist = td.concat(all.filter(isLate)).filter(function (t, i, arr) { return arr.indexOf(t) === i; }).sort(function (a, b) { return (a.status === "done") - (b.status === "done") || isLate(b) - isLate(a) || dueAt(a).localeCompare(dueAt(b)); });
    var TLN = 8;
    tlist.slice(0, TLN).forEach(function (t) {
      var r0 = el("div", "kin-ti" + (t.status === "done" ? " done" : isLate(t) ? " late" : "")); r0.setAttribute("role", "listitem");
      var m0 = el("div", "km"); m0.appendChild(el("b", null, t.title)); m0.appendChild(el("span", "sub", (isLate(t) ? "Terlambat · tenggat " + shortD(t.due) : "Tenggat " + (t.time || "–") + " WIB") + (t.status === "done" ? " · " + (t.viaEviden ? "eviden masuk" : t.viaAksi ? "selesai di dashboard" : "selesai") : "")));
      lastNote(kTask(t.id), m0); r0.appendChild(m0); var s0 = el("div", "tside2"); actBtns(t, s0, true); r0.appendChild(s0); tl.appendChild(r0);
    });
    if (!tlist.length) { var te0 = el("div", "empty", "Tidak ada tugas bertenggat hari ini."); te0.setAttribute("role", "listitem"); tl.appendChild(te0); }
    if (tlist.length > TLN) { var mo = el("a", "more", "+" + (tlist.length - TLN) + " tugas lain di Daftar tugas →"), mw = el("div"); mw.setAttribute("role", "listitem"); mo.href = "#tugas"; mo.addEventListener("click", function () { filter = "today"; renderList(); }); mw.appendChild(mo); tl.appendChild(mw); }
    [[tdd.length + "/" + td.length, "tugas hari ini selesai"], [open.length ? (open[0].time || "–") : "✓", open.length ? "tenggat berikut (WIB)" : "tidak ada yang tersisa"], [String(td.filter(function (t) { return t.status === "done" && t.viaEviden; }).length), "selesai lewat eviden"]].forEach(function (x) { var d = el("div", "kst"); d.appendChild(el("b", null, x[0])); d.appendChild(el("span", null, x[1])); hs.appendChild(d); });

    // beban 10 hari kerja ke depan
    var days = [], d = TODAY; if ([0, 6].indexOf(P(d).getUTCDay()) >= 0) d = nextWork(d);
    while (days.length < 10) { days.push(d); d = nextWork(d); }
    var cnt = days.map(function (x) { return all.filter(function (t) { return t.due === x && t.status !== "done"; }).length; }), mx0 = Math.max.apply(null, cnt), mx = Math.max(mx0, 1);
    var lc = $("#loadChart"); clear(lc);
    days.forEach(function (x, i) {
      var col = el("div", "lcol" + (cnt[i] === mx && mx > 0 ? " peak" : "") + (x === TODAY ? " today" : "")), bar = el("div", "lbar"), f = el("b");
      f.style.height = (cnt[i] / mx * 100) + "%"; if (cnt[i]) f.appendChild(el("span", null, String(cnt[i]))); bar.appendChild(f); col.appendChild(bar);
      col.appendChild(el("span", "ld", fmt(x, { weekday: "short" }) + " " + fmt(x, { day: "numeric" })));
      tipOn(col, fmt(x, { weekday: "long", day: "numeric", month: "short" }) + ": " + cnt[i] + " tugas belum selesai");
      lc.appendChild(col);
    });
    var pk = mx0 > 0 ? days[cnt.indexOf(mx0)] : null;
    $("#loadNote").textContent = pk ? "Hari terpadat: " + fmt(pk, { weekday: "long", day: "numeric", month: "short" }) + " dengan " + mx + " tugas. Total " + cnt.reduce(function (a, b) { return a + b; }, 0) + " tugas terbuka dalam 10 hari kerja." : "Tidak ada tugas terbuka dalam 10 hari kerja ke depan.";

    // tren tepat waktu per minggu
    var tb = $("#otTrend"); clear(tb);
    for (var w = 5; w >= 0; w--) {
      var s0 = addD(ws, -7 * w), r = rate(weekTasks(all, s0)); if (!r && w > 0) continue;
      var tr = el("tr"); tr.appendChild(el("td", null, w === 0 ? "Minggu ini" : "Mg " + fmt(s0, { day: "numeric", month: "short" })));
      tr.appendChild(el("td", "num", r ? r.ok + "/" + r.n : "–"));
      var tdb = el("td"), bb = el("span", "mini"); if (r) { var fb = el("b"); fb.style.width = r.pct + "%"; bb.appendChild(fb); var tk2 = el("i", "pm"); tk2.style.left = TARGET.tepat + "%"; bb.appendChild(tk2); } tdb.appendChild(bb); tr.appendChild(tdb);
      tr.appendChild(el("td", "num", r ? r.pct + "%" : "n/a")); tb.appendChild(tr);
    }

    // kepatuhan KPI 4b
    var kb = $("#kpiComp"); clear(kb);
    Object.keys(D.kpi).sort().reverse().forEach(function (id) {
      var x = D.kpi[id], tr = el("tr"); tr.appendChild(el("td", null, bln(id)));
      tr.appendChild(el("td", "num", x.tanggal ? shortD(x.tanggal) : "–")); tr.appendChild(el("td", "num", x.tenggat ? shortD(x.tenggat) : "–"));
      var ok = x.tanggal && x.tenggat && x.tanggal <= x.tenggat, c = el("td"); c.appendChild(el("span", "chip " + (!x.tanggal ? "s-hold" : ok ? "s-done" : "s-late"), !x.tanggal ? "Belum" : ok ? "Tepat waktu" : "Terlambat")); tr.appendChild(c); kb.appendChild(tr);
    });

    // CR: aktual vs rencana
    var cp = $("#crPlan"); clear(cp);
    var withPlan = crList().filter(function (c) { return planPct(c) != null; });
    if (!withPlan.length) { var cpe = el("div", "empty", "Belum ada CR dengan jadwal rencana per sub-task."); cpe.setAttribute("role", "listitem"); cp.appendChild(cpe); }
    withPlan.forEach(function (c) { var pp = planPct(c), g = (c.progres || 0) - pp; cp.appendChild(tgtRow({ nama: c.nama, sub: c.rencana.sumber, pct: c.progres || 0, target: pp, nilai: (c.progres || 0) + "%", tgtTxt: pp + "% per hari ini", st: g >= 0 ? ["s-done", "Sesuai rencana"] : g >= -10 ? ["s-risk", "Tertinggal " + Math.abs(g) + " poin"] : ["s-late", "Tertinggal " + Math.abs(g) + " poin"] })); });
    $("#crPlanNote").textContent = (crList().length - withPlan.length) + " CR lain belum punya jadwal sub-task yang bisa dibaca; minta vendor mengisi rencana progres mingguan di weekly CR.";
  }

  // ---- navigasi view ----
  var VIEWS = { ringkasan: "Ringkasan", kinerja: "Kinerja pribadi", kalender: "Kalender", eviden: "Unggah & arsip eviden", rutin: "Rutin mingguan", cr: "Monitoring CR aplikasi", coc: "Eviden CoC per bidang", kpi: "Eviden KPI 4b DIV GA", tugas: "Daftar tugas" };
  function route() {
    var v = (location.hash || "#ringkasan").slice(1);
    if (!VIEWS[v]) v = "ringkasan";
    Object.keys(VIEWS).forEach(function (k) { $("#v-" + k).hidden = k !== v; });
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#viewTitle").textContent = VIEWS[v];
    document.title = VIEWS[v] + " · Dashboard Strategi & Evaluasi";
    if (v === "cr") renderCR();
    if (v === "kinerja") renderKinerja();
    window.scrollTo(0, 0);
  }
  function navBadges() {
    var late = crList().filter(function (c) { return c.statusJadwal === "Terlambat"; }).length, lt = allTasks().filter(isLate).length;
    var a = $("#navCr"), b = $("#navLate");
    a.hidden = !late; a.textContent = String(late); a.setAttribute("aria-label", late + " CR terlambat");
    b.hidden = !lt; b.textContent = String(lt); b.setAttribute("aria-label", lt + " tugas terlambat");
    var mc = $("#navMoreCnt"); mc.hidden = !late; mc.textContent = String(late); mc.setAttribute("aria-label", late + " CR terlambat");
  }

  // ---- tooltip (hover & fokus keyboard) ----
  var tip = $("#tip");
  function showTip(e) {
    var t = e.target.closest && e.target.closest("[data-tip]"); if (!t) return;
    tip.textContent = t.dataset.tip; tip.classList.add("on");
    var r = t.getBoundingClientRect(), x = e.clientX || (r.left + r.width / 2), y = e.clientY || r.top;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + "px";
    tip.style.top = Math.max(8, y - h - 12) + "px";
  }
  function hideTip(e) { if (!e.relatedTarget || !(e.relatedTarget.closest && e.relatedTarget.closest("[data-tip]"))) tip.classList.remove("on"); }
  document.addEventListener("mouseover", showTip); document.addEventListener("mousemove", showTip); document.addEventListener("mouseout", hideTip);
  document.addEventListener("focusin", showTip); document.addEventListener("focusout", function () { tip.classList.remove("on"); });

  // ---- matriks rutin ----
  function renderMatrix() {
    var head = $("#mHead"); clear(head);
    var th0 = el("th", null, "Pekerjaan"); th0.scope = "col"; head.appendChild(th0);
    var days = DAYS.map(function (_, i) { return addD(weekStart, i); });
    days.forEach(function (d, i) { var th = el("th", d === TODAY ? "is-today" : null, DAYS[i] + " " + fmt(d, { day: "numeric" })); th.scope = "col"; head.appendChild(th); });
    $("#weekLbl").textContent = fmt(weekStart, { day: "numeric", month: "short" }) + " – " + fmt(addD(weekStart, 4), { day: "numeric", month: "short", year: "numeric" });
    var body = $("#mBody"); clear(body);
    ROUTINE.forEach(function (r) {
      var tr = el("tr");
      var th = el("th", null, r.title); th.scope = "row"; th.appendChild(el("small", null, r.sub)); tr.appendChild(th);
      days.forEach(function (d, i) {
        var dl = DAYS[i] + " " + fmt(d, { day: "numeric" });
        var id = r.key + "-" + d, t = D.tasks[id], bt = D.batal && D.batal[id], away = t && t.due !== d;
        var ins = ((D.pindah || {})[r.key + "@" + d] || []).filter(function (x) { return x !== id; }).map(taskOf).filter(Boolean);
        if (r.days.indexOf(i) < 0 && !ins.length) { var na = el("td", "na" + (d === TODAY ? " is-today" : ""), "—"); na.dataset.day = dl; na.setAttribute("aria-label", "Tidak dijadwalkan"); tr.appendChild(na); return; }
        if (r.days.indexOf(i) < 0) { t = null; bt = null; away = false; }
        var td = el("td", d === TODAY ? "is-today" : null); td.dataset.day = dl;
        if (bt) cellItem(td, "batal", "Batal", r.title + " " + shortD(d) + ": dibatalkan" + (bt.jadwal.alasan ? " — " + bt.jadwal.alasan : ""), function (ca) { jadwalBtn(id, ca, true); noteBtn(kTask(id), ca, true); });
        else if (away) cellItem(td, "moved", "→ " + fmt(t.due, { weekday: "short", day: "numeric" }), r.title + " " + shortD(d) + ": ditunda ke " + shortD(t.due) + (t.jadwal && t.jadwal.alasan ? " — " + t.jadwal.alasan : ""), function (ca) { jadwalBtn(id, ca, true); noteBtn(kTask(id), ca, true); });
        else if (t) { var s1 = cellSt(t); cellItem(td, s1[0], s1[1], r.title + " " + shortD(d) + ": " + s1[1], function (ca) { taskBtn(taskOf(id), ca, null, true); jadwalBtn(id, ca, true); }); }
        else if (!ins.length) cellItem(td, d > TODAY ? "plan" : "none", d > TODAY ? "Terjadwal" : "–", r.title + " " + shortD(d) + ": " + (d > TODAY ? "terjadwal" : "belum dibuat"), null);
        ins.forEach(function (x) { var s2 = cellSt(x); cellItem(td, s2[0], "Pengganti " + fmt(x.ditundaDari, { weekday: "short", day: "numeric" }) + " · " + s2[1], r.title + " pengganti " + shortD(x.ditundaDari) + " pada " + shortD(d) + ": " + s2[1], function (ca) { taskBtn(x, ca, null, true); jadwalBtn(x.id, ca, true); }); });
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function cellSt(t) { var s = t.status === "done" ? "done" : isLate(t) ? "late" : t.status === "doing" ? "doing" : t.due === TODAY ? "today" : "plan"; return [s, { done: "✓ Selesai", late: "! Terlambat", doing: "Proses " + prog(t) + "%", today: "○ Hari ini", plan: "Terjadwal" }[s]]; }
  function cellItem(td, st, txt, aria, btns) {
    var c = el("div", "cell", txt); c.dataset.st = st; c.setAttribute("aria-label", aria); td.appendChild(c);
    if (btns) { var ca = el("div", "cell-act"); btns(ca); if (ca.childNodes.length) td.appendChild(ca); }
  }
  function renderTrend() {
    var box = $("#trend"); clear(box);
    var all = allTasks(), cur = monday(TODAY);
    var shown = 0;
    for (var k = 3; k >= 0; k--) {
      var ws = addD(cur, -7 * k);
      var p = weekPct(all, ws);
      if (p === null && k > 0) continue;
      shown++;
      var row = el("div", "trow" + (k === 0 ? " cur" : ""));
      row.appendChild(el("span", "lab", k === 0 ? "Minggu ini" : "Mg " + fmt(ws, { day: "numeric", month: "short" })));
      var bar = el("div", "bar"), b = el("b"); b.style.width = (p || 0) + "%"; bar.appendChild(b); row.appendChild(bar);
      row.appendChild(el("span", "num", p === null ? "n/a" : p + "%"));
      box.appendChild(row);
    }
    var note = $("#trendNote"); note.hidden = shown > 1;
    note.textContent = "Tren mulai terlihat setelah ada tugas bertenggat di minggu-minggu sebelumnya.";
  }

  // ---- CR ----
  function nextMs(c) { return (c.milestones || []).filter(function (m) { return m.tanggal && m.status !== "Selesai"; }).sort(function (a, b) { return a.tanggal.localeCompare(b.tanggal); })[0]; }
  function renderCR() {
    var list = $("#crList");
    var all = Object.keys(D.cr).map(function (id) { return Object.assign({ id: id }, D.cr[id]); }).sort(function (a, b) { return (a.urut || 99) - (b.urut || 99); });
    var apps = [];
    all.forEach(function (c) { if (c.aplikasi && apps.indexOf(c.aplikasi) < 0) apps.push(c.aplikasi); });
    var tabs = $("#crTabs"); clear(tabs);
    [["", "Semua"]].concat(apps.map(function (a) { return [a, a]; })).forEach(function (x) {
      var b = el("button", "tab", x[1]); b.type = "button"; b.setAttribute("aria-pressed", String(crApp === x[0]));
      b.addEventListener("click", function () { crApp = x[0]; renderCR(); }); tabs.appendChild(b);
    });
    var cnt = {}; all.forEach(function (c) { cnt[c.statusJadwal] = (cnt[c.statusJadwal] || 0) + 1; });
    var head = $("#crHead"); clear(head);
    ["Terlambat", "Berisiko", "Perlu konfirmasi", "Perlu update", "Tertahan", "Sesuai jadwal", "Selesai"].forEach(function (k) {
      if (cnt[k]) { var sp = el("span"); sp.appendChild(el("b", null, String(cnt[k]))); sp.appendChild(document.createTextNode(" " + k.toLowerCase())); head.appendChild(sp); }
    });
    clear(list);
    if (!loaded) { list.appendChild(el("div", "empty", "Memuat data CR…")); return; }
    var rows = all.filter(function (c) { return !crApp || c.aplikasi === crApp; });
    if (!rows.length) { list.appendChild(el("div", "empty", "Belum ada CR yang dipantau.")); return; }
    rows.forEach(function (c) {
      var sc = CRS[c.statusJadwal] || "s-hold";
      var box = el("div", "cr " + sc), row = el("div", "cr-row");
      var nm = el("div", "cr-name"); nm.appendChild(el("b", null, c.nama)); nm.appendChild(el("small", null, [c.aplikasi, c.fase].filter(Boolean).join(" · "))); row.appendChild(nm);
      var pg = el("div", "c-prog"), bar = el("div", "bar"), fill = el("b"); fill.style.width = (c.progres || 0) + "%"; bar.appendChild(fill);
      var lab = el("span"); lab.appendChild(el("b", null, (c.progres == null ? "–" : c.progres) + "%")); lab.appendChild(document.createTextNode(" " + (c.progresKet || "progres")));
      var pp2 = planPct(c);
      if (pp2 != null) { var pm2 = el("i", "pm"); pm2.style.left = pp2 + "%"; bar.appendChild(pm2); var gap = (c.progres || 0) - pp2; lab.appendChild(el("em", gap < 0 ? "behind" : "ahead", " · rencana " + pp2 + "% (" + (gap >= 0 ? "+" : "−") + Math.abs(gap) + " poin)")); tipOn(pg, "Rencana per hari ini dari " + c.rencana.sumber); }
      pg.appendChild(bar); pg.appendChild(lab); row.appendChild(pg);
      var nx = el("div", "c-next"), m = nextMs(c);
      if (m) {
        var dd = daysTo(m.tanggal);
        nx.appendChild(el("div", null, m.nama));
        nx.appendChild(el("div", "d" + (dd < 0 ? " past" : dd <= 3 ? " soon" : ""), shortD(m.tanggal) + " · " + (dd < 0 ? Math.abs(dd) + " hari lewat" : dd === 0 ? "hari ini" : dd + " hari lagi")));
      } else nx.appendChild(el("div", "d", "Tidak ada milestone terjadwal"));
      row.appendChild(nx);
      var sd = el("div", "c-side"), chp = el("span", "chip " + sc, c.statusJadwal || "–"); sd.appendChild(chp);
      if (c.viaAksi && c.statusAsal && c.statusAsal !== c.statusJadwal) tipOn(chp, "Dihitung ulang dari milestone yang Anda tandai di dashboard (sebelumnya " + c.statusAsal + ")");
      if (c.update) { var age = -daysTo(c.update); if (age > 21) sd.appendChild(el("span", "stale", "update " + age + " hari lalu")); }
      if (m) msBtn(c, m, sd, null, false, true);
      else if (c.viaAksi) { var lastM = (c.milestones || []).filter(function (x) { return x.viaAksi; }).pop(); msBtn(c, lastM, sd, null, false, true); }
      noteBtn(kCr(c), sd);
      lastNote(kCr(c), nm);
      var tg = el("button", "btn", crOpen === c.id ? "Tutup" : "Rincian"); tg.type = "button"; tg.setAttribute("aria-expanded", String(crOpen === c.id));
      tg.addEventListener("click", function () { crOpen = crOpen === c.id ? null : c.id; renderCR(); });
      sd.appendChild(tg); row.appendChild(sd); box.appendChild(row);
      if (crOpen === c.id) {
        var body = el("div", "cr-body");
        if (c.ringkasan) body.appendChild(el("p", null, c.ringkasan));
        if ((c.milestones || []).length) {
          var ms = el("div", "ms"); ms.appendChild(el("span", "k ms-k", "Milestone"));
          c.milestones.forEach(function (x) {
            var r = el("div"); r.appendChild(el("span", null, x.nama)); r.appendChild(el("span", "when", x.label || (x.tanggal ? shortD(x.tanggal) : "–")));
            r.appendChild(el("span", "chip " + (MSC[x.status] || "s-hold"), (x.status || "–") + (x.viaAksi ? " · dashboard" : "")));
            var ab = el("span", "ms-act"); msBtn(c, x, ab); r.appendChild(ab); ms.appendChild(r);
          });
          body.appendChild(ms);
        }
        var cn = notesOf(kCr(c));
        var nhd = el("div", "nhead"); nhd.appendChild(el("div", "eyebrow", "Catatan progres & tindak lanjut" + (cn.length ? " (" + cn.length + ")" : "")));
        var nadd = el("button", "btn sm", "+ Tambah catatan"); nadd.type = "button"; nadd.setAttribute("aria-label", "Tambah catatan untuk " + c.nama); nadd.addEventListener("click", function () { openNotes(kCr(c)); }); nhd.appendChild(nadd); body.appendChild(nhd);
        if (cn.length) { var nul = el("ul", "nlist"); cn.slice(0, 5).forEach(function (x) { nul.appendChild(noteItem(x, false)); }); body.appendChild(nul); if (cn.length > 5) { var nmore = el("button", "linkbtn", "Lihat semua " + cn.length + " catatan →"); nmore.type = "button"; nmore.addEventListener("click", function () { openNotes(kCr(c)); }); body.appendChild(nmore); } }
        else body.appendChild(el("p", "sub", "Belum ada catatan untuk CR ini."));
        if ((c.isu || []).length) { body.appendChild(el("div", "eyebrow", "Isu & hal yang perlu dikawal")); var ul = el("ul", "notes"); c.isu.forEach(function (x) { ul.appendChild(el("li", null, x)); }); body.appendChild(ul); }
        var src = (c.sumber || []).length ? "Sumber: " + c.sumber.join("; ") + " · " : "";
        body.appendChild(el("div", "src", src + (c.update ? "catatan terakhir " + shortD(c.update) : "")));
        box.appendChild(body);
      }
      list.appendChild(box);
    });
  }

  // ---- eviden CoC ----
  function renderEvidence() {
    var grid = $("#evGrid"); clear(grid);
    $("#evWeek").textContent = fmt(weekStart, { day: "numeric", month: "short" }) + " – " + fmt(addD(weekStart, 3), { day: "numeric", month: "short", year: "numeric" });
    for (var i = 0; i < 4; i++) {
      var d = addD(weekStart, i), c = D.coc[d], ups = cocUps(d), mid = "mom-" + d, bt = D.batal && D.batal[mid], mt = D.tasks[mid], away = mt && mt.due !== d;
      var ins = ((D.pindah || {})["mom@" + d] || []).filter(function (x) { return x !== mid; });
      var ag = c && c.agenda, batalAg = bt || (ag && ag.status === "Batal"), tundaAg = away || (ag && ag.status === "Ditunda");
      var card = el("div", "ev" + (c || ups.length ? " has" : " empty-ev") + (batalAg ? " is-batal" : tundaAg ? " is-moved" : "") + (c && evSel === d ? " sel" : ""));
      card.appendChild(el("div", "day" + (d === TODAY ? " today" : ""), DAYS[i] + " · " + fmt(d, { day: "numeric", month: "short" })));
      if (batalAg && !ups.length) { card.appendChild(el("h3", null, "CoC dibatalkan")); card.appendChild(el("p", "muted", (bt ? bt.jadwal.alasan : ag.alasan) || "Tanpa alasan tercatat.")); card.appendChild(el("p", "ev-wait", "Tidak dihitung terlambat dan tidak dievaluasi.")); }
      else if (tundaAg && !ups.length) { var ke = away ? mt.due : ag.ke; card.appendChild(el("h3", null, "Ditunda ke " + (ke ? shortD(ke) : "tanggal lain"))); card.appendChild(el("p", "muted", ((away && mt.jadwal && mt.jadwal.alasan) || (ag && ag.alasan)) || "Tanpa alasan tercatat.")); card.appendChild(el("p", "ev-wait", "Unggah eviden dengan tanggal " + (ke ? shortD(ke) : "pengganti") + " atau tanggal ini; keduanya tertaut ke rapat yang sama.")); }
      else if (c) cardBody(card, c, d, ups);
      else if (ups.length) upCard(card, ups);
      else {
        card.appendChild(el("h3", null, "Belum ada eviden"));
        card.appendChild(el("p", "muted", d > TODAY ? "Jadwal CoC mendatang." : "MoM dan rekap belum masuk tracker."));
      }
      ins.forEach(function (x) { var u = D.tasks[x]; if (u) card.appendChild(el("p", "ev-sub", "CoC pengganti dari " + shortD(u.ditundaDari) + " juga jatuh hari ini" + (u.jadwal && u.jadwal.alasan ? " (" + u.jadwal.alasan + ")" : "") + ".")); });
      var ea = el("div", "ev-act");
      if (!bt) { taskBtn(taskOf(mid), ea, away ? "MoM (" + fmt(mt.due, { weekday: "short", day: "numeric" }) + ")" : "MoM"); taskBtn(taskOf("rekap-" + d), ea, away ? "Rekap (" + fmt(mt.due, { weekday: "short", day: "numeric" }) + ")" : "Rekap"); }
      ins.forEach(function (x) { taskBtn(taskOf(x), ea, "MoM pengganti"); taskBtn(taskOf(x.replace(/^mom-/, "rekap-")), ea, "Rekap pengganti"); });
      jadwalBtn(mid, ea, false, "Tunda/Batal CoC");
      if (ea.childNodes.length) card.appendChild(ea);
      grid.appendChild(card);
    }
    renderDetail();
  }
  var KIND = { mom: "MoM", rekap: "Rekap" };
  function cocUps(d) { return (D.evidenList || []).filter(function (x) { return x.tanggal === d && KIND[x.jenis]; }); }
  function trackerLink(label, title) {
    var u = D.meta && D.meta.tracker;
    if (!u) return el("span", "ev-tag ok", label + " ✓");
    var a = el("a", "ev-tag ok lnk", label + " ↗"); a.href = u; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.title = (title ? title + " · " : "") + "buka di tracker"; a.setAttribute("aria-label", label + (title ? " (" + title + ")" : "") + ", buka di tracker");
    return a;
  }
  function dlBtn(x) {
    var b = el("button", "ev-dl", "⤓ " + (KIND[x.jenis] || jenisOf(x.jenis).label)); b.type = "button";
    b.title = x.nama + " · " + kbStr(x.ukuran || 0); b.setAttribute("aria-label", "Unduh " + x.nama);
    b.addEventListener("click", function () { openEviden(x, true); });
    return b;
  }
  function fileRow(card, c, ups) {
    var fl = el("div", "files"), used = {};
    var tf = c && c.files && c.files.length ? c.files : ((c && c.eviden) || []).map(function (k) { return { kind: k }; });
    tf.forEach(function (f) {
      var up = ups.filter(function (x) { return KIND[x.jenis] === f.kind && !used[x.id]; })[0];
      if (up) { used[up.id] = 1; fl.appendChild(dlBtn(up)); } else fl.appendChild(trackerLink(f.kind, f.name));
    });
    ups.forEach(function (x) { if (!used[x.id]) fl.appendChild(dlBtn(x)); });
    if (c && c.evaluasi && c.evaluasi.status === "Selesai") fl.appendChild(trackerLink("Rekap evaluasi" + (c.evaluasi.slideRekap ? " " + c.evaluasi.slideRekap + " slide" : ""), c.evaluasi.deck));
    if (!fl.childNodes.length) fl.appendChild(el("span", "muted", "Belum ada file"));
    card.appendChild(fl);
  }
  function upCard(card, ups) {
    card.appendChild(el("h3", null, ups[0].ket || "CoC"));
    card.appendChild(el("p", "muted", "Eviden masuk dari dashboard. Disalin ke tracker oleh sinkron otomatis, lalu dievaluasi pukul 17.55."));
    fileRow(card, null, ups);
    card.appendChild(el("div", "ev-wait", "Menunggu evaluasi otomatis"));
  }
  function cardBody(card, c, d, ups) {
    card.appendChild(el("h3", null, c.bidang || "CoC"));
    var ix = c.indeks || {}, m = c.status || {}, tot = c.jumlahKomitmen || 0;
    if (tot) {
      var idx = el("div", "idx"); idx.appendChild(el("b", "num", ix.persen == null ? "–" : ix.persen + "%"));
      idx.appendChild(el("span", null, "indeks kemajuan · " + (ix.maju || 0) + " ÷ " + (ix.lama || 0) + " komitmen lama")); card.appendChild(idx);
      var st = el("div", "stack"); st.setAttribute("aria-hidden", "true");
      ST.forEach(function (s) { if (m[s.k]) { var b = el("i"); b.style.width = (m[s.k] / tot * 100) + "%"; stMark(b, s); b.title = s.k + ": " + m[s.k]; st.appendChild(b); } });
      card.appendChild(st);
      var cn = el("div", "counts");
      ST.forEach(function (s) { if (m[s.k]) { var sp = el("span", null, s.k + " " + m[s.k]); stMark(sp, s); cn.appendChild(sp); } });
      card.appendChild(cn);
    }
    fileRow(card, c, ups || []);
    if (c.evaluasi && c.evaluasi.ringkas) card.appendChild(el("div", "ev-rec", c.evaluasi.ringkas));
    else if (((c.eviden || []).length || (ups || []).length) && !(c.evaluasi && c.evaluasi.status === "Selesai")) card.appendChild(el("div", "ev-wait", "Menunggu evaluasi otomatis"));
    if (c.jumlahCatatan) card.appendChild(el("div", "flag", c.jumlahCatatan + " catatan evaluasi"));
    if (!tot) return;
    var tg = el("button", "btn", evSel === d ? "Tutup rincian" : "Lihat rincian"); tg.type = "button"; tg.setAttribute("aria-expanded", String(evSel === d));
    tg.addEventListener("click", function () { evSel = evSel === d ? null : d; renderEvidence(); if (evSel) $("#evDetail").scrollIntoView({ behavior: "smooth", block: "nearest" }); });
    card.appendChild(tg);
  }
  function renderDetail() {
    var box = $("#evDetail"), c = evSel && D.coc[evSel];
    clear(box);
    if (!c) { box.hidden = true; return; }
    box.hidden = false;
    var hd = el("header"), t = el("div");
    t.appendChild(el("h3", null, c.bidang)); t.appendChild(el("div", "sub", [c.rapat, shortD(c.date), c.periode ? "rekap " + c.periode : ""].filter(Boolean).join(" · ")));
    hd.appendChild(t); box.appendChild(hd);
    if ((c.komitmen || []).length) {
      var wrap = el("div", "kbox"), tb = el("table", "kom"), th = el("thead"), hr = el("tr");
      ["No", "Lingkup", "Posisi terkini", "Target awal → terkini", "Status", "Langkah berikut · PIC · tenggat"].forEach(function (h) { var x = el("th", null, h); x.scope = "col"; hr.appendChild(x); });
      th.appendChild(hr); tb.appendChild(th);
      var body = el("tbody"), grp = null;
      c.komitmen.forEach(function (r) {
        if (r.kelompok !== grp) { grp = r.kelompok; var g = el("tr", "grp"), gt = el("td", null, grp); gt.colSpan = 6; g.appendChild(gt); body.appendChild(g); }
        var tr = el("tr"); tr.appendChild(el("td", "no", r.no)); tr.appendChild(el("td", "lk", r.lingkup)); tr.appendChild(el("td", null, r.posisi)); tr.appendChild(el("td", null, r.target));
        var s = ST.filter(function (x) { return x.k === r.status; })[0], td = el("td"), sp = el("span", "st", r.status);
        if (s) paintSt(sp, s); else sp.style.setProperty("--c", "var(--muted)"); td.appendChild(sp); tr.appendChild(td);
        tr.appendChild(el("td", null, r.langkah)); body.appendChild(tr);
      });
      tb.appendChild(body); wrap.appendChild(tb); box.appendChild(wrap);
      if ((c.catatan || []).length) { box.appendChild(el("div", "eyebrow", "Catatan evaluasi")); var ul = el("ul", "notes"); c.catatan.forEach(function (x) { ul.appendChild(el("li", null, x)); }); box.appendChild(ul); }
      return;
    }
    // profil publik: hanya agregat
    var wrap2 = el("div", "kbox agg"), t2 = el("table", "kom kom-agg"), h2 = el("thead"), r2 = el("tr");
    ["Status komitmen", "Jumlah", "Porsi"].forEach(function (h) { var x = el("th", null, h); x.scope = "col"; r2.appendChild(x); });
    h2.appendChild(r2); t2.appendChild(h2);
    var b2 = el("tbody"), tot = c.jumlahKomitmen || 0;
    ST.forEach(function (s) {
      var n = (c.status || {})[s.k] || 0; if (!n) return;
      var tr = el("tr"), td = el("td"), sp = el("span", "st", s.k); paintSt(sp, s); td.appendChild(sp); tr.appendChild(td);
      tr.appendChild(el("td", "num", String(n))); tr.appendChild(el("td", "num", tot ? Math.round(n / tot * 100) + "%" : "–")); b2.appendChild(tr);
    });
    t2.appendChild(b2); wrap2.appendChild(t2); box.appendChild(wrap2);
    box.appendChild(el("p", "sub", tot + " komitmen · " + (c.jumlahTindakLanjut || 0) + " tindak lanjut MoM · " + (c.jumlahCatatan || 0) + " catatan evaluasi. Isi komitmen, catatan dan file evaluasi hanya ada di tracker privat."));
  }

  // ---- KPI 4b ----
  function bln(m) { return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(P(m + "-01")); }
  function pbar(x) {
    var w = el("div", "pbar"); if (!x) { w.appendChild(el("span", "sub", "–")); return w; }
    var b = el("div", "bar"), f = el("b"); f.style.width = (x.total ? Math.round(x.done / x.total * 100) : 0) + "%"; b.appendChild(f);
    w.appendChild(b); w.appendChild(el("span", "sub", x.done + " dari " + x.total + " item Done" + (x.ket ? " · " + x.ket : ""))); return w;
  }
  function renderKPI() {
    var body = $("#kpiBody"); clear(body);
    var rows = Object.keys(D.kpi).sort().reverse().map(function (id) { return Object.assign({ id: id }, D.kpi[id]); });
    if (!rows.length) { var tr0 = el("tr"), td0 = el("td", "empty", loaded ? "Belum ada eviden KPI 4b." : "Memuat eviden KPI…"); td0.colSpan = 5; tr0.appendChild(td0); body.appendChild(tr0); return; }
    rows.forEach(function (k) {
      var tr = el("tr");
      var m = el("td", "m", bln(k.id)); if (k.judul) m.appendChild(el("span", "sub", k.judul)); tr.appendChild(m);
      var td = el("td"), st, cls;
      if (k.tanggal) { st = k.tanggal <= k.tenggat ? "Tepat waktu" : "Terlambat"; cls = k.tanggal <= k.tenggat ? "s-done" : "s-late"; td.appendChild(el("div", null, shortD(k.tanggal))); }
      else if (k.proses) { st = k.proses; cls = "s-risk"; if (k.prosesSejak) td.appendChild(el("div", null, "sejak " + shortD(k.prosesSejak))); }
      else { var late = k.tenggat < TODAY; st = late ? "Belum ada · lewat tenggat" : "Belum ada"; cls = late ? "s-late" : "s-hold"; }
      td.appendChild(el("span", "sub", "tenggat " + shortD(k.tenggat)));
      var ch = el("span", "chip kpi-chip " + cls, st); td.appendChild(ch);
      var ka = el("div", "kpi-act"); taskBtn(taskOf("kpi4b-" + k.id), ka); if (ka.childNodes.length) td.appendChild(ka);
      tr.appendChild(td);
      var a = el("td"); a.appendChild(pbar(k.managed)); tr.appendChild(a);
      var b = el("td"); b.appendChild(pbar(k.reeng)); tr.appendChild(b);
      var c = el("td"), n = (k.catatan || []).length;
      if (n) {
        var bt = el("button", "btn", kpiOpen === k.id ? "Tutup" : n + " catatan"); bt.type = "button"; bt.setAttribute("aria-expanded", String(kpiOpen === k.id));
        bt.addEventListener("click", function () { kpiOpen = kpiOpen === k.id ? null : k.id; renderKPI(); }); c.appendChild(bt);
      } else c.appendChild(el("span", "sub", k.adaLaporan ? "Laporan ada di tracker privat" : "–"));
      tr.appendChild(c); body.appendChild(tr);
      if (kpiOpen === k.id && n) { var dr = el("tr", "det"), dc = el("td"); dc.colSpan = 5; var ul = el("ul", "notes"); k.catatan.forEach(function (x) { ul.appendChild(el("li", null, x)); }); dc.appendChild(ul); dr.appendChild(dc); body.appendChild(dr); }
    });
  }

  // ---- daftar tugas ----
  function pick(all, f) {
    var ws = monday(TODAY);
    if (f === "today") return all.filter(function (t) { return t.due === TODAY || isLate(t); });
    if (f === "week") return all.filter(function (t) { return inWeek(t, ws); });
    if (f === "late") return all.filter(isLate);
    if (f === "open") return all.filter(function (t) { return t.status !== "done"; });
    return all.filter(function (t) { return t.status === "done"; });
  }
  function renderList() {
    var all = allTasks();
    document.querySelectorAll("#taskTabs .tab").forEach(function (b) { b.querySelector(".n").textContent = String(pick(all, b.dataset.f).length); b.setAttribute("aria-pressed", String(b.dataset.f === filter)); });
    var box = $("#list"); clear(box);
    if (!loaded) { box.appendChild(el("div", "empty", "Memuat tugas…")); return; }
    var rows = pick(all, filter);
    rows.sort(function (a, b) { return (a.status === "done") - (b.status === "done") || a.due.localeCompare(b.due) || (b.prio === "tinggi") - (a.prio === "tinggi") || (a.cat || "").localeCompare(b.cat || ""); });
    if (filter === "done") rows.sort(function (a, b) { return (b.doneAt || "").localeCompare(a.doneAt || ""); });
    var bl = filter === "done" ? Object.keys(D.batal || {}).map(function (id) { return Object.assign({ id: id }, D.batal[id]); }).sort(function (a, b) { return b.due.localeCompare(a.due); }) : [];
    if (!rows.length && !bl.length) {
      box.appendChild(el("div", "empty", { today: "Tidak ada tugas untuk hari ini.", week: "Belum ada tugas minggu ini.", late: "Tidak ada tugas terlambat.", open: "Semua tugas sudah selesai.", done: "Belum ada tugas yang selesai." }[filter]));
      return;
    }
    rows.forEach(function (t) {
      var row = el("div", "task" + (t.status === "done" ? " done" : t.status === "doing" ? " doing" : "") + (isLate(t) ? " late" : ""));
      var dot = el("span", "dot"); dot.setAttribute("aria-hidden", "true");
      var main = el("div", "tmain"); main.appendChild(el("div", "ttl", t.title));
      var meta = el("div", "meta");
      meta.appendChild(el("span", "pill " + (CAT[t.cat] ? t.cat : "lain"), CAT[t.cat] || "Lainnya"));
      if (t.prio === "tinggi") meta.appendChild(el("span", "pill hi", "Prioritas tinggi"));
      if (isLate(t)) meta.appendChild(el("span", "pill late", "Terlambat"));
      if (t.ditundaDari && t.ditundaDari !== t.due) meta.appendChild(el("span", "pill moved", "Ditunda dari " + shortD(t.ditundaDari)));
      meta.appendChild(el("span", "mono", "Tenggat " + shortD(t.due) + (t.time ? " " + t.time : "")));
      main.appendChild(meta);
      lastNote(kTask(t.id), main);
      var side = el("div", "tside2"), sr = el("span", "seg-ro"), bar = el("span", "bar"), f = el("b"); f.style.width = prog(t) + "%"; bar.appendChild(f);
      sr.appendChild(bar); sr.appendChild(document.createTextNode(t.status === "done" ? (t.viaEviden ? "Selesai · eviden" : t.viaAksi ? "Selesai · dashboard" : "Selesai") : prog(t) + "%")); side.appendChild(sr);
      actBtns(t, side, !!jenisForTask(t.id)); jadwalBtn(t.id, side);
      if (t.status !== "done" && t.due >= TODAY && !onCalendar(t)) { var gl = el("a", "gcal", "+ Kalender"); gl.href = gcalLink(t); gl.target = "_blank"; gl.rel = "noopener noreferrer"; gl.setAttribute("aria-label", "Tambah ke Google Calendar: " + t.title); main.appendChild(gl); }
      row.appendChild(dot); row.appendChild(main); row.appendChild(side); box.appendChild(row);
    });
    if (bl.length) box.appendChild(el("div", "fg", "Dibatalkan · tidak dihitung dalam kinerja"));
    bl.forEach(function (t) {
      var row = el("div", "task batal"), dot = el("span", "dot"); dot.setAttribute("aria-hidden", "true");
      var main = el("div", "tmain"); main.appendChild(el("div", "ttl", t.title));
      var meta = el("div", "meta"); meta.appendChild(el("span", "pill " + (CAT[t.cat] ? t.cat : "lain"), CAT[t.cat] || "Lainnya")); meta.appendChild(el("span", "pill moved", "Dibatalkan")); meta.appendChild(el("span", "mono", "Jadwal " + shortD(t.due) + (t.jadwal.alasan ? " · " + t.jadwal.alasan : ""))); main.appendChild(meta);
      var side = el("div", "tside2"); noteBtn(kTask(t.id), side); jadwalBtn(t.id, side);
      row.appendChild(dot); row.appendChild(main); row.appendChild(side); box.appendChild(row);
    });
  }

  // ---- data & kesegaran ----
  function setFresh(cls, txt) { var f = $("#fresh"); f.className = "fchip " + cls; f.textContent = txt; $("#sideData").textContent = txt; }
  function freshness() {
    var t = D.meta && D.meta.diekspor ? new Date(D.meta.diekspor) : null;
    var banner = $("#banner");
    if (!t || isNaN(t)) { setFresh("bad", "! Waktu data tidak diketahui"); return; }
    var jam = (Date.now() - t.getTime()) / 3600000;
    var label = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(t) + " WIB";
    if (jam <= 26) { setFresh("ok", "✓ Segar · data per " + label); banner.hidden = true; }
    else if (jam <= 96) { setFresh("warn", "▲ Tertunda · data per " + label); banner.hidden = false; banner.className = "banner"; banner.textContent = "Data belum diperbarui lebih dari sehari. Minta Claude memperbarui data/tracker.enc.json."; }
    else { setFresh("bad", "! Usang " + Math.floor(jam / 24) + " hari · data per " + label); banner.hidden = false; banner.className = "banner bad"; banner.textContent = "Data sudah lebih dari 4 hari. Angka di dashboard ini mungkin tidak lagi sesuai tracker."; }
    $("#footSrc").textContent = "Sumber data: " + (D.meta.sumber || "data/tracker.enc.json") + " · profil " + (D.meta.profil || "–") + " · diekspor " + label + ". Eviden dan tombol ✓ Selesai disimpan terenkripsi di repo, lalu disalin ke tracker privat oleh sinkron otomatis (06.30, 12.30, 17.30 WIB).";
  }
  function valid(x) { return x && typeof x === "object" && x.meta && x.tasks && x.cr && x.coc && x.kpi; }
  // setiap panel dirender terpisah: galat di satu panel dicatat di konsol, panel lain dan proses simpan tetap jalan
  var renderErr = null;
  function renderAll() {
    renderErr = null;
    [renderOverview, renderKinerja, navBadges, renderMatrix, renderTrend, renderCR, renderEvidence, renderKPI, renderList, renderKalender, renderEvidenView, renderNotes, syncUpHint].forEach(function (fn) {
      try { fn(); } catch (e) { renderErr = e; if (window.console) console.error("[dashboard] " + (fn.name || "render") + ":", e); }
    });
  }

  // ---- data terenkripsi: kata sandi → PBKDF2 → AES-256-GCM (WebCrypto) ----
  var SKEY = "dse-pribadi:sandi";
  var sandi = null, env = null, keyCache = {};
  function store(kind) { try { return kind === "local" ? window.localStorage : window.sessionStorage; } catch (e) { return null; } }
  function rememberGet() { var v = null; ["session", "local"].some(function (k) { var s = store(k); try { v = s && s.getItem(SKEY); } catch (e) { v = null; } return !!v; }); return v; }
  function rememberSet(v, lama) { ["session", "local"].forEach(function (k) { var s = store(k); try { if (s) s.removeItem(SKEY); } catch (e) { } }); if (!v) return; var s = store(lama ? "local" : "session"); try { if (s) s.setItem(SKEY, v); } catch (e) { } }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function deriveKey(pw, e) {
    var id = e.kdf.salt + ":" + e.kdf.iter;
    if (keyCache[id]) return keyCache[id];
    var te = new TextEncoder();
    keyCache[id] = crypto.subtle.importKey("raw", te.encode(pw.normalize("NFC")), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(e.kdf.salt), iterations: e.kdf.iter }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    });
    return keyCache[id];
  }
  function decrypt(pw, e) {
    // dse-aesgcm-gz-v1 = isi JSON dikompres gzip sebelum dienkripsi (data dashboard ±5× lebih kecil)
    if (!e || (e.format !== "dse-aesgcm-v1" && e.format !== "dse-aesgcm-gz-v1") || !e.kdf || !e.iv || !e.ct) return Promise.reject(new Error("format"));
    return deriveKey(pw, e).then(function (k) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: new TextEncoder().encode(e.format) }, k, unb64(e.ct));
    }).then(function (buf) {
      if (e.format !== "dse-aesgcm-gz-v1") return JSON.parse(new TextDecoder().decode(buf));
      if (typeof DecompressionStream === "undefined") throw new Error("Browser ini belum mendukung data terkompres. Perbarui browser.");
      return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then(JSON.parse);
    });
  }
  function lock(msg) {
    sandi = null; keyCache = {}; D = { meta: {}, tasks: {}, cr: {}, coc: {}, kpi: {} }; loaded = false; BASE = null; TOKEN = null; ghInfo = null; EV = { skema: 1, eviden: [] }; ACT = { skema: 1, status: {} };
    document.body.classList.add("locked"); $("#lock").hidden = false;
    var er = $("#lockErr"); er.hidden = !msg; er.textContent = msg || "";
    setTimeout(function () { $("#lockPw").focus(); }, 0);
  }
  function unlocked(x) {
    if (!valid(x)) throw new Error("format");
    BASE = x; loaded = true; document.body.classList.remove("locked"); $("#lock").hidden = true;
    rebuild();
    tokenLoad().then(function () { renderEvidenView(); return Promise.all([evLoad(), actLoad()]); });
  }
  $("#lockForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var pw = $("#lockPw").value, btn = $("#lockBtn");
    if (!pw || !env) return;
    btn.disabled = true; btn.textContent = "Membuka…";
    keyCache = {};
    decrypt(pw, env).then(function (x) {
      sandi = pw; rememberSet(pw, $("#lockKeep").checked); $("#lockPw").value = ""; unlocked(x);
    }).catch(function () { lock("Kata sandi salah atau data rusak. Coba lagi."); }).then(function () { btn.disabled = false; btn.textContent = "Buka dashboard"; });
  });
  $("#btnLock").addEventListener("click", function () { rememberSet(null); lock("Dashboard dikunci. Kata sandi dihapus dari perangkat ini."); });

  // =====================================================================
  // EVIDEN (unggah terenkripsi ke repo lewat GitHub API) + GOOGLE CALENDAR
  // =====================================================================
  var EVIDEN_PATH = "data/eviden.enc.json";
  var GH_KEY = "dse-pribadi:gh";           // token GitHub, disimpan TERENKRIPSI dengan kata sandi dashboard
  var MAX_MB = 20;
  var JENIS = [
    { k: "mom", label: "MoM CoC", tugas: "mom-", per: "hari" },
    { k: "rekap", label: "Rekap CoC", tugas: "rekap-", per: "hari" },
    { k: "cresppd", label: "MoM Weekly CR ESPPD Re-Engineering", tugas: "cresppd-", per: "hari" },
    { k: "crlayanan", label: "MoM Weekly CR Aplikasi Layanan GA", tugas: "crlayanan-", per: "hari" },
    { k: "kpi4b", label: "Eviden KPI 4b", tugas: "kpi4b-", per: "bulan" },
    { k: "cr", label: "Dokumen CR (timeline, UAT, BA)", tugas: null },
    { k: "lain", label: "Lainnya", tugas: null }
  ];
  var BASE = null, EV = { skema: 1, eviden: [] }, evTag = null, TOKEN = null, ghInfo = null;
  var REPO = (function () { var o = location.hostname.split(".")[0], r = location.pathname.split("/").filter(Boolean)[0] || ""; return { owner: o, repo: r }; })();
  var te = new TextEncoder();

  function jenisOf(k) { return JENIS.filter(function (j) { return j.k === k; })[0] || JENIS[JENIS.length - 1]; }
  function taskIdFor(jenis, tanggal) { var j = jenisOf(jenis); if (!j.tugas || !tanggal) return null; return j.tugas + (j.per === "bulan" ? tanggal.slice(0, 7) : tanggal); }
  function b64(u8) { var s = "", CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function kbStr(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function nowIso() { return new Date().toISOString().replace(/\.\d+Z$/, "Z"); }

  // --- kunci eviden (K2): 32 byte acak di data terenkripsi; juga dipakai sinkron otomatis ke tracker ---
  var k2Raw = null, k2Key = null;
  function k2() {
    var raw = BASE && BASE.meta && BASE.meta.kunciEviden;
    if (!raw) return null;
    if (raw !== k2Raw) { k2Raw = raw; k2Key = crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]); }
    return k2Key;
  }
  function encAnyJSON(obj) {
    if (!k2()) return encryptJSON(sandi, obj);
    var iv = crypto.getRandomValues(new Uint8Array(12)), format = "dse-k2-v1";
    return k2().then(function (k) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: te.encode(format) }, k, te.encode(JSON.stringify(obj))); })
      .then(function (ct) { return { format: format, cipher: "AES-256-GCM", iv: b64(iv), ct: b64(new Uint8Array(ct)) }; });
  }
  function decAnyJSON(e) {
    if (!e || e.format !== "dse-k2-v1") return decrypt(sandi, e);
    if (!k2()) return Promise.reject(new Error("kunci"));
    return k2().then(function (k) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: te.encode(e.format) }, k, unb64(e.ct)); })
      .then(function (b) { return JSON.parse(new TextDecoder().decode(b)); });
  }
  // berkas DSE2: "DSE2" + iv(12) + ciphertext, AAD "dse-file-v2", kunci K2
  function encFile(bytes) {
    if (!k2()) return encryptFile(sandi, bytes);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return k2().then(function (k) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: te.encode("dse-file-v2") }, k, bytes); })
      .then(function (ct) { var c = new Uint8Array(ct), out = new Uint8Array(16 + c.length); out.set(te.encode("DSE2"), 0); out.set(iv, 4); out.set(c, 16); return out; });
  }

  // --- kunci dari kata sandi (salt baru per berkas) ---
  function keyFrom(pw, salt, iter, usages) {
    return crypto.subtle.importKey("raw", te.encode(pw.normalize("NFC")), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, usages);
    });
  }
  function encryptJSON(pw, obj) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), format = "dse-aesgcm-v1";
    return keyFrom(pw, salt, 600000, ["encrypt"]).then(function (k) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: te.encode(format) }, k, te.encode(JSON.stringify(obj)));
    }).then(function (ct) { return { format: format, kdf: { name: "PBKDF2", hash: "SHA-256", iter: 600000, salt: b64(salt) }, cipher: "AES-256-GCM", iv: b64(iv), ct: b64(new Uint8Array(ct)) }; });
  }
  // berkas biner: "DSE1" + salt(16) + iv(12) + ciphertext, AAD "dse-file-v1"
  function encryptFile(pw, bytes) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return keyFrom(pw, salt, 600000, ["encrypt"]).then(function (k) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv, additionalData: te.encode("dse-file-v1") }, k, bytes);
    }).then(function (ct) { var c = new Uint8Array(ct), out = new Uint8Array(32 + c.length); out.set(te.encode("DSE1"), 0); out.set(salt, 4); out.set(iv, 20); out.set(c, 32); return out; });
  }
  function decryptFile(pw, buf) {
    var u = new Uint8Array(buf), hd = new TextDecoder().decode(u.subarray(0, 4));
    if (hd === "DSE2") { if (!k2()) return Promise.reject(new Error("kunci")); return k2().then(function (k) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(4, 16), additionalData: te.encode("dse-file-v2") }, k, u.subarray(16)); }); }
    if (hd !== "DSE1") return Promise.reject(new Error("format"));
    return keyFrom(pw, u.slice(4, 20), 600000, ["decrypt"]).then(function (k) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: u.slice(20, 32), additionalData: te.encode("dse-file-v1") }, k, u.subarray(32));
    });
  }

  // --- GitHub API (hanya repo dashboard ini) ---
  function gh(method, path, body, accept) {
    var h = { Authorization: "Bearer " + TOKEN, Accept: accept || "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (body) h["Content-Type"] = "application/json";
    return fetch("https://api.github.com/repos/" + REPO.owner + "/" + REPO.repo + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  }
  function ghGet(path) { return gh("GET", "/contents/" + path + "?ref=main").then(function (r) { if (r.status === 404) return null; if (!r.ok) throw ghErr(r); return r.json(); }); }
  function ghPut(path, b64content, message, sha) {
    var body = { message: message, content: b64content, branch: "main" }; if (sha) body.sha = sha;
    return gh("PUT", "/contents/" + path, body).then(function (r) { if (!r.ok) throw ghErr(r); return r.json(); });
  }
  function ghDelete(path, message) {
    return ghGet(path).then(function (j) { if (!j) return null; return gh("DELETE", "/contents/" + path, { message: message, sha: j.sha, branch: "main" }).then(function (r) { if (!r.ok && r.status !== 404) throw ghErr(r); return r; }); });
  }
  function ghErr(r) { var e = new Error("GitHub " + r.status); e.status = r.status; return e; }
  function ghMsg(e) {
    if (!e || (!e.status && (e.name === "TypeError" && /fetch|network|load/i.test(e.message || "")))) return "Koneksi ke GitHub gagal. Periksa internet lalu coba lagi.";
    if (!e.status) return "Galat di dashboard (" + (e.message || e) + "). Muat ulang halaman lalu cek arsip sebelum mengulang.";
    if (e.status === 401) return "Token GitHub tidak berlaku (kedaluwarsa atau dicabut). Buat token baru di Koneksi GitHub.";
    if (e.status === 403 || e.status === 404) return "Token tidak punya izin tulis ke repo " + REPO.repo + ". Pastikan izin Contents: Read and write.";
    if (e.status === 409 || e.status === 422) return "File di repo baru saja berubah. Coba unggah lagi.";
    return "GitHub menolak permintaan (kode " + e.status + ").";
  }

  // --- token: disimpan terenkripsi, dibuka dengan kata sandi ---
  function tokenLoad() {
    var raw = null; try { raw = localStorage.getItem(GH_KEY); } catch (e) { }
    if (!raw || !sandi) { TOKEN = null; return Promise.resolve(null); }
    var e; try { e = JSON.parse(raw); } catch (x) { return Promise.resolve(null); }
    return decrypt(sandi, e).then(function (o) { TOKEN = o.token; return TOKEN; }).catch(function () { TOKEN = null; return null; });
  }
  function tokenSave(tok) { return encryptJSON(sandi, { token: tok, disimpan: nowIso() }).then(function (e) { try { localStorage.setItem(GH_KEY, JSON.stringify(e)); } catch (x) { } TOKEN = tok; }); }
  function tokenForget() { try { localStorage.removeItem(GH_KEY); } catch (x) { } TOKEN = null; ghInfo = null; }
  function tokenTest(tok) {
    var prev = TOKEN; TOKEN = tok;
    return gh("GET", "").then(function (r) { if (!r.ok) throw ghErr(r); return r.json(); }).then(function (j) {
      if (!j.permissions || !j.permissions.push) { var e = new Error("no push"); e.status = 403; throw e; }
      ghInfo = { full: j.full_name, private: j.private }; return ghInfo;
    }).catch(function (e) { TOKEN = prev; throw e; });
  }

  // --- indeks eviden: data/eviden.enc.json (terenkripsi) ---
  function evFromEnvelope(e) { return decAnyJSON(e).then(function (o) { if (!o || !Array.isArray(o.eviden)) throw new Error("format"); return o; }); }
  function evLoad() {
    // sumber cepat: GitHub Pages (situs sendiri); jika token ada, API (lebih segar setelah unggah)
    var p = TOKEN ? ghGet(EVIDEN_PATH).then(function (j) { return j ? JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\n/g, "")))) : null; })
                  : fetch(EVIDEN_PATH, { cache: "no-cache" }).then(function (r) { evTag = r.headers.get("ETag") || r.headers.get("Last-Modified"); return r.ok ? r.json() : null; });
    return p.then(function (e) { return e ? evFromEnvelope(e) : { skema: 1, eviden: [] }; })
      .then(function (o) { EV = o; rebuild(); }).catch(function () { /* indeks belum ada atau tidak terbaca: abaikan */ });
  }
  // eviden → tugas: pakai id yang tersimpan, atau turunkan dari jenis + tanggal (mom-YYYY-MM-DD, kpi4b-YYYY-MM, …)
  function evTask(x, tasks) {
    tasks = tasks || D.tasks;
    var id = x.tugas || taskIdFor(x.jenis, x.tanggal) || "", t = tasks[id];
    if (t && t.status !== "done") return id;
    // agenda yang ditunda ke tanggal eviden ini (mis. CoC Rabu dipindah ke Kamis)
    var pre = keyOfId(id) + "-", alt = Object.keys(tasks).filter(function (k) { var u = tasks[k]; return k !== id && k.indexOf(pre) === 0 && u.ditundaDari && u.due === x.tanggal && u.status !== "done"; })[0];
    return alt || id;
  }
  // tugas rutin dibuat ringkasan pagi di tracker setiap hari kerja; bila data dashboard belum diekspor ulang,
  // buat padanannya di sini (id sama dengan tracker) sampai Jumat minggu berjalan, agar eviden (termasuk MoM Weekly CR
  // hari Kamis/Jumat), tombol aksi, dan matriks rutin tetap jalan.
  function ensureRoutine(d) {
    var ex = d.meta && d.meta.diekspor ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(d.meta.diekspor)) : addD(TODAY, -1);
    var CATR = { mom: "mom", rekap: "rekap", cresppd: "cr", crlayanan: "cr" };
    for (var s = addD(ex, 1), end = addD(monday(TODAY), 4); s <= end; s = addD(s, 1)) {
      var wd = (P(s).getUTCDay() + 6) % 7;
      ROUTINE.forEach(function (r) {
        var id = r.key + "-" + s;
        if (r.days.indexOf(wd) < 0 || d.tasks[id]) return;
        d.tasks[id] = { title: r.title, cat: CATR[r.key] || "lain", due: s, time: "16:00", prio: "normal", status: "todo", progress: 0, routine: true, doneAt: null, sintetis: true };
      });
    }
  }
  function rebuild() {
    try { rebuild0(); } catch (e) { if (window.console) console.error("[dashboard] rebuild:", e); }
  }
  function rebuild0() {
    if (!BASE) return;
    var d = JSON.parse(JSON.stringify(BASE));
    d.evidenList = (EV.eviden || []).slice().sort(function (a, b) { return (b.tanggal + b.diunggah).localeCompare(a.tanggal + a.diunggah); });
    ensureRoutine(d);
    applyJadwal(d);
    d.evidenList.forEach(function (x) {
      var t = d.tasks[evTask(x, d.tasks)];
      if (t && t.status !== "done") { t.status = "done"; t.progress = 100; t.doneAt = x.diunggah; t.viaEviden = true; }
      if (x.jenis === "kpi4b") { var k = d.kpi[x.tanggal.slice(0, 7)]; if (k) k.adaLaporan = true; }
    });
    applyAct(d);
    D = d; renderAll(); if (loaded) freshness();
  }

  // --- unggah ---
  var uploading = false, dupOk = null;
  function setUpMsg(cls, txt) { var m = $("#upMsg"); m.hidden = !txt; m.className = "up-msg " + (cls || ""); m.textContent = txt || ""; }
  function doUpload(ev) {
    ev.preventDefault();
    if (uploading) return;
    if (!TOKEN) { setUpMsg("bad", "Hubungkan GitHub dulu (bagian Koneksi GitHub di bawah)."); return; }
    var f = $("#upFile").files[0], jenis = $("#upJenis").value, tanggal = $("#upTanggal").value, ket = $("#upKet").value.trim();
    if (!f) { setUpMsg("bad", "Pilih file eviden."); return; }
    if (!tanggal) { setUpMsg("bad", "Isi tanggal eviden."); return; }
    if (f.size > MAX_MB * 1048576) { setUpMsg("bad", "File " + kbStr(f.size) + " melebihi batas " + MAX_MB + " MB. Kompres PDF-nya dulu."); return; }
    var dup = (EV.eviden || []).filter(function (x) { return x.jenis === jenis && x.tanggal === tanggal && x.nama === f.name; })[0], dk = jenis + "|" + tanggal + "|" + f.name + "|" + f.size;
    if (dup && dupOk !== dk) { dupOk = dk; setUpMsg("bad", "File “" + f.name + "” untuk " + shortD(tanggal) + " sudah ada di arsip (diunggah " + fmtDT(dup.diunggah) + "). Tekan Unggah sekali lagi bila memang ingin mengunggah ulang."); return; }
    dupOk = null;
    var id = tanggal.replace(/-/g, "") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    var path = "eviden/" + tanggal.slice(0, 4) + "/" + tanggal.slice(5, 7) + "/" + id + ".bin";
    var tugas = taskIdFor(jenis, tanggal);
    uploading = true; $("#upBtn").disabled = true; setUpMsg("", "Mengenkripsi file…");
    f.arrayBuffer().then(function (buf) { return encFile(buf); }).then(function (bin) {
      setUpMsg("", "Mengunggah ke GitHub (" + kbStr(bin.length) + ")…");
      return ghPut(path, b64(bin), "Tambah eviden terenkripsi " + id);
    }).then(function () {
      setUpMsg("", "Memperbarui daftar eviden…");
      var entry = { id: id, path: path, jenis: jenis, tanggal: tanggal, ket: ket, nama: f.name, ukuran: f.size, tipe: f.type || "", diunggah: nowIso(), tugas: tugas };
      return saveIndex(function (o) { o.eviden.push(entry); return o; }, 0);
    }).then(function () {
      $("#upForm").reset(); $("#upTanggal").value = TODAY; upDefaultJenis(); syncUpHint();
      setUpMsg("ok", "✓ Eviden tersimpan terenkripsi" + (tugas ? " dan tugas terkait ditandai selesai." : ".") + " Situs memuat versi baru dalam 1–2 menit; daftar di bawah sudah diperbarui.");
    }).catch(function (e) { setUpMsg("bad", "! " + ghMsg(e)); }).then(function () { uploading = false; $("#upBtn").disabled = false; });
  }
  function saveIndex(mutate, attempt) {
    return ghGet(EVIDEN_PATH).then(function (j) {
      var p = j ? evFromEnvelope(JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\n/g, ""))))) : Promise.resolve({ skema: 1, eviden: [] });
      return p.then(function (o) { var next = mutate(o); next.diperbarui = nowIso(); return encAnyJSON(next).then(function (e) {
        return ghPut(EVIDEN_PATH, b64(te.encode(JSON.stringify(e) + "\n")), "Perbarui indeks eviden terenkripsi", j && j.sha).then(function () { EV = next; rebuild(); });
      }); });
    }).catch(function (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) return saveIndex(mutate, attempt + 1); throw e; });
  }
  function openEviden(x, download) {
    var btnMsg = $("#evListMsg"); btnMsg.hidden = false; btnMsg.className = "up-msg"; btnMsg.textContent = "Membuka " + x.nama + "…";
    toast((download ? "Mengunduh " : "Membuka ") + x.nama + "…", "");
    var src = TOKEN ? gh("GET", "/contents/" + x.path + "?ref=main", null, "application/vnd.github.raw") : fetch(x.path, { cache: "no-cache" });
    src.then(function (r) { if (!r.ok) throw ghErr(r); return r.arrayBuffer(); }).then(function (buf) { return decryptFile(sandi, buf); }).then(function (plain) {
      var url = URL.createObjectURL(new Blob([plain], { type: x.tipe || "application/octet-stream" }));
      var a = document.createElement("a"); a.href = url; if (download || !/pdf|image/.test(x.tipe || "")) a.download = x.nama; else a.target = "_blank";
      a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      btnMsg.hidden = true; toast("✓ " + x.nama + (download ? " diunduh." : " dibuka."), "ok");
    }).catch(function (e) { btnMsg.className = "up-msg bad"; btnMsg.textContent = e && e.status === 404 ? "! File belum tersedia di situs. Tunggu 1–2 menit setelah unggah, atau hubungkan GitHub." : "! File tidak bisa dibuka: " + (e && e.status ? ghMsg(e) : "kunci atau format file tidak cocok."); toast(btnMsg.textContent, "bad"); });
  }

  // --- status tugas dari tombol aksi: data/status.enc.json (terenkripsi), disalin ke tracker oleh sinkron otomatis ---
  var STATUS_PATH = "data/status.enc.json", ACT = { skema: 1, status: {} }, actTag = null, RANK = { todo: 0, doing: 1, done: 2 }, saving = {};
  function actLoad() {
    var p = TOKEN ? ghGet(STATUS_PATH).then(function (j) { return j ? JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\n/g, "")))) : null; })
                  : fetch(STATUS_PATH, { cache: "no-cache" }).then(function (r) { actTag = r.headers.get("ETag") || r.headers.get("Last-Modified"); return r.ok ? r.json() : null; });
    return p.then(function (e) { return e ? decAnyJSON(e) : null; }).then(function (o) { if (o && o.status) { ACT = o; rebuild(); } }).catch(function () { /* belum ada atau tidak terbaca */ });
  }
  function saveStatus(mutate, attempt) {
    return ghGet(STATUS_PATH).then(function (j) {
      var p = j ? decAnyJSON(JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\n/g, ""))))) : Promise.resolve({ skema: 1, status: {} });
      return p.then(function (o) { o.status = o.status || {}; var next = mutate(o); next.diperbarui = nowIso(); return encAnyJSON(next).then(function (e) {
        return ghPut(STATUS_PATH, b64(te.encode(JSON.stringify(e) + "\n")), "Perbarui status tugas terenkripsi", j && j.sha).then(function () { ACT = next; rebuild(); });
      }); });
    }).catch(function (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) return saveStatus(mutate, attempt + 1); throw e; });
  }
  // status dari dashboard hanya boleh MENAIKKAN status tracker (todo → doing → done), tidak pernah menurunkan
  function applyAct(d) {
    Object.keys(ACT.status || {}).forEach(function (id) {
      var a = ACT.status[id], t = d.tasks[id];
      if (!t || !a) return;
      var ra = RANK[a.status] || 0, rt = RANK[t.status] || 0;
      if (ra < rt || (ra === rt && !(a.status === "doing" && (+a.progress || 0) > (+t.progress || 0)))) return;
      t.status = a.status; t.progress = a.status === "done" ? 100 : Math.max(+t.progress || 0, +a.progress || 0);
      if (a.status === "done") t.doneAt = a.doneAt || a.at;
      t.viaAksi = true;
    });
    // milestone CR yang ditandai selesai dari dashboard (kunci "<idCR>::<nama milestone>")
    Object.keys(ACT.ms || {}).forEach(function (k) {
      var a = ACT.ms[k], i = k.indexOf("::"), c = i > 0 && d.cr[k.slice(0, i)], nm = k.slice(i + 2);
      if (!c || !a || a.status !== "Selesai") return;
      (c.milestones || []).forEach(function (m) { if (m.nama === nm && m.status !== "Selesai") { m.status = "Selesai"; m.viaAksi = true; m.doneAt = a.at; } });
    });
    Object.keys(d.cr || {}).forEach(function (id) {
      var c = d.cr[id], ms = c.milestones || [];
      if (!ms.some(function (m) { return m.viaAksi; }) || c.statusJadwal === "Selesai") return;
      c.viaAksi = true; c.statusAsal = c.statusJadwal;
      if (ms.every(function (m) { return m.status === "Selesai"; })) { c.statusJadwal = "Selesai"; c.progres = 100; return; }
      if (c.statusJadwal === "Tertahan") return;
      // status jadwal dihitung ulang dari milestone berikutnya yang belum selesai
      var nx = ms.filter(function (m) { return m.tanggal && m.status !== "Selesai"; }).sort(function (a, b) { return a.tanggal.localeCompare(b.tanggal); })[0];
      if (!nx) return;
      var pp = planPct(Object.assign({ id: id }, c)), gap = pp == null ? 0 : (c.progres || 0) - pp;
      c.statusJadwal = nx.tanggal < TODAY || nx.status === "Terlambat" ? "Terlambat" : nx.status === "Berisiko" || gap < -10 ? "Berisiko" : nx.status === "Perlu konfirmasi" ? "Perlu konfirmasi" : "Sesuai jadwal";
    });
  }
  var toastEl = null, toastT = null;
  function toast(msg, cls, act) {
    if (!toastEl) { toastEl = el("div", "toast"); toastEl.setAttribute("role", "status"); toastEl.setAttribute("aria-live", "polite"); document.body.appendChild(toastEl); }
    clear(toastEl); toastEl.className = "toast on " + (cls || "");
    toastEl.appendChild(el("span", null, msg));
    function hide() { toastEl.className = "toast"; }
    if (act) { var b = el("button", "tbtn", act.label); b.type = "button"; b.addEventListener("click", function () { hide(); act.fn(); }); toastEl.appendChild(b); }
    clearTimeout(toastT); toastT = setTimeout(hide, act ? 8000 : 4500);
  }
  function shortT(s) { s = s || ""; return s.length > 48 ? s.slice(0, 46) + "…" : s; }
  function setTaskState(t, status) {
    if (!TOKEN) { toast("Hubungkan GitHub dulu (menu Eviden → Koneksi GitHub) agar status bisa disimpan.", "bad", { label: "Buka", fn: function () { location.hash = "eviden"; } }); return; }
    var id = t.id; if (saving[id]) return;
    var prev = ACT.status[id], at = nowIso();
    var val = status ? { status: status, at: at, doneAt: status === "done" ? at : null, progress: status === "done" ? 100 : 50 } : null;
    saving[id] = true;
    if (val) ACT.status[id] = val; else delete ACT.status[id];
    rebuild();
    toast("Menyimpan status…", "");
    saveStatus(function (o) { if (val) o.status[id] = val; else delete o.status[id]; return o; }, 0).then(function () {
      var undo = { label: "Batalkan", fn: function () { setTaskState(t, null); } };
      if (status === "done") toast("✓ “" + shortT(t.title) + "” selesai" + (jenisForTask(id) && !t.viaEviden ? ". Unggah eviden bila ada." : "."), "ok", undo);
      else if (status === "doing") toast("“" + shortT(t.title) + "” sedang dikerjakan.", "ok", undo);
      else toast("Status “" + shortT(t.title) + "” dikembalikan.", "");
    }).catch(function (e) {
      if (prev) ACT.status[id] = prev; else delete ACT.status[id];
      rebuild(); toast("! Status belum tersimpan: " + ghMsg(e), "bad");
    }).then(function () { delete saving[id]; });
  }
  function actBtns(t, box, compact) {
    if (!loaded || !t.id) return;
    if (t.status === "done") {
      if (t.viaAksi) { var u = el("button", "btn sm ghost", "Batalkan"); u.type = "button"; u.setAttribute("aria-label", "Batalkan status selesai: " + t.title); u.addEventListener("click", function () { setTaskState(t, null); }); box.appendChild(u); }
    } else {
      if (t.status !== "doing" && !compact) { var s = el("button", "btn sm ghost", "Mulai"); s.type = "button"; s.setAttribute("aria-label", "Tandai sedang dikerjakan: " + t.title); s.addEventListener("click", function () { setTaskState(t, "doing"); }); box.appendChild(s); }
      var b = el("button", "btn sm ok", "✓ Selesai"); b.type = "button"; b.setAttribute("aria-label", "Tandai selesai: " + t.title);
      b.addEventListener("click", function () { setTaskState(t, "done"); }); box.appendChild(b);
    }
    noteBtn(kTask(t.id), box, compact);
  }
  // tombol aksi generik untuk tugas tracker (dipakai di semua menu)
  function taskOf(id) { return id && D.tasks[id] ? Object.assign({ id: id }, D.tasks[id]) : null; }
  function taskBtn(t, box, label, mini) {
    if (!loaded || !t || !t.id) return;
    var b, al;
    if (t.status !== "done") { b = el("button", "btn sm ok" + (mini ? " xs" : ""), mini ? "✓" : "✓ " + (label || "Selesai")); al = "Tandai selesai: " + t.title + " (" + shortD(t.due) + ")"; b.addEventListener("click", function () { setTaskState(t, "done"); }); }
    else if (t.viaAksi) { b = el("button", "btn sm ghost" + (mini ? " xs" : ""), mini ? "↺" : "Batalkan" + (label ? " " + label : "")); al = "Batalkan status selesai: " + t.title + " (" + shortD(t.due) + ")"; b.addEventListener("click", function () { setTaskState(t, null); }); }
    if (b) { b.type = "button"; b.title = al; b.setAttribute("aria-label", al); box.appendChild(b); }
    noteBtn(kTask(t.id), box, mini);
  }
  function setMsState(c, m, done) {
    if (!TOKEN) { toast("Hubungkan GitHub dulu (menu Eviden → Koneksi GitHub) agar status bisa disimpan.", "bad", { label: "Buka", fn: function () { location.hash = "eviden"; } }); return; }
    var k = c.id + "::" + m.nama; if (saving[k]) return;
    ACT.ms = ACT.ms || {};
    var prev = ACT.ms[k], val = done ? { status: "Selesai", at: nowIso(), cr: c.id, nama: m.nama } : null;
    saving[k] = true;
    if (val) ACT.ms[k] = val; else delete ACT.ms[k];
    rebuild(); toast("Menyimpan status milestone…", "");
    saveStatus(function (o) { o.ms = o.ms || {}; if (val) o.ms[k] = val; else delete o.ms[k]; return o; }, 0).then(function () {
      if (done) toast("✓ Milestone “" + shortT(m.nama) + "” · " + shortT(c.nama) + " selesai.", "ok", { label: "Batalkan", fn: function () { setMsState(c, m, false); } });
      else toast("Milestone “" + shortT(m.nama) + "” dikembalikan.", "");
    }).catch(function (e) {
      ACT.ms = ACT.ms || {}; if (prev) ACT.ms[k] = prev; else delete ACT.ms[k];
      rebuild(); toast("! Status belum tersimpan: " + ghMsg(e), "bad");
    }).then(function () { delete saving[k]; });
  }
  function msBtn(c, m, box, label, mini, noNote) {
    if (!loaded || !m || !m.nama) return;
    var b;
    if (m.status !== "Selesai") {
      b = el("button", "btn sm ok" + (mini ? " xs" : ""), mini ? "✓" : label || "✓ Selesai"); b.type = "button";
      b.title = "Tandai milestone selesai: " + m.nama; b.setAttribute("aria-label", "Tandai milestone selesai: " + m.nama + " (" + c.nama + ")");
      b.addEventListener("click", function () { setMsState(c, m, true); });
    } else if (m.viaAksi) {
      b = el("button", "btn sm ghost" + (mini ? " xs" : ""), mini ? "↺" : "Batalkan"); b.type = "button";
      b.title = "Batalkan milestone selesai: " + m.nama; b.setAttribute("aria-label", "Batalkan milestone selesai: " + m.nama + " (" + c.nama + ")");
      b.addEventListener("click", function () { setMsState(c, m, false); });
    }
    if (b) box.appendChild(b);
    if (!noNote) noteBtn(kMs(c, m), box, mini);
  }

  // --- catatan progres & tindak lanjut: ACT.catatan (terenkripsi di status.enc.json), disalin ke tracker oleh sinkron otomatis ---
  // kunci: "t:<idTugas>" · "cr:<idCR>" · "ms:<idCR>::<nama milestone>"
  var NJ = [["progres", "Progres"], ["tl", "Tindak lanjut"], ["kendala", "Kendala"], ["info", "Info"]], NJL = {};
  NJ.forEach(function (x) { NJL[x[0]] = x[1]; });
  var nDlg = null, nCtx = null, nDraft = {}, SVGNS = "http://www.w3.org/2000/svg";
  function kTask(id) { return "t:" + id; }
  function kCr(c) { return "cr:" + c.id; }
  function kMs(c, m) { return "ms:" + c.id + "::" + m.nama; }
  function icoNote() {
    var s = document.createElementNS(SVGNS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ico");
    var p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"); s.appendChild(p); return s;
  }
  function fmtDT(iso) {
    try { return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch (e) { return iso || ""; }
  }
  function clip(s, n) { s = (s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function infoFromKey(k) {
    var i, c;
    if (k.indexOf("t:") === 0) { var t = taskOf(k.slice(2)); return t ? { kind: "tugas", kl: "Tugas", title: t.title, sub: (CAT[t.cat] || "Tugas") + " · tenggat " + shortD(t.due) + (t.time ? " " + t.time : ""), task: t } : { kind: "lain", kl: "Tugas", title: k.slice(2), sub: "Tugas tidak ada lagi di data terbaru" }; }
    if (k.indexOf("cr:") === 0) { c = D.cr[k.slice(3)]; return c ? { kind: "cr", kl: "Change Request", title: c.nama, sub: [c.aplikasi, c.fase].filter(Boolean).join(" · "), crId: k.slice(3) } : { kind: "lain", kl: "CR", title: k.slice(3), sub: "" }; }
    if (k.indexOf("ms:") === 0) { i = k.indexOf("::"); c = D.cr[k.slice(3, i)]; return { kind: "milestone", kl: "Milestone CR", title: k.slice(i + 2), sub: c ? c.nama : k.slice(3, i), crId: k.slice(3, i) }; }
    return { kind: "lain", kl: "Catatan", title: k, sub: "" };
  }
  // catatan untuk satu kunci; untuk CR ikut menampilkan catatan milestone-nya
  function notesOf(k) {
    var all = ACT.catatan || {}, out = [];
    (all[k] || []).forEach(function (n) { out.push(Object.assign({ _k: k }, n)); });
    if (k.indexOf("cr:") === 0) {
      var pre = "ms:" + k.slice(3) + "::";
      Object.keys(all).forEach(function (kk) { if (kk.indexOf(pre) === 0) (all[kk] || []).forEach(function (n) { out.push(Object.assign({ _k: kk, src: kk.slice(pre.length) }, n)); }); });
    }
    return out.sort(function (a, b) { return ((b.at || "") + b.id).localeCompare((a.at || "") + a.id); });
  }
  function noteBtn(k, box, mini) {
    if (!loaded || !k) return;
    var n = notesOf(k).length, info = infoFromKey(k);
    var b = el("button", "btn sm ghost note-btn" + (mini ? " xs" : "") + (n ? " has" : "")); b.type = "button";
    b.appendChild(icoNote());
    if (!mini) b.appendChild(el("span", null, n ? "Catatan " + n : "Catatan")); else if (n) b.appendChild(el("span", "nn", String(n)));
    var al = (n ? "Lihat " + n + " catatan / tambah catatan: " : "Tambah catatan progres: ") + info.title;
    b.title = al; b.setAttribute("aria-label", al);
    b.addEventListener("click", function () { openNotes(k); });
    box.appendChild(b);
  }
  function lastNote(k, box) {
    var n = notesOf(k)[0]; if (!n) return;
    var p = el("p", "nlast"); p.appendChild(el("span", "nj nj-" + n.jenis, NJL[n.jenis] || "Catatan"));
    p.appendChild(el("span", "ntxt", (n.src ? n.src + ": " : "") + clip(n.teks, 140)));
    p.appendChild(el("time", "nt", fmtDT(n.at))); box.appendChild(p);
  }
  function noteItem(n, canDel) {
    var li = el("li", "nitem"), h = el("div", "nh");
    h.appendChild(el("span", "nj nj-" + n.jenis, NJL[n.jenis] || "Catatan"));
    if (n.src) h.appendChild(el("span", "nsrc", "Milestone " + n.src));
    if (n.progres != null) h.appendChild(el("span", "npg", "progres " + n.progres + "%"));
    if (n.sampai) { var late = n.jenis === "tl" && n.sampai < TODAY; h.appendChild(el("span", "nsd" + (late ? " late" : ""), (late ? "lewat target " : "target ") + shortD(n.sampai))); }
    h.appendChild(el("time", "nt", fmtDT(n.at)));
    li.appendChild(h); li.appendChild(el("p", "ntx", n.teks));
    if (canDel) {
      var d = el("button", "btn sm ghost xs ndel", "Hapus"); d.type = "button"; d.setAttribute("aria-label", "Hapus catatan " + fmtDT(n.at));
      d.addEventListener("click", function () { delNote(n._k, n); });
      li.appendChild(d);
    }
    return li;
  }
  function buildNoteDlg() {
    nDlg = el("dialog", "ndlg"); nDlg.setAttribute("aria-labelledby", "ndTitle");
    var f = el("form", "nd"); f.noValidate = true;
    var hd = el("div", "nd-h"), ht = el("div");
    var kl = el("div", "eyebrow"); kl.id = "ndKind"; ht.appendChild(kl);
    var h2 = el("h2"); h2.id = "ndTitle"; ht.appendChild(h2);
    var sb = el("p", "sub"); sb.id = "ndSub"; ht.appendChild(sb); hd.appendChild(ht);
    var x = el("button", "nd-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Tutup"); x.addEventListener("click", function () { nDlg.close(); }); hd.appendChild(x);
    f.appendChild(hd);
    var fs = el("fieldset", "nseg"); fs.appendChild(el("legend", null, "Jenis catatan"));
    NJ.forEach(function (j, i) { var lb = el("label"), r = el("input"); r.type = "radio"; r.name = "ndJenis"; r.value = j[0]; if (!i) r.checked = true; lb.appendChild(r); lb.appendChild(el("span", "nj-" + j[0], j[1])); fs.appendChild(lb); });
    f.appendChild(fs);
    var tl = el("label", "nd-l", "Isi catatan"); tl.htmlFor = "ndText"; f.appendChild(tl);
    var ta = el("textarea"); ta.id = "ndText"; ta.rows = 4; ta.maxLength = 1000; ta.required = true; ta.placeholder = "Apa yang sudah dikerjakan, hasilnya, kendala, dan langkah berikutnya"; f.appendChild(ta);
    var cnt = el("div", "nd-cnt"); cnt.id = "ndCnt"; f.appendChild(cnt);
    ta.addEventListener("input", function () { cnt.textContent = ta.value.length + "/1000"; if (nCtx) nDraft[nCtx.k] = ta.value; });
    var row = el("div", "nd-row");
    var pw = el("div", "nd-f"); pw.id = "ndProgWrap";
    var pl = el("label", "nd-l", "Progres tugas (%)"); pl.htmlFor = "ndProg"; pw.appendChild(pl);
    var pi = el("input"); pi.id = "ndProg"; pi.type = "number"; pi.min = "0"; pi.max = "100"; pi.step = "5"; pi.inputMode = "numeric"; pw.appendChild(pi);
    var ph = el("small", "sub"); ph.id = "ndProgHint"; pw.appendChild(ph); row.appendChild(pw);
    var dw = el("div", "nd-f"), dl = el("label", "nd-l", "Target tindak lanjut"); dl.htmlFor = "ndDue"; dw.appendChild(dl);
    var di = el("input"); di.id = "ndDue"; di.type = "date"; dw.appendChild(di); dw.appendChild(el("small", "sub", "opsional")); row.appendChild(dw);
    f.appendChild(row);
    var msg = el("p", "nd-msg"); msg.id = "ndMsg"; msg.setAttribute("role", "alert"); msg.hidden = true; f.appendChild(msg);
    var ac = el("div", "nd-act"), cb = el("button", "btn", "Batal"); cb.type = "button"; cb.addEventListener("click", function () { nDlg.close(); });
    var sv = el("button", "btn primary", "Simpan catatan"); sv.type = "submit"; ac.appendChild(cb); ac.appendChild(sv); f.appendChild(ac);
    var hh = el("div", "nd-hist"), h3 = el("h3"); h3.id = "ndHistH"; hh.appendChild(h3);
    var ul = el("ul", "nlist"); ul.id = "ndList"; hh.appendChild(ul); f.appendChild(hh);
    f.addEventListener("submit", function (e) { e.preventDefault(); submitNote(); });
    nDlg.addEventListener("click", function (e) { if (e.target === nDlg) nDlg.close(); });
    nDlg.appendChild(f); document.body.appendChild(nDlg);
  }
  function fillNoteHist() {
    if (!nDlg || !nCtx) return;
    var list = notesOf(nCtx.k), ul = $("#ndList"); clear(ul);
    $("#ndHistH").textContent = list.length ? "Riwayat catatan (" + list.length + ")" : "Belum ada catatan";
    list.forEach(function (n) { ul.appendChild(noteItem(n, true)); });
  }
  function openNotes(k) {
    if (!nDlg) buildNoteDlg();
    var info = infoFromKey(k); nCtx = { k: k, info: info };
    $("#ndKind").textContent = info.kl + (info.kind === "cr" ? " · termasuk catatan milestone" : "");
    $("#ndTitle").textContent = info.title; $("#ndSub").textContent = info.sub || "";
    var t = info.task, pw = $("#ndProgWrap"), pi = $("#ndProg");
    pw.hidden = !(t && t.status !== "done"); pi.value = "";
    if (t) { pi.placeholder = String(prog(t)); $("#ndProgHint").textContent = "sekarang " + prog(t) + "% · 100% = selesai"; }
    $("#ndDue").value = ""; $("#ndMsg").hidden = true;
    var ta = $("#ndText"); ta.value = nDraft[k] || ""; $("#ndCnt").textContent = ta.value.length + "/1000";
    nDlg.querySelector('input[name="ndJenis"][value="progres"]').checked = true;
    fillNoteHist();
    if (!nDlg.open) nDlg.showModal();
    ta.focus();
  }
  function ndErr(t) { var m = $("#ndMsg"); m.textContent = t; m.hidden = false; }
  function submitNote() {
    if (!nCtx) return;
    var teks = $("#ndText").value.trim(), jn = (nDlg.querySelector('input[name="ndJenis"]:checked') || {}).value || "progres";
    if (teks.length < 3) { ndErr("Tulis isi catatan minimal 3 karakter."); $("#ndText").focus(); return; }
    if (!TOKEN) { ndErr("Hubungkan GitHub dulu (menu Unggah eviden → Koneksi GitHub) agar catatan bisa disimpan."); return; }
    var info = nCtx.info, t = info.task, pv = $("#ndProg").value, due = $("#ndDue").value, pg = null;
    if (t && t.status !== "done" && pv !== "") {
      pg = Math.round(+pv);
      if (isNaN(pg) || pg < 0 || pg > 100) { ndErr("Progres harus angka 0–100."); $("#ndProg").focus(); return; }
    }
    var note = { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: nowIso(), jenis: jn, teks: teks, objek: info.kind, judul: info.title };
    if (pg != null) note.progres = pg;
    if (due) note.sampai = due;
    if (info.crId) note.cr = info.crId;
    var stVal = null;
    if (pg != null && pg > prog(t)) stVal = pg >= 100 ? { status: "done", at: note.at, doneAt: note.at, progress: 100 } : { status: "doing", at: note.at, doneAt: null, progress: pg };
    nDlg.close(); saveNote(nCtx.k, note, stVal, t);
  }
  function saveNote(k, note, stVal, t) {
    ACT.catatan = ACT.catatan || {};
    var prevList = (ACT.catatan[k] || []).slice(), tid = t && t.id, prevSt = tid ? ACT.status[tid] : null;
    ACT.catatan[k] = prevList.concat([note]); if (stVal) ACT.status[tid] = stVal;
    rebuild(); toast("Menyimpan catatan…", "");
    saveStatus(function (o) {
      o.catatan = o.catatan || {};
      o.catatan[k] = (o.catatan[k] || []).filter(function (x) { return x.id !== note.id; }).concat([note]);
      if (stVal) { var cur = o.status[tid]; if (!cur || (RANK[stVal.status] || 0) > (RANK[cur.status] || 0) || (stVal.status === cur.status && (+stVal.progress || 0) > (+cur.progress || 0))) o.status[tid] = stVal; }
      return o;
    }, 0).then(function () {
      delete nDraft[k];
      toast("✓ Catatan disimpan" + (stVal ? " · progres " + stVal.progress + "%" : "") + ".", "ok", { label: "Batalkan", fn: function () { delNote(k, note, true); } });
    }).catch(function (e) {
      ACT.catatan[k] = prevList; if (tid) { if (prevSt) ACT.status[tid] = prevSt; else delete ACT.status[tid]; }
      nDraft[k] = note.teks; rebuild();
      toast("! Catatan belum tersimpan: " + ghMsg(e), "bad", { label: "Buka lagi", fn: function () { openNotes(k); } });
    });
  }
  function delNote(k, n, quiet) {
    if (!TOKEN) { toast("Hubungkan GitHub dulu agar catatan bisa dihapus.", "bad"); return; }
    ACT.catatan = ACT.catatan || {};
    var prevList = (ACT.catatan[k] || []).slice(), clean = {};
    Object.keys(n).forEach(function (x) { if (x !== "_k" && x !== "src") clean[x] = n[x]; });
    ACT.catatan[k] = prevList.filter(function (x) { return x.id !== n.id; }); if (!ACT.catatan[k].length) delete ACT.catatan[k];
    rebuild(); fillNoteHist();
    saveStatus(function (o) { o.catatan = o.catatan || {}; o.catatan[k] = (o.catatan[k] || []).filter(function (x) { return x.id !== n.id; }); if (!o.catatan[k].length) delete o.catatan[k]; return o; }, 0).then(function () {
      fillNoteHist();
      toast(quiet ? "Catatan dibatalkan." : "Catatan dihapus.", "", quiet ? null : { label: "Kembalikan", fn: function () { saveNote(k, clean, null, null); } });
    }).catch(function (e) { ACT.catatan[k] = prevList; rebuild(); fillNoteHist(); toast("! Catatan belum terhapus: " + ghMsg(e), "bad"); });
  }
  // ringkasan: catatan terbaru dari semua menu
  function renderNotes() {
    var box = $("#noteFeed"); if (!box) return; clear(box);
    var all = ACT.catatan || {}, rows = [];
    Object.keys(all).forEach(function (k) { (all[k] || []).forEach(function (n) { rows.push(Object.assign({ _k: k }, n)); }); });
    rows.sort(function (a, b) { return ((b.at || "") + b.id).localeCompare((a.at || "") + a.id); });
    var lateTl = rows.filter(function (n) { return n.jenis === "tl" && n.sampai && n.sampai < TODAY; }).length;
    $("#noteFeedSub").textContent = rows.length ? rows.length + " catatan" + (lateTl ? " · " + lateTl + " tindak lanjut lewat target" : "") : "";
    if (!loaded) { var nl = el("div", "empty", "Memuat…"); nl.setAttribute("role", "listitem"); box.appendChild(nl); return; }
    if (!rows.length) { var ne = el("div", "empty"); ne.setAttribute("role", "listitem"); box.appendChild(ne); ne.textContent = ("Belum ada catatan. Tekan tombol Catatan di samping tombol ✓ Selesai pada tugas, milestone, atau CR untuk mencatat progres dan tindak lanjut."); return; }
    rows.slice(0, 8).forEach(function (n) {
      var info = infoFromKey(n._k), li = el("div", "nf-li"), b = el("button", "nf-i"); b.type = "button"; li.setAttribute("role", "listitem"); li.appendChild(b);
      b.appendChild(el("span", "nj nj-" + n.jenis, NJL[n.jenis] || "Catatan"));
      var m = el("span", "nf-m"); m.appendChild(el("b", null, info.title)); m.appendChild(el("span", "ntxt", clip(n.teks, 160)));
      var meta = [info.kl + (info.sub ? " · " + info.sub : "")];
      if (n.progres != null) meta.push("progres " + n.progres + "%");
      if (n.sampai) meta.push((n.jenis === "tl" && n.sampai < TODAY ? "lewat target " : "target ") + shortD(n.sampai));
      m.appendChild(el("small", "sub", meta.join(" · "))); b.appendChild(m);
      b.appendChild(el("time", "nt", fmtDT(n.at)));
      b.setAttribute("aria-label", (NJL[n.jenis] || "Catatan") + ": " + info.title + ". " + clip(n.teks, 160) + ". Buka catatan.");
      b.addEventListener("click", function () { openNotes(n._k); });
      box.appendChild(li);
    });
  }


  // --- agenda ditunda / dibatalkan: ACT.jadwal {idTugas: {aksi: "tunda"|"batal", ke?, alasan, at, judul}} (terenkripsi di status.enc.json) ---
  // MoM dan Rekap CoC satu tanggal = satu rapat, jadi penundaan/pembatalan berlaku untuk keduanya (bisa dimatikan di dialog).
  var jDlg = null, jCtx = null, ALASAN = ["Pimpinan berhalangan", "Bentrok agenda lain", "Libur / cuti bersama", "Bidang belum siap materi", "Rapat digabung"];
  function dateOfId(id) { var m = /(\d{4}-\d{2}-\d{2})$/.exec(id || ""); return m ? m[1] : null; }
  function keyOfId(id) { return (id || "").replace(/-\d{4}-\d{2}-\d{2}$/, ""); }
  function pairIds(id) { var d = dateOfId(id), k = keyOfId(id); return (k === "mom" || k === "rekap") && d ? ["mom-" + d, "rekap-" + d] : [id]; }
  function applyJadwal(d) {
    d.batal = {}; d.pindah = {};
    // dari tracker (sudah tersinkron): status "batal"
    Object.keys(d.tasks).forEach(function (id) {
      var t = d.tasks[id]; if (t.status !== "batal") return;
      d.batal[id] = Object.assign({}, t, { jadwal: { aksi: "batal", alasan: t.alasanBatal || "", at: t.batalAt || "", sumber: "tracker" } }); delete d.tasks[id];
    });
    var J = ACT.jadwal || {};
    Object.keys(J).forEach(function (id) {
      var j = J[id], t = d.tasks[id];
      if (!j || !t || t.status === "done") return;
      if (j.aksi === "batal") { d.batal[id] = Object.assign({}, t, { jadwal: j }); delete d.tasks[id]; }
      else if (j.aksi === "tunda" && j.ke) { t.ditundaDari = t.ditundaDari || t.due; t.due = j.ke; t.jadwal = j; }
    });
    Object.keys(d.tasks).forEach(function (id) {
      var t = d.tasks[id]; if (!t.ditundaDari || t.ditundaDari === t.due) return;
      t.jadwal = t.jadwal || { aksi: "tunda", ke: t.due, alasan: t.alasanTunda || "", sumber: "tracker" };
      var k = keyOfId(id) + "@" + t.due; (d.pindah[k] = d.pindah[k] || []).push(id);
    });
  }
  function jadwalOf(id) { return (D.batal && D.batal[id] && D.batal[id].jadwal) || (D.tasks[id] && D.tasks[id].jadwal) || null; }
  function jadwalTxt(j) { return !j ? "" : j.aksi === "batal" ? "Dibatalkan" + (j.alasan ? " · " + j.alasan : "") : "Ditunda ke " + shortD(j.ke) + (j.alasan ? " · " + j.alasan : ""); }
  function icoCal() {
    var s = document.createElementNS(SVGNS, "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "ico");
    var p = document.createElementNS(SVGNS, "path"); p.setAttribute("d", "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18M9 14l6 5M15 14l-6 5"); s.appendChild(p); return s;
  }
  function jadwalBtn(id, box, mini, label) {
    if (!loaded || !id) return;
    var t = D.tasks[id], bt = D.batal && D.batal[id], j = jadwalOf(id);
    if (!t && !bt) return;
    if (t && t.status === "done" && !j) return;
    var title = (t || bt).title, b = el("button", "btn sm ghost jd-btn" + (mini ? " xs" : "") + (j ? " has" : "")); b.type = "button";
    b.appendChild(icoCal()); if (!mini) b.appendChild(el("span", null, j ? "Ubah jadwal" : (label || "Tunda/Batal")));
    var al = (j ? jadwalTxt(j) + " — ubah atau kembalikan: " : "Tunda atau batalkan: ") + title + " (" + shortD(dateOfId(id) || (t || bt).due) + ")";
    b.title = al; b.setAttribute("aria-label", al);
    b.addEventListener("click", function () { openJadwal(id); }); box.appendChild(b);
  }
  function buildJadwalDlg() {
    jDlg = el("dialog", "ndlg jdlg"); jDlg.setAttribute("aria-labelledby", "jdTitle");
    var f = el("form", "nd"); f.noValidate = true;
    var hd = el("div", "nd-h"), ht = el("div"); ht.appendChild(el("div", "eyebrow", "Tunda atau batalkan agenda"));
    var h2 = el("h2"); h2.id = "jdTitle"; ht.appendChild(h2); var sb = el("p", "sub"); sb.id = "jdSub"; ht.appendChild(sb); hd.appendChild(ht);
    var x = el("button", "nd-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Tutup"); x.addEventListener("click", function () { jDlg.close(); }); hd.appendChild(x); f.appendChild(hd);
    var cur = el("div", "jd-cur"); cur.id = "jdCur"; cur.hidden = true; f.appendChild(cur);
    var fs = el("fieldset", "nseg"); fs.appendChild(el("legend", null, "Tindakan"));
    [["tunda", "Ditunda (jadwal ulang)"], ["batal", "Dibatalkan"]].forEach(function (a, i) { var lb = el("label"), r = el("input"); r.type = "radio"; r.name = "jdAksi"; r.value = a[0]; if (!i) r.checked = true; r.addEventListener("change", syncJd); lb.appendChild(r); lb.appendChild(el("span", "nj-" + (a[0] === "tunda" ? "tl" : "kendala"), a[1])); fs.appendChild(lb); });
    f.appendChild(fs);
    var dw = el("div", "nd-f"); dw.id = "jdKeWrap"; var dl = el("label", "nd-l", "Tanggal pengganti"); dl.htmlFor = "jdKe"; dw.appendChild(dl);
    var di = el("input"); di.id = "jdKe"; di.type = "date"; dw.appendChild(di); dw.appendChild(el("small", "sub", "tenggat MoM/rekap ikut pindah ke tanggal ini, pukul 16.00")); f.appendChild(dw);
    var al = el("label", "nd-l", "Alasan"); al.htmlFor = "jdAlasan"; f.appendChild(al);
    var chips = el("div", "jd-chips"); ALASAN.forEach(function (a) { var c = el("button", "jd-chip", a); c.type = "button"; c.addEventListener("click", function () { $("#jdAlasan").value = a; $("#jdAlasan").focus(); }); chips.appendChild(c); }); f.appendChild(chips);
    var ai = el("input"); ai.id = "jdAlasan"; ai.type = "text"; ai.maxLength = 200; ai.placeholder = "mis. pimpinan rapat direksi, digeser ke Kamis"; f.appendChild(ai);
    var pw = el("label", "jd-pair"); pw.id = "jdPairWrap"; var pc = el("input"); pc.type = "checkbox"; pc.id = "jdPair"; pc.checked = true; pw.appendChild(pc); var ps = el("span"); ps.id = "jdPairTxt"; pw.appendChild(ps); f.appendChild(pw);
    var msg = el("p", "nd-msg"); msg.id = "jdMsg"; msg.setAttribute("role", "alert"); msg.hidden = true; f.appendChild(msg);
    var ac = el("div", "nd-act"), rb = el("button", "btn jd-undo", "Kembalikan ke jadwal semula"); rb.type = "button"; rb.id = "jdUndo"; rb.hidden = true; rb.addEventListener("click", function () { saveJadwal(null); });
    var cb = el("button", "btn", "Batal"); cb.type = "button"; cb.addEventListener("click", function () { jDlg.close(); });
    var sv = el("button", "btn primary", "Simpan"); sv.type = "submit"; sv.id = "jdSave"; ac.appendChild(rb); ac.appendChild(cb); ac.appendChild(sv); f.appendChild(ac);
    f.addEventListener("submit", function (e) { e.preventDefault(); submitJadwal(); });
    jDlg.addEventListener("click", function (e) { if (e.target === jDlg) jDlg.close(); });
    jDlg.appendChild(f); document.body.appendChild(jDlg);
  }
  function syncJd() { var a = (jDlg.querySelector('input[name="jdAksi"]:checked') || {}).value; $("#jdKeWrap").hidden = a !== "tunda"; $("#jdSave").textContent = a === "batal" ? "Simpan pembatalan" : "Simpan penundaan"; }
  function openJadwal(id) {
    if (!jDlg) buildJadwalDlg();
    var t = D.tasks[id] || (D.batal && D.batal[id]), j = jadwalOf(id), d0 = dateOfId(id) || (t.ditundaDari || t.due);
    jCtx = { id: id, ids: pairIds(id) };
    $("#jdTitle").textContent = t.title; $("#jdSub").textContent = "Jadwal semula " + shortD(t.ditundaDari || d0) + (t.time ? " · tenggat " + t.time : "");
    var cur = $("#jdCur"); cur.hidden = !j; cur.textContent = j ? "Saat ini: " + jadwalTxt(j) + (j.sumber === "tracker" ? " (dari tracker)" : "") : "";
    $("#jdUndo").hidden = !j || j.sumber === "tracker";
    jDlg.querySelector('input[name="jdAksi"][value="' + (j && j.aksi === "batal" ? "batal" : "tunda") + '"]').checked = true;
    $("#jdKe").value = j && j.ke ? j.ke : ""; $("#jdKe").min = TODAY;
    $("#jdAlasan").value = j ? j.alasan || "" : "";
    var pair = jCtx.ids.length > 1; $("#jdPairWrap").hidden = !pair; $("#jdPair").checked = true;
    if (pair) $("#jdPairTxt").textContent = "Berlaku untuk MoM dan Rekap CoC " + shortD(d0) + " (satu rapat)";
    $("#jdMsg").hidden = true; syncJd();
    if (!jDlg.open) jDlg.showModal();
    $("#jdAlasan").focus();
  }
  function jdErr(t) { var m = $("#jdMsg"); m.textContent = t; m.hidden = false; }
  function submitJadwal() {
    var a = (jDlg.querySelector('input[name="jdAksi"]:checked') || {}).value, ke = $("#jdKe").value, al = $("#jdAlasan").value.trim();
    var t = D.tasks[jCtx.id] || D.batal[jCtx.id], asal = t.ditundaDari || dateOfId(jCtx.id) || t.due;
    if (a === "tunda" && !ke) { jdErr("Pilih tanggal pengganti."); $("#jdKe").focus(); return; }
    if (a === "tunda" && ke === asal) { jdErr("Tanggal pengganti sama dengan jadwal semula."); $("#jdKe").focus(); return; }
    if (a === "tunda" && ke < TODAY) { jdErr("Tanggal pengganti tidak boleh sebelum hari ini."); $("#jdKe").focus(); return; }
    if (al.length < 3) { jdErr("Tulis alasan singkat (minimal 3 karakter) agar tercatat di tracker."); $("#jdAlasan").focus(); return; }
    saveJadwal({ aksi: a, ke: a === "tunda" ? ke : undefined, alasan: al });
  }
  function saveJadwal(val) {
    if (!TOKEN) { jdErr("Hubungkan GitHub dulu (menu Unggah eviden → Koneksi GitHub) agar perubahan jadwal bisa disimpan."); return; }
    var ids = $("#jdPair").checked ? jCtx.ids : [jCtx.id], at = nowIso(), prev = {};
    ids = ids.filter(function (id) { return D.tasks[id] || (D.batal && D.batal[id]); });
    ACT.jadwal = ACT.jadwal || {};
    var notes = ids.map(function (id) {
      var t = D.tasks[id] || D.batal[id];
      return { id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: at, jenis: "info", objek: "tugas", judul: t.title,
        teks: val ? (val.aksi === "batal" ? "Agenda dibatalkan. Alasan: " + val.alasan : "Agenda ditunda dari " + shortD(t.ditundaDari || t.due) + " ke " + shortD(val.ke) + ". Alasan: " + val.alasan) : "Penundaan/pembatalan dicabut; kembali ke jadwal semula." };
    });
    ids.forEach(function (id) { prev[id] = ACT.jadwal[id]; if (val) ACT.jadwal[id] = Object.assign({ at: at, judul: (D.tasks[id] || D.batal[id]).title }, val); else delete ACT.jadwal[id]; });
    jDlg.close(); rebuild(); toast("Menyimpan jadwal…", "");
    saveStatus(function (o) {
      o.jadwal = o.jadwal || {}; o.catatan = o.catatan || {};
      ids.forEach(function (id, i) { if (val) o.jadwal[id] = ACT.jadwal[id]; else delete o.jadwal[id]; var k = kTask(id); o.catatan[k] = (o.catatan[k] || []).concat([notes[i]]); });
      return o;
    }, 0).then(function () {
      toast(val ? (val.aksi === "batal" ? "Agenda dibatalkan dan tidak dihitung terlambat." : "Agenda ditunda ke " + shortD(val.ke) + ".") : "Jadwal dikembalikan.", "ok", val ? { label: "Batalkan", fn: function () { jCtx = { id: ids[0], ids: ids }; if (!jDlg) buildJadwalDlg(); $("#jdPair").checked = true; saveJadwal(null); } } : null);
    }).catch(function (e) {
      ids.forEach(function (id) { if (prev[id]) ACT.jadwal[id] = prev[id]; else delete ACT.jadwal[id]; });
      rebuild(); toast("! Jadwal belum tersimpan: " + ghMsg(e), "bad");
    });
  }

  // --- perbarui data dashboard (tracker.enc.json) dari file yang dikirim Claude ---
  function doUpdateData() {
    var f = $("#dataFile").files[0], m = $("#dataMsg");
    m.hidden = false; m.className = "up-msg";
    if (!f) { m.className = "up-msg bad"; m.textContent = "Pilih file tracker.enc.json dari Claude."; return; }
    if (!TOKEN) { m.className = "up-msg bad"; m.textContent = "Hubungkan GitHub dulu."; return; }
    m.textContent = "Memeriksa file…";
    f.text().then(function (txt) { var e = JSON.parse(txt); return decrypt(sandi, e).then(function (x) { if (!valid(x)) throw new Error("format"); return { e: e, x: x, txt: txt }; }); })
      .then(function (o) { m.textContent = "Mengunggah ke GitHub…"; return ghGet(DATA_URL).then(function (j) { return ghPut(DATA_URL, b64(te.encode(o.txt.endsWith("\n") ? o.txt : o.txt + "\n")), "Perbarui data dashboard terenkripsi", j && j.sha); }).then(function () { return o; }); })
      .then(function (o) { env = o.e; BASE = o.x; rebuild(); m.className = "up-msg ok"; m.textContent = "✓ Data dashboard diperbarui (diekspor " + (o.x.meta.diekspor || "?") + ")."; $("#dataFile").value = ""; })
      .catch(function (e) { m.className = "up-msg bad"; m.textContent = e && e.status ? "! " + ghMsg(e) : "! File bukan data dashboard ini, atau kata sandinya berbeda."; });
  }

  // --- tampilan koneksi GitHub ---
  function renderGh() {
    var st = $("#ghState"); clear(st);
    var on = !!TOKEN;
    st.appendChild(el("span", "fchip " + (on ? "ok" : "warn"), on ? "✓ Terhubung" + (ghInfo ? " ke " + ghInfo.full : "") : "▲ Belum terhubung"));
    $("#ghForm").hidden = on; $("#ghOff").hidden = !on; $("#dataBox").hidden = !on;
    $("#upLocked").hidden = on; $("#upBtn").disabled = !on || uploading;
  }
  function syncUpHint() {
    var jenis = $("#upJenis").value, tanggal = $("#upTanggal").value, id = taskIdFor(jenis, tanggal), t = id && D.tasks && D.tasks[id];
    var h = $("#upHint"), r = ROUTINE.filter(function (x) { return x.key === jenis; })[0];
    var wd = tanggal ? (P(tanggal).getUTCDay() + 6) % 7 : -1, hari = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"];
    var alt = id && D.tasks ? evTask({ tugas: id, tanggal: tanggal }) : null, at2 = alt && alt !== id ? D.tasks[alt] : null, bt2 = id && D.batal && D.batal[id];
    if (at2 && (!t || t.status === "done")) h.textContent = "Tugas terkait: “" + at2.title + "” — rapat pengganti dari " + shortD(at2.ditundaDari) + " (akan ditandai selesai).";
    else if (t && t.due !== tanggal) h.textContent = "Agenda " + shortD(tanggal) + " ditunda ke " + shortD(t.due) + ". Eviden tetap ditautkan ke rapat ini (" + (t.status === "done" ? "sudah selesai" : "akan ditandai selesai") + ").";
    else if (bt2 && !t) h.textContent = "Agenda " + shortD(tanggal) + " tercatat dibatalkan" + (bt2.jadwal.alasan ? " (" + bt2.jadwal.alasan + ")" : "") + ". Eviden tetap tersimpan; kembalikan jadwalnya bila rapat ternyata berlangsung.";
    else if (t) h.textContent = "Tugas terkait: “" + t.title + "” " + shortD(tanggal) + " (" + (t.status === "done" ? "sudah selesai" : "akan ditandai selesai") + ").";
    else if (r && tanggal && r.days.indexOf(wd) < 0) h.textContent = jenisOf(jenis).label + " dijadwalkan " + (r.days.length > 1 ? hari[r.days[0]] + "–" + hari[r.days[r.days.length - 1]] : hari[r.days[0]]) + ". Periksa tanggalnya; eviden tetap tersimpan dan ditautkan ke tugas " + id + " bila tugas itu ada di tracker.";
    else if (id) h.textContent = "Akan ditautkan ke tugas " + jenisOf(jenis).label + " " + (tanggal ? shortD(tanggal) : "") + " (id " + id + ") begitu tugas itu ada di tracker; eviden tetap tersimpan.";
    else h.textContent = "Eviden disimpan tanpa tugas terkait.";
    $("#upKetL").textContent = jenis === "mom" || jenis === "rekap" ? "Bidang" : jenis === "cr" ? "Nama CR / dokumen" : "Keterangan";
  }

  function renderEvidenView() {
    var box = $("#evList"); if (!box) return; clear(box);
    renderGh();
    var list = D.evidenList || [];
    var dups = evDups(list);
    $("#evCount").textContent = list.length + " eviden" + (dups.length ? " · " + dups.length + " duplikat" : "");
    var tidy = $("#evTidy"); if (tidy) { tidy.hidden = !(dups.length && TOKEN); tidy.textContent = "Rapikan duplikat (" + dups.length + ")"; }
    if (!list.length) { var tr0 = el("tr"), td0 = el("td", "empty", loaded ? "Belum ada eviden yang diunggah dari dashboard." : "Memuat…"); td0.colSpan = 6; tr0.appendChild(td0); box.appendChild(tr0); return; }
    list.forEach(function (x) {
      var tr = el("tr");
      tr.appendChild(el("td", "m", shortD(x.tanggal)));
      var j = el("td"); j.appendChild(el("span", "pill " + (x.jenis === "kpi4b" ? "kpi" : x.jenis === "cresppd" || x.jenis === "crlayanan" || x.jenis === "cr" ? "cr" : x.jenis === "mom" ? "mom" : x.jenis === "rekap" ? "rekap" : "lain"), jenisOf(x.jenis).label)); tr.appendChild(j);
      tr.appendChild(el("td", null, x.ket || "–"));
      var fn = el("td"), fnm = el("div", "fname", x.nama); if (dups.indexOf(x.id) >= 0) { fnm.appendChild(document.createTextNode(" ")); fnm.appendChild(el("span", "pill moved", "duplikat")); } fn.appendChild(fnm); fn.appendChild(el("span", "sub", kbStr(x.ukuran || 0) + " · diunggah " + new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(x.diunggah)))); tr.appendChild(fn);
      var tk = el("td"), t = D.tasks[evTask(x)];
      tk.appendChild(t ? el("span", "chip s-done", "Tugas selesai") : el("span", "sub", "–")); tr.appendChild(tk);
      var ac = el("td", "act"), b1 = el("button", "btn", "Buka"), b2 = el("button", "btn", "Unduh");
      b1.type = b2.type = "button"; b1.addEventListener("click", function () { openEviden(x, false); }); b2.addEventListener("click", function () { openEviden(x, true); });
      ac.appendChild(b1); ac.appendChild(b2);
      if (TOKEN) { var b3 = el("button", "del", "Hapus"); b3.type = "button"; b3.setAttribute("aria-label", "Hapus eviden " + x.nama + " (" + shortD(x.tanggal) + ")"); b3.addEventListener("click", function () { armDel(b3, function () { removeEviden([x], "Hapus eviden " + x.nama); }); }); ac.appendChild(b3); }
      tr.appendChild(ac);
      box.appendChild(tr);
    });
  }

  // eviden ganda: jenis + tanggal + nama + ukuran sama → yang diunggah lebih awal dipertahankan
  function evDups(list) {
    var seen = {}, out = [];
    list.slice().sort(function (a, b) { return (a.diunggah || "").localeCompare(b.diunggah || ""); }).forEach(function (x) {
      var k = [x.jenis, x.tanggal, x.nama, x.ukuran].join("|"); if (seen[k]) out.push(x.id); else seen[k] = 1;
    });
    return out;
  }
  // tombol hapus dua langkah: klik pertama "Yakin?", klik kedua dalam 5 detik menjalankan
  function armDel(b, fn) {
    if (b.classList.contains("arm")) { b.classList.remove("arm"); clearTimeout(b._t); b.disabled = true; fn(); return; }
    b._lbl = b._lbl || b.textContent; b.classList.add("arm"); b.textContent = "Yakin hapus?";
    b._t = setTimeout(function () { b.classList.remove("arm"); b.textContent = b._lbl; }, 5000);
  }
  function removeEviden(items, msg) {
    if (!TOKEN) { toast("Hubungkan GitHub dulu agar eviden bisa dihapus.", "bad"); return; }
    var ids = items.map(function (x) { return x.id; }), m = $("#evListMsg");
    m.hidden = false; m.className = "up-msg"; m.textContent = "Menghapus " + ids.length + " eviden…";
    saveIndex(function (o) { o.eviden = o.eviden.filter(function (x) { return ids.indexOf(x.id) < 0; }); return o; }, 0)
      .then(function () { return items.reduce(function (p, x) { return p.then(function () { return x.path ? ghDelete(x.path, msg + " (" + x.id + ")").catch(function () { }) : null; }); }, Promise.resolve()); })
      .then(function () { m.className = "up-msg ok"; m.textContent = "✓ " + ids.length + " eviden dihapus dari arsip. Salinan yang sudah masuk tracker tidak ikut terhapus."; toast("✓ " + ids.length + " eviden dihapus.", "ok"); })
      .catch(function (e) { m.className = "up-msg bad"; m.textContent = "! Eviden belum terhapus: " + ghMsg(e); renderEvidenView(); });
  }

  // --- Google Calendar ---
  var KJ = { rapat: "Rapat", tenggat: "Tenggat", milestone: "Milestone CR", rutin: "Rutin", kpi: "KPI", lain: "Acara" };
  function kalList() { return ((D.kalender || {}).acara || []).slice().sort(function (a, b) { return a.mulai.localeCompare(b.mulai); }); }
  function evDate(a) { return a.mulai.slice(0, 10); }
  function evTime(a) { return a.sepanjangHari ? "Sepanjang hari" : a.mulai.slice(11, 16) + (a.selesai ? "–" + a.selesai.slice(11, 16) : ""); }
  function relatedTask(a) {
    var d = evDate(a), s = (a.judul || "").toLowerCase(), id = null;
    if (/evaluasi mom/.test(s)) id = "mom-" + d;
    else if (/esppd/.test(s) && (a.jenis === "rapat" || a.jenis === "tenggat")) id = "cresppd-" + d;
    else if (/layanan ga/.test(s) && (a.jenis === "rapat" || a.jenis === "tenggat")) id = "crlayanan-" + d;
    else if (/kpi 4b/.test(s)) id = "kpi4b-" + d.slice(0, 7);
    return id && D.tasks[id] ? Object.assign({ id: id }, D.tasks[id]) : null;
  }
  function gcalLink(t) {
    var d = t.due.replace(/-/g, ""), hm = (t.time || "").replace(":", "");
    var dates = hm ? d + "T" + String(Math.max(0, +hm.slice(0, 2) - 1)).padStart(2, "0") + hm.slice(2) + "00/" + d + "T" + hm + "00" : d + "/" + addD(t.due, 1).replace(/-/g, "");
    var q = new URLSearchParams({ action: "TEMPLATE", text: t.title, dates: dates, ctz: "Asia/Jakarta", details: "Dari Dashboard Pribadi: " + location.origin + location.pathname + "#tugas" });
    return "https://calendar.google.com/calendar/render?" + q.toString();
  }
  function onCalendar(t) {
    if (t.routine) return true;
    var s = t.title.toLowerCase();
    return kalList().some(function (a) { return evDate(a) === t.due && (a.judul || "").toLowerCase().split(/\W+/).filter(function (w) { return w.length > 4; }).some(function (w) { return s.indexOf(w) >= 0; }); });
  }
  var kalMode = (function () { try { return window.localStorage.getItem("dse-pribadi:kal") === "list" ? "list" : "week"; } catch (e) { return "week"; } })();
  var kalWeek = monday(TODAY);
  function evState(a) {
    var t = relatedTask(a); if (!t) return null;
    if (t.status === "done") return { c: "s-done", t: t.viaEviden ? "Eviden masuk" : "Selesai" };
    if (t.due < TODAY) return { c: "s-late", t: "Terlambat" };
    if (evDate(a) === TODAY || t.due === TODAY) return { c: "s-due", t: "Belum" };
    return null; // terjadwal: tanpa chip
  }
  function evSort(a, b) { return (b.sepanjangHari ? 1 : 0) - (a.sepanjangHari ? 1 : 0) || a.mulai.localeCompare(b.mulai); }
  var GENERIK = ["esppd", "multitrip", "transport", "aplikasi", "tahap", "layanan"];
  function relatedMs(a) {
    if (a.jenis !== "milestone") return [];
    var d = evDate(a), s = (a.judul || "").toLowerCase(), out = [];
    crList().forEach(function (c) {
      var cw = (c.nama || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4 && GENERIK.indexOf(w) < 0; });
      if (!cw.some(function (w) { return s.indexOf(w) >= 0; })) return;
      (c.milestones || []).forEach(function (m) {
        if (m.tanggal !== d) return;
        var mw = (m.nama || "").toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && GENERIK.indexOf(w) < 0; });
        if (mw.length && mw.every(function (w) { return s.indexOf(w) >= 0; })) out.push({ c: c, m: m, w: cw[0] });
      });
    });
    return out;
  }
  function evBlock(a, mini) {
    var st = evState(a), t = relatedTask(a), rms = relatedMs(a);
    var acts = el("span", "ks");
    if (st) acts.appendChild(el("span", "chip " + st.c, st.t));
    if (t && a.jenis !== "rapat") taskBtn(t, acts, null, mini);
    rms.forEach(function (x) { msBtn(x.c, x.m, acts, rms.length > 1 ? "✓ " + x.w.charAt(0).toUpperCase() + x.w.slice(1) : null, mini && rms.length === 1); });
    var hasBtn = !!acts.querySelector("button");
    var r = el(a.link && !hasBtn ? "a" : "div", "kev k-" + (a.jenis || "lain") + (st && st.c === "s-done" ? " is-done" : ""));
    if (a.link && !hasBtn) { r.href = a.link; r.target = "_blank"; r.rel = "noopener noreferrer"; r.setAttribute("aria-label", a.judul + ", " + evTime(a) + (st ? ", " + st.t : "") + " — buka di Google Calendar"); }
    r.appendChild(el("span", "kt", evTime(a)));
    var mid = el("span", "km"), ttl = el(a.link && hasBtn ? "a" : "b", a.link && hasBtn ? "kttl" : null, a.judul);
    if (a.link && hasBtn) { ttl.href = a.link; ttl.target = "_blank"; ttl.rel = "noopener noreferrer"; ttl.setAttribute("aria-label", a.judul + " — buka di Google Calendar"); }
    mid.appendChild(ttl); mid.appendChild(el("span", "sub", KJ[a.jenis] || "Acara")); r.appendChild(mid);
    if (acts.childNodes.length) r.appendChild(acts);
    return r;
  }
  function renderKalender() {
    var box = $("#kalList"); if (!box) return; clear(box);
    var K = D.kalender || null, src = $("#kalSrc");
    if (!K) { src.textContent = "Data kalender belum ada. Minta Claude “perbarui dashboard pribadi” untuk menarik agenda Google Calendar"; }
    else src.textContent = "Google Calendar " + (K.kalender || "utama") + " · diambil " + new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(K.diambil)) + " WIB · " + (K.acara || []).length + " acara";
    $("#kWeekLbl").textContent = fmt(kalWeek, { day: "numeric", month: "short" }) + " – " + fmt(addD(kalWeek, 6), { day: "numeric", month: "short", year: "numeric" });
    document.querySelectorAll("[data-km]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.km === kalMode)); });
    box.className = "kal-" + kalMode;
    var wEnd = addD(kalWeek, 6), evs = kalList().filter(function (a) { var d = evDate(a); return d >= kalWeek && d <= wEnd; });
    if (!evs.length) { box.appendChild(el("div", "empty", K ? "Tidak ada acara di minggu ini (data kalender mencakup " + fmt(evDate(kalList()[0] || { mulai: TODAY }), { day: "numeric", month: "short" }) + " – " + fmt(evDate(kalList().slice(-1)[0] || { mulai: TODAY }), { day: "numeric", month: "short" }) + ")." : "Belum ada data kalender.")); }
    else if (kalMode === "week") {
      var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return addD(kalWeek, i); }).filter(function (d, i) { return i < 5 || evs.some(function (a) { return evDate(a) === d; }); });
      var grid = el("div", "kweek"); grid.style.setProperty("--n", days.length);
      days.forEach(function (d) {
        var col = el("div", "kcol" + (d === TODAY ? " is-today" : "") + (d < TODAY ? " is-past" : "")), h = el("div", "kcol-h");
        h.appendChild(el("b", null, fmt(d, { weekday: "long" }))); h.appendChild(el("span", null, fmt(d, { day: "numeric", month: "short" })));
        if (d === TODAY) h.appendChild(el("span", "fchip ok", "Hari ini"));
        col.appendChild(h);
        var list = evs.filter(function (a) { return evDate(a) === d; }).sort(evSort);
        if (!list.length) col.appendChild(el("div", "kempty", "Tidak ada acara"));
        list.forEach(function (a) { col.appendChild(evBlock(a, true)); });
        grid.appendChild(col);
      });
      box.appendChild(grid);
    } else {
      // rutin berulang diringkas jadi satu baris per minggu
      var rut = {}, other = [];
      evs.forEach(function (a) { if (a.jenis === "rutin" && a.berulang) { var k = a.judul + "|" + evTime(a); (rut[k] = rut[k] || []).push(a); } else other.push(a); });
      var keys = Object.keys(rut);
      if (keys.length) {
        var g = el("div", "kday"); g.appendChild(el("div", "kday-h", null)).appendChild(el("b", null, "Rutin minggu ini"));
        keys.forEach(function (k) {
          var occ = rut[k].sort(evSort), a0 = occ[0], r = el(a0.link ? "a" : "div", "kev k-rutin");
          if (a0.link) { r.href = a0.link; r.target = "_blank"; r.rel = "noopener noreferrer"; }
          r.appendChild(el("span", "kt", evTime(a0)));
          var mid = el("span", "km"); mid.appendChild(el("b", null, a0.judul));
          var ds = el("span", "rdays");
          occ.forEach(function (a) { var st = evState(a), d = evDate(a), sp = el("span", "rd " + (st ? st.c : "s-plan"), fmt(d, { weekday: "short" }) + (st ? (st.c === "s-done" ? " ✓" : st.c === "s-late" ? " !" : " ○") : "")); sp.setAttribute("aria-label", fmt(d, { weekday: "long", day: "numeric", month: "short" }) + ": " + (st ? st.t : "terjadwal")); ds.appendChild(sp); });
          mid.appendChild(ds); r.appendChild(mid); g.appendChild(r);
        });
        box.appendChild(g);
      }
      var byDay = {}; other.forEach(function (a) { (byDay[evDate(a)] = byDay[evDate(a)] || []).push(a); });
      Object.keys(byDay).sort().forEach(function (d) {
        var g = el("div", "kday" + (d === TODAY ? " is-today" : "")), h = el("div", "kday-h");
        h.appendChild(el("b", null, fmt(d, { weekday: "long", day: "numeric", month: "long" }))); if (d === TODAY) h.appendChild(el("span", "fchip ok", "Hari ini"));
        g.appendChild(h); byDay[d].sort(evSort).forEach(function (a) { g.appendChild(evBlock(a)); }); box.appendChild(g);
      });
    }
    // tugas yang belum ada di kalender
    var miss = $("#kalMiss"); clear(miss);
    var todo = allTasks().filter(function (t) { return t.status !== "done" && t.due >= TODAY && t.due <= addD(TODAY, 30) && !onCalendar(t); }).sort(function (a, b) { return a.due.localeCompare(b.due) || (b.prio === "tinggi") - (a.prio === "tinggi"); });
    $("#kalMissN").textContent = todo.length ? todo.length + " tugas" : "";
    if (!todo.length) miss.appendChild(el("div", "empty", "Semua tugas 30 hari ke depan sudah ada di kalender atau selesai."));
    todo.forEach(function (t) {
      var r = el("div", "mrow"); r.appendChild(el("span", "kt", shortD(t.due) + (t.time ? " · " + t.time : "")));
      var mid = el("div", "km"); mid.appendChild(el("b", null, t.title)); mid.appendChild(el("span", "sub", (CAT[t.cat] || "Tugas") + (t.prio === "tinggi" ? " · prioritas tinggi" : ""))); r.appendChild(mid);
      var l = el("a", "gcal", "+ Kalender"); l.href = gcalLink(t); l.target = "_blank"; l.rel = "noopener noreferrer"; l.setAttribute("aria-label", "Tambah ke Google Calendar: " + t.title);
      var ms2 = el("div", "tside2"); ms2.appendChild(l); actBtns(t, ms2, true); r.appendChild(ms2); miss.appendChild(r);
    });
  }

  document.querySelectorAll(".kbox2, .matrix-box").forEach(function (b) { b.tabIndex = 0; b.setAttribute("role", "region"); var c = b.querySelector("th"); b.setAttribute("aria-label", "Tabel (gulir ke samping) · " + ((b.closest(".card") || {}).querySelector ? ((b.closest(".card").querySelector("h2") || {}).textContent || "") : "")); });
  // --- event handler ---
  $("#upForm").addEventListener("submit", doUpload);
  $("#upJenis").addEventListener("change", syncUpHint); $("#upTanggal").addEventListener("change", syncUpHint);
  // jenis bawaan Jumat = MoM Weekly CR Aplikasi Layanan GA (Sen–Kam tetap MoM CoC; MoM Weekly CR ESPPD Kamis dipilih dari daftar)
  function upDefaultJenis() { var wd = (P(TODAY).getUTCDay() + 6) % 7; if (wd === 4) $("#upJenis").value = "crlayanan"; }
  $("#upTanggal").value = TODAY;
  (function () { var s = $("#upJenis"); JENIS.forEach(function (j) { var o = el("option", null, j.label); o.value = j.k; s.appendChild(o); }); })();
  upDefaultJenis();
  $("#upFile").addEventListener("change", function () { var f = $("#upFile").files[0]; if (f && f.size > MAX_MB * 1048576) setUpMsg("bad", "File " + kbStr(f.size) + " melebihi batas " + MAX_MB + " MB."); else setUpMsg("", ""); });
  $("#ghForm").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var tok = $("#ghTok").value.trim(), m = $("#ghMsg"); m.hidden = false; m.className = "up-msg";
    if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tok)) { m.className = "up-msg bad"; m.textContent = "Format token tidak dikenali. Token GitHub diawali github_pat_."; return; }
    m.textContent = "Menguji token…";
    tokenTest(tok).then(function () { return tokenSave(tok); }).then(function () { $("#ghTok").value = ""; m.className = "up-msg ok"; m.textContent = "✓ Terhubung. Token disimpan terenkripsi dengan kata sandi dashboard di perangkat ini."; renderEvidenView(); evLoad(); })
      .catch(function (e) { m.className = "up-msg bad"; m.textContent = "! " + ghMsg(e); });
  });
  $("#ghForget").addEventListener("click", function () { tokenForget(); var m = $("#ghMsg"); m.hidden = false; m.className = "up-msg"; m.textContent = "Token dihapus dari perangkat ini. Cabut juga di GitHub jika tidak dipakai lagi."; renderEvidenView(); });
  $("#dataBtn").addEventListener("click", doUpdateData);
  document.querySelectorAll("[data-km]").forEach(function (b) { b.addEventListener("click", function () { kalMode = b.dataset.km; try { window.localStorage.setItem("dse-pribadi:kal", kalMode); } catch (e) { } renderKalender(); }); });
  $("#kPrev").addEventListener("click", function () { kalWeek = addD(kalWeek, -7); renderKalender(); });
  $("#kNext").addEventListener("click", function () { kalWeek = addD(kalWeek, 7); renderKalender(); });
  $("#kThis").addEventListener("click", function () { kalWeek = monday(TODAY); renderKalender(); });
  $("#navMore").addEventListener("click", function () { var n = $(".nav"), o = !n.classList.contains("more"); n.classList.toggle("more", o); this.setAttribute("aria-expanded", String(o)); });
  document.querySelectorAll(".nav a").forEach(function (a) { a.addEventListener("click", function () { $(".nav").classList.remove("more"); $("#navMore").setAttribute("aria-expanded", "false"); }); });
  $("#evRefresh").addEventListener("click", function () { evLoad(); actLoad(); });
  if ($("#evTidy")) $("#evTidy").addEventListener("click", function () { var b = this, ids = evDups(D.evidenList || []); if (!ids.length) return; armDel(b, function () { removeEviden((D.evidenList || []).filter(function (x) { return ids.indexOf(x.id) >= 0; }), "Rapikan eviden ganda"); setTimeout(function () { b.disabled = false; }, 1500); }); });

  function load() {
    return fetch(DATA_URL, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      lastTag = r.headers.get("ETag") || r.headers.get("Last-Modified");
      return r.json();
    }).then(function (e) {
      env = e;
      var pw = sandi || rememberGet();
      if (!pw) { lock(); return; }
      return decrypt(pw, e).then(function (x) { sandi = pw; unlocked(x); }).catch(function () { rememberSet(null); lock("Kata sandi tersimpan tidak cocok dengan data terbaru. Masukkan kata sandi."); });
    }).catch(function () {
      loaded = true; renderAll();
      setFresh("bad", "! Data gagal dimuat");
      var b = $("#banner"); b.hidden = false; b.className = "banner bad"; b.textContent = "data/tracker.enc.json tidak bisa dibaca. Periksa file di repositori.";
      document.body.classList.remove("locked"); $("#lock").hidden = true;
    });
  }
  function poll() {
    if (document.hidden || !env) return;
    fetch(DATA_URL, { method: "HEAD", cache: "no-cache" }).then(function (r) {
      var tag = r.headers.get("ETag") || r.headers.get("Last-Modified");
      if (tag && tag !== lastTag) load(); else if (loaded) freshness();
    }).catch(function () { /* coba lagi pada putaran berikutnya */ });
    if (loaded) fetch(EVIDEN_PATH, { method: "HEAD", cache: "no-cache" }).then(function (r) { var tag = r.headers.get("ETag") || r.headers.get("Last-Modified"); if (r.ok && tag && tag !== evTag) evLoad(); }).catch(function () { });
    if (loaded) fetch(STATUS_PATH, { method: "HEAD", cache: "no-cache" }).then(function (r) { var tag = r.headers.get("ETag") || r.headers.get("Last-Modified"); if (r.ok && tag && tag !== actTag) actLoad(); }).catch(function () { });
  }

  // ---- interaksi ----
  $("#prevW").addEventListener("click", function () { weekStart = addD(weekStart, -7); renderMatrix(); renderEvidence(); });
  $("#nextW").addEventListener("click", function () { weekStart = addD(weekStart, 7); renderMatrix(); renderEvidence(); });
  $("#thisW").addEventListener("click", function () { weekStart = monday(TODAY); renderMatrix(); renderEvidence(); });
  $("#prevW2").addEventListener("click", function () { weekStart = addD(weekStart, -7); renderMatrix(); renderEvidence(); });
  $("#nextW2").addEventListener("click", function () { weekStart = addD(weekStart, 7); renderMatrix(); renderEvidence(); });
  window.addEventListener("hashchange", route);
  document.querySelectorAll("#taskTabs .tab").forEach(function (b) { b.addEventListener("click", function () { filter = b.dataset.f; renderList(); }); });

  $("#todayLbl").textContent = fmt(TODAY, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  route();
  renderAll();
  load();
  // setiap menit: ganti hari (bangun ulang tugas rutin), cek perubahan data dari perangkat lain, dan
  // tiap 5 menit segarkan status yang bergantung jam (terlambat setelah 16.00) bila pengguna tidak sedang mengetik/membuka dialog
  var tick = 0;
  function idle() { var a = document.activeElement; return !document.querySelector("dialog[open]") && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
  function heartbeat() {
    var t = todayStr();
    if (t !== TODAY) { TODAY = t; weekStart = monday(t); kalWeek = monday(t); $("#todayLbl").textContent = fmt(TODAY, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); if (BASE) rebuild(); else renderAll(); }
    else if (++tick % 5 === 0 && loaded && BASE && idle()) rebuild();
    poll();
  }
  setInterval(heartbeat, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) heartbeat(); });
})();
