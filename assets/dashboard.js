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
  function paintSt(node, s) { node.style.setProperty("--c", "var(" + s.v + ")"); node.style.setProperty("--ci", "var(" + s.i + ")"); }
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
    hn.appendChild(document.createTextNode(String(late.length))); hn.appendChild(el("small", null, " / " + crs.length));
    var next = null;
    crs.forEach(function (c) { var m = nextMs(c); if (m && m.tanggal >= TODAY && (!next || m.tanggal < next.m.tanggal)) next = { c: c, m: m }; });
    var lateTasks = all.filter(isLate);
    var parts = [];
    parts.push(late.length ? late.length + " CR terlambat (" + late.map(function (c) { return c.nama; }).join(", ") + ")" : "Tidak ada CR terlambat");
    if (risk.length) parts.push(risk.length + " berisiko");
    var txt = parts.join(" dan ") + ".";
    if (next) txt += " Milestone terdekat: " + next.m.nama + " (" + next.c.nama + ", " + shortD(next.m.tanggal) + ").";
    txt += lateTasks.length ? " " + lateTasks.length + " tugas lewat tenggat." : " Tidak ada tugas lewat tenggat.";
    $("#heroText").textContent = txt;

    // KPI tiles
    var week = all.filter(function (t) { return inWeek(t, ws); });
    var wp = week.length ? Math.round(week.reduce(function (a, t) { return a + prog(t); }, 0) / week.length) : null;
    $("#kWeek").textContent = wp === null ? "n/a" : wp + "%";
    $("#kWeekBar").style.width = (wp || 0) + "%";
    $("#kWeekSub").textContent = week.length ? week.filter(function (t) { return t.status === "done"; }).length + " dari " + week.length + " tugas selesai" : "Belum ada tugas minggu ini";
    $("#kLate").textContent = String(lateTasks.length);
    $("#kLate").classList.toggle("is-bad", lateTasks.length > 0);
    $("#kLateSub").textContent = lateTasks.length ? "tertua: " + lateTasks.sort(function (a, b) { return a.due.localeCompare(b.due); })[0].title.slice(0, 60) : "semua tugas sesuai tenggat";
    var cw = cocWeek(), maju = 0, lama = 0;
    cw.forEach(function (c) { maju += (c.indeks || {}).maju || 0; lama += (c.indeks || {}).lama || 0; });
    $("#kCoc").textContent = lama ? Math.round(maju / lama * 100) + "%" : "n/a";
    $("#kCocSub").textContent = cw.length ? maju + " ÷ " + lama + " komitmen lama Selesai/Maju · " + cw.length + " bidang" : "Belum ada eviden CoC minggu ini";
    var ym = TODAY.slice(0, 7), k = D.kpi[ym];
    $("#kKpiL").textContent = "KPI 4b " + new Intl.DateTimeFormat("id-ID", { month: "long", timeZone: "UTC" }).format(P(ym + "-01"));
    if (k) {
      var st = k.tanggal ? (k.tanggal <= k.tenggat ? "Tepat waktu" : "Terlambat") : (k.proses || (k.tenggat < TODAY ? "Lewat tenggat" : "Belum ada"));
      $("#kKpi").textContent = st;
      $("#kKpiSub").textContent = "tenggat " + shortD(k.tenggat) + (k.reeng ? " · Reengineering " + k.reeng.done + "/" + k.reeng.total : "");
    } else { $("#kKpi").textContent = "n/a"; $("#kKpiSub").textContent = "Belum ada data bulan ini"; }

    // grafik CR: batang horizontal, satu skala 0–100
    var box = $("#crChart"); clear(box);
    crs.slice().sort(function (a, b) { return (SEV[a.statusJadwal] ?? 9) - (SEV[b.statusJadwal] ?? 9) || (a.progres || 0) - (b.progres || 0); }).forEach(function (c) {
      var row = el("a", "hb"); row.href = "#cr"; row.setAttribute("role", "listitem");
      row.addEventListener("click", function () { crOpen = c.id; });
      row.appendChild(el("span", "n", c.nama));
      var tr = el("span", "track");
      [25, 50, 75].forEach(function (g) { var l = el("i", "gl"); l.style.left = g + "%"; tr.appendChild(l); });
      if (c.progres != null) { var b = el("b"); b.style.width = c.progres + "%"; tr.appendChild(b); }
      row.appendChild(tr);
      row.appendChild(el("span", "v", c.progres == null ? "n/a" : c.progres + "%"));
      row.appendChild(el("span", "chip " + (CRS[c.statusJadwal] || "s-hold"), c.statusJadwal || "–"));
      tipOn(row, c.nama + ": " + (c.progres == null ? "n/a" : c.progres + "%") + " · " + (c.progresKet || "progres") + " · " + (c.statusJadwal || "–"));
      box.appendChild(row);
    });
    var ax = $("#crAxis"); clear(ax);
    [0, 25, 50, 75, 100].forEach(function (v) { var s = el("span", null, v + "%"); s.style.left = v + "%"; ax.appendChild(s); });

    // agenda 14 hari
    var ag = [], end = addD(TODAY, 14);
    crs.forEach(function (c) { (c.milestones || []).forEach(function (m) { if (m.tanggal && m.status !== "Selesai" && m.tanggal <= end && m.tanggal >= addD(TODAY, -7)) ag.push({ d: m.tanggal, t: m.nama, s: c.nama + (m.status ? " · " + m.status : "") }); }); });
    all.forEach(function (t) { if (t.status !== "done" && !t.routine && t.due <= end) ag.push({ d: t.due, t: t.title, s: (CAT[t.cat] || "Tugas") + (t.prio === "tinggi" ? " · prioritas tinggi" : "") }); });
    ag.sort(function (a, b) { return a.d.localeCompare(b.d); });
    var abox = $("#agenda"); clear(abox);
    if (!ag.length) abox.appendChild(el("div", "empty", "Tidak ada agenda 14 hari ke depan."));
    ag.slice(0, 7).forEach(function (a) {
      var dd = daysTo(a.d), r = el("div", "ag"), w = el("div", "when" + (dd < 0 ? " past" : ""));
      w.appendChild(el("b", null, fmt(a.d, { day: "numeric", month: "short" }))); w.appendChild(document.createTextNode(dd < 0 ? Math.abs(dd) + " hr lewat" : dd === 0 ? "hari ini" : dd + " hr lagi"));
      var wh = el("div", "what"); wh.appendChild(el("b", null, a.t)); wh.appendChild(el("span", null, a.s));
      r.appendChild(w); r.appendChild(wh); abox.appendChild(r);
    });
    if (ag.length > 7) abox.appendChild(el("p", "table-note", "+" + (ag.length - 7) + " agenda lain di Daftar tugas dan Monitoring CR."));

    // komposisi status CoC per bidang (minggu ini; jika kosong, 4 CoC terakhir)
    var lg = $("#cocLegend"); clear(lg);
    ST.forEach(function (s) { var sp = el("span", null, s.k); sp.style.setProperty("--c", "var(" + s.v + ")"); lg.appendChild(sp); });
    var list = cw.length ? cw : Object.keys(D.coc).sort().reverse().slice(0, 4).map(function (id) { return D.coc[id]; });
    var cb = $("#cocChart"); clear(cb);
    if (!list.length) cb.appendChild(el("div", "empty", "Belum ada eviden CoC."));
    list.forEach(function (c) {
      var row = el("div", "comp-row"), t = el("div", "t"), ix = c.indeks || {};
      t.appendChild(el("b", null, c.bidang + " · " + fmt(c.date, { day: "numeric", month: "short" })));
      t.appendChild(el("span", null, "indeks " + (ix.persen == null ? "n/a" : ix.persen + "%") + " · " + (c.jumlahKomitmen || 0) + " komitmen"));
      var bar = el("div", "cbar"), tot = c.jumlahKomitmen || 0;
      ST.forEach(function (s) { var n = (c.status || {})[s.k] || 0; if (!n || !tot) return; var i = el("i"); i.style.flex = n + " 0 0"; i.style.setProperty("--c", "var(" + s.v + ")"); tipOn(i, c.bidang + " · " + s.k + ": " + n + " dari " + tot + " (" + Math.round(n / tot * 100) + "%)"); bar.appendChild(i); });
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
  var VIEWS = { ringkasan: "Ringkasan", rutin: "Rutin mingguan", cr: "Monitoring CR aplikasi", coc: "Eviden CoC per bidang", kpi: "Eviden KPI 4b DIV GA", tugas: "Daftar tugas" };
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
        c.dataset.st = t ? t.status : "none";
        if (t && isLate(t)) c.dataset.late = "1";
        c.textContent = !t ? "–" : t.status === "done" ? "✓ Selesai" : t.status === "doing" ? "Proses " + prog(t) + "%" : (isLate(t) ? "Terlambat" : "Belum");
        c.setAttribute("aria-label", r.title + " " + shortD(d) + ": " + (t ? c.textContent : "belum dibuat"));
        td.appendChild(c); tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function renderTrend() {
    var box = $("#trend"); clear(box);
    var all = allTasks(), cur = monday(TODAY);
    for (var k = 3; k >= 0; k--) {
      var ws = addD(cur, -7 * k);
      var w = all.filter(function (t) { return inWeek(t, ws); });
      var p = w.length ? Math.round(w.reduce(function (a, t) { return a + prog(t); }, 0) / w.length) : null;
      var row = el("div", "trow" + (k === 0 ? " cur" : ""));
      row.appendChild(el("span", "lab", k === 0 ? "Minggu ini" : "Mg " + fmt(ws, { day: "numeric", month: "short" })));
      var bar = el("div", "bar"), b = el("b"); b.style.width = (p || 0) + "%"; bar.appendChild(b); row.appendChild(bar);
      row.appendChild(el("span", "num", p === null ? "n/a" : p + "%"));
      box.appendChild(row);
    }
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
    ST.forEach(function (s) { if (m[s.k] && tot) { var b = el("i"); b.style.width = (m[s.k] / tot * 100) + "%"; b.style.background = "var(" + s.v + ")"; b.title = s.k + ": " + m[s.k]; st.appendChild(b); } });
    card.appendChild(st);
    var cn = el("div", "counts");
    ST.forEach(function (s) { if (m[s.k]) { var sp = el("span", null, s.k + " " + m[s.k]); sp.style.setProperty("--c", "var(" + s.v + ")"); cn.appendChild(sp); } });
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
      side.appendChild(bar); side.appendChild(document.createTextNode(t.status === "done" ? "Selesai" : prog(t) + "%"));
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
    $("#footSrc").textContent = "Sumber data: " + (D.meta.sumber || "data/tracker.enc.json") + " · profil " + (D.meta.profil || "–") + " · diekspor " + label + ". Tampilan baca; status tugas dan eviden dikelola di tracker privat.";
  }
  function valid(x) { return x && typeof x === "object" && x.meta && x.tasks && x.cr && x.coc && x.kpi; }
  function renderAll() { renderOverview(); navBadges(); renderMatrix(); renderTrend(); renderCR(); renderEvidence(); renderKPI(); renderList(); }

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
    sandi = null; keyCache = {}; D = { meta: {}, tasks: {}, cr: {}, coc: {}, kpi: {} }; loaded = false;
    document.body.classList.add("locked"); $("#lock").hidden = false;
    var er = $("#lockErr"); er.hidden = !msg; er.textContent = msg || "";
    setTimeout(function () { $("#lockPw").focus(); }, 0);
  }
  function unlocked(x) {
    if (!valid(x)) throw new Error("format");
    D = x; loaded = true; document.body.classList.remove("locked"); $("#lock").hidden = true;
    renderAll(); freshness();
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
    if (t !== TODAY) { TODAY = t; weekStart = monday(t); $("#todayLbl").textContent = fmt(TODAY, { weekday: "short", day: "numeric", month: "short", year: "numeric" }); renderAll(); }
    poll();
  }, POLL_MS);
})();
