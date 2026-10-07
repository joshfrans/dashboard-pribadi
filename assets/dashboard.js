/* Dashboard Pribadi Strategi & Evaluasi — GitHub Pages, data terenkripsi (AES-256-GCM) (view: ringkasan, rutin, CR, CoC, KPI 4b, tugas).
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

  function isLate(t) { return t.status !== "done" && t.due < TODAY; }
  function prog(t) { return t.status === "done" ? 100 : (+t.progress || 0); }
  function inWeek(t, ws) { return t.due >= ws && t.due <= addD(ws, 6); }
  function allTasks() { return Object.keys(D.tasks).map(function (id) { return Object.assign({ id: id }, D.tasks[id]); }); }

  // ---- ringkasan (view eksekutif) ----
  var SEV = { "Terlambat": 0, "Berisiko": 1, "Perlu konfirmasi": 2, "Perlu update": 3, "Tertahan": 4, "Sesuai jadwal": 5, "Selesai": 6 };
  function paintSt(node, s) { node.style.setProperty("--c", "var(" + s.v + ")"); node.style.setProperty("--ci", "var(" + s.i + ")"); node.dataset.k = s.k; }
  var stMark = paintSt;
  function weekPct(all, ws) { var w = all.filter(function (t) { return inWeek(t, ws); }); return w.length ? Math.round(w.reduce(function (a, t) { return a + prog(t); }, 0) / w.length) : null; }
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
    when.appendChild(el("b", null, late ? shortD(t.due) : ct || (t.time ? "≤ " + t.time : "–")));
    when.appendChild(el("small", null, late ? "tenggat lewat" : ct ? "jadwal" : "tenggat"));
    r.appendChild(when);
    var m = el("div", "fm"); m.appendChild(el("b", null, t.title)); m.appendChild(el("span", "sub", (CAT[t.cat] || "Tugas") + (t.prio === "tinggi" ? " · prioritas tinggi" : "") + (!done && t.time && ct ? " · tenggat " + t.time : ""))); r.appendChild(m);
    var side = el("div", "fs");
    if (done) side.appendChild(el("span", "chip s-done", t.viaEviden ? "Eviden masuk" : "Selesai"));
    else if (late) side.appendChild(el("span", "chip s-late", "Terlambat"));
    else if (t.status === "doing") side.appendChild(el("span", "chip s-risk", "Proses " + prog(t) + "%"));
    else if (grp === "today") side.appendChild(el("span", "chip s-due", "Belum"));
    var jk = jenisForTask(t.id);
    if (jk && !done && grp === "today") { var b = el("button", "btn sm", "Unggah eviden"); b.type = "button"; b.addEventListener("click", function () { openUpload(jk, t.due); }); side.appendChild(b); }
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
      row.appendChild(tr);
      row.appendChild(el("span", "v", c.progres == null ? "n/a" : c.progres + "%"));
      var m = nextMs(c), nx = el("span", "nx");
      if (m && m.tanggal) { var dd = daysTo(m.tanggal); nx.appendChild(el("b", dd < 0 ? "past" : dd <= 3 ? "soon" : null, shortD(m.tanggal) + " · " + (dd < 0 ? "lewat " + Math.abs(dd) + " hr" : dd === 0 ? "hari ini" : dd + " hr lagi"))); nx.appendChild(el("small", null, m.nama)); }
      else nx.appendChild(el("small", null, m ? m.nama + " · tanpa tanggal" : "–"));
      row.appendChild(nx);
      row.appendChild(el("span", "chip " + (CRS[c.statusJadwal] || "s-hold"), c.statusJadwal || "–"));
      tipOn(row, c.nama + ": " + (c.progres == null ? "n/a" : c.progres + "%") + " · " + (c.progresKet || "progres") + " · " + (c.statusJadwal || "–") + (m ? " · berikut: " + m.nama + (m.tanggal ? " (" + shortD(m.tanggal) + ")" : "") : ""));
      box.appendChild(row);
    });
    var ax = $("#crAxis"); clear(ax);
    [0, 25, 50, 75, 100].forEach(function (v) { var s = el("span", null, v + "%"); s.style.left = v + "%"; ax.appendChild(s); });

    // agenda 14 hari (5 teratas)
    var ag = [], end = addD(TODAY, 14);
    crs.forEach(function (c) { (c.milestones || []).forEach(function (m) { if (m.tanggal && m.status !== "Selesai" && m.tanggal <= end && m.tanggal >= TODAY) ag.push({ d: m.tanggal, t: m.nama, s: c.nama }); }); });
    all.forEach(function (t) { if (t.status !== "done" && !t.routine && t.due >= TODAY && t.due <= end && t.prio === "tinggi") ag.push({ d: t.due, t: t.title, s: (CAT[t.cat] || "Tugas") + " · prioritas tinggi" }); });
    ((D.kalender || {}).acara || []).forEach(function (a) { var d = a.mulai.slice(0, 10); if (a.jenis === "rapat" && d >= TODAY && d <= end) ag.push({ d: d, t: a.judul, s: "Rapat · " + (a.sepanjangHari ? "sepanjang hari" : a.mulai.slice(11, 16) + " WIB") }); });
    ag.sort(function (a, b) { return a.d.localeCompare(b.d); });
    var abox = $("#agenda"), AGN = 5; clear(abox);
    if (!ag.length) abox.appendChild(el("div", "empty", "Tidak ada agenda 14 hari ke depan."));
    ag.slice(0, AGN).forEach(function (a) {
      var dd = daysTo(a.d), r = el("div", "ag"), w = el("div", "when");
      w.appendChild(el("b", null, fmt(a.d, { day: "numeric", month: "short" }))); w.appendChild(document.createTextNode(dd === 0 ? "hari ini" : dd === 1 ? "besok" : dd + " hr lagi"));
      var wh = el("div", "what"); wh.appendChild(el("b", null, a.t)); wh.appendChild(el("span", null, a.s));
      r.appendChild(w); r.appendChild(wh); abox.appendChild(r);
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
      ST.forEach(function (s) { var n = (c.status || {})[s.k] || 0; if (!n || !tot) return; var i = el("i"); i.style.flex = n + " 0 0"; stMark(i, s); tipOn(i, c.bidang + " · " + s.k + ": " + n + " dari " + tot + " (" + Math.round(n / tot * 100) + "%)"); bar.appendChild(i); });
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

  // ---- navigasi view ----
  var VIEWS = { ringkasan: "Ringkasan", kalender: "Kalender", eviden: "Unggah & arsip eviden", rutin: "Rutin mingguan", cr: "Monitoring CR aplikasi", coc: "Eviden CoC per bidang", kpi: "Eviden KPI 4b DIV GA", tugas: "Daftar tugas" };
  function route() {
    var v = (location.hash || "#ringkasan").slice(1);
    if (!VIEWS[v]) v = "ringkasan";
    Object.keys(VIEWS).forEach(function (k) { $("#v-" + k).hidden = k !== v; });
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.nav === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    $("#viewTitle").textContent = VIEWS[v];
    document.title = VIEWS[v] + " · Dashboard Strategi & Evaluasi";
    if (v === "cr") renderCR();
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
        if (r.days.indexOf(i) < 0) { var na = el("td", "na", "—"); na.setAttribute("aria-label", "Tidak dijadwalkan"); tr.appendChild(na); return; }
        var t = D.tasks[r.key + "-" + d];
        var td = el("td"), c = el("div", "cell");
        var stt = !t ? "none" : t.status === "done" ? "done" : isLate(t) ? "late" : t.status === "doing" ? "doing" : t.due === TODAY ? "today" : "plan";
        c.dataset.st = stt;
        c.textContent = { none: "–", done: "✓ Selesai", late: "! Terlambat", doing: "Proses " + (t ? prog(t) : 0) + "%", today: "○ Hari ini", plan: "Terjadwal" }[stt];
        c.setAttribute("aria-label", r.title + " " + shortD(d) + ": " + (t ? c.textContent : "belum dibuat"));
        td.appendChild(c); tr.appendChild(td);
      });
      body.appendChild(tr);
    });
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
      pg.appendChild(bar); pg.appendChild(lab); row.appendChild(pg);
      var nx = el("div", "c-next"), m = nextMs(c);
      if (m) {
        var dd = daysTo(m.tanggal);
        nx.appendChild(el("div", null, m.nama));
        nx.appendChild(el("div", "d" + (dd < 0 ? " past" : dd <= 3 ? " soon" : ""), shortD(m.tanggal) + " · " + (dd < 0 ? Math.abs(dd) + " hari lewat" : dd === 0 ? "hari ini" : dd + " hari lagi")));
      } else nx.appendChild(el("div", "d", "Tidak ada milestone terjadwal"));
      row.appendChild(nx);
      var sd = el("div", "c-side"); sd.appendChild(el("span", "chip " + sc, c.statusJadwal || "–"));
      if (c.update) { var age = -daysTo(c.update); if (age > 21) sd.appendChild(el("span", "stale", "update " + age + " hari lalu")); }
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
            r.appendChild(el("span", "chip " + (MSC[x.status] || "s-hold"), x.status || "–")); ms.appendChild(r);
          });
          body.appendChild(ms);
        }
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
      var d = addD(weekStart, i), c = D.coc[d];
      var card = el("div", "ev" + (c ? " has" : " empty-ev") + (c && evSel === d ? " sel" : ""));
      card.appendChild(el("div", "day" + (d === TODAY ? " today" : ""), DAYS[i] + " · " + fmt(d, { day: "numeric", month: "short" })));
      if (c) cardBody(card, c, d);
      else {
        card.appendChild(el("h3", null, "Belum ada eviden"));
        card.appendChild(el("p", "muted", d > TODAY ? "Jadwal CoC mendatang." : "MoM dan rekap belum masuk tracker."));
      }
      grid.appendChild(card);
    }
    renderDetail();
  }
  function cardBody(card, c, d) {
    card.appendChild(el("h3", null, c.bidang || "CoC"));
    var ix = c.indeks || {}, m = c.status || {}, tot = c.jumlahKomitmen || 0;
    var idx = el("div", "idx"); idx.appendChild(el("b", "num", ix.persen == null ? "–" : ix.persen + "%"));
    idx.appendChild(el("span", null, "indeks kemajuan · " + (ix.maju || 0) + " ÷ " + (ix.lama || 0) + " komitmen lama")); card.appendChild(idx);
    var st = el("div", "stack"); st.setAttribute("aria-hidden", "true");
    ST.forEach(function (s) { if (m[s.k] && tot) { var b = el("i"); b.style.width = (m[s.k] / tot * 100) + "%"; stMark(b, s); b.title = s.k + ": " + m[s.k]; st.appendChild(b); } });
    card.appendChild(st);
    var cn = el("div", "counts");
    ST.forEach(function (s) { if (m[s.k]) { var sp = el("span", null, s.k + " " + m[s.k]); stMark(sp, s); cn.appendChild(sp); } });
    card.appendChild(cn);
    var fl = el("div", "files");
    (c.eviden || []).forEach(function (k) { fl.appendChild(el("span", "ev-tag ok", k + " ✓")); });
    if (c.evaluasi && c.evaluasi.status === "Selesai") fl.appendChild(el("span", "ev-tag ok", "Evaluasi " + (c.evaluasi.slide || "") + " slide ✓"));
    if (c.evaluasi && c.evaluasi.slideRekap) fl.appendChild(el("span", "ev-tag ok", "Rekap " + c.evaluasi.slideRekap + " slide ✓"));
    if (!(c.eviden || []).length) fl.appendChild(el("span", "muted", "Belum ada file"));
    card.appendChild(fl);
    if (c.evaluasi && c.evaluasi.ringkas) card.appendChild(el("div", "ev-rec", c.evaluasi.ringkas));
    else if ((c.eviden || []).length && !c.evaluasi) card.appendChild(el("div", "ev-wait", "Menunggu evaluasi otomatis"));
    if (c.jumlahCatatan) card.appendChild(el("div", "flag", c.jumlahCatatan + " catatan evaluasi"));
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
      var ch = el("span", "chip kpi-chip " + cls, st); td.appendChild(ch); tr.appendChild(td);
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
    if (!rows.length) {
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
      meta.appendChild(el("span", "mono", "Tenggat " + shortD(t.due) + (t.time ? " " + t.time : "")));
      main.appendChild(meta);
      var side = el("div", "seg-ro"), bar = el("span", "bar"), f = el("b"); f.style.width = prog(t) + "%"; bar.appendChild(f);
      side.appendChild(bar); side.appendChild(document.createTextNode(t.status === "done" ? (t.viaEviden ? "Selesai · eviden" : "Selesai") : prog(t) + "%"));
      if (t.status !== "done" && t.due >= TODAY && !onCalendar(t)) { var gl = el("a", "gcal", "+ Kalender"); gl.href = gcalLink(t); gl.target = "_blank"; gl.rel = "noopener noreferrer"; gl.setAttribute("aria-label", "Tambah ke Google Calendar: " + t.title); main.appendChild(gl); }
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
    $("#footSrc").textContent = "Sumber data: " + (D.meta.sumber || "data/tracker.enc.json") + " · profil " + (D.meta.profil || "–") + " · diekspor " + label + ". Eviden diunggah lewat menu Eviden; status lain dikelola di tracker privat.";
  }
  function valid(x) { return x && typeof x === "object" && x.meta && x.tasks && x.cr && x.coc && x.kpi; }
  function renderAll() { renderOverview(); navBadges(); renderMatrix(); renderTrend(); renderCR(); renderEvidence(); renderKPI(); renderList(); renderKalender(); renderEvidenView(); }

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
    if (!e || e.format !== "dse-aesgcm-v1" || !e.kdf || !e.iv || !e.ct) return Promise.reject(new Error("format"));
    return deriveKey(pw, e).then(function (k) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv), additionalData: new TextEncoder().encode(e.format) }, k, unb64(e.ct));
    }).then(function (buf) { return JSON.parse(new TextDecoder().decode(buf)); });
  }
  function lock(msg) {
    sandi = null; keyCache = {}; D = { meta: {}, tasks: {}, cr: {}, coc: {}, kpi: {} }; loaded = false; BASE = null; TOKEN = null; ghInfo = null; EV = { skema: 1, eviden: [] };
    document.body.classList.add("locked"); $("#lock").hidden = false;
    var er = $("#lockErr"); er.hidden = !msg; er.textContent = msg || "";
    setTimeout(function () { $("#lockPw").focus(); }, 0);
  }
  function unlocked(x) {
    if (!valid(x)) throw new Error("format");
    BASE = x; loaded = true; document.body.classList.remove("locked"); $("#lock").hidden = true;
    rebuild();
    tokenLoad().then(function () { renderEvidenView(); return evLoad(); });
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
    var u = new Uint8Array(buf);
    if (new TextDecoder().decode(u.subarray(0, 4)) !== "DSE1") return Promise.reject(new Error("format"));
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
  function ghErr(r) { var e = new Error("GitHub " + r.status); e.status = r.status; return e; }
  function ghMsg(e) {
    if (!e || !e.status) return "Koneksi ke GitHub gagal. Periksa internet lalu coba lagi.";
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
  function evFromEnvelope(e) { return decrypt(sandi, e).then(function (o) { if (!o || !Array.isArray(o.eviden)) throw new Error("format"); return o; }); }
  function evLoad() {
    // sumber cepat: GitHub Pages (situs sendiri); jika token ada, API (lebih segar setelah unggah)
    var p = TOKEN ? ghGet(EVIDEN_PATH).then(function (j) { return j ? JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\n/g, "")))) : null; })
                  : fetch(EVIDEN_PATH, { cache: "no-cache" }).then(function (r) { evTag = r.headers.get("ETag") || r.headers.get("Last-Modified"); return r.ok ? r.json() : null; });
    return p.then(function (e) { return e ? evFromEnvelope(e) : { skema: 1, eviden: [] }; })
      .then(function (o) { EV = o; rebuild(); }).catch(function () { /* indeks belum ada atau tidak terbaca: abaikan */ });
  }
  function rebuild() {
    if (!BASE) return;
    var d = JSON.parse(JSON.stringify(BASE));
    d.evidenList = (EV.eviden || []).slice().sort(function (a, b) { return (b.tanggal + b.diunggah).localeCompare(a.tanggal + a.diunggah); });
    d.evidenList.forEach(function (x) {
      var t = x.tugas && d.tasks[x.tugas];
      if (t && t.status !== "done") { t.status = "done"; t.progress = 100; t.doneAt = x.diunggah; t.viaEviden = true; }
      if (x.jenis === "kpi4b") { var k = d.kpi[x.tanggal.slice(0, 7)]; if (k) k.adaLaporan = true; }
    });
    D = d; renderAll(); if (loaded) freshness();
  }

  // --- unggah ---
  var uploading = false;
  function setUpMsg(cls, txt) { var m = $("#upMsg"); m.hidden = !txt; m.className = "up-msg " + (cls || ""); m.textContent = txt || ""; }
  function doUpload(ev) {
    ev.preventDefault();
    if (uploading) return;
    if (!TOKEN) { setUpMsg("bad", "Hubungkan GitHub dulu (bagian Koneksi GitHub di bawah)."); return; }
    var f = $("#upFile").files[0], jenis = $("#upJenis").value, tanggal = $("#upTanggal").value, ket = $("#upKet").value.trim();
    if (!f) { setUpMsg("bad", "Pilih file eviden."); return; }
    if (!tanggal) { setUpMsg("bad", "Isi tanggal eviden."); return; }
    if (f.size > MAX_MB * 1048576) { setUpMsg("bad", "File " + kbStr(f.size) + " melebihi batas " + MAX_MB + " MB. Kompres PDF-nya dulu."); return; }
    var id = tanggal.replace(/-/g, "") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
    var path = "eviden/" + tanggal.slice(0, 4) + "/" + tanggal.slice(5, 7) + "/" + id + ".bin";
    var tugas = taskIdFor(jenis, tanggal);
    if (tugas && !(BASE.tasks || {})[tugas]) tugas = null;
    uploading = true; $("#upBtn").disabled = true; setUpMsg("", "Mengenkripsi file…");
    f.arrayBuffer().then(function (buf) { return encryptFile(sandi, buf); }).then(function (bin) {
      setUpMsg("", "Mengunggah ke GitHub (" + kbStr(bin.length) + ")…");
      return ghPut(path, b64(bin), "Tambah eviden terenkripsi " + id);
    }).then(function () {
      setUpMsg("", "Memperbarui daftar eviden…");
      var entry = { id: id, path: path, jenis: jenis, tanggal: tanggal, ket: ket, nama: f.name, ukuran: f.size, tipe: f.type || "", diunggah: nowIso(), tugas: tugas };
      return saveIndex(function (o) { o.eviden.push(entry); return o; }, 0);
    }).then(function () {
      $("#upForm").reset(); $("#upTanggal").value = TODAY; syncUpHint();
      setUpMsg("ok", "✓ Eviden tersimpan terenkripsi" + (tugas ? " dan tugas terkait ditandai selesai." : ".") + " Situs memuat versi baru dalam 1–2 menit; daftar di bawah sudah diperbarui.");
    }).catch(function (e) { setUpMsg("bad", "! " + ghMsg(e)); }).then(function () { uploading = false; $("#upBtn").disabled = false; });
  }
  function saveIndex(mutate, attempt) {
    return ghGet(EVIDEN_PATH).then(function (j) {
      var p = j ? evFromEnvelope(JSON.parse(new TextDecoder().decode(unb64(j.content.replace(/\n/g, ""))))) : Promise.resolve({ skema: 1, eviden: [] });
      return p.then(function (o) { var next = mutate(o); next.diperbarui = nowIso(); return encryptJSON(sandi, next).then(function (e) {
        return ghPut(EVIDEN_PATH, b64(te.encode(JSON.stringify(e) + "\n")), "Perbarui indeks eviden terenkripsi", j && j.sha).then(function () { EV = next; rebuild(); });
      }); });
    }).catch(function (e) { if ((e.status === 409 || e.status === 422) && attempt < 2) return saveIndex(mutate, attempt + 1); throw e; });
  }
  function openEviden(x, download) {
    var btnMsg = $("#evListMsg"); btnMsg.hidden = false; btnMsg.className = "up-msg"; btnMsg.textContent = "Membuka " + x.nama + "…";
    var src = TOKEN ? gh("GET", "/contents/" + x.path + "?ref=main", null, "application/vnd.github.raw") : fetch(x.path, { cache: "no-cache" });
    src.then(function (r) { if (!r.ok) throw ghErr(r); return r.arrayBuffer(); }).then(function (buf) { return decryptFile(sandi, buf); }).then(function (plain) {
      var url = URL.createObjectURL(new Blob([plain], { type: x.tipe || "application/octet-stream" }));
      var a = document.createElement("a"); a.href = url; if (download || !/pdf|image/.test(x.tipe || "")) a.download = x.nama; else a.target = "_blank";
      a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      btnMsg.hidden = true;
    }).catch(function (e) { btnMsg.className = "up-msg bad"; btnMsg.textContent = e && e.status === 404 ? "! File belum tersedia di situs. Tunggu 1–2 menit setelah unggah, atau hubungkan GitHub." : "! File tidak bisa dibuka: " + ghMsg(e); });
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
    var jenis = $("#upJenis").value, tanggal = $("#upTanggal").value, id = taskIdFor(jenis, tanggal), t = id && BASE && BASE.tasks[id];
    var h = $("#upHint");
    h.textContent = t ? "Tugas terkait: “" + t.title + "” (" + (t.status === "done" ? "sudah selesai" : "akan ditandai selesai") + ")." : (jenisOf(jenis).tugas ? "Belum ada tugas " + jenisOf(jenis).label + " untuk tanggal ini; eviden tetap tersimpan." : "Eviden disimpan tanpa tugas terkait.");
    $("#upKetL").textContent = jenis === "mom" || jenis === "rekap" ? "Bidang" : jenis === "cr" ? "Nama CR / dokumen" : "Keterangan";
  }

  function renderEvidenView() {
    var box = $("#evList"); if (!box) return; clear(box);
    renderGh();
    var list = D.evidenList || [];
    $("#evCount").textContent = list.length + " eviden";
    if (!list.length) { var tr0 = el("tr"), td0 = el("td", "empty", loaded ? "Belum ada eviden yang diunggah dari dashboard." : "Memuat…"); td0.colSpan = 6; tr0.appendChild(td0); box.appendChild(tr0); return; }
    list.forEach(function (x) {
      var tr = el("tr");
      tr.appendChild(el("td", "m", shortD(x.tanggal)));
      var j = el("td"); j.appendChild(el("span", "pill " + (x.jenis === "kpi4b" ? "kpi" : x.jenis === "cresppd" || x.jenis === "crlayanan" || x.jenis === "cr" ? "cr" : x.jenis === "mom" ? "mom" : x.jenis === "rekap" ? "rekap" : "lain"), jenisOf(x.jenis).label)); tr.appendChild(j);
      tr.appendChild(el("td", null, x.ket || "–"));
      var fn = el("td"); fn.appendChild(el("div", "fname", x.nama)); fn.appendChild(el("span", "sub", kbStr(x.ukuran || 0) + " · diunggah " + new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(x.diunggah)))); tr.appendChild(fn);
      var tk = el("td"), t = x.tugas && D.tasks[x.tugas];
      tk.appendChild(t ? el("span", "chip s-done", "Tugas selesai") : el("span", "sub", "–")); tr.appendChild(tk);
      var ac = el("td", "act"), b1 = el("button", "btn", "Buka"), b2 = el("button", "btn", "Unduh");
      b1.type = b2.type = "button"; b1.addEventListener("click", function () { openEviden(x, false); }); b2.addEventListener("click", function () { openEviden(x, true); });
      ac.appendChild(b1); ac.appendChild(b2); tr.appendChild(ac);
      box.appendChild(tr);
    });
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
  function evBlock(a) {
    var st = evState(a), r = el(a.link ? "a" : "div", "kev k-" + (a.jenis || "lain") + (st && st.c === "s-done" ? " is-done" : ""));
    if (a.link) { r.href = a.link; r.target = "_blank"; r.rel = "noopener noreferrer"; r.setAttribute("aria-label", a.judul + ", " + evTime(a) + (st ? ", " + st.t : "") + " — buka di Google Calendar"); }
    r.appendChild(el("span", "kt", evTime(a)));
    var mid = el("span", "km"); mid.appendChild(el("b", null, a.judul)); mid.appendChild(el("span", "sub", KJ[a.jenis] || "Acara")); r.appendChild(mid);
    if (st) r.appendChild(el("span", "chip " + st.c, st.t));
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
        list.forEach(function (a) { col.appendChild(evBlock(a)); });
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
      r.appendChild(l); miss.appendChild(r);
    });
  }

  // --- event handler ---
  $("#upForm").addEventListener("submit", doUpload);
  $("#upJenis").addEventListener("change", syncUpHint); $("#upTanggal").addEventListener("change", syncUpHint);
  $("#upTanggal").value = TODAY;
  (function () { var s = $("#upJenis"); JENIS.forEach(function (j) { var o = el("option", null, j.label); o.value = j.k; s.appendChild(o); }); })();
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
  $("#evRefresh").addEventListener("click", function () { evLoad(); });

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
    if (loaded && !TOKEN) fetch(EVIDEN_PATH, { method: "HEAD", cache: "no-cache" }).then(function (r) { var tag = r.headers.get("ETag") || r.headers.get("Last-Modified"); if (r.ok && tag && tag !== evTag) evLoad(); }).catch(function () { });
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
  setInterval(function () {
    var t = todayStr();
    if (t !== TODAY) { TODAY = t; weekStart = monday(t); kalWeek = monday(t); $("#todayLbl").textContent = fmt(TODAY, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); renderAll(); }
    poll();
  }, POLL_MS);
})();
