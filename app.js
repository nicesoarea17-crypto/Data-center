/* MFlash Data Center — aplikasi web (Cloudflare Pages + Supabase)
   Tanpa build step: cukup index.html, config.js, app.js. */
(function () {
"use strict";
window.__mfStarted = true;

/* =================== util =================== */
const $ = (s, el = document) => el.querySelector(s);
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
  ({ dashboard: pageDashboard, sewa: pageSewa, service: pageService, pelanggan: pagePelanggan, faktur: pageFaktur, unggah: pageUnggah, unduh: pageUnduh, kualitas: pageKualitas }[p])(el)
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
  const mat = D.pilar ? matAll.filter(r => r.pilar === D.pilar) : matAll;   // filter pilar
  const pilars = D.pilar ? [D.pilar] : allPilars;
  const sel = D.cab ? mat.filter(r => r.cabang === D.cab) : mat;            // filter cabang
  const T = withM(sumRows(sel)), TA = withM(sumRows(mat));
  const pAgg = pilars.map(p => [p, withM(sumRows(sel.filter(r => r.pilar === p)))]);
  const maxP = Math.max(0, ...pAgg.map(x => x[1].gp));
  const cabs = [...new Set(mat.map(r => r.cabang))].map(c => { const rs = mat.filter(r => r.cabang === c); return { c, t: withM(sumRows(rs)), p: pilars.map(p => sumRows(rs.filter(r => r.pilar === p)).gp) }; }).sort((a, b) => b.t.gp - a.t.gp);
  const label = [D.cab || "Semua cabang", D.pilar].filter(Boolean).join(" · ");
  el.innerHTML = `<div style="display:grid;gap:14px">
  ${filterBar(true, allPilars)}
  ${!matAll.length ? `<div class="notice warn">Belum ada faktur pada periode ini.${D.bulan !== "semua" ? ` <button class="linkbtn" id="dAll">Lihat semua periode</button>` : " Unggah file Rincian Faktur Penjualan di menu Unggah Data."}</div>` : ""}
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
    note: "Jumlah unit = total QTY pada baris faktur pilar SEWA." },
  service: { title: "Service & Maintenance Corporate", match: p => /MAINTENANCE/.test(p), extra: "corporate",
    note: "Hanya pilar yang namanya mengandung MAINTENANCE (pilar SERVICE biasa tidak ikut). Corporate termaintenance = jumlah pelanggan (perusahaan) yang bertransaksi; satu perusahaan dihitung satu walau punya beberapa transaksi." }
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
  const vend = corp ? [] : await db.rpc("sewa_vendor", args).catch(() => []);
  const [cab, days, kat, cust] = await Promise.all([
    db.rpc("pilar_cabang", { ...args, p_pilar: pArr }), db.rpc("gp_harian", cArgs), db.rpc("gp_kategori", cArgs),
    db.rpc("pilar_pelanggan", { ...cArgs, p_corporate: false, p_urut: corp ? "transaksi" : "unit", p_limit: 100 })]);
  const rows = D.cab ? cab.filter(r => r.cabang === D.cab) : cab;
  const s = rows.reduce((o, r) => (o.rev += +r.omzet, o.cost += +r.hpp, o.gp += +r.gross_profit, o.inv += +r.jumlah_faktur, o.unit += +r.unit, o.tc += +r.transaksi_corporate, o.pc += +r.pelanggan_corporate, o.pel += +r.pelanggan, o), { rev: 0, cost: 0, gp: 0, inv: 0, unit: 0, tc: 0, pc: 0, pel: 0 });
  s.m = s.rev ? s.gp / s.rev : 0;
  const label = (D.cab || "Semua cabang") + " · " + periodeLabel();
  const sorted = [...rows].sort((a, b) => corp ? (b.pelanggan - a.pelanggan || b.gross_profit - a.gross_profit) : (b.unit - a.unit || b.gross_profit - a.gross_profit));
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
  </div>` : barCabang("Unit tersewa per cabang", periodeLabel() + " · total QTY pilar Sewa", cab, r => r.unit, v => fmtN(v) + " unit")}
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
  ${katCard(kat, label, corp ? null : ["unit", "Unit"])}
  </div>`;
  const re = () => pagePilar(el, key);
  $("#pDl", el).onclick = async () => { const b = $("#pDl", el); b.disabled = true; try { await unduhDenganProgres(key, D.cab || null, dari || null, sampai || null); } catch (e) {} b.disabled = false; };
  bindFilter(el, re);
  const all = $("#dAll", el); if (all) all.onclick = () => { D.bulan = "semua"; re(); };
  el.querySelectorAll("[data-cab]").forEach(b => b.onclick = () => { D.cab = D.cab === b.dataset.cab ? "" : b.dataset.cab; re(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  bindTrend(el, days, d => corp ? `${fmtN(d.pelanggan)} corporate · ${fmtN(d.jumlah_faktur)} transaksi<br>GP ${rp(d.gross_profit)} · Omzet ${rp(d.omzet)}` : `${fmtN(d.unit)} unit · ${fmtN(d.jumlah_faktur)} transaksi<br>GP ${rp(d.gross_profit)} · Omzet ${rp(d.omzet)}`);
}

function vendorCard(v) {
  const t = v.reduce((o, r) => (o.b += +r.biaya_vendor, o.o += +r.omzet_sewa, o.uv += +r.unit_vendor, o.us += +r.unit_sewa, o), { b: 0, o: 0, uv: 0, us: 0 });
  const st = r => +r.biaya_vendor && !+r.omzet_sewa ? `<span class="pill bad">Ada pembelian, belum ada penjualan sewa</span>`
    : !+r.biaya_vendor && +r.omzet_sewa ? `<span class="pill warn">Tanpa biaya vendor</span>` : `<span class="pill ok">Terpotong</span>`;
  return `<div class="card"><h3>Biaya sewa vendor (Faktur Pembelian)</h3>
    <p class="sub">Pembelian barang SEWA (mis. SEWA LAPTOP) per cabang per bulan, dipotong dari penjualan sewa cabang & bulan yang sama. "Tanpa biaya vendor" bisa berarti unit milik MFlash sendiri, atau faktur pembelian cabang itu belum diunggah.</p>
    <div class="tablebox"><table><thead><tr><th>Cabang</th><th>Bulan</th><th class="num">Unit disewakan</th><th class="num">Unit dari vendor</th><th class="num">Omzet sewa</th><th class="num">Biaya vendor</th><th class="num">GP sewa</th><th>Status</th></tr></thead><tbody>
    ${v.map(r => `<tr><td class="cab">${esc(r.cabang)}</td><td>${esc(namaBulan(String(r.bulan).slice(0, 7)))}</td><td class="num">${fmtN(r.unit_sewa)}</td><td class="num">${fmtN(r.unit_vendor)}</td><td class="num">${rp(r.omzet_sewa)}</td><td class="num">${rp(r.biaya_vendor)}</td><td class="num"><b>${rp(r.omzet_sewa - r.biaya_vendor)}</b></td><td>${st(r)}</td></tr>`).join("") || `<tr><td colspan="8" class="sub">Belum ada data sewa atau pembelian sewa pada periode ini.</td></tr>`}
    ${v.length > 1 ? `<tr class="tot"><td colspan="2">TOTAL</td><td class="num">${fmtN(t.us)}</td><td class="num">${fmtN(t.uv)}</td><td class="num">${rp(t.o)}</td><td class="num">${rp(t.b)}</td><td class="num">${rp(t.o - t.b)}</td><td></td></tr>` : ""}</tbody></table></div></div>`;
}

/* =================== bar per cabang (untuk dibagikan ke tim) =================== */
function barCabang(title, sub, rows, val, fmt) {
  const list = rows.map(r => ({ c: r.cabang, v: +val(r) || 0 })).sort((a, b) => b.v - a.v || a.c.localeCompare(b.c));
  const max = Math.max(0, ...list.map(x => x.v)), tot = list.reduce((a, x) => a + x.v, 0);
  return `<div class="card"><h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p>
    <div class="hbars rank">${list.map((x, i) => `<div class="hbar"><div class="hbar-l"><span class="rk">${i + 1}</span>${esc(x.c)}</div><div class="hbar-t" role="img" aria-label="${esc(x.c)}: ${esc(fmt(x.v))}"><span style="width:${max > 0 ? Math.max(0, x.v) / max * 100 : 0}%"></span></div><div class="hbar-v">${esc(fmt(x.v))}<small>${tot ? Math.round(x.v / tot * 100) : 0}% dari total</small></div></div>`).join("") || `<p class="sub">Tidak ada data.</p>`}</div>
    ${list.length ? `<p class="sub" style="margin-top:0">Total semua cabang: <b>${esc(fmt(tot))}</b>. Cabang yang belum muncul berarti belum ada data pada periode ini.</p>` : ""}</div>`;
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
const REK_COLS = [["cabang", "CABANG"], ["tgl_faktur", "TGL FAKTUR"], ["no_faktur", "NO FAKTUR"], ["baris", "BARIS KE"], ["id_pelanggan", "ID PELANGGAN"], ["nama_customer", "NAMA CUSTOMER"], ["kategori_pelanggan", "KATEGORI PELANGGAN"], ["pilar", "PILAR"], ["kategori_penjualan", "KATEGORI PENJUALAN"], ["kategori_barang", "KATEGORI BARANG"], ["kode_barang", "KODE BARANG"], ["nama_barang", "NAMA BARANG"], ["qty", "QTY"], ["harga_satuan", "@HARGA"], ["total_harga", "TOTAL HARGA"], ["harga_beli", "HARGA BELI (ACCURATE)"], ["biaya_vendor", "BIAYA SEWA VENDOR"], ["hpp", "HPP TOTAL"], ["gross_profit", "GROSS PROFIT"], ["penjual_default", "PENJUAL DEFAULT"], ["nama_admin", "NAMA ADMIN"], ["no_wa", "NO WA"]];
const SUM_KEYS = ["qty", "total_harga", "harga_beli", "biaya_vendor", "hpp", "gross_profit"];
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
  // Ringkasan per cabang dihitung dari baris yang sama dengan sheet rincian, supaya angkanya pasti cocok
  const byC = new Map(); for (const r of rows) { if (!byC.has(r.cabang)) byC.set(r.cabang, []); byC.get(r.cabang).push(r); }
  const ring = [...byC.entries()].sort((a, b) => S.cabangs.indexOf(a[0]) - S.cabangs.indexOf(b[0])).map(([c, rs]) => {
    const s = k => Math.round(rs.reduce((a, r) => a + (+r[k] || 0), 0) * 100) / 100; const omzet = s("total_harga"), gp = s("gross_profit");
    const o = { "CABANG": c, "JUMLAH TRANSAKSI (FAKTUR)": new Set(rs.map(r => r.no_faktur)).size };
    if (key === "sewa") o["UNIT TERSEWA (QTY)"] = s("qty");
    if (key === "service") o["CORPORATE TERMAINTENANCE"] = new Set(rs.map(r => r.id_pelanggan || r.nama_customer)).size;
    Object.assign(o, { "OMZET": omzet, "HARGA BELI (ACCURATE)": s("harga_beli"), "BIAYA SEWA VENDOR": s("biaya_vendor"), "HPP TOTAL": s("hpp"), "GROSS PROFIT": gp, "MARGIN %": omzet ? +(gp / omzet * 100).toFixed(1) : 0 });
    return o;
  });
  if (ring.length) { const t = { "CABANG": "TOTAL" }; for (const k of Object.keys(ring[0])) if (k !== "CABANG") t[k] = k === "MARGIN %" ? null : ring.reduce((a, r) => a + (+r[k] || 0), 0); if (t["OMZET"]) t["MARGIN %"] = +(t["GROSS PROFIT"] / t["OMZET"] * 100).toFixed(1); ring.push(t); }
  const per = dari || sampai ? `${dari ? fmtDate(dari) : "awal"} – ${sampai ? fmtDate(sampai) : "sekarang"}` : "Semua periode";
  const info = [["Laporan", title], ["Cabang", cab || "Semua cabang"], ["Periode", per], ["Pilar", pil ? pil.join(", ") : "Semua"], ["Dibuat", fmtDateTime(new Date())], [], ["Cara hitung", "Gross profit = TOTAL HARGA − HARGA BELI (Accurate) − BIAYA SEWA VENDOR"], ["Biaya sewa vendor", "Total Faktur Pembelian barang SEWA per cabang per bulan, dibagi ke penjualan pilar SEWA cabang & bulan yang sama sesuai QTY"], ["Rekonsiliasi", "Cocokkan NO FAKTUR dan TOTAL HARGA di sheet Rincian dengan laporan Rincian Faktur Penjualan di Accurate pada filter yang sama"]];
  if (key === "service") info.push(["Corporate termaintenance", "Jumlah pelanggan (ID pelanggan per cabang) yang bertransaksi; satu perusahaan dihitung satu"]);
  const wsInfo = XLSX.utils.aoa_to_sheet(info); wsInfo["!cols"] = [{ wch: 26 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Keterangan");
  const wsR = XLSX.utils.json_to_sheet(ring); wsR["!cols"] = Object.keys(ring[0] || { CABANG: 1 }).map(k => ({ wch: Math.max(12, k.length + 2) }));
  XLSX.utils.book_append_sheet(wb, wsR, "Ringkasan per Cabang");
  XLSX.utils.book_append_sheet(wb, sheetRows(rows, REK_COLS, "TOTAL"), "Rincian Faktur Penjualan");
  if (key === "service") {
    onStep("Menyusun daftar corporate…");
    const m = new Map(); for (const r of rows) { const k = r.cabang + "|" + (r.id_pelanggan || r.nama_customer); let o = m.get(k); if (!o) { o = { cabang: r.cabang, id_pelanggan: r.id_pelanggan, nama_customer: r.nama_customer, kategori_pelanggan: r.kategori_pelanggan, no_wa: r.no_wa, f: new Set(), total_harga: 0, gross_profit: 0, terakhir: null }; m.set(k, o); } o.f.add(r.no_faktur); o.total_harga += +r.total_harga || 0; o.gross_profit += +r.gross_profit || 0; if (!o.terakhir || r.tgl_faktur > o.terakhir) o.terakhir = r.tgl_faktur; }
    const list = [...m.values()].map(o => ({ ...o, transaksi: o.f.size })).sort((a, b) => a.cabang.localeCompare(b.cabang) || b.transaksi - a.transaksi);
    XLSX.utils.book_append_sheet(wb, sheetRows(list, [["cabang", "CABANG"], ["id_pelanggan", "ID PELANGGAN"], ["nama_customer", "NAMA CORPORATE"], ["kategori_pelanggan", "KATEGORI PELANGGAN"], ["no_wa", "NO WA"], ["transaksi", "JUMLAH TRANSAKSI"], ["total_harga", "OMZET"], ["gross_profit", "GROSS PROFIT"], ["terakhir", "TRANSAKSI TERAKHIR"]]), "Daftar Corporate");
  }
  if (key === "sewa") {
    onStep("Mengambil faktur pembelian SEWA…");
    const pf = []; if (cab) pf.push(["cabang", "eq", cab]);
    const bDari = dari ? dari.slice(0, 7) + "-01" : null; if (bDari) pf.push(["tgl", "gte", bDari]); if (sampai) pf.push(["tgl", "lte", sampai]);
    const beli = await db.all("pembelian", { select: "cabang,tgl,no_faktur,baris,kategori_barang,kode_barang,nama_barang,qty,harga_satuan,total_harga,pemasok,kategori_kebutuhan", filters: pf, or: `nama_barang.ilike."*SEWA*",kategori_barang.ilike.SEWA`, order: "cabang.asc,tgl.asc,no_faktur.asc" });
    XLSX.utils.book_append_sheet(wb, sheetRows(beli, [["cabang", "CABANG"], ["tgl", "TANGGAL"], ["no_faktur", "NOMOR FAKTUR PEMBELIAN"], ["kategori_barang", "KATEGORI BARANG"], ["kode_barang", "KODE BARANG"], ["nama_barang", "NAMA BARANG"], ["qty", "QTY"], ["harga_satuan", "@HARGA"], ["total_harga", "TOTAL HARGA"], ["pemasok", "PEMASOK"], ["kategori_kebutuhan", "KATEGORI KEBUTUHAN"]], "TOTAL"), "Pembelian SEWA (Vendor)");
    const v = await db.rpc("sewa_vendor", { p_dari: dari || null, p_sampai: sampai || null });
    const vv = (cab ? v.filter(x => x.cabang === cab) : v).map(x => ({ "CABANG": x.cabang, "BULAN": namaBulan(String(x.bulan).slice(0, 7)), "UNIT DISEWAKAN": +x.unit_sewa, "UNIT DARI VENDOR": +x.unit_vendor, "OMZET SEWA": +x.omzet_sewa, "BIAYA VENDOR": +x.biaya_vendor, "GP SEWA": x.omzet_sewa - x.biaya_vendor, "STATUS": +x.biaya_vendor && !+x.omzet_sewa ? "Ada pembelian, belum ada penjualan sewa" : !+x.biaya_vendor && +x.omzet_sewa ? "Tanpa biaya vendor" : "Terpotong" }));
    const wsV = XLSX.utils.json_to_sheet(vv); wsV["!cols"] = [{ wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 38 }];
    XLSX.utils.book_append_sheet(wb, wsV, "Biaya Vendor per Bulan");
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
  const isi = () => { const k = $("#rJenis", el).value; $("#rIsi", el).innerHTML = `<b>Isi file:</b> Keterangan (filter &amp; cara hitung) · Ringkasan per Cabang · Rincian Faktur Penjualan (per baris, dengan total)` + (k === "sewa" ? " · Pembelian SEWA (Vendor) · Biaya Vendor per Bulan" : k === "service" ? " · Daftar Corporate" : ""); };
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
    cols: [["cabang", "Cabang"], ["tgl_faktur", "Tgl faktur", "date"], ["no_faktur", "No faktur"], ["id_pelanggan", "ID Pelanggan"], ["nama_customer", "Nama customer"], ["no_wa", "No WA"], ["kategori_pelanggan", "Kategori pelanggan"], ["pilar", "Pilar"], ["kategori_penjualan", "Kategori penjualan"], ["kategori_barang", "Kategori barang"], ["nama_barang", "Nama barang"], ["merk_unit", "Merk"], ["tipe_unit", "Tipe"], ["qty", "Qty", "num"], ["total_harga", "Total harga", "rp"], ["harga_beli", "Harga beli", "rp"], ["biaya_vendor", "Biaya sewa vendor", "rp"], ["gross_profit", "Gross profit", "rp"], ["penjual_default", "Penjual default"], ["kecamatan", "Kecamatan"], ["kota", "Kota"], ["status_pelanggan", "Status pelanggan"], ["dilengkapi", "Dilengkapi dari pelanggan"]],
    search: q => `no_faktur.ilike."*${q}*",nama_customer.ilike."*${q}*",id_pelanggan.ilike."*${q}*",nama_barang.ilike."*${q}*",no_wa.ilike."*${q}*"`,
    chips: [["wa", "Dapat No WA", ["no_wa", "not.is", "null"]], ["unmatched", "Pelanggan tidak ditemukan", ["status_pelanggan", "neq", "Cocok"]], ["rugi", "Rugi (GP minus)", ["gross_profit", "lt", "0"]], ["fill", "Dilengkapi dari pelanggan", ["dilengkapi", "not.is", "null"]]],
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
  F: { id: ["id pelanggan", "no. pelanggan", "no pelanggan", "kode pelanggan"], nama: ["nama customer", "nama pelanggan"], no: ["no faktur", "no. faktur", "nomor faktur", "nomor # faktur"], tgl: ["tgl faktur", "tanggal faktur", "tanggal"], total: ["total harga", "total"], cost: ["harga beli", "hpp", "harga pokok"], kat: ["kategori pelanggan"], penjual: ["nama default penjual pelanggan faktur penjualan", "nama default penjual"], kj: ["kategori penjualan"], kb: ["kategori barang"], pilar: ["kategori pilar faktur penjualan", "kategori pilar", "pilar"], kode: ["kode barang"], barang: ["nama barang", "keterangan barang"], merk: ["merk unit"], tipe: ["tipe unit"], qty: ["qty", "kuantitas"], harga: ["@harga", "harga satuan"], admin: ["nama admin"], teknisi: ["nama teknisi (final)", "nama teknisi"] }
};
const PHONE_RE = /(telp|telepon|tlp|handphone|whatsapp|phone|\bhp\b|\bwa\b)/i;
const DATE_HDR = /(tgl|tanggal|date)/i;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
function findCol(H, list) { const low = H.map(h => h.toLowerCase().replace(/\s+/g, " ").trim()); for (const a of list) { const i = low.indexOf(a); if (i >= 0) return H[i]; } return null; }
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
async function parseFile(file) {
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, cellNF: true });
  const aoa = sheetAOA(wb.Sheets[wb.SheetNames[0]]);
  const hi = aoa.findIndex(r => r && r.filter(v => typeof v === "string" && v.trim()).length >= 3);
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
  const histHtml = `<section class="panel"><h2>Riwayat unggah</h2>
    <p class="sub">Tombol <b>Hapus</b> menghapus data yang berasal dari unggahan itu. Pelanggan yang sudah diperbarui oleh unggahan lain yang lebih baru tidak ikut terhapus.</p>
    <div class="tablebox"><table><thead><tr><th>Waktu</th><th>Cabang</th><th>Jenis</th><th>File</th><th class="num">Baris</th><th>Periode faktur</th><th>Oleh</th><th></th></tr></thead><tbody>
    ${hist.map(h => `<tr><td>${fmtDateTime(h.diunggah_pada)}</td><td class="cab">${esc(h.cabang)}</td><td>${{ faktur: "Faktur Penjualan", pembelian: "Faktur Pembelian", pelanggan: "Data Pelanggan" }[h.jenis] || h.jenis}</td><td class="mono" style="white-space:normal;word-break:break-all;min-width:200px">${esc(h.nama_file)}</td><td class="num">${fmtN(h.jumlah_baris)}</td><td>${h.periode_dari ? fmtDate(h.periode_dari) + " – " + fmtDate(h.periode_sampai) : "–"}</td><td>${esc(h.diunggah_nama || "")}</td><td><button data-delup="${h.id}">Hapus</button></td></tr>`).join("") || `<tr><td colspan="8" class="sub">Belum ada data yang diunggah.</td></tr>`}</tbody></table></div>
  </section>`;
  const tot = stat.reduce((o, s) => (o.p += +s.pelanggan, o.f += +s.baris_faktur, o.b += +(s.baris_pembelian || 0), o), { p: 0, f: 0, b: 0 });
  el.innerHTML = `<div style="display:grid;gap:14px">
  <div class="toolbar"><button class="chip" data-ut="unggah" aria-pressed="${U_TAB === "unggah"}">Unggah data</button><button class="chip" data-ut="hapus" aria-pressed="${U_TAB === "hapus"}">Hapus / Reset data</button></div>
  ${U_TAB === "unggah" ? `<section class="panel"><div><h2>Unggah file Accurate</h2>
    <p class="sub">Unggah export <b>Daftar Pelanggan</b>, <b>Rincian Faktur Penjualan</b>, dan <b>Rincian Faktur Pembelian</b> (untuk biaya sewa vendor). Bisa banyak file dari cabang mana saja sekaligus. Pelanggan dengan ID yang sama diperbarui, faktur dengan nomor yang sama diganti versi terbaru, jadi aman mengunggah periode yang tumpang tindih.</p></div>
    <label style="display:grid;gap:4px;font-weight:600;font-size:13px;max-width:360px">Nama pengunggah<input id="upName" value="${esc(LS.get("mfdc-uploader") || "")}" placeholder="mis. Admin Bintara" autocomplete="name"></label>
    <label class="drop" id="drop" tabindex="0"><div><strong>Tarik file .xlsx ke sini, atau klik untuk memilih</strong><span class="sub">Cabang dikenali dari nama file (misal 003mflashbintar → Bintara)</span></div><span class="btn">Pilih file</span>
      <input type="file" id="fileInput" class="hidden-input" accept=".xlsx,.xls" multiple></label>
    <div id="upList"></div>
  </section>` : `<section class="panel"><div><h2>Hapus / Reset data</h2>
    <p class="sub">Untuk pembaruan harian: kosongkan data, lalu unggah ulang file Accurate terbaru di tab <b>Unggah data</b>. Data yang dihapus <b>tidak bisa dikembalikan</b>. Isi database sekarang: <b>${fmtN(tot.p)}</b> pelanggan, <b>${fmtN(tot.f)}</b> baris faktur penjualan, dan <b>${fmtN(tot.b)}</b> baris faktur pembelian.</p></div>
    <div class="toolbar">
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Cabang<select id="hCab"><option value="">Semua cabang</option>${S.cabangs.map(c => `<option>${esc(c)}</option>`).join("")}</select></label>
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Data yang dihapus<select id="hJenis"><option value="semua">Semua (pelanggan, faktur, pembelian)</option><option value="faktur">Faktur Penjualan saja</option><option value="pelanggan">Data Pelanggan saja</option><option value="pembelian">Faktur Pembelian saja</option></select></label>
      ${pinOn ? `<label style="display:grid;gap:4px;font-weight:600;font-size:13px">PIN hapus<input id="hPin" type="password" autocomplete="off" style="width:130px"></label>` : ""}
      <label style="display:grid;gap:4px;font-weight:600;font-size:13px">Ketik HAPUS untuk konfirmasi<input id="hKonf" autocomplete="off" style="width:200px"></label>
    </div>
    <p class="sub" id="hInfo"></p>
    <div class="toolbar"><button class="danger" id="hBtn" disabled>Hapus data</button><span class="sub" id="hMsg" role="status"></span></div>
    ${pinOn ? "" : `<p class="sub">Belum ada PIN hapus, jadi siapa pun yang membuka aplikasi bisa menghapus data. Cara memasang PIN ada di README (bagian Hapus / Reset).</p>`}
  </section>`}
  ${histHtml}</div>`;
  el.querySelectorAll("[data-ut]").forEach(b => b.onclick = () => { U_TAB = b.dataset.ut; pageUnggah(el); });
  el.querySelectorAll("[data-delup]").forEach(b => b.onclick = async () => {
    if (!b.classList.contains("danger")) { b.classList.add("danger"); b.textContent = "Klik lagi untuk hapus"; setTimeout(() => { if (b.isConnected) { b.classList.remove("danger"); b.textContent = "Hapus"; } }, 4000); return; }
    let pin = null; if (pinOn) { pin = window.prompt ? window.prompt("PIN hapus:") : null; if (!pin) { toast("Masukkan PIN untuk menghapus. Atau gunakan tab Hapus / Reset data."); return; } }
    b.disabled = true;
    try { const r = await db.rpc("hapus_upload", { p_upload: +b.dataset.delup, p_pin: pin }); BULAN = null; toast(`Terhapus: ${fmtN(r.pelanggan)} pelanggan, ${fmtN(r.faktur)} baris faktur, ${fmtN(r.pembelian || 0)} baris pembelian.`); pageUnggah(el); }
    catch (e) { toast("Gagal menghapus: " + e.message); b.disabled = false; }
  });
  if (U_TAB === "hapus") {
    const upd = () => {
      const c = $("#hCab", el).value, j = $("#hJenis", el).value; const rs = c ? stat.filter(s => s.cabang === c) : stat;
      const p = rs.reduce((o, s) => o + +s.pelanggan, 0), f = rs.reduce((o, s) => o + +s.baris_faktur, 0), bb = rs.reduce((o, s) => o + +(s.baris_pembelian || 0), 0);
      const parts = []; if (j === "semua" || j === "pelanggan") parts.push(`<b>${fmtN(p)}</b> pelanggan`); if (j === "semua" || j === "faktur") parts.push(`<b>${fmtN(f)}</b> baris faktur penjualan`); if (j === "semua" || j === "pembelian") parts.push(`<b>${fmtN(bb)}</b> baris faktur pembelian`);
      $("#hInfo", el).innerHTML = `Akan menghapus ${parts.join(", ")} dari <b>${esc(c || "semua cabang")}</b>, beserta riwayat unggahnya.`;
      $("#hBtn", el).disabled = $("#hKonf", el).value.trim().toUpperCase() !== "HAPUS" || (pinOn && !$("#hPin", el).value);
    };
    ["hCab", "hJenis", "hKonf", "hPin"].forEach(id => { const x = $("#" + id, el); if (x) x.oninput = x.onchange = upd; });
    upd();
    $("#hBtn", el).onclick = async () => {
      const b = $("#hBtn", el); b.disabled = true; $("#hMsg", el).textContent = "Menghapus…";
      try {
        const r = await db.rpc("hapus_data", { p_cabang: $("#hCab", el).value || null, p_jenis: $("#hJenis", el).value, p_pin: pinOn ? $("#hPin", el).value : null });
        BULAN = null; toast(`Terhapus: ${fmtN(r.pelanggan)} pelanggan, ${fmtN(r.faktur)} baris faktur, ${fmtN(r.pembelian || 0)} baris pembelian.`); U_TAB = "unggah"; pageUnggah(el);
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
      <td><select data-id="${f.id}" data-k="kind" aria-label="Jenis"${f.status !== "siap" ? " disabled" : ""}><option value="">— pilih —</option><option value="pelanggan"${f.kind === "pelanggan" ? " selected" : ""}>Data Pelanggan</option><option value="faktur"${f.kind === "faktur" ? " selected" : ""}>Faktur Penjualan</option><option value="pembelian"${f.kind === "pembelian" ? " selected" : ""}>Faktur Pembelian</option></select></td>
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
  list.sort((a, b) => ({ pelanggan: 0, faktur: 1, pembelian: 2 }[a.kind] - { pelanggan: 0, faktur: 1, pembelian: 2 }[b.kind]));
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

/* =================== KUALITAS DATA =================== */
async function pageKualitas(el) {
  const rows = await db.rpc("kualitas_data");
  const issues = [];
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
    if (+s.tanpa_harga_beli) issues.push(["warn", `${s.cabang}: ${fmtN(s.tanpa_harga_beli)} baris faktur tanpa HARGA BELI`, `Baris ini dihitung dengan harga beli 0, sehingga gross profit-nya bisa terlalu tinggi.`]);
  }
  issues.sort((a, b) => ({ bad: 0, warn: 1, ok: 2 }[a[0]] - { bad: 0, warn: 1, ok: 2 }[b[0]]));
  el.innerHTML = `<div style="display:grid;gap:14px">
  <section class="panel"><h2>Status data per cabang</h2>
  <div class="tablebox"><table><thead><tr><th>Cabang</th><th class="num">Pelanggan</th><th class="num">Punya No WA</th><th class="num">Faktur</th><th class="num">Baris faktur</th><th>Periode faktur</th><th class="num">Faktur tidak cocok</th><th>Unggah pelanggan terakhir</th><th>Unggah faktur terakhir</th></tr></thead><tbody>
  ${rows.map(s => `<tr><td class="cab">${esc(s.cabang)}</td><td class="num">${fmtN(s.pelanggan)}</td><td class="num">${fmtN(s.punya_wa)} <span class="pill ${+s.pelanggan ? (s.punya_wa / s.pelanggan > .7 ? "ok" : +s.punya_wa ? "warn" : "bad") : "warn"}">${+s.pelanggan ? pct(s.punya_wa / s.pelanggan) : "–"}</span></td><td class="num">${fmtN(s.jumlah_faktur)}</td><td class="num">${fmtN(s.baris_faktur)}</td><td>${s.faktur_dari ? fmtDate(s.faktur_dari) + " – " + fmtDate(s.faktur_sampai) : "–"}</td><td class="num">${+s.faktur_tidak_cocok ? `<span class="pill bad">${fmtN(s.faktur_tidak_cocok)}</span>` : "0"}</td><td>${fmtDateTime(s.unggah_pelanggan_terakhir) || "–"}</td><td>${fmtDateTime(s.unggah_faktur_terakhir) || "–"}</td></tr>`).join("") || `<tr><td colspan="9" class="sub">Belum ada data.</td></tr>`}
  </tbody></table></div>
  ${lockedCabang() ? "" : `<p class="sub">Cabang yang belum mengunggah: ${esc(S.cabangs.filter(c => !rows.some(r => r.cabang === c)).join(", ") || "tidak ada")}.</p>`}</section>
  <section class="issues">${issues.map(([l, t, d]) => `<div class="issue ${l === "bad" ? "bad" : l === "ok" ? "ok" : ""}"><h3><span class="pill ${l === "bad" ? "bad" : l === "ok" ? "ok" : "warn"}">${l === "bad" ? "Perlu dibenahi" : l === "ok" ? "Baik" : "Perhatikan"}</span> ${esc(t)}</h3><p>${esc(d)}</p></div>`).join("")}</section></div>`;
}

/* =================== start =================== */
if (!window.XLSX) root().innerHTML = `<div class="wrap"><div class="notice bad">Pustaka Excel gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.</div></div>`;
boot();
})();
