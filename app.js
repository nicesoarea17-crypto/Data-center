/* MFlash Data Center — aplikasi web (Cloudflare Pages + Supabase)
   Tanpa build step: cukup index.html, config.js, app.js. */
(function () {
"use strict";
window.__mfStarted = true;

/* =================== util =================== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
function unduhBlob(blob, name) { if (window.__SAVED) window.__SAVED.push({ name, size: blob.size, blob }); const u = URL.createObjectURL(blob), x = document.createElement("a"); x.href = u; x.download = name; document.body.appendChild(x); x.click(); x.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = new Intl.NumberFormat("id-ID");
const fmtN = n => nf.format(Math.round(Number(n) || 0));
const rp = n => "Rp " + nf.format(Math.round(Number(n) || 0));
const rpShort = n => { n = Number(n) || 0; const a = Math.abs(n); return a >= 1e9 ? "Rp " + (n / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M" : a >= 1e6 ? "Rp " + (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt" : rp(n); };
const pad = n => String(n).padStart(2, "0");
const pct = x => (x * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
const isEmpty = v => v == null || v === "";
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function fmtDate(v) {
  if (isEmpty(v)) return "";
  if (typeof v === "string" && /T\d{2}:\d{2}.*([+-]\d{2}(:?\d{2})?|Z)$/.test(v)) { const d = new Date(v); if (!isNaN(d)) return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` + (d.getHours() || d.getMinutes() ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ""); }
  if (typeof v === "string") { const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/); if (!m) return v; return `${m[3]}/${m[2]}/${m[1]}` + (m[4] && (m[4] !== "00" || m[5] !== "00") ? ` ${m[4]}:${m[5]}` : ""); }
  if (v instanceof Date) return `${pad(v.getDate())}/${pad(v.getMonth() + 1)}/${v.getFullYear()}`;
  return String(v);
}
function fmtDateTime(v) { if (!v) return ""; const d = new Date(v); if (isNaN(d)) return String(v); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* =================== Supabase REST client =================== */
// Alamat & kunci Supabase. Dibaca dari config.js; bila penulisannya rusak, dibaca langsung dari teks file,
// atau dari isian yang disimpan di perangkat ini lewat layar "Sambungkan ke Supabase".
const cleanUrl = u => (String(u || "").trim().match(/^https?:\/\/[^\/?#\s"'“”]+/) || [""])[0];
const URL_RE = /https:\/\/[a-z0-9-]+\.supabase\.co/i;
const KEY_RE = /(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sb_publishable_[A-Za-z0-9_-]+)/;
let BASE = "", KEY = "";
function setConn(url, key) { BASE = cleanUrl(url); KEY = String(key || "").trim().replace(/^["'“”]+|["'“”,;]+$/g, ""); }
const validConn = () => !!BASE && !/ISI-PROJECT/i.test(BASE) && KEY_RE.test(KEY);
async function resolveConfig() {
  const C = window.MFLASH_CONFIG;
  if (C) { setConn(C.SUPABASE_URL, C.SUPABASE_ANON_KEY); if (validConn()) return "config"; }
  try { // config.js rusak: ambil alamat dan kunci langsung dari teksnya
    const t = await (await fetch("config.js", { cache: "no-store" })).text();
    const u = t.match(URL_RE), k = t.match(KEY_RE);
    if (u && k) { setConn(u[0], k[0]); if (validConn()) return "teks"; }
  } catch (e) {}
  const saved = LS.get("mfdc-conn");
  if (saved) { setConn(saved.url, saved.key); if (validConn()) return "perangkat"; }
  return null;
}
// Tanpa login: semua permintaan memakai anon key; aturan akses diatur di database.
async function rest(path, { method = "GET", body, headers = {} } = {}) {
  let r;
  try { r = await fetch(BASE + "/rest/v1" + path, { method, headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { throw new Error("Tidak bisa menghubungi server. Periksa koneksi internet."); }
  if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) {} throw new Error((j && (j.message || j.hint || j.details)) || "Server menolak permintaan (" + r.status + ")."); }
  return r;
}
// filters: [[kolom, operator, nilai]] → kolom=operator.nilai
function qs(o) {
  const p = [];
  if (o.select) p.push("select=" + encodeURIComponent(o.select));
  for (const [c, op, v] of (o.filters || [])) p.push(encodeURIComponent(c) + "=" + op + "." + encodeURIComponent(v));
  if (o.or) p.push("or=" + encodeURIComponent("(" + o.or + ")"));
  if (o.order) p.push("order=" + encodeURIComponent(o.order));
  if (o.limit != null) p.push("limit=" + o.limit);
  if (o.offset) p.push("offset=" + o.offset);
  if (o.onConflict) p.push("on_conflict=" + encodeURIComponent(o.onConflict));
  return p.length ? "?" + p.join("&") : "";
}
const db = {
  async select(table, o = {}) {
    const r = await rest("/" + table + qs(o), { headers: o.count ? { Prefer: "count=exact" } : {} });
    const rows = await r.json(); let count = null;
    const cr = r.headers.get("content-range"); if (cr && cr.includes("/")) { const n = cr.split("/")[1]; if (n !== "*") count = +n; }
    return { rows, count };
  },
  async all(table, o = {}, onPage) {
    const out = []; const size = 1000;
    for (let off = 0; ; off += size) {
      const { rows } = await db.select(table, { ...o, limit: size, offset: off });
      out.push(...rows); if (onPage) onPage(out.length);
      if (rows.length < size) break;
    }
    return out;
  },
  async insert(table, rows, { returning = false, upsert = false, onConflict } = {}) {
    const prefer = [returning ? "return=representation" : "return=minimal"]; if (upsert) prefer.push("resolution=merge-duplicates");
    const r = await rest("/" + table + qs({ onConflict }), { method: "POST", body: rows, headers: { Prefer: prefer.join(",") } });
    return returning ? r.json() : null;
  },
  async update(table, filters, body) { await rest("/" + table + qs({ filters }), { method: "PATCH", body, headers: { Prefer: "return=minimal" } }); },
  async rpc(fn, args = {}) { const r = await rest("/rpc/" + fn, { method: "POST", body: args }); const t = await r.text(); return t ? JSON.parse(t) : null; }
};
const orSafe = s => String(s).replace(/[,()"\\*:]/g, " ").trim();

/* =================== state =================== */
const BRANCHES = ["Klender", "Ceger", "Bintara", "Radjiman", "Jatimulya", "Dramaga", "Condet", "Jatibening", "Sawangan Depok", "Warbong", "Cinere", "Cibinong", "Teluk Jambe Karawang", "Jatiwaringin", "Cikampek", "Cilangkap", "Pejaten", "Cibubur"];
const PILAR_ORDER = ["SERVICE", "PENJUALAN RITEL", "SEWA", "PENGADAAN CORPORATE"];
const S = { cabangs: BRANCHES.slice(), kodeMap: {}, page: LS.get("mfdc-page") || "dashboard" };
const root = () => $("#root");

async function boot() {
  const src = await resolveConfig();
  if (!src) return renderConnect();
  try {
    const cab = await db.select("cabang", { select: "nama,urut,kode_accurate", order: "urut" });
    if (cab.rows.length) { S.cabangs = cab.rows.map(c => c.nama); S.kodeMap = Object.fromEntries(cab.rows.filter(c => c.kode_accurate).map(c => [c.kode_accurate.toLowerCase(), c.nama])); }
  } catch (e) { return renderConnect(friendlyConnErr(e.message)); }
  renderShell();
}
function friendlyConnErr(m) {
  if (/invalid path/i.test(m)) return "Alamat Supabase salah. Isi hanya sampai .supabase.co, contoh https://abcdxyz.supabase.co";
  if (/invalid api key|no api key|jwt|401/i.test(m)) return "Kunci (anon / publishable key) salah atau tidak lengkap. Salin ulang dari Supabase.";
  if (/relation .*cabang.* does not exist|could not find the table|404/i.test(m)) return "Database belum disiapkan. Jalankan supabase/schema.sql di Supabase → SQL Editor, lalu coba lagi.";
  return m;
}
// Layar sambungan: isi alamat & kunci tanpa mengedit kode
function renderConnect(err) {
  const saved = LS.get("mfdc-conn") || {};
  root().innerHTML = `<div class="login"><form id="fConn" novalidate style="width:min(100%,520px)">
    <div><span class="eyebrow">MFlash</span><h1>Sambungkan ke Supabase</h1>
    <p class="sub">Isi dua data dari Supabase → <b>Project Settings → API</b> (atau <b>API Keys</b>). Cukup sekali; setelah tersambung, aplikasi memberi isi <b>config.js</b> yang siap disalin ke GitHub.</p></div>
    ${err ? `<div class="notice bad">${esc(err)}</div>` : ""}
    <label>Project URL<input id="cUrl" placeholder="https://abcdxyz.supabase.co" value="${esc(saved.url || (BASE && !/ISI-PROJECT/i.test(BASE) ? BASE : ""))}" autocomplete="off"></label>
    <label>anon public key / publishable key<input id="cKey" placeholder="eyJhbGciOi… atau sb_publishable_…" value="${esc(saved.key || (KEY_RE.test(KEY) ? KEY : ""))}" autocomplete="off"></label>
    <div class="err" id="cErr" role="alert"></div>
    <button class="primary" id="cBtn" type="submit">Sambungkan</button>
    <div id="cOut"></div>
  </form></div>`;
  $("#fConn").onsubmit = async e => {
    e.preventDefault(); const b = $("#cBtn"); $("#cErr").textContent = "";
    const um = $("#cUrl").value.match(URL_RE), km = $("#cKey").value.match(KEY_RE);
    if (!um) return $("#cErr").textContent = "Project URL harus berbentuk https://xxxxx.supabase.co";
    if (!km) return $("#cErr").textContent = "Kunci tidak dikenali. Salin anon public key (diawali eyJ) atau publishable key (diawali sb_publishable_).";
    setConn(um[0], km[0]); b.disabled = true; b.textContent = "Mencoba…";
    try { await db.select("cabang", { select: "nama", limit: 1 }); }
    catch (er) { $("#cErr").textContent = friendlyConnErr(er.message); b.disabled = false; b.textContent = "Sambungkan"; return; }
    LS.set("mfdc-conn", { url: BASE, key: KEY });
    const cfg = `window.MFLASH_CONFIG = {\n  SUPABASE_URL: "${BASE}",\n  SUPABASE_ANON_KEY: "${KEY}"\n};\n`;
    $("#cOut").innerHTML = `<div class="notice ok" style="display:grid;gap:8px"><b>Tersambung.</b>
      <span>Aplikasi sudah bisa dipakai di perangkat ini. Agar semua orang langsung tersambung, ganti seluruh isi <b>config.js</b> di GitHub dengan teks berikut (klik Salin, lalu di GitHub: buka config.js → ikon pensil → hapus semua isi → tempel → Commit changes):</span>
      <textarea id="cCfg" readonly rows="5" style="font-family:var(--f-data);font-size:12px;width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface);color:var(--ink)">${esc(cfg)}</textarea>
      <div class="toolbar"><button type="button" id="cCopy">Salin isi config.js</button><button type="button" class="primary" id="cGo">Buka aplikasi</button></div></div>`;
    b.hidden = true;
    $("#cCopy").onclick = async () => { const t = $("#cCfg"); try { await navigator.clipboard.writeText(t.value); $("#cCopy").textContent = "Tersalin"; } catch (x) { t.select(); } };
    $("#cGo").onclick = () => boot();
  };
}

/* =================== shell =================== */
const PAGES = [
  ["dashboard", "Dashboard Gross Profit"],
  ["sewa", "Sewa"],
  ["service", "Service & Maintenance Corporate"],
  ["sales", "Pencapaian Sales"],
  ["pelanggan", "Data Pelanggan"],
  ["faktur", "Faktur Penjualan"],
  ["unggah", "Unggah Data"],
  ["unduh", "Unduh Laporan"],
  ["kualitas", "Kualitas Data"],
];
function renderShell() {
  if (!PAGES.some(p => p[0] === S.page)) S.page = "dashboard";
  root().innerHTML = `<div class="wrap">
    <header class="topbar">
      <div class="brand"><span class="eyebrow">MFlash · gabungan Accurate semua cabang</span><h1>Data Center</h1></div>
      <div class="who"><button id="bExport" class="primary">Unduh Excel Data Center</button></div>
    </header>
    <nav class="nav" aria-label="Menu">${PAGES.map(([k, l]) => `<button data-page="${k}"${k === S.page ? ' aria-current="page"' : ""}>${l}</button>`).join("")}</nav>
    <main id="page"></main>
    <div id="modal"></div>
  </div>`;
  root().querySelectorAll("[data-page]").forEach(b => b.onclick = () => go(b.dataset.page));
  $("#bExport").onclick = exportDataCenter;
  go(S.page);
}
function go(p) {
  S.page = p; LS.set("mfdc-page", p);
  root().querySelectorAll("[data-page]").forEach(b => b.dataset.page === p ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  // wadah baru tiap pindah menu: halaman lama yang masih memuat tidak bisa menimpa halaman baru
  const el = document.createElement("div"); el.innerHTML = `<p class="loading">Memuat…</p>`; $("#page").replaceChildren(el);
  ({ dashboard: pageDashboard, sewa: pageSewa, service: pageService, sales: pageSales, pelanggan: pagePelanggan, faktur: pageFaktur, unggah: pageUnggah, unduh: pageUnduh, kualitas: pageKualitas }[p])(el)
    .catch(e => { el.innerHTML = `<div class="notice bad">${esc(e.message)}</div>`; });
}
function toast(t) { const d = document.createElement("div"); d.className = "notice ok"; d.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:20;box-shadow:0 6px 18px rgba(0,0,0,.15)"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }
const cabangOptions = (sel, all = true) => (all ? `<option value="">Semua cabang</option>` : "") + S.cabangs.map(c => `<option${c === sel ? " selected" : ""}>${esc(c)}</option>`).join("");
const lockedCabang = () => null;
const mPill = (m, has = true) => has ? `<span class="pill ${m >= 0.35 ? "ok" : m >= 0.15 ? "warn" : "bad"}">${pct(m)}</span>` : "–";

/* =================== FILTER BERSAMA (cabang, bulan) =================== */
// Dipakai Dashboard GP dan tab pilar. bulan: "YYYY-MM" | "semua" | "pilih" (rentang tanggal sendiri)
const D = { bulan: LS.get("mfdc-bulan") || "", from: "", to: "", cab: "", pilar: "" };
let BULAN = null;
const BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const namaBulan = b => { const [y, m] = b.split("-"); return `${BLN[+m - 1]} ${y}`; };
async function loadBulan() {
  if (!BULAN) BULAN = (await db.rpc("bulan_tersedia")).map(r => r.bulan);
  if (!D.bulan || (D.bulan !== "semua" && D.bulan !== "pilih" && !BULAN.includes(D.bulan))) D.bulan = BULAN[0] || "semua";
}
function periode() {
  if (D.bulan === "semua") return ["", ""];
  if (D.bulan === "pilih") return [D.from, D.to];
  const [y, m] = D.bulan.split("-").map(Number); return [ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0))];
}
function periodeLabel() {
  if (D.bulan === "semua") return "semua periode";
  if (D.bulan === "pilih") return `${D.from ? fmtDate(D.from) : "awal"} – ${D.to ? fmtDate(D.to) : "sekarang"}`;
  return namaBulan(D.bulan);
}
function filterBar(withPilar, pilars) {
  return `<div class="toolbar">
    <select id="fCab" aria-label="Cabang">${cabangOptions(D.cab)}</select>
    <select id="fBln" aria-label="Bulan">${(BULAN || []).map(b => `<option value="${b}"${b === D.bulan ? " selected" : ""}>${namaBulan(b)}</option>`).join("")}<option value="semua"${D.bulan === "semua" ? " selected" : ""}>Semua periode</option><option value="pilih"${D.bulan === "pilih" ? " selected" : ""}>Pilih tanggal…</option></select>
    ${withPilar ? `<select id="fPil" aria-label="Pilar"><option value="">Semua pilar</option>${pilars.map(p => `<option${p === D.pilar ? " selected" : ""}>${esc(p)}</option>`).join("")}</select>` : ""}
    <span class="toolbar"${D.bulan === "pilih" ? "" : " hidden"} id="fCustom"><input type="date" id="fFrom" value="${D.from}" aria-label="Dari tanggal"><input type="date" id="fTo" value="${D.to}" aria-label="Sampai tanggal"></span>
    <span class="sub">Periode: <b>${esc(periodeLabel())}</b></span>
  </div>`;
}
function bindFilter(el, re) {
  $("#fCab", el).onchange = e => { D.cab = e.target.value; re(); };
  $("#fBln", el).onchange = e => { D.bulan = e.target.value; LS.set("mfdc-bulan", D.bulan); if (D.bulan === "pilih") { $("#fCustom", el).hidden = false; return; } re(); };
  const p = $("#fPil", el); if (p) p.onchange = e => { D.pilar = e.target.value; re(); };
  $("#fFrom", el).onchange = e => { D.from = e.target.value; re(); };
  $("#fTo", el).onchange = e => { D.to = e.target.value; re(); };
}
const sumRows = rows => rows.reduce((o, r) => (o.rev += +r.omzet, o.cost += +(r.hpp || 0), o.gp += +r.gross_profit, o.inv += +r.jumlah_faktur, o.n += +(r.jumlah_baris || 0), o), { rev: 0, cost: 0, gp: 0, inv: 0, n: 0 });
const withM = o => (o.m = o.rev ? o.gp / o.rev : 0, o);
const sortPilar = arr => arr.sort((a, b) => (PILAR_ORDER.indexOf(a) + 1 || 99) - (PILAR_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

/* =================== DASHBOARD GP =================== */
async function pageDashboard(el) {
  await loadBulan();
  const [dari, sampai] = periode();
  const args = { p_dari: dari || null, p_sampai: sampai || null };
  const pil = D.pilar ? [D.pilar] : null;
  const cArgs = { ...args, p_cabang: D.cab || null, p_pilar: pil };
  const [matAll, days, kat, top, rugi] = await Promise.all([
    db.rpc("gp_cabang_pilar", args), db.rpc("gp_harian", cArgs), db.rpc("gp_kategori", cArgs),
    db.rpc("gp_top_barang", { ...cArgs, p_limit: 10 }), db.rpc("gp_rugi", { ...cArgs, p_limit: 300 })]);
  const allPilars = sortPilar([...new Set(matAll.map(r => r.pilar).concat(D.pilar ? [D.pilar] : []))]);
  const mPil = [...new Set(matAll.map(r => r.pilar))].filter(PILAR_TABS.service.match);
  const [kSewa, kMnt] = await Promise.all([
    db.rpc("pilar_cabang", { ...args, p_pilar: ["SEWA"] }).catch(() => []),
    mPil.length ? db.rpc("pilar_cabang", { ...args, p_pilar: mPil }).catch(() => []) : []]);
  const mat = D.pilar ? matAll.filter(r => r.pilar === D.pilar) : matAll;   // filter pilar
  const pilars = D.pilar ? [D.pilar] : allPilars;
  const sel = D.cab ? mat.filter(r => r.cabang === D.cab) : mat;            // filter cabang
  const T = withM(sumRows(sel)), TA = withM(sumRows(mat));
  const pAgg = pilars.map(p => [p, withM(sumRows(sel.filter(r => r.pilar === p)))]);
  const maxP = Math.max(0, ...pAgg.map(x => x[1].gp));
  const cabs = [...new Set(mat.map(r => r.cabang))].map(c => { const rs = mat.filter(r => r.cabang === c); return { c, t: withM(sumRows(rs)), p: pilars.map(p => sumRows(rs.filter(r => r.pilar === p)).gp) }; }).sort((a, b) => b.t.gp - a.t.gp);
  for (const c of S.cabangs) if (!cabs.some(x => x.c === c)) cabs.push({ c, t: withM(sumRows([])), p: pilars.map(() => 0) });
  const label = [D.cab || "Semua cabang", D.pilar].filter(Boolean).join(" · ");
  el.innerHTML = `<div style="display:grid;gap:14px">
  ${filterBar(true, allPilars)}
  ${!matAll.length ? `<div class="notice warn">Belum ada faktur pada periode ini.${D.bulan !== "semua" ? ` <button class="linkbtn" id="dAll">Lihat semua periode</button>` : " Unggah file Rincian Faktur Penjualan di menu Unggah Data."}</div>` : ""}
  ${kpiBand(kSewa, kMnt, mPil)}
  <div class="gp-hero">
    <div class="gp-main"><span class="l">Gross profit · ${esc(label)}</span><span class="v">${rp(T.gp)}</span><span class="s">Margin ${mPill(T.m, T.rev)} dari omzet ${rp(T.rev)}</span></div>
    <div class="kpi"><span class="l">Omzet</span><span class="v">${rpShort(T.rev)}</span><span class="s">${fmtN(T.inv)} faktur</span></div>
    <div class="kpi"><span class="l">HPP (harga beli)</span><span class="v">${rpShort(T.cost)}</span><span class="s">${fmtN(T.n)} baris barang/jasa</span></div>
    <div class="kpi"><span class="l">GP per faktur</span><span class="v">${rpShort(T.inv ? T.gp / T.inv : 0)}</span><span class="s">rata-rata</span></div>
  </div>
  <div class="gp-grid">
    <div class="card"><h3>Gross profit per pilar</h3><p class="sub">${esc(label)} · ${esc(periodeLabel())}</p>
      <div class="hbars">${pAgg.map(([p, a]) => `<div class="hbar"><div class="hbar-l">${esc(p)}</div><div class="hbar-t" role="img" aria-label="${esc(p)} ${rp(a.gp)}"><span style="width:${maxP > 0 ? Math.max(0, a.gp) / maxP * 100 : 0}%"></span></div><div class="hbar-v">${rp(a.gp)}<small>${T.gp ? Math.round(a.gp / T.gp * 100) : 0}% dari total</small></div></div>`).join("") || `<p class="sub">Tidak ada data.</p>`}</div>
      <div class="tablebox"><table><thead><tr><th>Pilar</th><th class="num">Omzet</th><th class="num">HPP</th><th class="num">Gross profit</th><th class="num">Margin</th><th class="num">Faktur</th></tr></thead><tbody>
      ${pAgg.map(([p, a]) => `<tr><td class="cab">${esc(p)}</td><td class="num">${rp(a.rev)}</td><td class="num">${rp(a.cost)}</td><td class="num"><b>${rp(a.gp)}</b></td><td class="num">${mPill(a.m, a.rev)}</td><td class="num">${fmtN(a.inv)}</td></tr>`).join("")}
      <tr class="tot"><td>TOTAL</td><td class="num">${rp(T.rev)}</td><td class="num">${rp(T.cost)}</td><td class="num">${rp(T.gp)}</td><td class="num">${mPill(T.m, T.rev)}</td><td class="num">${fmtN(T.inv)}</td></tr></tbody></table></div>
    </div>
    <div class="card"><h3>Tren gross profit harian</h3><p class="sub">${esc(label)} · arahkan kursor ke batang untuk detail</p>${trendSVG(days, "gross_profit")}</div>
  </div>
  <div class="card"><h3>Laporan per cabang</h3><p class="sub">Gross profit tiap cabang per pilar${D.pilar ? " (pilar " + esc(D.pilar) + ")" : ""}, ${esc(periodeLabel())}. Klik nama cabang untuk membuka laporannya.</p>
    <div class="tablebox"><table><thead><tr><th>Cabang</th>${pilars.map(p => `<th class="num">${esc(p)}</th>`).join("")}${pilars.length > 1 ? `<th class="num">Total GP</th>` : ""}<th class="num">Omzet</th><th class="num">Margin</th><th class="num">Faktur</th><th class="num">Porsi GP</th></tr></thead><tbody>
    ${cabs.map(m => `<tr${m.c === D.cab ? ' class="sel"' : ""}><td class="cab"><button class="linkbtn" data-cab="${esc(m.c)}">${esc(m.c)}</button></td>${m.p.map(g => `<td class="num">${g ? rp(g) : "–"}</td>`).join("")}${pilars.length > 1 ? `<td class="num"><b>${rp(m.t.gp)}</b></td>` : ""}<td class="num">${rp(m.t.rev)}</td><td class="num">${mPill(m.t.m, m.t.rev)}</td><td class="num">${fmtN(m.t.inv)}</td><td class="num">${TA.gp ? Math.round(m.t.gp / TA.gp * 100) : 0}%</td></tr>`).join("") || `<tr><td colspan="9" class="sub">Tidak ada data.</td></tr>`}
    ${cabs.length ? `<tr class="tot"><td>SEMUA CABANG</td>${pilars.map(p => `<td class="num">${rp(sumRows(mat.filter(r => r.pilar === p)).gp)}</td>`).join("")}${pilars.length > 1 ? `<td class="num">${rp(TA.gp)}</td>` : ""}<td class="num">${rp(TA.rev)}</td><td class="num">${mPill(TA.m, TA.rev)}</td><td class="num">${fmtN(TA.inv)}</td><td class="num">100%</td></tr>` : ""}</tbody></table></div></div>
  <div class="gp-grid">
    ${katCard(kat, label)}
    <div class="card"><h3>10 barang/jasa penyumbang GP terbesar</h3><p class="sub">${esc(label)}</p><div class="tablebox"><table><thead><tr><th>Barang / jasa</th><th class="num">Qty</th><th class="num">Omzet</th><th class="num">Gross profit</th></tr></thead><tbody>
      ${top.map(b => `<tr><td style="white-space:normal;min-width:220px">${esc(b.nama_barang)}</td><td class="num">${fmtN(b.qty)}</td><td class="num">${rp(b.omzet)}</td><td class="num"><b>${rp(b.gross_profit)}</b></td></tr>`).join("") || `<tr><td colspan="4" class="sub">Tidak ada data.</td></tr>`}</tbody></table></div></div>
  </div>
  ${rugiCard(rugi)}
  <p class="sub">Cara hitung: <b>Gross profit = TOTAL HARGA − HARGA BELI − biaya sewa vendor</b>. HARGA BELI dari faktur penjualan Accurate (sudah untuk seluruh qty). Biaya sewa vendor diambil dari <b>Faktur Pembelian</b> (barang SEWA, mis. SEWA LAPTOP), dijumlah per cabang per bulan lalu dibagi ke penjualan pilar SEWA cabang & bulan yang sama sesuai QTY. Biaya teknisi belum termasuk.</p>
  </div>`;
  const re = () => pageDashboard(el);
  bindFilter(el, re);
  const all = $("#dAll", el); if (all) all.onclick = () => { D.bulan = "semua"; re(); };
  el.querySelectorAll("[data-cab]").forEach(b => b.onclick = () => { D.cab = D.cab === b.dataset.cab ? "" : b.dataset.cab; re(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  bindTrend(el, days, d => `GP ${rp(d.gross_profit)}<br>Omzet ${rp(d.omzet)} · ${fmtN(d.jumlah_faktur)} faktur`);
  el.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => go(b.dataset.goto));
}
/* KPI utama: unit tersewa & GP Service & Maintenance Corporate (ikut filter cabang & bulan, tidak ikut filter pilar) */
const KPI_TARGET = { unit: 918, corporate: 162 };   // target per bulan, untuk semua cabang
function kpiBand(kSewa, kMnt, mPil) {
  kMnt = kMnt.map(r => ({ ...r, pelanggan: r.pelanggan_corporate }));   // hanya kategori pelanggan CORPORATE
  const pick = rs => D.cab ? rs.filter(r => r.cabang === D.cab) : rs;
  const sum = rs => rs.reduce((o, r) => (o.rev += +r.omzet, o.gp += +r.gross_profit, o.inv += +r.jumlah_faktur, o.unit += +r.unit, o.pel += +r.pelanggan, o), { rev: 0, gp: 0, inv: 0, unit: 0, pel: 0 });
  const a = sum(pick(kSewa)), b = sum(pick(kMnt));
  const satuBulan = /^\d{4}-\d{2}$/.test(D.bulan) && !D.cab;
  const rank = (rs, f) => { if (!D.cab) return ""; const l = lengkapiCabang(rs).map(r => ({ c: r.cabang, v: +f(r) || 0 })).sort((x, y) => y.v - x.v); const rk = peringkat(l); const i = l.findIndex(r => r.c === D.cab); return i < 0 ? "" : ` · peringkat ${rk[i]} dari ${l.length} cabang`; };
  const prog = (v, t, unit) => { const p = t ? v / t : 0; return `<div style="display:grid;gap:4px;margin-top:6px"><div style="height:8px;border-radius:999px;background:var(--line);overflow:hidden" role="img" aria-label="${Math.round(p * 100)}% dari target"><span style="display:block;height:100%;width:${Math.min(100, p * 100)}%;background:${p >= 1 ? "var(--ok)" : "var(--accent)"}"></span></div><span style="font-size:12px;color:var(--muted)"><b style="color:var(--ink)">${Math.round(p * 100)}%</b> dari target ${fmtN(t)} ${unit}/bulan${p < 1 ? ` · kurang ${fmtN(Math.max(0, t - v))}` : " · tercapai"}</span></div>`; };
  const box = (inner, goto) => `<div style="background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:var(--r);padding:14px 16px;display:grid;gap:4px;align-content:start;min-width:0">${inner}<button class="linkbtn" data-goto="${goto}" style="justify-self:start;margin-top:6px;font-size:12.5px">Buka tab ${goto === "sewa" ? "Sewa" : "Service & Maintenance Corporate"} →</button></div>`;
  const lab = t => `<span style="font-size:11.5px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;color:var(--accent)">KPI · ${t}</span>`;
  const big = (v, small) => `<span style="font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums">${v}${small ? ` <small style="font-size:14px;font-weight:600">${small}</small>` : ""}</span>`;
  const sub = t => `<span style="font-size:12.5px;color:var(--muted)">${t}</span>`;
  return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:10px">
    ${box(lab("Unit tersewa") + big(fmtN(a.unit), "unit") + sub(`${esc(D.cab || "Semua cabang")} · ${esc(periodeLabel())} · ${fmtN(a.inv)} transaksi, ${fmtN(a.pel)} pelanggan · GP sewa ${rp(a.gp)}${rank(kSewa, r => +r.unit)}`) + (satuBulan ? prog(a.unit, KPI_TARGET.unit, "unit") : ""), "sewa")}
    ${box(lab("Gross profit Service & Maintenance Corporate") + big(rp(b.gp)) + sub(mPil.length ? `${esc(D.cab || "Semua cabang")} · ${esc(periodeLabel())} · margin ${b.rev ? pct(b.gp / b.rev) : "–"} dari omzet ${rp(b.rev)}${rank(kMnt, r => +r.gross_profit)}` : "Belum ada faktur dengan pilar yang mengandung kata MAINTENANCE pada periode ini.") + sub(`<b style="color:var(--ink)">${fmtN(b.pel)}</b> corporate termaintenance · ${fmtN(b.inv)} transaksi`) + (satuBulan ? prog(b.pel, KPI_TARGET.corporate, "corporate") : ""), "service")}
  </div>`;
}
function katCard(kat, label, extraCol) {
  return `<div class="card"><h3>GP per kategori penjualan</h3><p class="sub">${esc(label)}</p><div class="tablebox"><table><thead><tr><th>Pilar</th><th>Kategori penjualan</th>${extraCol ? `<th class="num">${extraCol[1]}</th>` : ""}<th class="num">Omzet</th><th class="num">Gross profit</th><th class="num">Margin</th></tr></thead><tbody>
    ${kat.map(k => `<tr><td>${esc(k.pilar)}</td><td>${esc(k.kategori_penjualan)}</td>${extraCol ? `<td class="num">${fmtN(k[extraCol[0]])}</td>` : ""}<td class="num">${rp(k.omzet)}</td><td class="num"><b>${rp(k.gross_profit)}</b></td><td class="num">${mPill(+k.omzet ? k.gross_profit / k.omzet : 0, +k.omzet)}</td></tr>`).join("") || `<tr><td colspan="6" class="sub">Tidak ada data.</td></tr>`}</tbody></table></div></div>`;
}
function rugiCard(rugi) {
  return `<div class="card"><h3>Dijual di bawah harga beli <span class="pill ${rugi.length ? "bad" : "ok"}">${fmtN(rugi.length)} baris</span></h3>
    <p class="sub">${rugi.length ? `Total kerugian ${rp(-rugi.reduce((s, r) => s + +r.gross_profit, 0))}. Cek apakah harga jual salah input atau HPP di Accurate terlalu tinggi.` : "Tidak ada penjualan rugi pada filter ini."}</p>
    ${rugi.length ? `<div class="tablebox" style="max-height:340px"><table><thead><tr><th>Cabang</th><th>Tanggal</th><th>No faktur</th><th>Barang</th><th class="num">Qty</th><th class="num">Harga beli</th><th class="num">Total jual</th><th class="num">GP</th></tr></thead><tbody>
    ${rugi.map(r => `<tr><td class="cab">${esc(r.cabang)}</td><td>${fmtDate(r.tgl_faktur)}</td><td class="mono">${esc(r.no_faktur)}</td><td style="white-space:normal;min-width:200px">${esc(r.nama_barang)}</td><td class="num">${fmtN(r.qty)}</td><td class="num">${rp(r.harga_beli)}</td><td class="num">${rp(r.total_harga)}</td><td class="num" style="color:var(--bad)"><b>${rp(r.gross_profit)}</b></td></tr>`).join("")}</tbody></table></div>` : ""}</div>`;
}

/* =================== TAB PILAR: SEWA & SERVICE & MAINTENANCE =================== */
const PILAR_TABS = {
  sewa: { title: "Sewa", match: p => p === "SEWA", extra: "unit",
    note: "Jumlah unit = QTY baris faktur pilar SEWA yang kategori barangnya SEWA atau LAPTOP. Aksesoris, sparepart/lisensi, jasa, dll. tidak dihitung sebagai unit." },
  service: { title: "Service & Maintenance Corporate", match: p => /MAINTENANCE/.test(p), extra: "corporate",
    note: "Hanya pilar yang namanya mengandung MAINTENANCE (pilar SERVICE biasa tidak ikut). Corporate termaintenance = jumlah pelanggan berkategori CORPORATE yang bertransaksi; satu perusahaan dihitung satu walau punya beberapa transaksi." }
};
const pageSewa = el => pagePilar(el, "sewa");
const pageService = el => pagePilar(el, "service");
async function pagePilar(el, key) {
  const C = PILAR_TABS[key];
  await loadBulan();
  const [dari, sampai] = periode();
  const args = { p_dari: dari || null, p_sampai: sampai || null };
  const known = await db.rpc("gp_cabang_pilar", { p_dari: null, p_sampai: null });
  const pil = [...new Set(known.map(r => r.pilar))].filter(C.match);
  const pArr = pil.length ? pil : (key === "sewa" ? ["SEWA"] : ["SERVICE & MAINTENANCE CORPORATE"]);
  const adaPilar = [...new Set(known.map(r => r.pilar))];
  const cArgs = { ...args, p_cabang: D.cab || null, p_pilar: pArr };
  const corp = C.extra === "corporate";
  const [vend, sendiri, rinSewa] = corp ? [[], [], []] : await Promise.all([db.rpc("sewa_vendor", args).catch(() => []), db.rpc("sewa_unit_sendiri", { ...args, p_cabang: D.cab || null }).catch(() => []),
    db.rpc("insentif_sewa_rincian", { ...args, p_cabang: D.cab || null, p_basis: SB }).then(hitungInsentif).catch(() => [])]);
  const [cab0, days, kat, cust] = await Promise.all([
    db.rpc("pilar_cabang", { ...args, p_pilar: pArr }), db.rpc("gp_harian", cArgs), db.rpc("gp_kategori", cArgs),
    db.rpc("pilar_pelanggan", { ...cArgs, p_corporate: corp, p_urut: corp ? "transaksi" : "unit", p_limit: 100 })]);
  // corporate termaintenance = pelanggan berkategori CORPORATE saja
  const cab = corp ? cab0.map(r => ({ ...r, pelanggan: r.pelanggan_corporate })) : cab0;
  const rows = D.cab ? cab.filter(r => r.cabang === D.cab) : cab;
  const s = rows.reduce((o, r) => (o.rev += +r.omzet, o.cost += +r.hpp, o.gp += +r.gross_profit, o.inv += +r.jumlah_faktur, o.unit += +r.unit, o.tc += +r.transaksi_corporate, o.pc += +r.pelanggan_corporate, o.pel += +r.pelanggan, o), { rev: 0, cost: 0, gp: 0, inv: 0, unit: 0, tc: 0, pc: 0, pel: 0 });
  s.m = s.rev ? s.gp / s.rev : 0;
  const label = (D.cab || "Semua cabang") + " · " + periodeLabel();
  const sorted = [...(D.cab ? rows : lengkapiCabang(rows))].sort((a, b) => corp ? (b.pelanggan - a.pelanggan || b.gross_profit - a.gross_profit) : (b.unit - a.unit || b.gross_profit - a.gross_profit));
  el.innerHTML = `<div style="display:grid;gap:14px">
  <div class="toolbar" style="justify-content:space-between">${filterBar(false)}<button id="pDl">Unduh Excel rekonsiliasi</button></div>
  <p class="sub">Pilar: <b>${esc(pArr.join(", "))}</b>. ${esc(C.note)}</p>
  ${!pil.length ? `<div class="notice warn">Belum ada faktur dengan pilar ${key === "sewa" ? "SEWA" : "yang mengandung kata MAINTENANCE"} di data yang diunggah. Pilar yang ada: ${esc(adaPilar.join(", ") || "-")}.</div>` : !cab.length ? `<div class="notice warn">Belum ada faktur ${esc(C.title)} pada periode ini.${D.bulan !== "semua" ? ` <button class="linkbtn" id="dAll">Lihat semua periode</button>` : ""}</div>` : ""}
  <div class="gp-hero">
    <div class="gp-main"><span class="l">Gross profit ${esc(C.title)} · ${esc(D.cab || "Semua cabang")}</span><span class="v">${rp(s.gp)}</span><span class="s">Margin ${mPill(s.m, s.rev)} dari omzet ${rp(s.rev)}</span></div>
    ${corp ? `<div class="kpi"><span class="l">Corporate termaintenance</span><span class="v">${fmtN(s.pel)} <small style="font-size:13px;font-weight:600">corporate</small></span><span class="s">dengan ${fmtN(s.inv)} transaksi</span></div>`
           : `<div class="kpi"><span class="l">Unit disewakan (QTY)</span><span class="v">${fmtN(s.unit)} <small style="font-size:13px;font-weight:600">unit</small></span><span class="s">${fmtN(s.pel)} pelanggan sewa</span></div>`}
    ${corp ? `<div class="kpi"><span class="l">Omzet</span><span class="v">${rpShort(s.rev)}</span><span class="s">HPP ${rpShort(s.cost)}</span></div>` : `<div class="kpi"><span class="l">Jumlah transaksi</span><span class="v">${fmtN(s.inv)}</span><span class="s">faktur ${esc(C.title)}</span></div>`}
    <div class="kpi"><span class="l">${corp ? "GP per corporate" : "GP per unit"}</span><span class="v">${rpShort(corp ? (s.pel ? s.gp / s.pel : 0) : (s.unit ? s.gp / s.unit : 0))}</span><span class="s">rata-rata</span></div>
  </div>
  ${corp ? `<div class="gp-grid">
    ${barCabang("Gross profit Maintenance per cabang", periodeLabel(), cab, r => r.gross_profit, rp)}
    ${barCabang("Corporate termaintenance per cabang", periodeLabel() + " · jumlah perusahaan", cab, r => r.pelanggan, v => fmtN(v) + " corporate")}
  </div>` : barCabang("Unit tersewa per cabang", periodeLabel() + " · QTY barang SEWA/LAPTOP", cab, r => r.unit, v => fmtN(v) + " unit")}
  <div class="gp-grid">
    <div class="card"><h3>${corp ? "Corporate termaintenance per hari" : "Unit disewakan per hari"}</h3><p class="sub">${esc(label)} · jumlah ${corp ? "corporate yang bertransaksi di hari itu" : "unit"}</p>${trendSVG(days, corp ? "pelanggan" : "unit", true)}</div>
    <div class="card"><h3>Gross profit ${esc(C.title)} per hari</h3><p class="sub">${esc(label)}</p>${trendSVG(days, "gross_profit")}</div>
  </div>
  <div class="card"><h3>Laporan ${esc(C.title)} per cabang</h3><p class="sub">${esc(periodeLabel())}. Klik nama cabang untuk membuka laporannya.</p>
    <div class="tablebox"><table><thead><tr><th>Cabang</th>${corp ? `<th class="num">Corporate termaintenance</th><th class="num">Transaksi</th>` : `<th class="num">Unit (QTY)</th><th class="num">Pelanggan sewa</th><th class="num">Transaksi</th>`}<th class="num">Omzet</th><th class="num">HPP</th><th class="num">Gross profit</th><th class="num">Margin</th></tr></thead><tbody>
    ${sorted.map(r => `<tr${r.cabang === D.cab ? ' class="sel"' : ""}><td class="cab"><button class="linkbtn" data-cab="${esc(r.cabang)}">${esc(r.cabang)}</button></td>${corp ? `<td class="num"><b>${fmtN(r.pelanggan)}</b></td><td class="num">${fmtN(r.jumlah_faktur)}</td>` : `<td class="num"><b>${fmtN(r.unit)}</b></td><td class="num">${fmtN(r.pelanggan)}</td><td class="num">${fmtN(r.jumlah_faktur)}</td>`}<td class="num">${rp(r.omzet)}</td><td class="num">${rp(r.hpp)}</td><td class="num"><b>${rp(r.gross_profit)}</b></td><td class="num">${mPill(+r.omzet ? r.gross_profit / r.omzet : 0, +r.omzet)}</td></tr>`).join("") || `<tr><td colspan="9" class="sub">Tidak ada data.</td></tr>`}
    ${sorted.length > 1 || D.cab ? (() => { const a = cab.reduce((o, r) => (o.rev += +r.omzet, o.cost += +r.hpp, o.gp += +r.gross_profit, o.inv += +r.jumlah_faktur, o.unit += +r.unit, o.tc += +r.transaksi_corporate, o.pc += +r.pelanggan_corporate, o.pel += +r.pelanggan, o), { rev: 0, cost: 0, gp: 0, inv: 0, unit: 0, tc: 0, pc: 0, pel: 0 }); return `<tr class="tot"><td>SEMUA CABANG</td>${corp ? `<td class="num">${fmtN(a.pel)}</td><td class="num">${fmtN(a.inv)}</td>` : `<td class="num">${fmtN(a.unit)}</td><td class="num">${fmtN(a.pel)}</td><td class="num">${fmtN(a.inv)}</td>`}<td class="num">${rp(a.rev)}</td><td class="num">${rp(a.cost)}</td><td class="num">${rp(a.gp)}</td><td class="num">${mPill(a.rev ? a.gp / a.rev : 0, a.rev)}</td></tr>`; })() : ""}
    </tbody></table></div></div>
  <div class="card"><h3>${corp ? "Daftar corporate termaintenance" : "Pelanggan sewa"}</h3><p class="sub">${esc(label)} · diurutkan menurut ${corp ? "jumlah transaksi" : "jumlah unit"}</p>
    <div class="tablebox" style="max-height:420px"><table><thead><tr><th>Cabang</th><th>Pelanggan</th><th>ID</th><th>Kategori</th><th>No WA</th>${corp ? "" : `<th class="num">Unit</th>`}<th class="num">Transaksi</th><th class="num">Omzet</th><th class="num">Gross profit</th><th>Transaksi terakhir</th></tr></thead><tbody>
    ${cust.map(c => `<tr><td class="cab">${esc(c.cabang)}</td><td style="white-space:normal;min-width:180px">${esc(c.nama)}</td><td class="mono">${esc(c.id_pelanggan)}</td><td>${esc(c.kategori_pelanggan)}</td><td class="mono">${esc(c.no_wa)}</td>${corp ? "" : `<td class="num"><b>${fmtN(c.unit)}</b></td>`}<td class="num">${corp ? `<b>${fmtN(c.jumlah_faktur)}</b>` : fmtN(c.jumlah_faktur)}</td><td class="num">${rp(c.omzet)}</td><td class="num">${rp(c.gross_profit)}</td><td>${fmtDate(c.faktur_terakhir)}</td></tr>`).join("") || `<tr><td colspan="10" class="sub">Tidak ada data.</td></tr>`}</tbody></table></div></div>
  ${corp ? "" : vendorCard(D.cab ? vend.filter(v => v.cabang === D.cab) : vend)}
  ${corp ? "" : sendiriCard(sendiri, label)}
  ${corp ? "" : `<div class="toolbar">${basisSelect()}</div>` + insentifCard(rinSewa, label)}
  ${katCard(kat, label, corp ? null : ["unit", "Unit"])}
  </div>`;
  const re = () => pagePilar(el, key);
  if (!corp) { bindPengajuan(el, rinSewa, dari, sampai); bindBasis(el, re); }
  $("#pDl", el).onclick = async () => { const b = $("#pDl", el); b.disabled = true; try { await unduhDenganProgres(key, D.cab || null, dari || null, sampai || null); } catch (e) {} b.disabled = false; };
  bindFilter(el, re);
  const all = $("#dAll", el); if (all) all.onclick = () => { D.bulan = "semua"; re(); };
  el.querySelectorAll("[data-cab]").forEach(b => b.onclick = () => { D.cab = D.cab === b.dataset.cab ? "" : b.dataset.cab; re(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  bindTrend(el, days, d => corp ? `${fmtN(d.pelanggan)} corporate · ${fmtN(d.jumlah_faktur)} transaksi<br>GP ${rp(d.gross_profit)} · Omzet ${rp(d.omzet)}` : `${fmtN(d.unit)} unit · ${fmtN(d.jumlah_faktur)} transaksi<br>GP ${rp(d.gross_profit)} · Omzet ${rp(d.omzet)}`);
}

function vendorCard(v) {
  const gp = r => r.gp_sewa != null ? +r.gp_sewa : r.omzet_sewa - r.biaya_vendor;
  const t = v.reduce((o, r) => (o.b += +r.biaya_vendor, o.o += +r.omzet_sewa, o.uv += +r.unit_vendor, o.us += +r.unit_sewa, o.ui += +(r.unit_sendiri || 0), o.hb += +(r.harga_beli_faktur || 0), o.g += gp(r), o), { b: 0, o: 0, uv: 0, us: 0, ui: 0, hb: 0, g: 0 });
  const st = r => +r.biaya_vendor && !+r.omzet_sewa ? `<span class="pill bad">Ada pembelian, belum ada penjualan sewa</span>`
    : +r.biaya_vendor && +r.harga_beli_faktur && !+r.vendor_terpotong ? `<span class="pill ok">Sudah di HARGA BELI faktur</span>`
    : !+r.biaya_vendor && +r.omzet_sewa ? (+r.harga_beli_faktur ? `<span class="pill ok">HPP dari HARGA BELI faktur</span>` : +r.unit_sendiri ? `<span class="pill ok">Unit milik sendiri</span>` : `<span class="pill warn">Tanpa biaya vendor</span>`) : `<span class="pill ok">Terpotong</span>`;
  return `<div class="card"><h3>Biaya sewa vendor & unit milik sendiri</h3>
    <p class="sub">Biaya vendor = pembelian barang SEWA per cabang per bulan dari Faktur Pembelian. Biaya ini hanya dipotong dari baris sewa yang <b>HARGA BELI</b>-nya kosong di faktur penjualan; kalau HARGA BELI sudah diisi (biasanya sudah berisi biaya vendor), tidak dipotong lagi supaya tidak dobel. GP sewa = omzet − HARGA BELI faktur − biaya vendor yang terpotong.</p>
    <div class="tablebox"><table><thead><tr><th>Cabang</th><th>Bulan</th><th class="num">Unit disewakan</th><th class="num">Unit dari vendor</th><th class="num">Unit milik sendiri</th><th class="num">Omzet sewa</th><th class="num">HARGA BELI faktur</th><th class="num">Biaya vendor (pembelian)</th><th class="num">GP sewa</th><th>Status</th></tr></thead><tbody>
    ${v.map(r => `<tr><td class="cab">${esc(r.cabang)}</td><td>${esc(namaBulan(String(r.bulan).slice(0, 7)))}</td><td class="num">${fmtN(r.unit_sewa)}</td><td class="num">${fmtN(r.unit_vendor)}</td><td class="num">${fmtN(r.unit_sendiri || 0)}</td><td class="num">${rp(r.omzet_sewa)}</td><td class="num">${rp(r.harga_beli_faktur || 0)}</td><td class="num">${rp(r.biaya_vendor)}</td><td class="num"><b${gp(r) < 0 ? ' style="color:var(--bad)"' : ""}>${rp(gp(r))}</b></td><td>${st(r)}</td></tr>`).join("") || `<tr><td colspan="10" class="sub">Belum ada data sewa atau pembelian sewa pada periode ini.</td></tr>`}
    ${v.length > 1 ? `<tr class="tot"><td colspan="2">TOTAL</td><td class="num">${fmtN(t.us)}</td><td class="num">${fmtN(t.uv)}</td><td class="num">${fmtN(t.ui)}</td><td class="num">${rp(t.o)}</td><td class="num">${rp(t.hb)}</td><td class="num">${rp(t.b)}</td><td class="num">${rp(t.g)}</td><td></td></tr>` : ""}</tbody></table></div></div>`;
}
function sendiriCard(rows, label) {
  const tot = rows.reduce((a, r) => a + (+r.qty || 0), 0);
  const byName = new Map(); for (const r of rows) byName.set(r.nama_barang, (byName.get(r.nama_barang) || 0) + (+r.qty || 0));
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="card"><h3>Unit milik sendiri yang tersewa <span class="pill ${rows.length ? "ok" : "warn"}">${fmtN(tot)} unit</span></h3>
    <p class="sub">${esc(label)} · dari <b>Rincian Pemindahan Barang</b> (gudang tujuan/dari mengandung kata SEWA). Kolom "Faktur sewa di hari yang sama" mencocokkan cabang + tanggal, karena laporan pemindahan belum memuat nomor faktur atau nama pelanggan.</p>
    ${top.length ? `<p class="sub" style="margin-top:0">Paling sering: ${top.map(([n, q]) => `${esc(n)} <b>(${fmtN(q)})</b>`).join(" · ")}</p>` : ""}
    <div class="tablebox" style="max-height:420px"><table><thead><tr><th>Cabang</th><th>Tanggal</th><th>Kode</th><th>Nama barang</th><th class="num">Qty</th><th>Gudang</th><th>Faktur sewa di hari yang sama</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="cab">${esc(r.cabang)}</td><td>${fmtDate(r.tanggal)}</td><td class="mono">${esc(r.kode_barang || "")}</td><td style="white-space:normal;min-width:220px"><b>${esc(r.nama_barang)}</b>${r.nomor ? `<br><span class="sub mono">${esc(r.nomor)}</span>` : ""}${r.keterangan ? `<br><span class="sub">${esc(r.keterangan)}</span>` : ""}</td><td class="num">${fmtN(r.qty)} ${esc(r.satuan || "")}</td><td>${esc(r.gudang || "")}</td><td style="white-space:normal;min-width:240px">${r.faktur_sewa_hari_itu ? esc(r.faktur_sewa_hari_itu).split("; ").join("<br>") : `<span class="pill warn">Belum ada faktur sewa di tanggal ini</span>`}</td></tr>`).join("") || `<tr><td colspan="7" class="sub">Belum ada data pemindahan ke/dari gudang sewa pada periode ini. Unggah file Rincian Pemindahan Barang di menu Unggah Data.</td></tr>`}</tbody></table></div></div>`;
}

/* =================== PENCAPAIAN SALES & INSENTIF SEWA =================== */
let SB = LS.get("mfdc-basis") || "default";   // basis nama sales
const BASIS = { default: "Nama Default Penjual", menjual: "Yang Menyerahkan / Menjual" };
const salesArgs = (args, pilar) => ({ ...args, p_cabang: D.cab || null, p_pilar: pilar, p_basis: SB });
function barList(title, sub, list, fmt, opt = {}) {
  list = list.filter(x => opt.keepZero || x.v > 0).sort((a, b) => b.v - a.v || a.c.localeCompare(b.c));
  const max = Math.max(0, ...list.map(x => x.v)), tot = list.reduce((a, x) => a + x.v, 0); const rk = peringkat(list);
  return `<div class="card"><h3>${esc(title)}</h3><p class="sub">${esc(sub)} · ${fmtN(list.length)} sales</p>
    <div class="hbars rank" style="max-height:${opt.maxH || 560}px;overflow:auto">${list.map((x, i) => `<div class="hbar"><div class="hbar-l"><span class="rk">${rk[i]}</span><span>${esc(x.c)}${x.sub ? `<br><small style="color:var(--muted);font-weight:500">${esc(x.sub)}</small>` : ""}</span></div><div class="hbar-t" role="img" aria-label="${esc(x.c)}: ${esc(fmt(x.v))}"><span style="width:${max > 0 ? Math.max(0, x.v) / max * 100 : 0}%"></span></div><div class="hbar-v">${esc(fmt(x.v))}${x.note ? `<small>${esc(x.note)}</small>` : `<small>${tot ? Math.round(x.v / tot * 100) : 0}% dari total</small>`}</div></div>`).join("") || `<p class="sub">Belum ada pencapaian pada filter ini.</p>`}</div>
    ${list.length ? `<p class="sub" style="margin-top:0">Total: <b>${esc(fmt(tot))}</b></p>` : ""}</div>`;
}
/* =================== PENGAJUAN INSENTIF SEWA (file Excel berformat, tanpa library tambahan) =================== */
// Aturan pengali per unit:
//  - sewa BULANAN: selalu Rp 25.000
//  - harian/mingguan dengan gross profit per unit >= Rp 100.000: Rp 25.000
//  - harian/mingguan dengan gross profit per unit < Rp 100.000: Rp 5.000
// Durasi tidak tercatat di Accurate, jadi ditebak dari harga per unit (>= Rp 250.000 = bulanan); bisa diubah di Excel.
const INS = { tinggi: 25000, rendah: 5000, batasGP: 100000, batasBulanan: 250000 };
const durasiTebak = r => (+r.total_harga / (+r.unit || 1)) >= INS.batasBulanan ? "Bulanan" : "Harian";
const pengaliUnit = (durasi, gpUnit) => durasi === "Bulanan" || gpUnit >= INS.batasGP ? INS.tinggi : INS.rendah;
function hitungInsentif(rows) {
  return rows.map(r => { const unit = +r.unit || 0, gpu = unit ? +r.gross_profit / unit : 0, durasi = durasiTebak(r), p = pengaliUnit(durasi, gpu);
    return { ...r, unit, gpu, durasi, pengali: p, insentif: unit * p, diajukan: r.sales !== "TANPA NAMA SALES" }; });
}
function insentifPerSales(rin) {
  const m = new Map();
  for (const r of rin) { if (!r.diajukan) continue; const o = m.get(r.sales) || { sales: r.sales, cabang: new Set(), u25: 0, u5: 0, unit: 0, gp: 0, ins: 0, trx: new Set() };
    o.cabang.add(r.cabang); o.unit += r.unit; o.gp += +r.gross_profit; o.ins += r.insentif; o.trx.add(r.cabang + r.no_faktur); if (r.pengali === INS.tinggi) o.u25 += r.unit; else o.u5 += r.unit; m.set(r.sales, o); }
  return [...m.values()].map(o => ({ ...o, cabang: [...o.cabang].join(", "), trx: o.trx.size })).sort((a, b) => b.ins - a.ins || b.unit - a.unit);
}

// ---- penulis ZIP sederhana (tanpa kompresi) ----
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) {
  const enc = new TextEncoder(), parts = [], central = []; let off = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name), db = typeof data === "string" ? enc.encode(data) : data, crc = crc32(db);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, db.length, true); h.setUint32(22, db.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, db.length, true); c.setUint32(24, db.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb); off += 30 + nb.length + db.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const b64bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const xe = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colN = n => { let s = ""; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const xlDate = d => { const [y, m, dd] = String(d).slice(0, 10).split("-").map(Number); return (Date.UTC(y, m - 1, dd) - Date.UTC(1899, 11, 30)) / 864e5; };

// ---- gaya sel (indeks cellXfs) ----
const ST = { def: 0, title: 1, addr: 2, label: 3, text: 4, head: 5, dText: 6, dCenter: 7, dRp: 8, dNum: 9, tLabel: 10, tNum: 11, tRp: 12, yellow: 13, note: 14, sLabel: 15, sName: 16, sJob: 17, box: 18, dDate: 19, dInp: 20, kLabel: 21, dana: 22, noteB: 23, dRpBold: 24 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="_(&quot;Rp&quot;* #,##0_);_(&quot;Rp&quot;* \\(#,##0\\);_(&quot;Rp&quot;* &quot;-&quot;_);_(@_)"/><numFmt numFmtId="165" formatCode="#,##0;-#,##0;&quot;-&quot;"/><numFmt numFmtId="166" formatCode="dd-mmm-yy"/></numFmts>
<fonts count="10"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font><font><b/><sz val="9"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><sz val="9"/><name val="Arial"/></font><font><i/><sz val="8"/><color rgb="FF808080"/><name val="Arial"/></font><font><b/><i/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font><font><i/><sz val="9"/><name val="Arial"/></font><font><b/><sz val="9"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4CC"/></patternFill></fill></fills>
<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border><border><left style="medium"/><right style="medium"/><top style="medium"/><bottom style="medium"/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="25">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="165" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="165" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="3" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="166" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="9" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

// ---- pembentuk sheet ----
function Sheet() {
  const rows = new Map(), merges = [], heights = {};
  const put = (r, c, cell) => { if (!rows.has(r)) rows.set(r, new Map()); rows.get(r).set(c, cell); };
  return {
    s: (r, c, v, st = 0) => put(r, c, { t: "s", v, st }),
    n: (r, c, v, st = 0) => put(r, c, { t: "n", v, st }),
    f: (r, c, f, v, st = 0) => put(r, c, { t: "f", f, v, st }),
    e: (r, c, st) => put(r, c, { t: "e", st }),
    m: (a, b) => merges.push(`${a}:${b}`),
    h: (r, ht) => { heights[r] = ht; },
    xml(extra = {}) {
      const rs = [...rows.keys()].concat(Object.keys(heights).map(Number)).filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
      const body = rs.map(r => { const cs = rows.get(r) || new Map();
        const cells = [...cs.keys()].sort((a, b) => a - b).map(c => { const x = cs.get(c), ref = colN(c) + r, st = x.st ? ` s="${x.st}"` : "";
          if (x.t === "s") return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xe(x.v)}</t></is></c>`;
          if (x.t === "n") return `<c r="${ref}"${st}><v>${x.v}</v></c>`;
          if (x.t === "f") return `<c r="${ref}"${st}${typeof x.v === "string" ? ' t="str"' : ""}><f>${xe(x.f)}</f>${x.v != null ? `<v>${xe(x.v)}</v>` : ""}</c>`;
          return `<c r="${ref}"${st}/>`; }).join("");
        return `<row r="${r}"${heights[r] ? ` ht="${heights[r]}" customHeight="1"` : ""}>${cells}</row>`; }).join("");
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr>${extra.fit ? '<pageSetUpPr fitToPage="1"/>' : ""}</sheetPr><sheetViews><sheetView workbookViewId="0"${extra.noGrid ? ' showGridLines="0"' : ""}${extra.tab ? ' tabSelected="1"' : ""}>${extra.freeze || ""}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/><cols>${extra.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${body}</sheetData>${extra.filter ? `<autoFilter ref="${extra.filter}"/>` : ""}${merges.length ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}${extra.dv || ""}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${extra.land ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>${extra.drawing ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
    }
  };
}

function buatPengajuanXlsx(rin, o) {
  // ---------- sheet 2: Rincian Transaksi ----------
  const R = Sheet(), S2 = "'Rincian Transaksi'!";
  const hd = ["TANGGAL", "NO FAKTUR", "CABANG", "NAMA SALES", "PELANGGAN", "BARANG", "UNIT", "TOTAL HARGA", "HARGA / UNIT", "GROSS PROFIT", "GP / UNIT", "DURASI SEWA", "PENGALI / UNIT", "INSENTIF", "DIAJUKAN", "CATATAN"];
  hd.forEach((h, j) => R.s(1, j + 1, h, ST.head)); R.h(1, 30);
  const rows = [...rin].sort((a, b) => (a.sales === "TANPA NAMA SALES") - (b.sales === "TANPA NAMA SALES") || a.sales.localeCompare(b.sales) || a.cabang.localeCompare(b.cabang) || String(a.tgl_faktur).localeCompare(String(b.tgl_faktur)) || a.no_faktur.localeCompare(b.no_faktur));
  rows.forEach((r, k) => { const i = k + 2;
    R.n(i, 1, xlDate(r.tgl_faktur), ST.dDate); R.s(i, 2, r.no_faktur, ST.dText); R.s(i, 3, r.cabang, ST.dText); R.s(i, 4, r.sales, ST.dText); R.s(i, 5, r.pelanggan || "-", ST.dText); R.s(i, 6, r.barang || "-", ST.dText);
    R.n(i, 7, r.unit, ST.dNum); R.n(i, 8, +r.total_harga, ST.dRp); R.f(i, 9, `H${i}/G${i}`, +r.total_harga / r.unit, ST.dRp); R.n(i, 10, Math.round(+r.gross_profit), ST.dRp); R.f(i, 11, `J${i}/G${i}`, r.gpu, ST.dRp);
    R.s(i, 12, r.durasi, ST.dInp); R.f(i, 13, `IF(OR(L${i}="Bulanan",K${i}>=${INS.batasGP}),${INS.tinggi},${INS.rendah})`, r.pengali, ST.dRp); R.f(i, 14, `G${i}*M${i}`, r.insentif, ST.dRp);
    R.s(i, 15, r.diajukan ? "Ya" : "Tidak", ST.dInp); R.s(i, 16, r.diajukan ? (r.sales_lain ? `Yang menyerahkan/menjual: ${r.sales_lain}` : "") : "Nama sales kosong di Accurate", ST.dText); });
  const last = Math.max(2, rows.length + 1), tr = last + 1;
  R.s(tr, 1, "TOTAL", ST.tLabel); for (let j = 2; j <= 16; j++) R.e(tr, j, ST.tLabel);
  R.f(tr, 7, `SUM(G2:G${last})`, rows.reduce((a, r) => a + r.unit, 0), ST.tNum); R.f(tr, 8, `SUM(H2:H${last})`, rows.reduce((a, r) => a + +r.total_harga, 0), ST.tRp);
  R.f(tr, 10, `SUM(J2:J${last})`, rows.reduce((a, r) => a + Math.round(+r.gross_profit), 0), ST.tRp); R.f(tr, 14, `SUMIFS(N2:N${last},O2:O${last},"Ya")`, rows.filter(r => r.diajukan).reduce((a, r) => a + r.insentif, 0), ST.tRp);
  const notes = ["Aturan pengali insentif per unit:", `1. Sewa BULANAN: selalu Rp ${fmtN(INS.tinggi)} per unit.`, `2. Sewa HARIAN / MINGGUAN dengan gross profit per unit Rp ${fmtN(INS.batasGP)} ke atas: Rp ${fmtN(INS.tinggi)} per unit.`, `3. Sewa HARIAN / MINGGUAN dengan gross profit per unit di bawah Rp ${fmtN(INS.batasGP)}: Rp ${fmtN(INS.rendah)} per unit.`,
    `DURASI SEWA diisi otomatis dari harga per unit (>= Rp ${fmtN(INS.batasBulanan)} = Bulanan, di bawahnya = Harian) karena Accurate tidak mencatat durasi. Cek dan ubah lewat pilihan bila keliru; pengali dan total di sheet PENGAJUAN ikut berubah.`,
    `Unit = QTY baris berkategori barang SEWA/LAPTOP di pilar SEWA. Gross profit = total harga − harga beli − biaya sewa vendor (aplikasi MFlash Data Center). Nama sales dari kolom ${o.basisLabel}.`, "DIAJUKAN = Tidak: transaksi tanpa nama sales di Accurate, tidak ikut pengajuan sampai nama sales dilengkapi."];
  notes.forEach((t, k) => R.s(tr + 2 + k, 1, t, k ? ST.noteB : ST.kLabel));
  const dv = `<dataValidations count="2"><dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="L2:L${last}"><formula1>"Bulanan,Mingguan,Harian"</formula1></dataValidation><dataValidation type="list" allowBlank="0" showErrorMessage="1" sqref="O2:O${last}"><formula1>"Ya,Tidak"</formula1></dataValidation></dataValidations>`;
  const sheet2 = R.xml({ cols: [11, 14, 20, 28, 34, 30, 7, 15, 14, 15, 13, 13, 14, 14, 11, 30], freeze: '<pane xSplit="3" ySplit="1" topLeftCell="D2" activePane="bottomRight" state="frozen"/>', filter: `A1:P${last}`, dv, land: true, fit: true });

  // ---------- sheet 1: PENGAJUAN ----------
  const P = Sheet();
  for (let r = 1; r <= 16; r++) P.h(r, 20);
  P.s(2, 2, "PENGAJUAN BIAYA", ST.title);
  [o.alamat1, o.alamat2, o.alamat3].forEach((t, k) => t && P.s(7 + k, 2, t, ST.addr));
  for (let c = 2; c <= 4; c++) P.e(11, c, ST.yellow);
  P.s(11, 6, "Keterangan", ST.yellow); for (let c = 7; c <= 9; c++) P.e(11, c, ST.yellow);
  [["Nama", ": " + o.nama], ["Jabatan", ": " + o.jabatan], ["Jenis Keperluan", ": Insentif Sewa Sales"], ["Periode", ": " + o.periode]].forEach(([a, b], k) => { P.s(12 + k, 2, a, ST.label); P.s(12 + k, 3, b, ST.text); });
  [["Tgl Penyerahan", ": " + (o.tglSerah || "")], ["Bank / Atas Nama", ": " + (o.bank || "")], ["No Rekening", ": " + (o.rekening || "")]].forEach(([a, b], k) => { P.s(12 + k, 6, a, ST.kLabel); P.s(12 + k, 7, b, ST.kLabel); });
  P.s(12, 9, "Validasi FA", ST.box); P.e(13, 9, ST.box); P.e(14, 9, ST.box); P.m("I12", "I14");
  const H0 = 17; P.h(H0, 30);
  [["B", "TANGGAL"], ["C", "NAMA SALES"], ["E", "CABANG"], ["G", "KUANTITAS (UNIT)"], ["H", "HARGA / PCS"], ["I", "TOTAL"]].forEach(([c, t]) => P.s(H0, c.charCodeAt(0) - 64, t, ST.head));
  [4, 6].forEach(c => P.e(H0, c, ST.head)); P.m(`C${H0}`, `D${H0}`); P.m(`E${H0}`, `F${H0}`);
  // satu baris per sales + cabang + pengali
  const g = new Map();
  for (const r of rows) { if (!r.diajukan) continue; const k = r.sales + "|" + r.cabang + "|" + r.pengali; const x = g.get(k) || { sales: r.sales, cabang: r.cabang, p: r.pengali, unit: 0 }; x.unit += r.unit; g.set(k, x); }
  const grp = [...g.values()].sort((a, b) => a.sales.localeCompare(b.sales) || a.cabang.localeCompare(b.cabang) || b.p - a.p);
  const rng = c => `${S2}$${c}$2:$${c}$${last}`;
  grp.forEach((x, k) => { const r = H0 + 1 + k; P.h(r, 20);
    P.s(r, 2, o.periodeSingkat, ST.dCenter); P.s(r, 3, x.sales, ST.dText); P.e(r, 4, ST.dText); P.s(r, 5, x.cabang, ST.dText); P.e(r, 6, ST.dText); P.m(`C${r}`, `D${r}`); P.m(`E${r}`, `F${r}`);
    P.f(r, 7, `SUMIFS(${rng("G")},${rng("D")},C${r},${rng("C")},E${r},${rng("M")},H${r},${rng("O")},"Ya")`, x.unit, ST.dNum); P.n(r, 8, x.p, ST.dRp); P.f(r, 9, `G${r}*H${r}`, x.unit * x.p, ST.dRp); });
  const gt = H0 + 1 + Math.max(grp.length, 1);
  if (!grp.length) { P.s(H0 + 1, 3, "Tidak ada transaksi sewa pada periode ini", ST.dText); }
  const tU = grp.reduce((a, x) => a + x.unit, 0), tI = grp.reduce((a, x) => a + x.unit * x.p, 0);
  P.s(gt, 2, "Grand Total", ST.tLabel); for (let c = 3; c <= 6; c++) P.e(gt, c, ST.tLabel); P.m(`B${gt}`, `F${gt}`);
  P.f(gt, 7, `SUM(G${H0 + 1}:G${gt - 1})`, tU, ST.tNum); P.e(gt, 8, ST.tLabel); P.f(gt, 9, `SUM(I${H0 + 1}:I${gt - 1})`, tI, ST.tRp); P.h(gt, 22);
  P.f(gt + 1, 2, `IF(ROUND(I${gt}-${S2}N${tr},0)=0,"Cocok dengan sheet Rincian Transaksi","PERIKSA: total berbeda dengan sheet Rincian Transaksi (ada durasi/pengali yang diubah), sesuaikan baris pengajuan")`, "Cocok dengan sheet Rincian Transaksi", ST.note);
  const sr = gt + 3;
  P.s(sr, 8, `${o.kota}, ${o.tglTtd}`, ST.text);
  [["B", "D", "Mengajukan,", o.nama, o.jabatan], ["E", "F", "Disetujui,", o.ceo, o.ceoJab], ["H", "I", "Disetujui,", o.fin, o.finJab]].forEach(([a, b, t1, nm, jb]) => {
    const ca = a.charCodeAt(0) - 64; [[sr + 1, t1, ST.sLabel], [sr + 6, `( ${String(nm || "").toUpperCase()} )`, ST.sName], [sr + 7, jb, ST.sJob]].forEach(([rr, t, st]) => { P.s(rr, ca, t, st); P.m(`${a}${rr}`, `${b}${rr}`); }); });
  const pb = sr + 10;
  P.s(pb, 2, "Sumber Dana :", ST.dana); P.s(pb, 8, "Penerima Berkas", ST.box); P.e(pb, 9, ST.box); P.e(pb + 1, 8, ST.box); P.e(pb + 1, 9, ST.box); P.e(pb + 2, 8, ST.box); P.e(pb + 2, 9, ST.box); P.m(`H${pb}`, `I${pb + 2}`);
  const sheet1 = P.xml({ cols: [1.8, 15, 17, 14, 12, 14, 12, 16, 18, 3], noGrid: true, tab: true, drawing: true, fit: true });

  // ---------- gambar logo ----------
  const px2emu = 9525, anchor = (id, col, row, w, h, rid) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${w * px2emu}" cy="${h * px2emu}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="Logo ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w * px2emu}" cy="${h * px2emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  const lh = 110, l1w = Math.round(LOGO_MADINAH.w * lh / LOGO_MADINAH.h), l2w = Math.round(LOGO_MFLASH.w * 120 / LOGO_MFLASH.h);
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchor(2, 5, 0, l1w, lh, "rId1")}${anchor(3, 7, 0, l2w, 120, "rId2")}</xdr:wsDr>`;
  const NS = "http://schemas.openxmlformats.org/package/2006/relationships";
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="PENGAJUAN" sheetId="1" r:id="rId1"/><sheet name="Rincian Transaksi" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">'Rincian Transaksi'!$A$1:$P$${last}</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">PENGAJUAN!$A$1:$J$${pb + 3}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="1">'Rincian Transaksi'!$1:$1</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ["xl/worksheets/sheet1.xml", sheet1],
    ["xl/worksheets/_rels/sheet1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`],
    ["xl/worksheets/sheet2.xml", sheet2],
    ["xl/drawings/drawing1.xml", drawing],
    ["xl/drawings/_rels/drawing1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo2.png"/></Relationships>`],
    ["xl/media/logo1.png", b64bytes(LOGO_MADINAH.b64)],
    ["xl/media/logo2.png", b64bytes(LOGO_MFLASH.b64)],
  ];
  return { blob: zipStore(files), total: tI, unit: tU, baris: grp.length };
}

/* logo untuk form Pengajuan Insentif (PNG base64) */
const LOGO_MADINAH = { w: 240, h: 171, b64: "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" };
const LOGO_MFLASH = { w: 300, h: 268, b64: "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" };
const PJ_DEF = { nama: "Toni Nugroho", jabatan: "Manager Pilar Sewa", ceo: "Zaskanul Tibalky", ceoJab: "CEO MFlash", fin: "Galih Permana", finJab: "Finance", kota: "Jakarta", tglSerah: "", bank: "", rekening: "" };
const PJ_ALAMAT = ["Ruko Madinah Office, Blok C4, Jl. Pd. Kelapa Raya No.1B,", "Malaka Jaya, Kec. Duren Sawit, Kota Jakarta Timur,", "DKI Jakarta 13460"];
const pjData = () => ({ ...PJ_DEF, ...(LS.get("mfdc-pengajuan") || {}) });
function insentifCard(rin, label) {
  const list = insentifPerSales(rin), t = list.reduce((o, r) => (o.u += r.unit, o.u25 += r.u25, o.u5 += r.u5, o.g += r.gp, o.i += r.ins, o.f += r.trx, o), { u: 0, u25: 0, u5: 0, g: 0, i: 0, f: 0 });
  const tanpa = rin.filter(r => !r.diajukan), pj = pjData();
  const fld = (k, lab, w = 190, ph = "") => `<label style="display:grid;gap:4px;font-weight:600;font-size:13px">${lab}<input data-pj="${k}" value="${esc(pj[k])}" placeholder="${esc(ph)}" style="width:${w}px"></label>`;
  return `<div class="card" id="insCard"><h3>Insentif sewa per sales <span class="pill ok">${rp(t.i)}</span></h3>
    <p class="sub">${esc(label)} · Pengali per unit: <b>sewa bulanan Rp ${fmtN(INS.tinggi)}</b>; harian/mingguan <b>Rp ${fmtN(INS.tinggi)}</b> bila gross profit per unit ≥ Rp ${fmtN(INS.batasGP)}, selain itu <b>Rp ${fmtN(INS.rendah)}</b>. Durasi ditebak dari harga per unit (≥ Rp ${fmtN(INS.batasBulanan)} = bulanan) karena Accurate tidak mencatatnya; bisa dikoreksi di file pengajuan. Nama sales dari kolom <b>${esc(BASIS[SB])}</b>.</p>
    ${barList("Pencapaian insentif sewa", label, list.map(r => ({ c: r.sales, v: r.ins, sub: r.cabang, note: `${fmtN(r.u25)} × 25rb + ${fmtN(r.u5)} × 5rb` })), rp, { maxH: 420 })}
    <div class="tablebox" style="max-height:420px"><table><thead><tr><th>Sales</th><th>Cabang</th><th class="num">Unit tersewa</th><th class="num">Unit × 25rb</th><th class="num">Unit × 5rb</th><th class="num">Faktur sewa</th><th class="num">GP sewa</th><th class="num">Insentif</th></tr></thead><tbody>
    ${list.map(r => `<tr><td class="cab">${esc(r.sales)}</td><td style="white-space:normal;min-width:120px">${esc(r.cabang)}</td><td class="num"><b>${fmtN(r.unit)}</b></td><td class="num">${fmtN(r.u25)}</td><td class="num">${fmtN(r.u5)}</td><td class="num">${fmtN(r.trx)}</td><td class="num">${rp(r.gp)}</td><td class="num"><b>${rp(r.ins)}</b></td></tr>`).join("") || `<tr><td colspan="8" class="sub">Belum ada penjualan unit sewa pada filter ini.</td></tr>`}
    ${list.length > 1 ? `<tr class="tot"><td colspan="2">TOTAL</td><td class="num">${fmtN(t.u)}</td><td class="num">${fmtN(t.u25)}</td><td class="num">${fmtN(t.u5)}</td><td class="num">${fmtN(t.f)}</td><td class="num">${rp(t.g)}</td><td class="num">${rp(t.i)}</td></tr>` : ""}</tbody></table></div>
    ${tanpa.length ? `<div class="notice warn">${fmtN(tanpa.length)} transaksi sewa (${fmtN(tanpa.reduce((a, r) => a + r.unit, 0))} unit) belum punya nama sales di Accurate, jadi tidak ikut pengajuan: ${tanpa.map(r => esc(r.cabang + " " + r.no_faktur)).join(", ")}.</div>` : ""}
    <h3 style="margin-top:16px">Unduh form Pengajuan Insentif</h3>
    <p class="sub">Satu klik menghasilkan file Excel form PENGAJUAN BIAYA (logo, tabel per sales & cabang, tanda tangan) plus sheet Rincian Transaksi. Isian di bawah tersimpan di browser ini saja.</p>
    <div class="toolbar" style="align-items:end;flex-wrap:wrap;background:var(--accent-soft);border-radius:var(--r);padding:10px 12px">
      ${fld("nama", "Mengajukan")}${fld("jabatan", "Jabatan")}${fld("ceo", "Disetujui (1)")}${fld("ceoJab", "Jabatan", 140)}${fld("fin", "Disetujui (2)")}${fld("finJab", "Jabatan", 140)}
      ${fld("kota", "Kota", 120)}${fld("tglSerah", "Tgl penyerahan dokumen", 150, "mis. 05-11-2026")}${fld("bank", "Bank / atas nama", 190, "mis. BSI / NAMA")}${fld("rekening", "No rekening", 150)}
      <button class="primary" id="pjDl"${t.i ? "" : " disabled"}>Unduh Pengajuan Insentif</button>
    </div></div>`;
}
function bindPengajuan(el, rin, dari, sampai) {
  const b = $("#pjDl", el); if (!b) return;
  $$("[data-pj]", el).forEach(i => i.onchange = () => { const o = LS.get("mfdc-pengajuan") || {}; o[i.dataset.pj] = i.value.trim(); LS.set("mfdc-pengajuan", o); });
  b.onclick = () => {
    const pj = pjData(); $$("[data-pj]", el).forEach(i => pj[i.dataset.pj] = i.value.trim());
    const now = new Date(), satu = /^\d{4}-\d{2}$/.test(D.bulan);
    const per = satu ? namaBulan(D.bulan) : periodeLabel();
    const o = { ...pj, alamat1: PJ_ALAMAT[0], alamat2: PJ_ALAMAT[1], alamat3: PJ_ALAMAT[2], periode: per + (D.cab ? " · " + D.cab : ""), periodeSingkat: satu ? `${BLN[+D.bulan.slice(5) - 1].slice(0, 3)}-${D.bulan.slice(2, 4)}` : per,
      tglTtd: `${now.getDate()} ${BLN[now.getMonth()]} ${now.getFullYear()}`, basisLabel: BASIS[SB] };
    const x = buatPengajuanXlsx(rin, o);
    const nm = `Pengajuan-Insentif-Sewa-${satu ? per.replace(" ", "-") : (dari || "awal") + "_" + (sampai || "akhir")}${D.cab ? "-" + D.cab.replace(/[^\w]+/g, "-") : ""}.xlsx`;
    unduhBlob(x.blob, nm); toast(`Pengajuan insentif diunduh: ${fmtN(x.unit)} unit, ${rp(x.total)}.`);
  };
}
const basisSelect = () => `<label class="sub" style="display:flex;gap:6px;align-items:center">Nama sales dari<select id="fBasis" aria-label="Basis nama sales">${Object.entries(BASIS).map(([k, v]) => `<option value="${k}"${k === SB ? " selected" : ""}>${v}</option>`).join("")}</select></label>`;
const bindBasis = (el, re) => { const x = $("#fBasis", el); if (x) x.onchange = e => { SB = e.target.value; LS.set("mfdc-basis", SB); re(); }; };
async function pageSales(el) {
  await loadBulan();
  const [dari, sampai] = periode();
  const args = { p_dari: dari || null, p_sampai: sampai || null };
  const pil = D.pilar ? [D.pilar] : null;
  const [known, rows, rowsAll, rin] = await Promise.all([
    db.rpc("gp_cabang_pilar", { p_dari: null, p_sampai: null }),
    db.rpc("pencapaian_sales", salesArgs(args, pil)),
    pil ? db.rpc("pencapaian_sales", salesArgs(args, null)) : null,
    db.rpc("insentif_sewa_rincian", { ...args, p_cabang: D.cab || null, p_basis: SB }).then(hitungInsentif).catch(() => [])]);
  const allPilars = sortPilar([...new Set(known.map(r => r.pilar))]);
  const sewaRows = rowsAll || rows;
  const insBy = new Map(insentifPerSales(rin).map(r => [r.sales, r.ins]));
  const T = rows.reduce((o, r) => (o.rev += +r.omzet, o.gp += +r.gross_profit, o.inv += +r.jumlah_faktur, o.pel += +r.pelanggan, o), { rev: 0, gp: 0, inv: 0, pel: 0 });
  const sorted = [...rows].sort((a, b) => b.gross_profit - a.gross_profit);
  const named = sorted.filter(r => r.sales !== "TANPA NAMA SALES");
  const label = [D.cab || "Semua cabang", D.pilar, periodeLabel()].filter(Boolean).join(" · ");
  el.innerHTML = `<div style="display:grid;gap:14px">
  <div class="toolbar" style="justify-content:space-between">${filterBar(true, allPilars)}<div class="toolbar">${basisSelect()}<button id="sDl">Unduh Excel pencapaian</button></div></div>
  ${!rows.length ? `<div class="notice warn">Belum ada faktur pada filter ini.${D.bulan !== "semua" ? ` <button class="linkbtn" id="dAll">Lihat semua periode</button>` : ""}</div>` : ""}
  <div class="gp-hero">
    <div class="gp-main"><span class="l">Gross profit · ${esc(label)}</span><span class="v">${rp(T.gp)}</span><span class="s">dari ${fmtN(named.length)} sales · omzet ${rp(T.rev)}</span></div>
    <div class="kpi"><span class="l">Sales terbaik (GP)</span><span class="v" style="font-size:16px">${esc(named[0]?.sales || "–")}</span><span class="s">${named[0] ? rp(named[0].gross_profit) : ""}</span></div>
    <div class="kpi"><span class="l">Unit sewa</span><span class="v">${fmtN(sewaRows.reduce((a, r) => a + +r.unit_sewa, 0))} <small style="font-size:13px;font-weight:600">unit</small></span><span class="s">insentif ${rp([...insBy.values()].reduce((a, v) => a + v, 0))}</span></div>
    <div class="kpi"><span class="l">GP rata-rata per sales</span><span class="v">${rpShort(named.length ? named.reduce((a, r) => a + +r.gross_profit, 0) / named.length : 0)}</span><span class="s">${fmtN(T.inv)} faktur</span></div>
  </div>
  ${targetCorpCard(sewaRows, [D.cab || "Semua cabang", periodeLabel()].join(" · "))}
  <div class="gp-grid">
    ${barList("Gross profit per sales", label, named.map(r => ({ c: r.sales, v: +r.gross_profit, sub: r.cabang })), rp)}
    ${barList("Unit sewa per sales", [D.cab || "Semua cabang", periodeLabel()].join(" · ") + " · pilar SEWA", sewaRows.filter(r => r.sales !== "TANPA NAMA SALES").map(r => ({ c: r.sales, v: +r.unit_sewa, sub: r.cabang })), v => fmtN(v) + " unit")}
  </div>
  ${insentifCard(rin, [D.cab || "Semua cabang", periodeLabel()].join(" · "))}
  <div class="card"><h3>Laporan pencapaian per sales</h3><p class="sub">${esc(label)} · nama sales dari kolom ${esc(BASIS[SB])}. Satu sales yang melayani di beberapa cabang digabung.</p>
    <div class="tablebox" style="max-height:560px"><table><thead><tr><th>#</th><th>Sales</th><th>Cabang</th><th class="num">Faktur</th><th class="num">Pelanggan</th><th class="num">Omzet</th><th class="num">HPP</th><th class="num">Gross profit</th><th class="num">Margin</th><th class="num">Unit sewa</th><th class="num">GP Maintenance</th><th class="num">Corporate maint.</th><th class="num">Insentif sewa</th></tr></thead><tbody>
    ${sorted.map((r, i) => `<tr><td class="num">${i + 1}</td><td class="cab">${esc(r.sales)}</td><td style="white-space:normal;min-width:120px">${esc(r.cabang)}</td><td class="num">${fmtN(r.jumlah_faktur)}</td><td class="num">${fmtN(r.pelanggan)}</td><td class="num">${rp(r.omzet)}</td><td class="num">${rp(r.hpp)}</td><td class="num"><b>${rp(r.gross_profit)}</b></td><td class="num">${mPill(+r.omzet ? r.gross_profit / r.omzet : 0, +r.omzet)}</td><td class="num">${fmtN(r.unit_sewa)}</td><td class="num">${rp(r.gp_maintenance)}</td><td class="num">${fmtN(r.corporate_maintenance)}</td><td class="num">${rp(insBy.get(r.sales) || 0)}</td></tr>`).join("") || `<tr><td colspan="13" class="sub">Tidak ada data.</td></tr>`}
    ${sorted.length > 1 ? `<tr class="tot"><td></td><td colspan="2">TOTAL</td><td class="num">${fmtN(T.inv)}</td><td class="num">${fmtN(T.pel)}</td><td class="num">${rp(T.rev)}</td><td class="num">${rp(rows.reduce((a, r) => a + +r.hpp, 0))}</td><td class="num">${rp(T.gp)}</td><td class="num">${mPill(T.rev ? T.gp / T.rev : 0, T.rev)}</td><td class="num">${fmtN(rows.reduce((a, r) => a + +r.unit_sewa, 0))}</td><td class="num">${rp(rows.reduce((a, r) => a + +r.gp_maintenance, 0))}</td><td class="num">${fmtN(rows.reduce((a, r) => a + +r.corporate_maintenance, 0))}</td><td class="num">${rp([...insBy.values()].reduce((a, v) => a + v, 0))}</td></tr>` : ""}</tbody></table></div>
    ${rows.some(r => r.sales === "TANPA NAMA SALES") ? `<p class="sub">"TANPA NAMA SALES" = faktur yang kolom penjualnya kosong di Accurate.</p>` : ""}</div>
  </div>`;
  const re = () => pageSales(el);
  bindFilter(el, re); bindBasis(el, re); bindPengajuan(el, rin, dari, sampai);
  const ca = $("#corpAll", el); if (ca) ca.onchange = () => { CORP_ALL = ca.checked; re(); };
  const all = $("#dAll", el); if (all) all.onclick = () => { D.bulan = "semua"; re(); };
  $("#sDl", el).onclick = () => {
    const wb = XLSX.utils.book_new();
    const info = [["Laporan", "Pencapaian per Sales"], ["Filter", label], ["Nama sales dari", BASIS[SB]], ["Rumus insentif", `Per unit sewa (QTY barang SEWA/LAPTOP di pilar SEWA): Rp ${fmtN(INS.tinggi)} bila sewa bulanan (harga/unit ≥ Rp ${fmtN(INS.batasBulanan)}) atau GP/unit ≥ Rp ${fmtN(INS.batasGP)}; selain itu Rp ${fmtN(INS.rendah)}`], ["Dibuat", fmtDateTime(new Date())]];
    const ws0 = XLSX.utils.aoa_to_sheet(info); ws0["!cols"] = [{ wch: 22 }, { wch: 70 }]; XLSX.utils.book_append_sheet(wb, ws0, "Keterangan");
    const ws1 = XLSX.utils.json_to_sheet(sorted.map((r, i) => ({ "PERINGKAT": i + 1, "SALES": r.sales, "CABANG": r.cabang, "FAKTUR": +r.jumlah_faktur, "PELANGGAN": +r.pelanggan, "OMZET": +r.omzet, "HPP": +r.hpp, "GROSS PROFIT": +r.gross_profit, "UNIT SEWA": +r.unit_sewa, "GP MAINTENANCE": +r.gp_maintenance, "CORPORATE MAINTENANCE": +r.corporate_maintenance, "TARGET CORPORATE": TARGET_CORP_SALES * bulanPeriode(), "% CAPAI CORPORATE": +(+r.corporate_maintenance / (TARGET_CORP_SALES * bulanPeriode())).toFixed(3), "INSENTIF SEWA": insBy.get(r.sales) || 0 })));
    ws1["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 24 }, ...Array(9).fill({ wch: 16 })]; XLSX.utils.book_append_sheet(wb, ws1, "Pencapaian Sales");
    const ws2 = XLSX.utils.json_to_sheet(insentifPerSales(rin).map(r => ({ "SALES": r.sales, "CABANG": r.cabang, "UNIT TERSEWA": r.unit, "UNIT × 25RB": r.u25, "UNIT × 5RB": r.u5, "FAKTUR SEWA": r.trx, "GP SEWA": Math.round(r.gp), "INSENTIF": r.ins })));
    ws2["!cols"] = [{ wch: 28 }, { wch: 24 }, ...Array(6).fill({ wch: 16 })]; XLSX.utils.book_append_sheet(wb, ws2, "Insentif Sewa");
    saveWb(wb, `MFlash-Pencapaian-Sales-${(dari || "awal").replace(/-/g, "")}-${(sampai || "akhir").replace(/-/g, "")}.xlsx`);
  };
}

/* ---- Target corporate termaintenance per sales ---- */
const TARGET_CORP_SALES = 9;            // corporate termaintenance per sales per bulan
let CORP_ALL = false;                  // tampilkan juga sales tanpa transaksi maintenance
function bulanPeriode() {
  if (/^\d{4}-\d{2}$/.test(D.bulan)) return 1;
  const [a, b] = periode();
  if (a && b) { const x = new Date(a), y = new Date(b); return Math.max(1, (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth() + 1); }
  return Math.max(1, (BULAN || []).length);
}
const warnaCapai = p => p >= 1 ? "var(--ok)" : p >= 0.85 ? "var(--warn)" : "var(--bad)";
function targetCorpCard(rows, label) {
  const bln = bulanPeriode(), target = TARGET_CORP_SALES * bln;
  const named = rows.filter(r => r.sales !== "TANPA NAMA SALES");
  const list = named.filter(r => CORP_ALL || +r.corporate_maintenance > 0)
    .map(r => ({ ...r, n: +r.corporate_maintenance, p: target ? +r.corporate_maintenance / target : 0 }))
    .sort((a, b) => b.n - a.n || b.gp_maintenance - a.gp_maintenance || a.sales.localeCompare(b.sales));
  const capai = list.filter(r => r.p >= 1).length, dekat = list.filter(r => r.p >= 0.85 && r.p < 1).length;
  const tot = list.reduce((a, r) => a + r.n, 0);
  return `<div class="card" id="corpCard"><h3>Pencapaian corporate termaintenance per sales <span class="pill ${capai ? "ok" : "warn"}">${fmtN(capai)} sales capai target</span></h3>
    <p class="sub">${esc(label)} · Target <b>${fmtN(TARGET_CORP_SALES)} corporate per sales per bulan</b>${bln > 1 ? ` × ${fmtN(bln)} bulan = <b>${fmtN(target)}</b>` : ""}. Dihitung dari faktur <b>pilar MAINTENANCE</b> dengan <b>kategori pelanggan CORPORATE</b>; satu corporate dihitung satu walau beberapa transaksi. GP juga hanya dari faktur itu. Warna: hijau ≥100%, kuning 85–99%, merah &lt;85%.</p>
    <div class="toolbar"><label class="sub" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="corpAll"${CORP_ALL ? " checked" : ""}> Tampilkan juga sales tanpa transaksi maintenance</label>
      <span class="sub">${fmtN(list.length)} sales · total ${fmtN(tot)} corporate · ${fmtN(dekat)} sales mendekati target</span></div>
    <div class="hbars rank" style="max-height:520px;overflow:auto">${list.map((r, i) => `<div class="hbar"><div class="hbar-l"><span class="rk">${i + 1}</span><span>${esc(r.sales)}<br><small style="color:var(--muted);font-weight:500">${esc(r.cabang)}</small></span></div>
      <div class="hbar-t" role="img" aria-label="${esc(r.sales)}: ${fmtN(r.n)} dari ${fmtN(target)} corporate"><span style="width:${Math.min(100, r.p * 100)}%;background:${warnaCapai(r.p)}"></span></div>
      <div class="hbar-v"><span style="color:${warnaCapai(r.p)}">${fmtN(r.n)} / ${fmtN(target)} · ${Math.round(r.p * 100)}%</span><small>${r.p >= 1 ? "tercapai" : `kurang ${fmtN(target - r.n)}`} · GP ${rpShort(r.gp_maintenance)}</small></div></div>`).join("") || `<p class="sub">Belum ada transaksi pilar MAINTENANCE pada filter ini.</p>`}</div></div>`;
}

/* =================== bar per cabang (untuk dibagikan ke tim) =================== */
// semua cabang selalu tampil; cabang tanpa transaksi diisi nol
const ZERO_ROW = { omzet: 0, hpp: 0, gross_profit: 0, jumlah_faktur: 0, unit: 0, transaksi_corporate: 0, pelanggan_corporate: 0, pelanggan: 0 };
const lengkapiCabang = rows => { const ada = new Set(rows.map(r => r.cabang)); return rows.concat(S.cabangs.filter(c => !ada.has(c)).map(c => ({ ...ZERO_ROW, cabang: c }))); };
const peringkat = list => { let prev = null, rk = 0; return list.map((x, i) => { if (x.v !== prev) { rk = i + 1; prev = x.v; } return rk; }); };
function barCabang(title, sub, rows, val, fmt) {
  const list = lengkapiCabang(rows).map(r => ({ c: r.cabang, v: +val(r) || 0 })).sort((a, b) => b.v - a.v || S.cabangs.indexOf(a.c) - S.cabangs.indexOf(b.c));
  const max = Math.max(0, ...list.map(x => x.v)), tot = list.reduce((a, x) => a + x.v, 0), rk = peringkat(list), nol = list.filter(x => x.v <= 0).length;
  return `<div class="card"><h3>${esc(title)}</h3><p class="sub">${esc(sub)} · ${fmtN(list.length)} cabang</p>
    <div class="hbars rank">${list.map((x, i) => `<div class="hbar"${x.v <= 0 ? ' style="opacity:.75"' : ""}><div class="hbar-l"><span class="rk">${rk[i]}</span>${esc(x.c)}</div><div class="hbar-t" role="img" aria-label="${esc(x.c)}: ${esc(fmt(x.v))}"><span style="width:${max > 0 ? Math.max(0, x.v) / max * 100 : 0}%"></span></div><div class="hbar-v"${x.v <= 0 ? ' style="color:var(--bad)"' : ""}>${esc(fmt(x.v))}<small>${x.v <= 0 ? "belum ada pencapaian" : (tot ? Math.round(x.v / tot * 100) : 0) + "% dari total"}</small></div></div>`).join("") || `<p class="sub">Tidak ada data.</p>`}</div>
    ${list.length ? `<p class="sub" style="margin-top:0">Total semua cabang: <b>${esc(fmt(tot))}</b>.${nol ? ` <b>${fmtN(nol)}</b> cabang belum ada pencapaian pada periode ini (belum ada transaksi atau datanya belum diunggah, cek menu Kualitas Data).` : ""}</p>` : ""}</div>`;
}

/* =================== grafik batang harian =================== */
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
function short(n) { const a = Math.abs(n); return (n < 0 ? "-" : "") + (a >= 1e9 ? (a / 1e9).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " M" : a >= 1e6 ? (a / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt" : a >= 1e3 ? Math.round(a / 1e3) + " rb" : a.toLocaleString("id-ID", { maximumFractionDigits: 1 })); }
function trendSVG(days, key, count) {
  if (!days.length) return `<p class="sub">Tidak ada faktur bertanggal pada filter ini.</p>`;
  const W = 640, H = 230, L = 64, R = 8, T = 12, B = 30; const vals = days.map(d => +d[key] || 0);
  const max = Math.max(0, ...vals), min = Math.min(0, ...vals); let step = niceStep((max - min) / 4 || 1); if (count) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(max / step) * step || step, bot = Math.floor(min / step) * step; const y = v => T + (top - v) / ((top - bot) || 1) * (H - T - B);
  const bw = (W - L - R) / days.length; const ticks = []; for (let t = bot; t <= top + 1e-6; t += step) ticks.push(t);
  const lab = Math.ceil(days.length / 10);
  return `<div class="trend"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Grafik harian">
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="grid${t === 0 ? " zero" : ""}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" class="ax">${count ? fmtN(t) : short(t)}</text>`).join("")}
    ${days.map((d, i) => { const v = +d[key] || 0, x = L + i * bw + bw * 0.15, w = Math.max(2, bw * 0.7), y0 = y(0), y1 = y(v);
      return `<g data-i="${i}" tabindex="0"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>${v ? `<rect x="${x}" y="${Math.min(y0, y1)}" width="${w}" height="${Math.max(1, Math.abs(y1 - y0))}" rx="${Math.min(4, w / 2)}" class="${v < 0 ? "bneg" : "b"}"/>` : ""}${i % lab === 0 ? `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle" class="ax">${String(d.tgl).slice(8, 10)}/${String(d.tgl).slice(5, 7)}</text>` : ""}</g>`; }).join("")}
  </svg><div class="tip" hidden></div></div>`;
}
function bindTrend(el, days, html) {
  el.querySelectorAll(".trend").forEach(box => {
    const tip = box.querySelector(".tip");
    box.querySelectorAll("[data-i]").forEach(g => {
      const d = days[+g.dataset.i];
      g.onmouseenter = g.onfocus = () => { tip.innerHTML = `<b>${fmtDate(d.tgl)}</b><br>${html(d)}`; tip.hidden = false; const b = g.getBoundingClientRect(), w = box.getBoundingClientRect(); tip.style.left = Math.min(w.width - 180, Math.max(0, b.left - w.left + b.width / 2 - 90)) + "px"; tip.style.top = (b.top - w.top - 80) + "px"; };
      g.onmouseleave = g.onblur = () => { tip.hidden = true; };
    });
  });
}

/* =================== UNDUH LAPORAN (rekonsiliasi dengan Accurate) =================== */
async function resolvePilar(key) {
  const known = await db.rpc("gp_cabang_pilar", { p_dari: null, p_sampai: null });
  const all = [...new Set(known.map(r => r.pilar))];
  if (key === "semua") return { pil: null, all };
  const C = PILAR_TABS[key]; const pil = all.filter(C.match);
  return { pil: pil.length ? pil : (key === "sewa" ? ["SEWA"] : ["SERVICE & MAINTENANCE CORPORATE"]), all };
}
const REK_COLS = [["cabang", "CABANG"], ["tgl_faktur", "TGL FAKTUR"], ["no_faktur", "NO FAKTUR"], ["baris", "BARIS KE"], ["id_pelanggan", "ID PELANGGAN"], ["nama_customer", "NAMA CUSTOMER"], ["kategori_pelanggan", "KATEGORI PELANGGAN"], ["pilar", "PILAR"], ["kategori_penjualan", "KATEGORI PENJUALAN"], ["kategori_barang", "KATEGORI BARANG"], ["kode_barang", "KODE BARANG"], ["nama_barang", "NAMA BARANG"], ["qty", "QTY"], ["unit", "UNIT TERSEWA"], ["harga_satuan", "@HARGA"], ["total_harga", "TOTAL HARGA"], ["harga_beli", "HARGA BELI (ACCURATE)"], ["biaya_vendor", "BIAYA SEWA VENDOR"], ["hpp", "HPP TOTAL"], ["gross_profit", "GROSS PROFIT"], ["penjual_default", "PENJUAL DEFAULT"], ["nama_admin", "NAMA ADMIN"], ["no_wa", "NO WA"], ["sumber", "SUMBER DATA"]];
const SUM_KEYS = ["qty", "unit", "total_harga", "harga_beli", "biaya_vendor", "hpp", "gross_profit"];
function sheetRows(rows, cols, totalLabel) {
  const out = rows.map(r => Object.fromEntries(cols.map(([k, h]) => [h, isEmpty(r[k]) ? null : (typeof r[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r[k]) ? toCell(r[k]) : (["qty", "harga_satuan", "total_harga", "harga_beli", "biaya_vendor", "hpp", "gross_profit", "total"].includes(k) ? +r[k] : r[k]))])));
  if (totalLabel && rows.length) out.push(Object.fromEntries(cols.map(([k, h], i) => [h, i === 0 ? totalLabel : SUM_KEYS.includes(k) ? Math.round(rows.reduce((a, r) => a + (+r[k] || 0), 0) * 100) / 100 : null])));
  const ws = XLSX.utils.json_to_sheet(out, { header: cols.map(c => c[1]), cellDates: true, dateNF: "dd/mm/yyyy" });
  ws["!cols"] = cols.map(([, h]) => ({ wch: Math.min(40, Math.max(11, h.length + 2)) }));
  return ws;
}
async function exportRekon(key, cab, dari, sampai, onStep = () => {}) {
  const { pil } = await resolvePilar(key);
  const title = key === "sewa" ? "Sewa" : key === "service" ? "Service & Maintenance Corporate" : "Semua Pilar";
  const f = []; if (cab) f.push(["cabang", "eq", cab]); if (dari) f.push(["tgl_faktur", "gte", dari]); if (sampai) f.push(["tgl_faktur", "lte", sampai]);
  if (pil) f.push(["pilar", "in", "(" + pil.map(p => `"${p.replace(/"/g, "")}"`).join(",") + ")"]);
  const rows = await db.all("v_faktur", { select: REK_COLS.map(c => c[0]).join(","), filters: f, order: "cabang.asc,tgl_faktur.asc,no_faktur.asc,baris.asc" }, n => onStep(`Mengambil faktur penjualan… ${fmtN(n)} baris`));
  const wb = XLSX.utils.book_new();
  // Sewa: ambil Faktur Pembelian SEWA lebih dulu, supaya nama vendor/supplier bisa ditempel ke tiap baris sewa
  let beli = [], vendBy = new Map();
  if (key === "sewa") {
    onStep("Mengambil faktur pembelian SEWA…");
    const pf = []; if (cab) pf.push(["cabang", "eq", cab]);
    const bDari = dari ? dari.slice(0, 7) + "-01" : null; if (bDari) pf.push(["tgl", "gte", bDari]); if (sampai) pf.push(["tgl", "lte", sampai]);
    beli = await db.all("v_pembelian", { select: "cabang,tgl,no_faktur,baris,kategori_barang,kode_barang,nama_barang,qty,harga_satuan,total_harga,pemasok,kategori_kebutuhan", filters: pf, or: `nama_barang.ilike."*SEWA*",kategori_barang.ilike.SEWA`, order: "cabang.asc,tgl.asc,no_faktur.asc" });
    for (const b of beli) { const k = b.cabang + "|" + String(b.tgl).slice(0, 7); if (!vendBy.has(k)) vendBy.set(k, new Map()); const m = vendBy.get(k), n = (b.pemasok || "Tanpa nama pemasok").trim(); m.set(n, (m.get(n) || 0) + (+b.total_harga || 0)); }
    for (const r of rows) { const m = vendBy.get(r.cabang + "|" + String(r.tgl_faktur).slice(0, 7)); r.vendor = m ? [...m.keys()].join("; ") : "Tanpa vendor (unit sendiri / pembelian belum ada)"; }
  }
  const vendorText = (c, bln) => { const m = vendBy.get(c + "|" + bln); return m ? [...m.entries()].map(([n, v]) => `${n} (${rp(v)})`).join("; ") : ""; };
  // Ringkasan per cabang dihitung dari baris yang sama dengan sheet rincian, supaya angkanya pasti cocok
  const byC = new Map(); for (const r of rows) { if (!byC.has(r.cabang)) byC.set(r.cabang, []); byC.get(r.cabang).push(r); }
  const ring = [...byC.entries()].sort((a, b) => S.cabangs.indexOf(a[0]) - S.cabangs.indexOf(b[0])).map(([c, rs]) => {
    const s = k => Math.round(rs.reduce((a, r) => a + (+r[k] || 0), 0) * 100) / 100; const omzet = s("total_harga"), gp = s("gross_profit");
    const o = { "CABANG": c, "JUMLAH TRANSAKSI (FAKTUR)": new Set(rs.map(r => r.no_faktur)).size };
    if (key === "sewa") { o["UNIT TERSEWA"] = s("unit"); o["VENDOR / SUPPLIER"] = [...new Set(rs.filter(r => +r.biaya_vendor).map(r => r.vendor))].join("; ") || "Tanpa vendor"; }
    if (key === "service") o["CORPORATE TERMAINTENANCE"] = new Set(rs.map(r => r.id_pelanggan || r.nama_customer)).size;
    Object.assign(o, { "OMZET": omzet, "HARGA BELI (ACCURATE)": s("harga_beli"), "BIAYA SEWA VENDOR": s("biaya_vendor"), "HPP TOTAL": s("hpp"), "GROSS PROFIT": gp, "MARGIN %": omzet ? +(gp / omzet * 100).toFixed(1) : 0 });
    return o;
  });
  if (ring.length) { const t = { "CABANG": "TOTAL" }; for (const k of Object.keys(ring[0])) if (k !== "CABANG") t[k] = k === "MARGIN %" ? null : ring.reduce((a, r) => a + (+r[k] || 0), 0); if (t["OMZET"]) t["MARGIN %"] = +(t["GROSS PROFIT"] / t["OMZET"] * 100).toFixed(1); ring.push(t); }
  const per = dari || sampai ? `${dari ? fmtDate(dari) : "awal"} – ${sampai ? fmtDate(sampai) : "sekarang"}` : "Semua periode";
  const info = [["Laporan", title], ["Cabang", cab || "Semua cabang"], ["Periode", per], ["Pilar", pil ? pil.join(", ") : "Semua"], ["Dibuat", fmtDateTime(new Date())], [], ["Cara hitung", "Gross profit = TOTAL HARGA − HARGA BELI (Accurate) − BIAYA SEWA VENDOR"], ["Biaya sewa vendor", "Total Faktur Pembelian barang SEWA per cabang per bulan, dibagi ke penjualan pilar SEWA cabang & bulan yang sama sesuai QTY"], ["Rekonsiliasi", "Cocokkan NO FAKTUR dan TOTAL HARGA di sheet Rincian dengan laporan Rincian Faktur Penjualan di Accurate pada filter yang sama"]];
  if (key === "sewa") info.push(["Ringkasan per Sales", `Unit tersewa (QTY barang SEWA/LAPTOP) dan gross profit sewa per sales. Nama sales dari kolom ${BASIS[SB]} (bisa diganti di menu Pencapaian Sales). Insentif per unit: Rp 25.000 untuk sewa bulanan atau GP/unit ≥ Rp 100.000, selain itu Rp 5.000 (sama dengan form Pengajuan Insentif).`]);
  if (key === "sewa") info.push(["Unit milik sendiri", "Dari Rincian Pemindahan Barang (gudang tujuan/dari mengandung SEWA). Dicocokkan ke faktur sewa cabang & tanggal yang sama, karena laporan pemindahan tidak memuat nomor faktur"]);
  if (key === "service") info.push(["Corporate termaintenance", "Jumlah pelanggan (ID pelanggan per cabang) yang bertransaksi; satu perusahaan dihitung satu"]);
  const wsInfo = XLSX.utils.aoa_to_sheet(info); wsInfo["!cols"] = [{ wch: 26 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Keterangan");
  const wsR = XLSX.utils.json_to_sheet(ring); wsR["!cols"] = Object.keys(ring[0] || { CABANG: 1 }).map(k => ({ wch: Math.max(12, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsR, "Ringkasan per Cabang");
  if (key === "sewa") {
    // Ringkasan per sales: unit tersewa & gross profit sewa yang tercipta per sales
    onStep("Menghitung unit & gross profit per sales…");
    const [ps, ins] = await Promise.all([
      db.rpc("pencapaian_sales", { p_dari: dari || null, p_sampai: sampai || null, p_cabang: cab || null, p_pilar: ["SEWA"], p_basis: SB }),
      db.rpc("insentif_sewa_rincian", { p_dari: dari || null, p_sampai: sampai || null, p_cabang: cab || null, p_basis: SB }).then(hitungInsentif).catch(() => [])]);
    const insS = new Map(insentifPerSales(ins).map(r => [r.sales, r]));
    const sl = ps.filter(r => +r.jumlah_faktur > 0).sort((a, b) => b.unit_sewa - a.unit_sewa || b.gross_profit - a.gross_profit);
    const out = sl.map((r, i) => ({ "PERINGKAT": i + 1, "SALES": r.sales, "CABANG": r.cabang, "FAKTUR SEWA": +r.faktur_sewa, "PELANGGAN": +r.pelanggan, "UNIT TERSEWA": +r.unit_sewa,
      "OMZET SEWA": +r.omzet, "HPP (HARGA BELI + VENDOR)": +r.hpp, "GROSS PROFIT SEWA": +r.gross_profit, "MARGIN": +r.omzet ? +(r.gross_profit / r.omzet).toFixed(3) : 0,
      "GP PER UNIT": +r.unit_sewa ? Math.round(r.gross_profit / r.unit_sewa) : 0, "UNIT × 25RB": insS.get(r.sales)?.u25 || 0, "UNIT × 5RB": insS.get(r.sales)?.u5 || 0, "INSENTIF SEWA": insS.get(r.sales)?.ins || 0 }));
    const sum = k => out.reduce((a, o) => a + (+o[k] || 0), 0);
    if (out.length) out.push({ "PERINGKAT": "", "SALES": "TOTAL", "CABANG": "", "FAKTUR SEWA": sum("FAKTUR SEWA"), "PELANGGAN": sum("PELANGGAN"), "UNIT TERSEWA": sum("UNIT TERSEWA"),
      "OMZET SEWA": sum("OMZET SEWA"), "HPP (HARGA BELI + VENDOR)": sum("HPP (HARGA BELI + VENDOR)"), "GROSS PROFIT SEWA": sum("GROSS PROFIT SEWA"),
      "MARGIN": sum("OMZET SEWA") ? +(sum("GROSS PROFIT SEWA") / sum("OMZET SEWA")).toFixed(3) : 0,
      "GP PER UNIT": sum("UNIT TERSEWA") ? Math.round(sum("GROSS PROFIT SEWA") / sum("UNIT TERSEWA")) : 0, "UNIT × 25RB": sum("UNIT × 25RB"), "UNIT × 5RB": sum("UNIT × 5RB"), "INSENTIF SEWA": sum("INSENTIF SEWA") });
    const wsS = XLSX.utils.json_to_sheet(out.length ? out : [{ "SALES": "Belum ada penjualan pilar SEWA pada filter ini" }]);
    wsS["!cols"] = [{ wch: 10 }, { wch: 28 }, { wch: 26 }, { wch: 12 }, { wch: 11 }, { wch: 13 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 9 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsS, "Ringkasan per Sales");
  }
  const rekCols = key === "sewa" ? REK_COLS.flatMap(c => c[0] === "biaya_vendor" ? [c, ["vendor", "VENDOR / SUPPLIER"]] : [c]) : REK_COLS;
  XLSX.utils.book_append_sheet(wb, sheetRows(rows, rekCols, "TOTAL"), "Rincian Faktur Penjualan");
  if (key === "service") {
    onStep("Menyusun daftar corporate…");
    const m = new Map(); for (const r of rows) { const k = r.cabang + "|" + (r.id_pelanggan || r.nama_customer); let o = m.get(k); if (!o) { o = { cabang: r.cabang, id_pelanggan: r.id_pelanggan, nama_customer: r.nama_customer, kategori_pelanggan: r.kategori_pelanggan, no_wa: r.no_wa, f: new Set(), total_harga: 0, gross_profit: 0, terakhir: null }; m.set(k, o); } o.f.add(r.no_faktur); o.total_harga += +r.total_harga || 0; o.gross_profit += +r.gross_profit || 0; if (!o.terakhir || r.tgl_faktur > o.terakhir) o.terakhir = r.tgl_faktur; }
    const list = [...m.values()].map(o => ({ ...o, transaksi: o.f.size })).sort((a, b) => a.cabang.localeCompare(b.cabang) || b.transaksi - a.transaksi);
    XLSX.utils.book_append_sheet(wb, sheetRows(list, [["cabang", "CABANG"], ["id_pelanggan", "ID PELANGGAN"], ["nama_customer", "NAMA CORPORATE"], ["kategori_pelanggan", "KATEGORI PELANGGAN"], ["no_wa", "NO WA"], ["transaksi", "JUMLAH TRANSAKSI"], ["total_harga", "OMZET"], ["gross_profit", "GROSS PROFIT"], ["terakhir", "TRANSAKSI TERAKHIR"]]), "Daftar Corporate");
  }
  if (key === "sewa") {
    XLSX.utils.book_append_sheet(wb, sheetRows(beli, [["cabang", "CABANG"], ["tgl", "TANGGAL"], ["no_faktur", "NOMOR FAKTUR PEMBELIAN"], ["kategori_barang", "KATEGORI BARANG"], ["kode_barang", "KODE BARANG"], ["nama_barang", "NAMA BARANG"], ["qty", "QTY"], ["harga_satuan", "@HARGA"], ["total_harga", "TOTAL HARGA"], ["pemasok", "VENDOR / SUPPLIER"], ["kategori_kebutuhan", "KATEGORI KEBUTUHAN"]], "TOTAL"), "Pembelian SEWA (Vendor)");
    const v = await db.rpc("sewa_vendor", { p_dari: dari || null, p_sampai: sampai || null });
    const vv = (cab ? v.filter(x => x.cabang === cab) : v).map(x => ({ "CABANG": x.cabang, "BULAN": namaBulan(String(x.bulan).slice(0, 7)), "UNIT DISEWAKAN": +x.unit_sewa, "UNIT DARI VENDOR": +x.unit_vendor, "UNIT MILIK SENDIRI": +(x.unit_sendiri || 0), "VENDOR / SUPPLIER": vendorText(x.cabang, String(x.bulan).slice(0, 7)), "OMZET SEWA": +x.omzet_sewa, "BIAYA VENDOR": +x.biaya_vendor, "HARGA BELI FAKTUR": +(x.harga_beli_faktur || 0), "GP SEWA": x.gp_sewa != null ? +x.gp_sewa : x.omzet_sewa - x.biaya_vendor, "STATUS": +x.biaya_vendor && !+x.omzet_sewa ? "Ada pembelian, belum ada penjualan sewa" : !+x.biaya_vendor && +x.omzet_sewa ? (+x.unit_sendiri ? "Unit milik sendiri" : "Tanpa biaya vendor") : "Terpotong" }));
    const wsV = XLSX.utils.json_to_sheet(vv); wsV["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 18 }, { wch: 48 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, wsV, "Biaya Vendor per Bulan");
    onStep("Mengambil pemindahan barang (unit milik sendiri)…");
    const own = await db.rpc("sewa_unit_sendiri", { p_dari: dari || null, p_sampai: sampai || null, p_cabang: cab || null }).catch(() => []);
    own.sort((x, y) => x.cabang.localeCompare(y.cabang) || String(x.tanggal).localeCompare(String(y.tanggal)));
    XLSX.utils.book_append_sheet(wb, sheetRows(own, [["cabang", "CABANG"], ["tanggal", "TANGGAL"], ["nomor", "NOMOR"], ["gudang", "GUDANG TUJUAN/DARI"], ["kode_barang", "KODE BARANG"], ["nama_barang", "NAMA BARANG"], ["qty", "KUANTITAS"], ["satuan", "SATUAN"], ["keterangan", "KETERANGAN"], ["faktur_sewa_hari_itu", "FAKTUR SEWA DI TANGGAL YANG SAMA"]], "TOTAL"), "Unit Milik Sendiri");
  }
  onStep("Menyusun file Excel…"); await sleep(30);
  const nm = `MFlash-Rekon-${title.replace(/[^A-Za-z]+/g, "")}${cab ? "-" + cab.replace(/\s+/g, "") : ""}-${(dari || "awal").replace(/-/g, "")}-${(sampai || "akhir").replace(/-/g, "")}.xlsx`;
  saveWb(wb, nm);
  return { rows: rows.length, name: nm };
}
async function unduhDenganProgres(key, cab, dari, sampai) {
  const pg = progress("Menyiapkan laporan…");
  try { const r = await exportRekon(key, cab, dari, sampai, t => pg.set(t)); pg.close(); toast(`${r.name} diunduh (${fmtN(r.rows)} baris faktur).`); return r; }
  catch (e) { pg.close(); toast("Gagal mengunduh: " + e.message); throw e; }
}
async function pageUnduh(el) {
  await loadBulan();
  const R = LS.get("mfdc-rekon") || "sewa";
  el.innerHTML = `<section class="panel"><div><h2>Unduh laporan untuk rekonsiliasi</h2>
    <p class="sub">Pilih laporan, cabang, dan bulan, lalu unduh Excel. Isinya sama dengan angka di dashboard, lengkap dengan nomor faktur per baris, supaya bisa dicocokkan dengan laporan di Accurate.</p></div>
    <div class="toolbar">
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Laporan<select id="rJenis"><option value="sewa"${R === "sewa" ? " selected" : ""}>Sewa</option><option value="service"${R === "service" ? " selected" : ""}>Service &amp; Maintenance Corporate</option><option value="semua"${R === "semua" ? " selected" : ""}>Semua pilar (Dashboard GP)</option></select></label>
    </div>
    ${filterBar(false)}
    <div class="notice" id="rIsi"></div>
    <div class="toolbar"><button class="primary" id="rBtn">Unduh Excel</button><span class="sub" id="rMsg" role="status"></span></div>
  </section>`;
  const isi = () => { const k = $("#rJenis", el).value; $("#rIsi", el).innerHTML = `<b>Isi file:</b> Keterangan (filter &amp; cara hitung) · Ringkasan per Cabang · Rincian Faktur Penjualan (per baris, dengan total)` + (k === "sewa" ? " · Ringkasan per Sales (unit, GP, insentif) · Pembelian SEWA (Vendor) · Biaya Vendor per Bulan · Unit Milik Sendiri (dari Pemindahan Barang)" : k === "service" ? " · Daftar Corporate" : ""); };
  $("#rJenis", el).onchange = () => { LS.set("mfdc-rekon", $("#rJenis", el).value); isi(); };
  isi();
  bindFilter(el, () => pageUnduh(el));
  $("#rBtn", el).onclick = async () => { const b = $("#rBtn", el); b.disabled = true; const [dari, sampai] = periode(); try { const r = await unduhDenganProgres($("#rJenis", el).value, D.cab || null, dari || null, sampai || null); $("#rMsg", el).textContent = `Terunduh: ${r.name}`; } catch (e) { $("#rMsg", el).textContent = "Gagal: " + e.message; } b.disabled = false; };
}

/* =================== DATA TABLES =================== */
const TABLES = {
  pelanggan: {
    view: "v_pelanggan", title: "Data Pelanggan",
    cols: [["cabang", "Cabang"], ["id_pelanggan", "ID Pelanggan"], ["nama", "Nama"], ["kategori_pelanggan", "Kategori"], ["no_wa", "No WA"], ["isi_kolom_telp_bukan_nomor", "Isi kolom telp (bukan nomor)"], ["kecamatan", "Kecamatan"], ["kota", "Kota"], ["referensi", "Referensi"], ["penjual_default", "Penjual default"], ["tgl_daftar", "Tgl daftar", "date"], ["jumlah_faktur", "Jumlah faktur", "num"], ["total_belanja", "Total belanja", "rp"], ["total_gross_profit", "Total GP", "rp"], ["faktur_terakhir", "Faktur terakhir", "date"], ["kategori_penjualan_terakhir", "Kategori terakhir"], ["no_wa_juga_di", "No WA juga di"], ["dilengkapi", "Dilengkapi dari faktur"]],
    search: q => `nama.ilike."*${q}*",id_pelanggan.ilike."*${q}*",no_wa.ilike."*${q}*"`,
    chips: [["wa", "Punya No WA", ["no_wa", "not.is", "null"]], ["nowa", "Belum ada No WA", ["no_wa", "is", "null"]], ["trx", "Ada transaksi", ["jumlah_faktur", "gt", "0"]], ["cross", "Lintas cabang", ["no_wa_juga_di", "not.is", "null"]], ["dup", "No WA ganda", ["no_wa_ganda", "is", "true"]], ["fill", "Dilengkapi dari faktur", ["dilengkapi", "not.is", "null"]]],
    order: "cabang.asc,tgl_daftar.desc.nullslast,id_pelanggan.asc", dateCol: null,
    fillMark: { nama: "Nama", kategori_pelanggan: "Kategori Pelanggan", penjual_default: "Penjual Default" }
  },
  faktur: {
    view: "v_faktur", title: "Faktur Penjualan",
    cols: [["cabang", "Cabang"], ["tgl_faktur", "Tgl faktur", "date"], ["no_faktur", "No faktur"], ["id_pelanggan", "ID Pelanggan"], ["nama_customer", "Nama customer"], ["no_wa", "No WA"], ["kategori_pelanggan", "Kategori pelanggan"], ["pilar", "Pilar"], ["kategori_penjualan", "Kategori penjualan"], ["kategori_barang", "Kategori barang"], ["nama_barang", "Nama barang"], ["merk_unit", "Merk"], ["tipe_unit", "Tipe"], ["qty", "Qty", "num"], ["total_harga", "Total harga", "rp"], ["harga_beli", "Harga beli", "rp"], ["biaya_vendor", "Biaya sewa vendor", "rp"], ["gross_profit", "Gross profit", "rp"], ["penjual_default", "Penjual default"], ["kecamatan", "Kecamatan"], ["kota", "Kota"], ["status_pelanggan", "Status pelanggan"], ["dilengkapi", "Dilengkapi dari pelanggan"], ["sumber", "Sumber data"]],
    search: q => `no_faktur.ilike."*${q}*",nama_customer.ilike."*${q}*",id_pelanggan.ilike."*${q}*",nama_barang.ilike."*${q}*",no_wa.ilike."*${q}*"`,
    chips: [["wa", "Dapat No WA", ["no_wa", "not.is", "null"]], ["unmatched", "Pelanggan tidak ditemukan", ["status_pelanggan", "neq", "Cocok"]], ["rugi", "Rugi (GP minus)", ["gross_profit", "lt", "0"]], ["fill", "Dilengkapi dari pelanggan", ["dilengkapi", "not.is", "null"]], ["hub", "Dari hub (belum diunggah Excel)", ["sumber", "eq", "Hub"]]],
    order: "tgl_faktur.desc.nullslast,cabang.asc,no_faktur.desc,baris.asc", dateCol: "tgl_faktur",
    fillMark: { nama_customer: "Nama", kategori_pelanggan: "Kategori Pelanggan", penjual_default: "Penjual Default", no_wa: "No WA", kecamatan: "*", kota: "*" }
  }
};
const TS = { pelanggan: { q: "", cab: "", chips: new Set(), page: 0, from: "", to: "", pilar: "" }, faktur: { q: "", cab: "", chips: new Set(), page: 0, from: "", to: "", pilar: "" } };
const PAGE = 50;
function tableQuery(kind) {
  const T = TABLES[kind], st = TS[kind]; const filters = [];
  const cab = lockedCabang() || st.cab; if (cab) filters.push(["cabang", "eq", cab]);
  for (const [k, , f] of T.chips) if (st.chips.has(k)) filters.push(f);
  if (T.dateCol && st.from) filters.push([T.dateCol, "gte", st.from]);
  if (T.dateCol && st.to) filters.push([T.dateCol, "lte", st.to]);
  if (kind === "faktur" && st.pilar) filters.push(["pilar", "eq", st.pilar]);
  const q = orSafe(st.q); return { filters, or: q ? T.search(q) : undefined, order: T.order };
}
const pagePelanggan = el => pageTable(el, "pelanggan");
const pageFaktur = el => pageTable(el, "faktur");
async function pageTable(el, kind) {
  const T = TABLES[kind], st = TS[kind];
  const q = tableQuery(kind);
  const { rows, count } = await db.select(T.view, { select: T.cols.map(c => c[0]).join(","), ...q, limit: PAGE, offset: st.page * PAGE, count: true });
  const total = count ?? rows.length; const pages = Math.max(1, Math.ceil(total / PAGE));
  const keep = document.activeElement && document.activeElement.id;
  el.innerHTML = `<section class="panel">
    <div class="toolbar">
      <input type="search" id="tq" placeholder="Cari ${kind === "pelanggan" ? "nama, ID, nomor WA" : "no faktur, nama, ID, barang, nomor WA"}…" value="${esc(st.q)}" aria-label="Cari">
      <select id="tcab" aria-label="Cabang"${lockedCabang() ? " disabled" : ""}>${cabangOptions(lockedCabang() || st.cab)}</select>
      ${kind === "faktur" ? `<select id="tpil" aria-label="Pilar"><option value="">Semua pilar</option>${PILAR_ORDER.concat(["TANPA PILAR"]).map(p => `<option${p === st.pilar ? " selected" : ""}>${p}</option>`).join("")}</select>
      <input type="date" id="tfrom" value="${st.from}" aria-label="Dari tanggal"><input type="date" id="tto" value="${st.to}" aria-label="Sampai tanggal">` : ""}
      <button id="texp">Unduh hasil filter</button>
    </div>
    <div class="toolbar">${T.chips.map(([k, l]) => `<button class="chip" data-chip="${k}" aria-pressed="${st.chips.has(k)}">${l}</button>`).join("")}</div>
    <p class="sub"><span class="pill ok">hijau</span> = diisi dari ${kind === "pelanggan" ? "faktur" : "Data Pelanggan"} · ${fmtN(total)} baris cocok dengan filter</p>
    <div class="tablebox" style="max-height:70vh"><table><thead><tr>${T.cols.map(([, l, t]) => `<th class="${t === "num" || t === "rp" ? "num" : ""}">${esc(l)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => { const fill = String(r.dilengkapi || ""); return `<tr>${T.cols.map(([k, , t]) => { const v = r[k]; const fm = T.fillMark[k]; const added = fm && !isEmpty(v) && (fm === "*" ? r.status_pelanggan === "Cocok" : fill.includes(fm));
      const cls = [k === "cabang" ? "cab" : "", t === "num" || t === "rp" ? "num" : "", /^(id_|no_)/.test(k) ? "mono" : "", added ? "added" : ""].filter(Boolean).join(" ");
      const txt = isEmpty(v) ? "" : t === "date" ? fmtDate(v) : t === "rp" ? fmtN(v) : t === "num" ? fmtN(v) : v === true ? "Ya" : v === false ? "" : v;
      return `<td class="${cls}">${esc(txt)}</td>`; }).join("")}</tr>`; }).join("") || `<tr><td colspan="${T.cols.length}" class="sub">Tidak ada data yang cocok.</td></tr>`}</tbody></table></div>
    <div class="pager"><span>Halaman ${fmtN(st.page + 1)} dari ${fmtN(pages)}</span><span class="toolbar"><button id="tprev"${st.page === 0 ? " disabled" : ""}>‹ Sebelumnya</button><button id="tnext"${st.page >= pages - 1 ? " disabled" : ""}>Berikutnya ›</button></span></div>
  </section>`;
  if (keep === "tq") { const i = $("#tq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  const re = () => pageTable(el, kind).catch(e => el.innerHTML = `<div class="notice bad">${esc(e.message)}</div>`);
  let tmr; $("#tq").oninput = e => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = e.target.value; st.page = 0; re(); }, 350); };
  $("#tcab").onchange = e => { st.cab = e.target.value; st.page = 0; re(); };
  if (kind === "faktur") { $("#tpil").onchange = e => { st.pilar = e.target.value; st.page = 0; re(); }; $("#tfrom").onchange = e => { st.from = e.target.value; st.page = 0; re(); }; $("#tto").onchange = e => { st.to = e.target.value; st.page = 0; re(); }; }
  el.querySelectorAll("[data-chip]").forEach(b => b.onclick = () => { const k = b.dataset.chip; if (st.chips.has(k)) st.chips.delete(k); else { st.chips.add(k); if (k === "wa") st.chips.delete("nowa"); if (k === "nowa") st.chips.delete("wa"); } st.page = 0; re(); });
  $("#tprev").onclick = () => { st.page--; re(); }; $("#tnext").onclick = () => { st.page++; re(); };
  $("#texp").onclick = () => exportFiltered(kind);
}

/* =================== EXPORT EXCEL =================== */
const EXTRA = {
  pelanggan: [["no_wa", "NO WA"], ["isi_kolom_telp_bukan_nomor", "ISI KOLOM TELP (BUKAN NOMOR)"], ["kategori_pelanggan", "KATEGORI PELANGGAN (LENGKAP)"], ["penjual_default", "PENJUAL DEFAULT (LENGKAP)"], ["jumlah_faktur", "JUMLAH FAKTUR"], ["total_belanja", "TOTAL BELANJA"], ["total_gross_profit", "TOTAL GROSS PROFIT"], ["faktur_pertama", "FAKTUR PERTAMA"], ["faktur_terakhir", "FAKTUR TERAKHIR"], ["no_faktur_terakhir", "NO FAKTUR TERAKHIR"], ["kategori_penjualan_terakhir", "KATEGORI PENJUALAN TERAKHIR"], ["no_wa_juga_di", "NO WA JUGA TERDAFTAR DI"], ["no_wa_ganda", "NO WA DIPAKAI >1 ID"], ["dilengkapi", "DILENGKAPI DARI FAKTUR"]],
  faktur: [["kategori_pelanggan", "KATEGORI PELANGGAN (LENGKAP)"], ["penjual_default", "PENJUAL DEFAULT (LENGKAP)"], ["no_wa", "NO WA"], ["kecamatan", "KECAMATAN"], ["kota", "KOTA"], ["referensi", "REFERENSI DARI"], ["tgl_daftar", "TGL DAFTAR PELANGGAN"], ["pilar", "PILAR"], ["biaya_vendor", "BIAYA SEWA VENDOR"], ["hpp", "HPP TOTAL"], ["gross_profit", "GROSS PROFIT"], ["status_pelanggan", "STATUS PELANGGAN"], ["dilengkapi", "DILENGKAPI DARI DATA PELANGGAN"]]
};
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
function toCell(v) { if (typeof v === "string") { const m = v.match(ISO_RE); if (m && v.length <= 25) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); } if (v === true) return "Ya"; if (v === false) return null; return v; }
// Urutan kolom asli Accurate diambil dari riwayat unggah (database menyimpan kolom tanpa urutan).
async function kolomOrder(kind) {
  try { const { rows } = await db.select("uploads", { select: "kolom", filters: [["jenis", "eq", kind]], order: "diunggah_pada.desc", limit: 100 }); const out = []; for (const r of rows) for (const k of (r.kolom || [])) if (!out.includes(k)) out.push(k); return out; }
  catch (e) { return []; }
}
function buildSheet(kind, rows, order = []) {
  const seen = new Set(); const found = [];
  for (const r of rows) for (const k of Object.keys(r.data || {})) if (!seen.has(k)) { seen.add(k); found.push(k); }
  const keys = [...order.filter(k => seen.has(k)), ...found.filter(k => !order.includes(k))];
  const head = ["CABANG", ...keys, ...EXTRA[kind].map(e => e[1])];
  const aoa = [head];
  for (const r of rows) { const d = r.data || {}; aoa.push([r.cabang, ...keys.map(k => toCell(d[k])), ...EXTRA[kind].map(([k]) => { const v = r[k]; if (k === "tgl_daftar" && v) { const d = new Date(v); return isNaN(d) ? v : d; } return toCell(v); })]); }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: "dd/mm/yyyy" });
  ws["!cols"] = head.map(h => ({ wch: Math.min(38, Math.max(10, String(h).length + 2)) }));
  return ws;
}
function progress(text) {
  let m = $("#modal"); if (!m) return { set() {}, close() {} };
  m.innerHTML = `<div class="modal"><form onsubmit="return false"><h2 style="margin:0">Menyiapkan Excel</h2><p class="sub" id="pgText">${esc(text)}</p></form></div>`;
  return { set(t) { const e = $("#pgText"); if (e) e.textContent = t; }, close() { m.innerHTML = ""; } };
}
function saveWb(wb, name) { XLSX.writeFile(wb, name, { compression: true }); }
async function exportFiltered(kind) {
  const T = TABLES[kind]; const q = tableQuery(kind); const pg = progress("Mengambil data…");
  try {
    const rows = await db.all(T.view, { select: "*", ...q }, n => pg.set(`Mengambil data… ${fmtN(n)} baris`));
    pg.set("Menyusun file Excel…"); await sleep(30);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, buildSheet(kind, rows, await kolomOrder(kind)), T.title);
    saveWb(wb, `MFlash-${kind === "pelanggan" ? "Pelanggan" : "Faktur"}-filter-${stamp()}.xlsx`); pg.close(); toast(`${fmtN(rows.length)} baris diunduh.`);
  } catch (e) { pg.close(); toast("Gagal mengunduh: " + e.message); }
}
async function exportDataCenter() {
  const pg = progress("Mengambil ringkasan…");
  try {
    const cab = lockedCabang(); const f = cab ? [["cabang", "eq", cab]] : [];
    const ring = await db.rpc("kualitas_data");
    const P = await db.all("v_pelanggan", { select: "*", filters: f, order: TABLES.pelanggan.order }, n => pg.set(`Mengambil Data Pelanggan… ${fmtN(n)} baris`));
    const F = await db.all("v_faktur", { select: "*", filters: f, order: TABLES.faktur.order }, n => pg.set(`Mengambil Faktur Penjualan… ${fmtN(n)} baris`));
    pg.set("Menyusun file Excel…"); await sleep(30);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ring.map(r => ({ "CABANG": r.cabang, "Jumlah Pelanggan": +r.pelanggan, "Punya No WA": +r.punya_wa, "Kolom Telp berisi non-nomor": +r.telp_bukan_nomor, "Jumlah Faktur": +r.jumlah_faktur, "Baris Faktur": +r.baris_faktur, "Baris Faktur Tidak Cocok": +r.faktur_tidak_cocok, "Faktur Dari": r.faktur_dari ? toCell(r.faktur_dari) : null, "Faktur Sampai": r.faktur_sampai ? toCell(r.faktur_sampai) : null })), { cellDates: true, dateNF: "dd/mm/yyyy" }), "Ringkasan");
    XLSX.utils.book_append_sheet(wb, buildSheet("pelanggan", P, await kolomOrder("pelanggan")), "Data Pelanggan");
    XLSX.utils.book_append_sheet(wb, buildSheet("faktur", F, await kolomOrder("faktur")), "Faktur Penjualan");
    saveWb(wb, `MFlash-DataCenter${cab ? "-" + cab.replace(/\s+/g, "") : ""}-${stamp()}.xlsx`); pg.close(); toast("Excel Data Center diunduh.");
  } catch (e) { pg.close(); toast("Gagal mengunduh: " + e.message); }
}

/* =================== UNGGAH =================== */
const ALIAS = {
  P: { id: ["id pelanggan", "no. pelanggan", "no pelanggan", "kode pelanggan"], nama: ["nama", "nama pelanggan"], kat: ["kategori pelanggan"], penjual: ["nama default penjual"], kec: ["kecamatan"], kota: ["kota"], ref: ["referensi dari", "referensi"], tgl: ["tgl/jam pembuatan", "tanggal pembuatan", "tgl pembuatan"] },
  B: { no: ["nomor #", "nomor # faktur", "no faktur", "no. faktur", "nomor faktur"], tgl: ["tanggal", "tgl faktur", "tanggal faktur"], kb: ["nama kategori barang", "kategori barang"], kode: ["kode #", "kode barang"], barang: ["nama barang", "keterangan barang"], qty: ["kuantitas", "qty"], harga: ["@harga", "harga satuan"], total: ["total harga", "total"], pemasok: ["pemasok", "nama pemasok"], keb: ["kategori kebutuhan"] },
  F: { id: ["id pelanggan", "no. pelanggan", "no pelanggan", "kode pelanggan"], nama: ["nama customer", "nama pelanggan"], no: ["no faktur", "no. faktur", "nomor faktur", "nomor # faktur"], tgl: ["tgl faktur", "tanggal faktur", "tanggal"], total: ["total harga", "total"], cost: ["harga beli", "hpp", "harga pokok"], kat: ["kategori pelanggan"], penjual: ["nama default penjual pelanggan faktur penjualan", "nama default penjual pelanggan sales invoice", "nama default penjual", "~nama default penjual"], kj: ["kategori penjualan"], kb: ["kategori barang"], pilar: ["kategori pilar faktur penjualan", "kategori pilar sales invoice", "kategori pilar", "pilar", "~pilar"], kode: ["kode barang"], barang: ["nama barang", "keterangan barang"], merk: ["merk unit"], tipe: ["tipe unit"], qty: ["qty", "kuantitas"], harga: ["@harga", "harga satuan"], admin: ["nama admin"], teknisi: ["nama teknisi (final)", "nama teknisi"] }
};
const PHONE_RE = /(telp|telepon|tlp|handphone|whatsapp|phone|\bhp\b|\bwa\b)/i;
const DATE_HDR = /(tgl|tanggal|date)/i;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
// "~kata" = cocok bila judul kolom mengandung kata itu (mis. "KATEGORI PILAR Sales Invoice" dari Accurate berbahasa Inggris)
function findCol(H, list) { const low = H.map(h => h.toLowerCase().replace(/\s+/g, " ").trim()); for (const a of list) { const i = a.startsWith("~") ? low.findIndex(h => h.includes(a.slice(1))) : low.indexOf(a); if (i >= 0) return H[i]; } return null; }
function normPhone(v) {
  if (v == null) return null;
  for (const p of String(v).split(/[\/,;|]| atau /i)) { let s = p.replace(/\D/g, ""); if (s.startsWith("62")) s = "0" + s.slice(2); if (s.startsWith("8")) s = "0" + s; if (/^08\d{7,12}$/.test(s)) return s; }
  return null;
}
// Tanggal Excel dibaca dari nomor seri lalu dipakai apa adanya (tanpa geser zona waktu).
function serialToDate(s) { const u = new Date(Math.round((s - 25569) * 86400) * 1000); return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds()); }
function sheetAOA(ws) {
  if (!ws || !ws["!ref"]) return [];
  const rg = XLSX.utils.decode_range(ws["!ref"]); const out = [];
  for (let r = rg.s.r; r <= rg.e.r; r++) {
    const row = []; let any = false;
    for (let c = rg.s.c; c <= rg.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]; let v = null;
      if (cell) {
        if (cell.t === "n" && cell.z && XLSX.SSF.is_date(cell.z)) v = serialToDate(cell.v);
        else if (cell.t === "d") v = cell.v instanceof Date ? cell.v : new Date(cell.v);
        else if (cell.t === "s") v = String(cell.v).trim() || null;
        else if (cell.t === "e" || cell.t === "z") v = null;
        else v = cell.v;
      }
      if (v != null && v !== "") any = true; row.push(v);
    }
    out.push(any ? row : null);
  }
  return out;
}
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
function detectBranch(name) {
  const m = name.toLowerCase().match(/(\d{3}mflash[a-z0-9]+)/);
  if (m) {
    const code = m[1]; if (S.kodeMap[code]) return S.kodeMap[code];
    const frag = code.replace(/^\d{3}mflash/, ""); for (const b of S.cabangs) { const s = slug(b); if (s.startsWith(frag) || frag.startsWith(s)) return b; }
  }
  const sf = slug(name); for (const b of S.cabangs) if (sf.includes(slug(b))) return b;
  return "";
}
/* ---- Rincian Pemindahan Barang: laporan cetak Accurate (bukan tabel datar) ---- */
const BLN_ID = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };
function parseTglId(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return ymd(v);
  if (typeof v === "number" && v > 20000 && v < 80000) return ymd(serialToDate(v));
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[\s\-/]+([A-Za-z]{3,})[\s\-/]+(\d{4})/); if (m && BLN_ID[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(BLN_ID[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}
const isPindahanReport = (aoa, name) => /pemindahan|pindah_barang|transfer_barang/i.test(name) || aoa.slice(0, 8).some(r => r && r.some(v => typeof v === "string" && /pemindahan barang/i.test(v)));
function parsePindahan(aoa) {
  const cells = r => (r || []).map((v, i) => [i, v]).filter(([, v]) => v != null && String(v).trim() !== "");
  let periode = null, judul = null, meta = {}, itemsSinceMeta = false, col = null; const recs = []; let baris = 0;
  for (let r = 0; r < aoa.length; r++) {
    const c = cells(aoa[r]); if (!c.length) continue;
    const texts = c.map(([, v]) => typeof v === "string" ? v.trim() : v);
    const first = String(texts[0]);
    if (!judul && r < 3 && c.length === 1 && /mflash/i.test(first)) judul = first;
    const pm = c.length <= 2 && typeof texts[0] === "string" && texts[0].match(/^dari\s+(.+?)\s+s\/?d\s+(.+)$/i);
    if (pm) { periode = { dari: parseTglId(pm[1]), sampai: parseTglId(pm[2]) }; continue; }
    if (/^(ACCURATE|Tercetak|Halaman)/i.test(first)) continue;
    // baris judul tabel barang
    const lower = texts.map(t => String(t).toLowerCase());
    if (lower.some(t => t === "nama barang") && lower.some(t => /^(kuantitas|qty|jumlah)$/.test(t))) {
      col = {}; c.forEach(([i, v]) => { const t = String(v).toLowerCase().trim(); if (/^kode/.test(t)) col.kode = i; else if (t === "nama barang") col.nama = i; else if (/^(kuantitas|qty|jumlah)$/.test(t)) col.qty = i; else if (/^satuan|^unit$/.test(t)) col.satuan = i; else if (/^(keterangan|catatan)/.test(t)) col.ket = i; });
      continue;
    }
    // pasangan "Label : nilai" (bisa lebih dari satu per baris)
    const pairs = [];
    for (let k = 0; k < c.length; k++) {
      const t = String(c[k][1]).trim();
      if (t === ":" && k > 0) { const lab = String(c[k - 1][1]).trim(); const nx = c[k + 1]; const val = nx && !(c[k + 2] && String(c[k + 2][1]).trim() === ":") ? nx[1] : null; pairs.push([lab, val]); }
      else if (/^[A-Za-z][^:]{1,40}:\s*$/.test(t)) { const nx = c[k + 1]; pairs.push([t.replace(/:\s*$/, ""), nx ? nx[1] : null]); }
    }
    if (pairs.length) {
      if (itemsSinceMeta) { meta = {}; itemsSinceMeta = false; col = null; }
      for (const [lab, val] of pairs) {
        const l = lab.toLowerCase(); meta.raw = meta.raw || {}; if (val != null) meta.raw[lab] = val instanceof Date ? ymd(val) : val;
        if (/^tanggal|^tgl/.test(l)) meta.tanggal = parseTglId(val);
        else if (/nomor|^no\b|^no\./.test(l)) meta.nomor = val == null ? null : String(val).trim();
        else if (/gudang/.test(l) && !/alamat/.test(l)) meta.gudang = val == null ? null : String(val).trim();
        else if (/alamat/.test(l) && !/gudang/.test(l)) meta.alamat = val == null ? null : String(val).trim();
        else if (/keterangan|catatan|deskripsi/.test(l)) meta.keterangan = val == null ? null : String(val).trim();
      }
      continue;
    }
    if (col && col.nama != null) {
      const a = aoa[r]; const nama = a[col.nama]; if (nama == null || String(nama).trim() === "") continue;
      const qty = col.qty != null ? num(a[col.qty]) : null;
      baris++; itemsSinceMeta = true;
      const kode = col.kode != null && a[col.kode] != null ? String(a[col.kode]).trim() : null;
      const satuan = col.satuan != null && a[col.satuan] != null ? String(a[col.satuan]).trim() : null;
      recs.push({ tanggal: meta.tanggal || null, nomor: meta.nomor || null, gudang: meta.gudang || null, alamat: meta.alamat || null,
        keterangan: meta.keterangan || (col.ket != null && a[col.ket] != null ? String(a[col.ket]).trim() : null),
        baris, kode_barang: kode, nama_barang: String(nama).trim(), qty, satuan,
        data: { ...(meta.raw || {}), "Kode Barang": kode, "Nama Barang": String(nama).trim(), "Kuantitas": qty, "Satuan": satuan } });
    }
  }
  return { recs, periode, judul };
}
async function parseFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, cellNF: true });
  const aoa = sheetAOA(wb.Sheets[wb.SheetNames[0]]);
  if (isPindahanReport(aoa, file.name)) {
    const { recs, periode, judul } = parsePindahan(aoa);
    if (!recs.length) throw new Error("laporan Pemindahan Barang terbaca, tetapi tidak ada baris barang");
    let detected = detectBranch(file.name); if (!detected && judul) detected = detectBranch(judul);
    return { id: Math.random().toString(36).slice(2), name: file.name, headers: ["TANGGAL", "NOMOR", "GUDANG TUJUAN/DARI", "KODE BARANG", "NAMA BARANG", "KUANTITAS", "SATUAN"], rows: recs, kind: "pindahan", detected, branch: lockedCabang() || detected, periode, status: "siap", done: 0 };
  }
  const hi =aoa.findIndex(r => r && r.filter(v => typeof v === "string" && v.trim()).length >= 3);
  if (hi < 0) throw new Error("baris judul kolom tidak ditemukan");
  const cols = []; const seen = {};
  aoa[hi].forEach((h, i) => { if (h == null || !String(h).trim()) return; let n = String(h).trim(); if (seen[n]) { seen[n]++; n += " (" + seen[n] + ")"; } else seen[n] = 1; cols.push([i, n]); });
  const H = cols.map(c => c[1]); const rows = [];
  for (let r = hi + 1; r < aoa.length; r++) {
    const a = aoa[r]; if (!a) continue; const o = {}; let any = false;
    for (const [i, h] of cols) { let v = a[i]; if (typeof v === "number" && DATE_HDR.test(h) && v > 20000 && v < 80000 && !/(no|nomor|#)/i.test(h)) v = serialToDate(v); if (v != null && v !== "") any = true; o[h] = v ?? null; }
    if (any) rows.push(o);
  }
  const kind = (/pembelian/i.test(file.name) || findCol(H, ALIAS.B.pemasok)) ? "pembelian" : findCol(H, ALIAS.F.no) ? "faktur" : findCol(H, ALIAS.P.id) ? "pelanggan" : /faktur/i.test(file.name) ? "faktur" : /pelanggan/i.test(file.name) ? "pelanggan" : "";
  const detected = detectBranch(file.name);
  return { id: Math.random().toString(36).slice(2), name: file.name, headers: H, rows, kind, detected, branch: lockedCabang() || detected, status: "siap", done: 0 };
}
const num = v => { if (v == null || v === "") return null; const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : null; };
const txt = v => v == null || v === "" ? null : v instanceof Date ? isoLocal(v) : String(v).trim() || null;
const dataObj = r => { const o = {}; for (const [k, v] of Object.entries(r)) if (v != null && v !== "") o[k] = v instanceof Date ? isoLocal(v) : v; return o; };
function mapPelanggan(f) {
  const H = f.headers, c = k => findCol(H, ALIAS.P[k]); const ph = H.filter(h => PHONE_RE.test(h));
  const map = new Map();
  for (const r of f.rows) {
    const id = txt(r[c("id")]); if (!id) continue;
    let wa = null, raw = null; for (const h of ph) { if (isEmpty(r[h])) continue; if (raw == null) raw = String(r[h]); const n = normPhone(r[h]); if (n) { wa = n; break; } }
    const tg = r[c("tgl")];
    map.set(id, { cabang: f.branch, id_pelanggan: id, nama: txt(r[c("nama")]), kategori_pelanggan: txt(r[c("kat")]), penjual_default: txt(r[c("penjual")]), telp_asli: raw, no_wa: wa, kecamatan: txt(r[c("kec")]), kota: txt(r[c("kota")]), referensi: txt(r[c("ref")]), tgl_daftar: tg instanceof Date ? isoLocal(tg) + "+07:00" : null, data: dataObj(r) });
  }
  return [...map.values()];
}
function mapPembelian(f) {
  const H = f.headers, c = k => findCol(H, ALIAS.B[k]); const out = []; const seq = {};
  for (const r of f.rows) {
    const no = txt(r[c("no")]); if (!no) continue; seq[no] = (seq[no] || 0) + 1; const tg = r[c("tgl")];
    out.push({ no_faktur: no, baris: seq[no], tgl: tg instanceof Date ? ymd(tg) : null, kategori_barang: txt(r[c("kb")]), kode_barang: txt(r[c("kode")]), nama_barang: txt(r[c("barang")]), qty: num(r[c("qty")]), harga_satuan: num(r[c("harga")]), total_harga: num(r[c("total")]) ?? 0, pemasok: txt(r[c("pemasok")]), kategori_kebutuhan: txt(r[c("keb")]), data: dataObj(r) });
  }
  return out;
}
function mapFaktur(f) {
  const H = f.headers, c = k => findCol(H, ALIAS.F[k]); const out = []; const seq = {};
  for (const r of f.rows) {
    const no = txt(r[c("no")]); if (!no) continue; seq[no] = (seq[no] || 0) + 1;
    const tg = r[c("tgl")];
    out.push({ no_faktur: no, baris: seq[no], tgl_faktur: tg instanceof Date ? ymd(tg) : null, id_pelanggan: txt(r[c("id")]), nama_customer: txt(r[c("nama")]), kategori_pelanggan: txt(r[c("kat")]), kategori_penjualan: txt(r[c("kj")]), kategori_barang: txt(r[c("kb")]), pilar: txt(r[c("pilar")]), kode_barang: txt(r[c("kode")]), nama_barang: txt(r[c("barang")]), merk_unit: txt(r[c("merk")]), tipe_unit: txt(r[c("tipe")]), qty: num(r[c("qty")]), harga_satuan: num(r[c("harga")]), total_harga: num(r[c("total")]) ?? 0, harga_beli: num(r[c("cost")]), penjual_default: txt(r[c("penjual")]), nama_admin: txt(r[c("admin")]), nama_teknisi: txt(r[c("teknisi")]), data: dataObj(r) });
  }
  return out;
}
let UP = [];
const uploader = () => (LS.get("mfdc-uploader") || "").trim();
let U_TAB = "unggah";
async function pageUnggah(el) {
  const [{ rows: hist }, pinOn, stat] = await Promise.all([
    db.select("uploads", { select: "id,cabang,jenis,nama_file,jumlah_baris,periode_dari,periode_sampai,diunggah_nama,diunggah_pada", order: "diunggah_pada.desc", limit: 50 }),
    db.rpc("pin_aktif").catch(() => false), db.rpc("kualitas_data").catch(() => [])]);
  const hub = await db.rpc("hub_status").catch(() => null);
  const histHtml = `<section class="panel"><h2>Riwayat unggah</h2>
    <p class="sub">Tombol <b>Hapus</b> menghapus data yang berasal dari unggahan itu. Pelanggan yang sudah diperbarui oleh unggahan lain yang lebih baru tidak ikut terhapus.</p>
    <div class="tablebox"><table><thead><tr><th>Waktu</th><th>Cabang</th><th>Jenis</th><th>File</th><th class="num">Baris</th><th>Periode faktur</th><th>Oleh</th><th></th></tr></thead><tbody>
    ${hist.map(h => `<tr><td>${fmtDateTime(h.diunggah_pada)}</td><td class="cab">${esc(h.cabang)}</td><td>${{ faktur: "Faktur Penjualan", pembelian: "Faktur Pembelian", pelanggan: "Data Pelanggan", pindahan: "Pemindahan Barang" }[h.jenis] || h.jenis}</td><td class="mono" style="white-space:normal;word-break:break-all;min-width:200px">${esc(h.nama_file)}</td><td class="num">${fmtN(h.jumlah_baris)}</td><td>${h.periode_dari ? fmtDate(h.periode_dari) + " – " + fmtDate(h.periode_sampai) : "–"}</td><td>${esc(h.diunggah_nama || "")}</td><td><button data-delup="${h.id}">Hapus</button></td></tr>`).join("") || `<tr><td colspan="8" class="sub">Belum ada data yang diunggah.</td></tr>`}</tbody></table></div>
  </section>`;
  const tot = stat.reduce((o, s) => (o.p += +s.pelanggan, o.f += +s.baris_faktur, o.b += +(s.baris_pembelian || 0), o.m += +(s.baris_pindahan || 0), o), { p: 0, f: 0, b: 0, m: 0 });
  el.innerHTML = `<div style="display:grid;gap:14px">
  <div class="toolbar"><button class="chip" data-ut="unggah" aria-pressed="${U_TAB === "unggah"}">Unggah data</button><button class="chip" data-ut="hapus" aria-pressed="${U_TAB === "hapus"}">Hapus / Reset data</button></div>
  ${U_TAB === "unggah" ? `<section class="panel"><div><h2>Unggah file Accurate</h2>
    <p class="sub">Unggah export <b>Daftar Pelanggan</b>, <b>Rincian Faktur Penjualan</b>, <b>Rincian Faktur Pembelian</b> (untuk biaya sewa vendor), dan <b>Rincian Pemindahan Barang</b> (nama unit milik sendiri yang keluar lewat gudang sewa). Bisa banyak file dari cabang mana saja sekaligus. Pelanggan dengan ID yang sama diperbarui. Faktur dengan nomor yang sama diganti versi terbaru, dan pemindahan barang diganti per cabang untuk periode di file. Jadi aman mengunggah periode yang tumpang tindih.</p></div>
    <label style="display:grid;gap:4px;font-weight:600;font-size:13px;max-width:360px">Nama pengunggah<input id="upName" value="${esc(LS.get("mfdc-uploader") || "")}" placeholder="mis. Admin Bintara" autocomplete="name"></label>
    <label class="drop" id="drop" tabindex="0"><div><strong>Tarik file .xlsx ke sini, atau klik untuk memilih</strong><span class="sub">Cabang dikenali dari nama file (misal 003mflashbintar → Bintara)</span></div><span class="btn">Pilih file</span>
      <input type="file" id="fileInput" class="hidden-input" accept=".xlsx,.xls" multiple></label>
    <div id="upList"></div>
  </section>` : `<section class="panel"><div><h2>Hapus / Reset data</h2>
    <p class="sub">Untuk pembaruan harian: kosongkan data, lalu unggah ulang file Accurate terbaru di tab <b>Unggah data</b>. Data yang dihapus <b>tidak bisa dikembalikan</b>. Isi database sekarang: <b>${fmtN(tot.p)}</b> pelanggan, <b>${fmtN(tot.f)}</b> baris faktur penjualan, <b>${fmtN(tot.b)}</b> baris faktur pembelian, dan <b>${fmtN(tot.m)}</b> baris pemindahan barang.</p></div>
    <div class="toolbar">
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Cabang<select id="hCab"><option value="">Semua cabang</option>${S.cabangs.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Data yang dihapus<select id="hJenis"><option value="semua">Semua (pelanggan, faktur, pembelian, pemindahan)</option><option value="faktur">Faktur Penjualan saja</option><option value="pelanggan">Data Pelanggan saja</option><option value="pembelian">Faktur Pembelian saja</option><option value="pindahan">Pemindahan Barang saja</option></select></label>
      ${pinOn ? `<label style="display:grid;gap:4px;font-weight:600;font-size:13px">PIN hapus<input id="hPin" type="password" autocomplete="off" style="width:130px"></label>` : ""}
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Ketik HAPUS untuk konfirmasi<input id="hKonf" autocomplete="off" style="width:200px"></label>
    </div>
    <p class="sub" id="hInfo"></p>
    <div class="toolbar"><button class="danger" id="hBtn" disabled>Hapus data</button><span class="sub" id="hMsg" role="status"></span></div>
    ${pinOn ? "" : `<p class="sub">Belum ada PIN hapus, jadi siapa pun yang membuka aplikasi bisa menghapus data. Cara memasang PIN ada di README (bagian Hapus / Reset).</p>`}
  </section>`}
  ${U_TAB === "unggah" ? hubCard(hub) : ""}
  ${histHtml}</div>`;
  el.querySelectorAll("[data-ut]").forEach(b => b.onclick = () => { U_TAB = b.dataset.ut; pageUnggah(el); });
  el.querySelectorAll("[data-delup]").forEach(b => b.onclick = async () => {
    if (!b.classList.contains("danger")) { b.classList.add("danger"); b.textContent = "Klik lagi untuk hapus"; setTimeout(() => { if (b.isConnected) { b.classList.remove("danger"); b.textContent = "Hapus"; } }, 4000); return; }
    let pin = null; if (pinOn) { pin = window.prompt ? window.prompt("PIN hapus:") : null; if (!pin) { toast("Masukkan PIN untuk menghapus. Atau gunakan tab Hapus / Reset data."); return; } }
    b.disabled = true;
    try { const r = await db.rpc("hapus_upload", { p_upload: +b.dataset.delup, p_pin: pin }); BULAN = null; toast(`Terhapus: ${fmtN(r.pelanggan)} pelanggan, ${fmtN(r.faktur)} baris faktur, ${fmtN(r.pembelian || 0)} baris pembelian, ${fmtN(r.pindahan || 0)} baris pemindahan.`); pageUnggah(el); }
    catch (e) { toast("Gagal menghapus: " + e.message); b.disabled = false; }
  });
  if (U_TAB === "hapus") {
    const upd = () => {
      const c = $("#hCab", el).value, j = $("#hJenis", el).value; const rs = c ? stat.filter(s => s.cabang === c) : stat;
      const p = rs.reduce((o, s) => o + +s.pelanggan, 0), f = rs.reduce((o, s) => o + +s.baris_faktur, 0), bb = rs.reduce((o, s) => o + +(s.baris_pembelian || 0), 0), mm = rs.reduce((o, s) => o + +(s.baris_pindahan || 0), 0);
      const parts = []; if (j === "semua" || j === "pelanggan") parts.push(`<b>${fmtN(p)}</b> pelanggan`); if (j === "semua" || j === "faktur") parts.push(`<b>${fmtN(f)}</b> baris faktur penjualan`); if (j === "semua" || j === "pembelian") parts.push(`<b>${fmtN(bb)}</b> baris faktur pembelian`); if (j === "semua" || j === "pindahan") parts.push(`<b>${fmtN(mm)}</b> baris pemindahan barang`);
      $("#hInfo", el).innerHTML = `Akan menghapus ${parts.join(", ")} dari <b>${esc(c || "semua cabang")}</b>, beserta riwayat unggahnya.`;
      $("#hBtn", el).disabled = $("#hKonf", el).value.trim().toUpperCase() !== "HAPUS" || (pinOn && !$("#hPin", el).value);
    };
    ["hCab", "hJenis", "hKonf", "hPin"].forEach(id => { const x = $("#" + id, el); if (x) x.oninput = x.onchange = upd; });
    upd();
    $("#hBtn", el).onclick = async () => {
      const b = $("#hBtn", el); b.disabled = true; $("#hMsg", el).textContent = "Menghapus…";
      try {
        const r = await db.rpc("hapus_data", { p_cabang: $("#hCab", el).value || null, p_jenis: $("#hJenis", el).value, p_pin: pinOn ? $("#hPin", el).value : null });
        BULAN = null; toast(`Terhapus: ${fmtN(r.pelanggan)} pelanggan, ${fmtN(r.faktur)} baris faktur, ${fmtN(r.pembelian || 0)} baris pembelian, ${fmtN(r.pindahan || 0)} baris pemindahan.`); U_TAB = "unggah"; pageUnggah(el);
      } catch (e) { $("#hMsg", el).textContent = "Gagal: " + e.message; upd(); }
    };
    return;
  }
  $("#upName", el).oninput = e => { LS.set("mfdc-uploader", e.target.value.trim() || null); renderUpList(); };
  const inp = $("#fileInput", el), drop = $("#drop", el);
  const add = async list => {
    for (const file of [...list]) { try { const f = await parseFile(file); UP = UP.filter(x => x.name !== f.name); UP.push(f); } catch (e) { UP.push({ id: Math.random().toString(36).slice(2), name: file.name, rows: [], kind: "", branch: "", status: "gagal", err: "Gagal dibaca: " + e.message }); } }
    renderUpList();
  };
  inp.onchange = e => { add(e.target.files); inp.value = ""; };
  drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inp.click(); } });
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => add(e.dataTransfer.files));
  renderUpList();
}
function upProblem(f) {
  if (f.status === "gagal") return f.err;
  if (!f.kind) return "Pilih jenis data.";
  if (!f.branch) return "Pilih cabang.";
  if (lockedCabang() && f.detected && f.detected !== lockedCabang()) return `Nama file menunjukkan cabang ${f.detected}, bukan ${lockedCabang()}.`;
  if (f.kind === "pindahan" && f.headers[0] !== "TANGGAL") return "File ini bukan laporan Rincian Pemindahan Barang.";
  if (f.kind !== "pindahan" && f.headers[0] === "TANGGAL" && f.headers[2] === "GUDANG TUJUAN/DARI") return "File ini laporan Rincian Pemindahan Barang; pilih jenis Pemindahan Barang.";
  if (f.kind === "pembelian" && !findCol(f.headers, ALIAS.B.no)) return "Kolom nomor faktur pembelian (Nomor #) tidak ditemukan.";
  if (f.kind === "pembelian" && !findCol(f.headers, ALIAS.B.total)) return "Kolom Total Harga tidak ditemukan di faktur pembelian.";
  if (f.kind === "faktur" && !findCol(f.headers, ALIAS.F.cost)) return "Kolom HARGA BELI tidak ada; gross profit tidak bisa dihitung. Tambahkan kolom itu di template export.";
  return "";
}
function renderUpList() {
  const box = $("#upList"); if (!box) return;
  if (!UP.length) { box.innerHTML = ""; return; }
  const busy = UP.some(f => f.status === "mengunggah");
  const ready = UP.filter(f => f.status === "siap" && !upProblem(f));
  box.innerHTML = `<div class="tablebox"><table><thead><tr><th>File</th><th>Jenis</th><th>Cabang</th><th class="num">Baris</th><th>Status</th><th></th></tr></thead><tbody>
    ${UP.map(f => { const p = upProblem(f); const pr = f.total ? Math.round(f.done / f.total * 100) : 0;
      return `<tr><td class="mono" style="white-space:normal;word-break:break-all;min-width:200px">${esc(f.name)}</td>
      <td><select data-id="${f.id}" data-k="kind" aria-label="Jenis"${f.status !== "siap" ? " disabled" : ""}><option value="">— pilih —</option><option value="pelanggan"${f.kind === "pelanggan" ? " selected" : ""}>Data Pelanggan</option><option value="faktur"${f.kind === "faktur" ? " selected" : ""}>Faktur Penjualan</option><option value="pembelian"${f.kind === "pembelian" ? " selected" : ""}>Faktur Pembelian</option><option value="pindahan"${f.kind === "pindahan" ? " selected" : ""}>Pemindahan Barang</option></select></td>
      <td><select data-id="${f.id}" data-k="branch" aria-label="Cabang"${lockedCabang() || f.status !== "siap" ? " disabled" : ""}><option value="">— pilih cabang —</option>${S.cabangs.map(b => `<option${b === f.branch ? " selected" : ""}>${esc(b)}</option>`).join("")}</select></td>
      <td class="num">${fmtN(f.rows.length)}</td>
      <td style="white-space:normal;min-width:220px">${f.status === "selesai" ? `<span class="pill ok">Terunggah</span> ${esc(f.msg || "")}` : f.status === "mengunggah" ? `<div class="bar"><span style="width:${pr}%"></span></div><span class="sub">${pr}%</span>` : f.status === "error" ? `<span class="pill bad">Gagal</span> ${esc(f.err)}` : p ? `<span class="pill bad">Perlu dicek</span> ${esc(p)}` : `<span class="pill warn">Siap diunggah</span>`}</td>
      <td>${f.status === "mengunggah" ? "" : `<button data-rm="${f.id}">Hapus</button>`}</td></tr>`; }).join("")}</tbody></table></div>
    <div class="toolbar"><button class="primary" id="bUpload"${busy || !ready.length || !uploader() ? " disabled" : ""}>Unggah ${ready.length} file ke server</button>${!uploader() && ready.length ? `<span class="sub">Isi nama pengunggah dulu.</span>` : ""}${UP.some(f => f.status === "selesai") && !busy ? `<button id="bClearDone">Bersihkan daftar</button>` : ""}</div>`;
  box.querySelectorAll("select").forEach(s => s.onchange = () => { const f = UP.find(x => x.id === s.dataset.id); f[s.dataset.k] = s.value; renderUpList(); });
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { UP = UP.filter(x => x.id !== b.dataset.rm); renderUpList(); });
  const bu = $("#bUpload"); if (bu) bu.onclick = uploadAll;
  const bc = $("#bClearDone"); if (bc) bc.onclick = () => { UP = UP.filter(f => f.status !== "selesai"); renderUpList(); };
}
async function uploadAll() {
  const list = UP.filter(f => f.status === "siap" && !upProblem(f));
  // Pelanggan dulu, supaya faktur langsung bisa dilengkapi.
  list.sort((a, b) => ({ pelanggan: 0, faktur: 1, pembelian: 2, pindahan: 3 }[a.kind] - { pelanggan: 0, faktur: 1, pembelian: 2, pindahan: 3 }[b.kind]));
  for (const f of list) {
    f.status = "mengunggah"; f.done = 0; renderUpList();
    try {
      if (f.kind === "pelanggan") {
        const recs = mapPelanggan(f); f.total = recs.length;
        const [u] = await db.insert("uploads", [{ cabang: f.branch, jenis: "pelanggan", nama_file: f.name, jumlah_baris: recs.length, kolom: f.headers, diunggah_nama: uploader() }], { returning: true });
        for (let i = 0; i < recs.length; i += 500) {
          await db.insert("pelanggan", recs.slice(i, i + 500).map(r => ({ ...r, upload_id: u.id, diperbarui: new Date().toISOString() })), { upsert: true, onConflict: "cabang,id_pelanggan" });
          f.done = Math.min(recs.length, i + 500); renderUpList();
        }
        f.msg = `${fmtN(recs.length)} pelanggan disimpan.`;
      } else if (f.kind === "pindahan") {
        if (f.headers[0] !== "TANGGAL") throw new Error("File ini bukan laporan Rincian Pemindahan Barang.");
        const recs = f.rows; f.total = recs.length;
        const dates = recs.map(r => r.tanggal).filter(Boolean).sort();
        const dari = f.periode?.dari || dates[0] || null, sampai = f.periode?.sampai || dates[dates.length - 1] || null;
        const [u] = await db.insert("uploads", [{ cabang: f.branch, jenis: "pindahan", nama_file: f.name, jumlah_baris: recs.length, kolom: f.headers, periode_dari: dari, periode_sampai: sampai, diunggah_nama: uploader() }], { returning: true });
        for (let i = 0; i < recs.length; i += 500) {
          await db.rpc("simpan_pindahan", { p_cabang: f.branch, p_upload: u.id, p_dari: dari, p_sampai: sampai, p_hapus: i === 0, p_rows: recs.slice(i, i + 500) });
          f.done = Math.min(recs.length, i + 500); renderUpList();
        }
        const sw = recs.filter(r => /SEWA/i.test(r.gudang || ""));
        f.msg = `${fmtN(recs.length)} baris pemindahan disimpan; ${fmtN(sw.reduce((a, r) => a + (r.qty || 0), 0))} unit lewat gudang sewa.` + (dari && sampai ? ` Data pemindahan ${f.branch} periode ${fmtDate(dari)} – ${fmtDate(sampai)} diganti dengan file ini.` : "");
      } else {
        const beli = f.kind === "pembelian";
        const recs = beli ? mapPembelian(f) : mapFaktur(f); f.total = recs.length;
        const dates = recs.map(r => beli ? r.tgl : r.tgl_faktur).filter(Boolean).sort();
        const [u] = await db.insert("uploads", [{ cabang: f.branch, jenis: f.kind, nama_file: f.name, jumlah_baris: recs.length, kolom: f.headers, periode_dari: dates[0] || null, periode_sampai: dates[dates.length - 1] || null, diunggah_nama: uploader() }], { returning: true });
        // kirim per kelompok faktur utuh (satu faktur tidak terpotong)
        const byNo = new Map(); for (const r of recs) { if (!byNo.has(r.no_faktur)) byNo.set(r.no_faktur, []); byNo.get(r.no_faktur).push(r); }
        let chunk = [];
        const flush = async () => { if (!chunk.length) return; await db.rpc(beli ? "simpan_pembelian" : "simpan_faktur", { p_cabang: f.branch, p_upload: u.id, p_rows: chunk }); f.done += chunk.length; chunk = []; renderUpList(); };
        for (const rows of byNo.values()) { if (chunk.length + rows.length > 500) await flush(); chunk.push(...rows); }
        await flush();
        const sewa = beli ? recs.filter(r => /SEWA/i.test(r.nama_barang || "") || /^SEWA$/i.test((r.kategori_barang || "").trim())) : [];
        f.msg = `${fmtN(byNo.size)} faktur ${beli ? "pembelian " : ""}(${fmtN(recs.length)} baris) disimpan.` + (beli ? ` Biaya sewa vendor: ${rp(sewa.reduce((a, r) => a + (r.total_harga || 0), 0))} (${fmtN(sewa.length)} baris SEWA).` : "");
      }
      f.status = "selesai";
    } catch (e) { f.status = "error"; f.err = e.message; }
    renderUpList();
  }
  if (UP.some(f => f.status === "selesai")) { BULAN = null; toast("Unggah selesai. Dashboard sudah memakai data baru."); if (S.page === "unggah") go("unggah"); }
}

/* =================== TARIKAN OTOMATIS HUB =================== */
function hubCard(h) {
  if (!h) return "";
  const log = h.log || [], per = h.per_cabang || [], last = log[0];
  const okLast = log.find(l => l.ok); const gagal = log.filter(l => !l.ok && okLast && new Date(l.waktu) > new Date(okLast.waktu));
  const lama = okLast ? (Date.now() - new Date(okLast.waktu).getTime()) / 864e5 : null;
  const pill = !log.length ? `<span class="pill warn">Belum pernah jalan</span>` : last.ok && lama < 2 ? `<span class="pill ok">Berjalan</span>` : `<span class="pill bad">Perlu dicek</span>`;
  return `<section class="panel"><h2>Tarikan otomatis dari hub MFlash ${pill}</h2>
    <p class="sub">Faktur ditarik otomatis setiap hari 03.15 WIB (satu baris per faktur). Faktur yang <b>belum diunggah lewat Excel</b> tetap tampil di dashboard dari data hub, ditandai Sumber data = Hub. Begitu Excel cabang itu diunggah, baris rinci dari Excel yang dipakai (nama barang, QTY, pelanggan).</p>
    ${h.pembelian || h.pemindahan ? `<p class="sub">Juga ditarik: <b>Faktur Pembelian</b> ${fmtN(h.pembelian?.baris)} baris${h.pembelian?.sewa ? ` (biaya sewa vendor ${rp(h.pembelian.biaya_sewa)} dari ${fmtN(h.pembelian.sewa)} baris SEWA)` : ""} · <b>Pemindahan Barang</b> ${fmtN(h.pemindahan?.baris)} baris (${fmtN(h.pemindahan?.gudang_sewa)} lewat gudang sewa). Dipakai untuk biaya vendor dan unit milik sendiri bila Excel-nya belum diunggah.</p>` : ""}
    ${last ? `<p class="sub">${["faktur", "pembelian", "pemindahan"].map(j => log.find(l => (l.jenis || "faktur") === j)).filter(Boolean).map(l => `<b>${esc({ faktur: "Faktur penjualan", pembelian: "Faktur pembelian", pemindahan: "Pemindahan barang" }[l.jenis || "faktur"])}</b>: ${fmtDateTime(l.waktu)} · ${l.ok ? `${fmtN(l.jml)} baris (${fmtDate(l.dari)} – ${fmtDate(l.sampai)})${l.dihapus ? `, ${fmtN(l.dihapus)} dihapus karena sudah tidak ada di Accurate` : ""}` : `<span style="color:var(--bad)">gagal: ${esc(l.pesan || "")}</span>`}`).join("<br>") || `Terakhir: ${fmtDateTime(last.waktu)} · <span style="color:var(--bad)">${esc(last.pesan || "")}</span>`}${last.tgl_data_terakhir ? `<br>Data hub sampai ${esc(last.tgl_data_terakhir)}` : ""}${lama != null && lama >= 2 ? ` · <b style="color:var(--bad)">tarikan berhasil terakhir ${Math.floor(lama)} hari lalu</b>` : ""}</p>` : `<p class="sub">Belum ada tarikan. Pasang Edge Function <span class="mono">tarik-mflash</span> dan jadwalnya (lihat README bagian Tarikan otomatis).</p>`}
    ${(h.cabang_tak_dikenal || []).length ? `<div class="notice warn">Nama cabang dari hub yang tidak cocok dengan daftar cabang aplikasi: <b>${esc(h.cabang_tak_dikenal.join(", "))}</b>. Fakturnya belum dipakai di dashboard.</div>` : ""}
    ${per.length ? `<div class="tablebox"><table><thead><tr><th>Cabang</th><th class="num">Faktur di hub</th><th>Periode</th><th class="num">Nilai</th><th class="num">Belum ada di Excel</th><th>Diperbarui</th></tr></thead><tbody>
      ${per.map(r => `<tr><td class="cab">${esc(r.cabang)}</td><td class="num">${fmtN(r.faktur_hub)}</td><td>${fmtDate(r.dari)} – ${fmtDate(r.sampai)}</td><td class="num">${rp(r.nilai_hub)}</td><td class="num">${+r.belum_diunggah ? `<span class="pill warn">${fmtN(r.belum_diunggah)}</span>` : `<span class="pill ok">0</span>`}</td><td>${fmtDateTime(r.diperbarui)}</td></tr>`).join("")}</tbody></table></div>` : ""}
  </section>`;
}

/* =================== KUALITAS DATA =================== */
async function pageKualitas(el) {
  const [rows, hub] = await Promise.all([db.rpc("kualitas_data"), db.rpc("hub_status").catch(() => null)]);
  const issues = [];
  for (const r of (hub?.per_cabang || [])) if (+r.belum_diunggah) issues.push(["warn", `${r.cabang}: ${fmtN(r.belum_diunggah)} faktur dari hub belum ada di unggahan Excel`, `Faktur ini sudah ikut dashboard dari data hub (omzet, harga beli, pilar, sales), tetapi tanpa nama barang, QTY per barang, dan data pelanggan. Unggah Rincian Faktur Penjualan cabang ini untuk rinciannya.`]);
  for (const s of rows) {
    const pel = +s.pelanggan, wa = +s.punya_wa, raw = +s.telp_bukan_nomor, top = (s.contoh_isi_telp || []).map(x => `${x.isi} (${fmtN(x.jumlah)})`).join(", ");
    if (pel) {
      if (!wa && raw) issues.push(["bad", `${s.cabang}: kolom telepon pelanggan tidak berisi nomor sama sekali`, `${fmtN(raw)} dari ${fmtN(pel)} pelanggan punya isi kolom telepon, tetapi bukan nomor. Paling banyak: ${top}. Kemungkinan template laporan Daftar Pelanggan di Accurate menarik field yang salah; tambahkan kolom No. Handphone / WhatsApp yang benar lalu unggah ulang.`]);
      else if (raw / pel > 0.3) issues.push(["warn", `${s.cabang}: ${pct(raw / pel)} kolom telepon berisi teks, bukan nomor`, `Hanya ${fmtN(wa)} pelanggan (${pct(wa / pel)}) yang punya nomor valid. Teks yang ditemukan: ${top}.`]);
      else issues.push(["ok", `${s.cabang}: ${pct(wa / pel)} pelanggan punya nomor WA valid`, `${fmtN(wa)} dari ${fmtN(pel)} pelanggan.`]);
      if (+s.no_wa_ganda) issues.push(["warn", `${s.cabang}: ${fmtN(s.no_wa_ganda)} pelanggan berbagi nomor WA dengan ID lain`, `Kemungkinan pelanggan yang sama terdaftar dua kali. Lihat filter "No WA ganda" di Data Pelanggan.`]);
    }
    if (+s.baris_faktur && !pel) issues.push(["warn", `${s.cabang}: faktur ada, tapi Data Pelanggan belum diunggah`, `Faktur cabang ini belum bisa dilengkapi nomor WA dan alamat.`]);
    if (pel && !+s.baris_faktur) issues.push(["warn", `${s.cabang}: Data Pelanggan ada, tapi faktur belum diunggah`, `Gross profit dan riwayat transaksi cabang ini masih kosong.`]);
    if (+s.faktur_tidak_cocok && pel) issues.push(["bad", `${s.cabang}: ${fmtN(s.faktur_tidak_cocok)} baris faktur tidak menemukan pelanggannya`, `ID pelanggan di faktur tidak ada di Data Pelanggan cabang yang sama. Unggah export pelanggan terbaru.`]);
    if (+s.baris_faktur && !+s.baris_pembelian) issues.push(["warn", `${s.cabang}: Faktur Pembelian belum diunggah`, `Biaya sewa vendor cabang ini belum terhitung, jadi GP Sewa bisa terlalu tinggi.`]);
    if (+s.baris_pembelian) issues.push(["ok", `${s.cabang}: Faktur Pembelian terunggah (${fmtN(s.baris_pembelian)} baris)`, `Biaya sewa vendor (barang SEWA): ${rp(s.biaya_sewa_vendor)}.`]);
    if (+s.baris_pindahan) issues.push(["ok", `${s.cabang}: Pemindahan Barang terunggah (${fmtN(s.baris_pindahan)} baris)`, `Nama unit milik sendiri yang keluar lewat gudang sewa tampil di tab Sewa.`]);
    else if (+s.baris_faktur) issues.push(["warn", `${s.cabang}: Pemindahan Barang belum diunggah`, `Nama unit milik sendiri yang tersewa belum bisa ditampilkan untuk cabang ini.`]);
    if (+s.tanpa_harga_beli) issues.push(["warn", `${s.cabang}: ${fmtN(s.tanpa_harga_beli)} baris faktur tanpa HARGA BELI`, `Baris ini dihitung dengan harga beli 0, sehingga gross profit-nya bisa terlalu tinggi.`]);
  }
  issues.sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[a[0]] - { bad: 0, warn: 1, ok: 2 }[b[0]]));
  el.innerHTML = `<div style="display:grid;gap:14px">
  <section class="panel"><h2>Status data per cabang</h2>
  <div class="tablebox"><table><thead><tr><th>Cabang</th><th class="num">Pelanggan</th><th class="num">Punya No WA</th><th class="num">Faktur</th><th class="num">Baris faktur</th><th>Periode faktur</th><th class="num">Faktur tidak cocok</th><th>Unggah pelanggan terakhir</th><th>Unggah faktur terakhir</th></tr></thead><tbody>
  ${rows.map(s => `<tr><td class="cab">${esc(s.cabang)}</td><td class="num">${fmtN(s.pelanggan)}</td><td class="num">${fmtN(s.punya_wa)} <span class="pill ${+s.pelanggan ? (s.punya_wa / s.pelanggan > .7 ? "ok" : +s.punya_wa ? "warn" : "bad") : "warn"}">${+s.pelanggan ? pct(s.punya_wa / s.pelanggan) : "–"}</span></td><td class="num">${fmtN(s.jumlah_faktur)}</td><td class="num">${fmtN(s.baris_faktur)}</td><td>${s.faktur_dari ? fmtDate(s.faktur_dari) + " – " + fmtDate(s.faktur_sampai) : "–"}</td><td class="num">${+s.faktur_tidak_cocok ? `<span class="pill bad">${fmtN(s.faktur_tidak_cocok)}</span>` : "0"}</td><td>${fmtDateTime(s.unggah_pelanggan_terakhir) || "–"}</td><td>${fmtDateTime(s.unggah_faktur_terakhir) || "–"}</td></tr>`).join("") || `<tr><td colspan="9" class="sub">Belum ada data.</td></tr>`}
  </tbody></table></div>
  ${lockedCabang() ? "" : `<p class="sub">Cabang yang belum mengunggah: ${esc(S.cabangs.filter(c => !rows.some(r => r.cabang === c)).join(", ") || "tidak ada")}.</p>`}</section>
  ${hubCard(hub)}
  <section class="issues">${issues.map(([l, t, d]) => `<div class="issue ${l === "bad" ? "bad" : l === "ok" ? "ok" : ""}"><h3><span class="pill ${l === "bad" ? "bad" : l === "ok" ? "ok" : "warn"}">${l === "bad" ? "Perlu dibenahi" : l === "ok" ? "Baik" : "Perhatikan"}</span> ${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</section></div>`;
}

/* =================== start =================== */
if (!window.XLSX) root().innerHTML = `<div class="wrap"><div class="notice bad">Pustaka Excel gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.</div></div>`;
boot();
})();
