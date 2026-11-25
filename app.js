/* FOMO Desk iPhone app (STEP 10). Plan B hosting: polls Upstash Redis REST (GET one snap / 15s) or d/{DATA_PATH}/*.json + screen.jpg, no SSE.
 * Every FOMO link shown here comes from the desk's JSON (built by links.py). This file never builds a FOMO URL.
 * Demo data exists ONLY behind #demo=1 / #demo=empty / #demo=error and is always labelled "DEMO DATA · not real numbers". */
(function () {
  "use strict";
  const POLL_MS = 15000, FRAME_MS = 15000;
  const BOT = {
    scanner: { name: "Scanner", color: "#64d2ff" }, analyst: { name: "Analyst", color: "#ffd60a" },
    brain: { name: "Brain", color: "#bf5af2" }, executor: { name: "Executor", color: "#00d35a" },
    risk: { name: "Risk", color: "#ff6b9a" },
  };
  const BOT_ORDER = ["scanner", "analyst", "brain", "executor", "risk"];

  // ---------- params (hash) -> localStorage; DATA_PATH is removed from the URL bar ----------
  const hp = new URLSearchParams(location.hash.replace(/^#/, ""));
  if (hp.get("d")) localStorage.setItem("desk_data_path", hp.get("d"));
  if (hp.get("b")) localStorage.setItem("desk_data_base", hp.get("b").replace(/\/+$/, ""));
  if (hp.get("t")) localStorage.setItem("desk_read_token", hp.get("t"));
  const DEMO = hp.get("demo"); // "1" | "empty" | "error" | null
  const START_SCREEN = hp.get("screen") || "home";
  const START_MINT = hp.get("mint") || null;
  if (hp.get("d") || hp.get("b") || hp.get("t")) {
    hp.delete("d"); hp.delete("b"); hp.delete("t");
    history.replaceState(null, "", location.pathname + location.search + (hp.toString() ? "#" + hp : ""));
  }
  const DATA_PATH = localStorage.getItem("desk_data_path") || "";
  const BASE = (localStorage.getItem("desk_data_base") || "").replace(/\/+$/, "");
  const READ_TOKEN = localStorage.getItem("desk_read_token") || "";

  const S = { state: null, chart: null, activity: null, account: null, bots: {}, coin: {}, audit: {},
    lastOk: null, err: null, retryAt: 0, range: "LIVE", frameTs: null, screen: START_SCREEN, mint: START_MINT, query: "" };

  // ---------- data source ----------
  const UPSTASH = !!(READ_TOKEN && BASE);
  function url(file) { return `${BASE}/d/${encodeURIComponent(DATA_PATH)}/${file}`; }
  function upstashGet(key) { return `${BASE}/get/${encodeURIComponent(key)}`; }
  async function fetchJSON(u, headers) {
    const r = await fetch(u, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", headers: headers || {} });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function getJSON(file) {
    if (DEMO) return Demo.get(file);
    if (!DATA_PATH) throw new Error("no data path");
    return fetchJSON(url(file));
  }
  async function getSnap() {
    const body = await fetchJSON(upstashGet("desk:" + DATA_PATH + ":snap"), { Authorization: "Bearer " + READ_TOKEN });
    if (body.result == null) throw new Error("empty snap");
    return typeof body.result === "string" ? JSON.parse(body.result) : body.result;
  }
  function applySnap(snap) {
    S.state = snap.state; S.chart = snap.chart; S.activity = snap.activity; S.account = snap.account;
    S.orders = snap.orders || S.orders;
    if (snap.bots) S.bots = snap.bots;
    if (snap.coins) Object.assign(S.coin, snap.coins);
    if (snap.audits) Object.assign(S.audit, snap.audits);
    S.snapFrameTs = snap.frame_ts || (snap.state && snap.state.frame_ts) || null;
  }

  async function poll() {
    try {
      if (DEMO) {
        const [st, ch, act, acc] = await Promise.all([getJSON("state.json"), getJSON("chart.json"), getJSON("activity.json"), getJSON("account.json")]);
        S.state = st; S.chart = ch; S.activity = act; S.account = acc;
        if (S.screen === "bots") await Promise.all(BOT_ORDER.map(async (b) => { try { S.bots[b] = await getJSON(`bots/${b}.json`); } catch (_) {} }));
        if (S.mint && (S.screen === "coin" || S.screen === "audit")) {
          try { S.coin[S.mint] = await getJSON(`coin/${S.mint}.json`); } catch (_) { S.coin[S.mint] = S.coin[S.mint] || null; }
          try { S.audit[S.mint] = await getJSON(`audit/${S.mint}.json`); } catch (_) { S.audit[S.mint] = S.audit[S.mint] || null; }
        }
      } else if (UPSTASH) {
        if (!DATA_PATH) throw new Error("no data path");
        applySnap(await getSnap());
      } else {
        if (!DATA_PATH) throw new Error("no data path");
        const [st, ch, act, acc] = await Promise.all([getJSON("state.json"), getJSON("chart.json"), getJSON("activity.json"), getJSON("account.json")]);
        S.state = st; S.chart = ch; S.activity = act; S.account = acc;
        if (S.screen === "bots") await Promise.all(BOT_ORDER.map(async (b) => { try { S.bots[b] = await getJSON(`bots/${b}.json`); } catch (_) {} }));
        if (S.mint && (S.screen === "coin" || S.screen === "audit")) {
          try { S.coin[S.mint] = await getJSON(`coin/${S.mint}.json`); } catch (_) { S.coin[S.mint] = S.coin[S.mint] || null; }
          try { S.audit[S.mint] = await getJSON(`audit/${S.mint}.json`); } catch (_) { S.audit[S.mint] = S.audit[S.mint] || null; }
        }
      }
      S.lastOk = Date.now(); S.err = null;
      if (DEMO === "error") throw new Error("demo: desk offline");
    } catch (e) {
      S.err = String(e.message || e); S.retryAt = Date.now() + POLL_MS;
    }
    render();
    if (!DEMO && UPSTASH) loadFrame();
  }

  // ---------- helpers ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const usd = (v, d = 2) => (v == null || isNaN(v) ? "—" : (v < 0 ? "-$" : "$") + Math.abs(+v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
  const pct = (v) => (v == null || isNaN(v) ? "—" : (v >= 0 ? "+" : "") + (+v).toFixed(2) + "%");
  const short = (v) => { if (v == null || isNaN(v)) return "—"; const a = Math.abs(v); return a >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : a >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : usd(v); };
  const hhmm = (ts) => (ts ? new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
  const fomoBtn = (link) => link ? `<a class="fomo" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : `<span class="fomo faint">${DEMO ? "Open on FOMO (demo)" : "Open on FOMO"}</span>`;
  const isPaper = () => ((S.state && S.state.mode) || (S.account && S.account.mode)) === "PAPER";
  function go(screen, mint) { S.screen = screen; if (mint !== undefined) S.mint = mint; render(); window.scrollTo(0, 0); if (mint) poll(); if (screen === "bots") poll(); }

  // odometer: changed digits roll 600ms ease-out, 30ms stagger; reduced motion = swap
  function odometer(el, text) {
    const prev = el.dataset.v || "";
    el.dataset.v = text;
    if (!el.firstChild || prev.length !== text.length) {
      el.innerHTML = "";
      el.classList.add("odo");
      [...text].forEach((ch) => {
        if (/\d/.test(ch)) {
          const d = document.createElement("span"); d.className = "d";
          const col = document.createElement("span"); col.className = "col";
          for (let i = 0; i <= 9; i++) { const s = document.createElement("span"); s.textContent = i; col.appendChild(s); }
          col.style.transition = "none"; col.style.transform = `translateY(-${+ch * 1.05}em)`;
          d.appendChild(col); el.appendChild(d);
        } else { const s = document.createElement("span"); s.textContent = ch; el.appendChild(s); }
      });
      return;
    }
    let k = 0;
    [...text].forEach((ch, i) => {
      const node = el.childNodes[i];
      if (/\d/.test(ch) && node && node.firstChild) {
        const col = node.firstChild;
        if (prev[i] !== ch) { col.style.transition = ""; col.style.transitionDelay = `${k++ * 30}ms`; col.style.transform = `translateY(-${+ch * 1.05}em)`; }
      } else if (node) node.textContent = ch;
    });
  }

  // ---------- states ----------
  function offlineRow() {
    const el = $("#offline");
    if (!S.err || (!DEMO && !DATA_PATH)) { el.hidden = true; return; }
    const n = Math.max(0, Math.round((S.retryAt - Date.now()) / 1000));
    const last = S.lastOk ? new Date(S.lastOk).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "never";
    el.hidden = false;
    el.textContent = `Desk offline · retrying in ${n}s · last update ${last}`;
  }
  function loading(kind) {
    const blocks = {
      home: `<div class="sk" style="height:52px;margin-top:4px"></div><div class="sk" style="height:44px;margin-top:8px"></div><div class="sk" style="height:76px;width:70%;margin-top:14px"></div><div class="sk" style="height:220px;margin-top:14px"></div><div class="sk" style="aspect-ratio:16/9;border-radius:22px;margin-top:14px"></div><div class="sk" style="height:150px;margin-top:22px"></div>`,
      list: `<div class="sk" style="height:52px"></div>${'<div class="sk" style="height:60px;margin-top:8px"></div>'.repeat(7)}`,
      bots: `<div class="sk" style="height:52px"></div>${'<div class="sk" style="height:160px;margin-top:12px"></div>'.repeat(4)}`,
      coin: `<div class="sk" style="height:52px"></div><div class="sk" style="height:40px;width:60%;margin-top:8px"></div><div class="sk" style="height:76px;width:70%;margin-top:12px"></div><div class="sk" style="height:220px;margin-top:14px"></div><div class="sk" style="height:64px;margin-top:14px"></div>`,
    };
    return blocks[kind] || blocks.list;
  }

  // ---------- screens ----------
  function home() {
    const st = S.state;
    if (!st) return loading("home");
    const today = st.today_pct, mult = st.multiplier;
    const acts = (S.activity && S.activity.rows) || [];
    const running = (st.bot_cards || []).filter((b) => b.alive && !b.paused).length;
    const lo = st.last_order;
    const holder = st.lane_owner && st.lane_owner !== "Idle" ? st.lane_owner : "Idle";
    const holderBot = BOT[(holder.split(" ")[0] || "").toLowerCase()];
    return `
      <div class="nav">
        <button class="avatar" data-go="account" aria-label="Account"><span>${esc(((S.account && S.account.fomo_handle) || "G")[0].toUpperCase())}</span></button>
        <div class="brand">Grok Bot <small>›</small></div>
        <button class="iconbtn" data-go="activity" aria-label="Notifications">🔔${acts.length ? '<i class="bell-dot"></i>' : ""}</button>
      </div>
      <input class="search" id="q" type="search" placeholder="Search name, symbol or mint" value="${esc(S.query)}" autocomplete="off">
      <div id="qres"></div>
      <div class="bal">
        <div class="bal-row"><span class="big" id="odo"></span>${st.mode === "PAPER" ? '<span class="paper">PAPER</span>' : ""}</div>
        <div class="sub-row"><span class="${today >= 0 ? "up" : "down"}">${pct(today)} today</span><span class="mult ${mult < 1 ? "neg" : ""}">${mult != null ? (+mult).toFixed(2) + "×" : "—"}</span></div>
      </div>
      <div class="chart-wrap"><canvas class="chart" id="chart"></canvas></div>
      <div class="ranges">${["LIVE", "1H", "4H", "1D", "1W", "ALL"].map((r) => `<button data-range="${r}" class="${S.range === r ? "on" : ""}">${r}</button>`).join("")}</div>
      ${acts.length === 0 ? '<div class="empty">Waiting for the first trade</div>' : ""}
      <div class="live">
        <button class="screen" id="screen" aria-label="Live screen full screen" style="width:100%">
          <img id="f0" ${S.frameSrc ? `src="${esc(S.frameSrc)}"` : ""} alt=""><img id="f1" class="back" alt="">
          ${S.frameSrc ? "" : '<div class="none" id="fnone">No frame yet</div>'}
          <span class="tl" id="flabel">${frameLabel()}</span>
          <span class="tr" style="${holderBot ? `color:${holderBot.color}` : ""}">${esc(holder)}</span>
        </button>
        <div class="lastorder">${lo ? `<span>${esc(lo.side === "buy" ? "Bought" : "Sold")} ${esc(lo.symbol)} · ${usd(lo.fill_usd != null ? lo.fill_usd : lo.usd)} · ${esc(lo.status === "done" ? "verified" : lo.status)}</span>${checks(lo.checks)}` : '<span class="muted">No orders yet</span>'}</div>
      </div>
      <div class="section-h"><h2>Bots · ${running} running</h2></div>
      <div class="carousel">${BOT_ORDER.map((b) => botCard(b, (st.bot_cards || []).find((c) => c.name === b) || {})).join("")}</div>
      <div class="section-h"><h2>Activity</h2><button data-go="activity">See all</button></div>
      ${acts.length ? `<div class="list">${acts.slice(0, 5).map(actRow).join("")}</div>` : '<div class="list"><div class="empty">Nothing yet tonight</div></div>'}
    `;
  }
  function checks(c) {
    c = c || {};
    const one = (k, lbl) => `<span class="chk ${c[k] === true ? "ok" : c[k] === false ? "bad" : "na"}">${c[k] === true ? "✓" : c[k] === false ? "✕" : "–"} ${lbl}</span>`;
    return `<span class="checks">${one("screen", "screen")}${one("api", "api")}${one("chain", "chain")}</span>`;
  }
  function botCard(key, c) {
    const b = BOT[key], st = S.state || {};
    let body = "";
    if (key === "scanner") body = `<div class="bmetric">${c.today_count != null ? c.today_count : "—"} pools</div><div class="feed">${feed("scanner")}</div>`;
    if (key === "analyst") body = `<div class="bmetric">${c.today_count != null ? c.today_count : "—"} taken apart</div><div class="strips">${Array.from({ length: 8 }, () => '<i class="strip"></i>').join("")}</div><div class="feed" style="margin-top:6px">Score ring 0-100 · green from 70</div>`;
    if (key === "brain") body = `<div class="bmetric">Sizing</div><div class="feed">80+ = full size<br>under 80 = half size</div>`;
    if (key === "executor") body = `<div class="bmetric">${c.today_count != null ? c.today_count : "—"} trades</div><div class="feed">${esc(st.lane_owner && st.lane_owner.toLowerCase().startsWith("executor") ? "Clicking Buy..." : st.last_order && st.last_order.status === "done" && st.last_order.side === "buy" ? "✓ Bought · verified" : "Waiting for a dip -15%")}</div><div class="bar"><i></i></div>`;
    if (key === "risk") body = `<div class="bmetric">${(st.open_position_count || 0) > 0 ? "Guarding" : "Watching"}</div><div><span class="pill red">stop -25%</span><span class="pill green">trail 40%</span></div>`;
    return `<div class="bcard"><div class="bname"><i class="dot" style="background:${c.alive === false ? "#8e8e93" : b.color}"></i><span style="color:${b.color}">${b.name}</span>${c.paused ? '<span class="faint" style="margin-left:auto">Paused</span>' : ""}</div>${body}</div>`;
  }
  function feed(bot) {
    const d = (S.bots[bot] && S.bots[bot].decisions) || [];
    if (!d.length) return "No scans yet";
    return d.slice(0, 3).map((x) => x.verdict === "pass" ? `${esc(x.symbol)} → Analyst` : `<span class="killed">${esc(x.symbol)}</span> ${esc(x.reason || "")}`).join("<br>");
  }
  function actRow(r) {
    const icon = { bought: "▲", sold: "$", stopped: "■", rejected: "✕" }[r.kind] || "•";
    const col = { bought: "var(--blue)", sold: "var(--green)", stopped: "var(--red)", rejected: "var(--t2)" }[r.kind] || "var(--t2)";
    const target = r.kind === "rejected" ? "audit" : "coin";
    return `<div class="row"><button class="ico" style="color:${col}" data-open="${target}" data-mint="${esc(r.mint || "")}">${icon}</button>
      <button class="mid" style="text-align:left" data-open="${target}" data-mint="${esc(r.mint || "")}"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.subtitle)}</div></button>
      <div class="v"><div class="${r.kind === "stopped" ? "down" : r.kind === "sold" ? "up" : ""}">${esc(r.value || "")}</div>${r.mint ? fomoBtn(r.link) : ""}</div></div>`;
  }
  function activity() {
    if (!S.activity) return `<div class="title">Activity</div>${loading("list")}`;
    const rows = S.activity.rows || [];
    return `<div class="title">Activity</div>${rows.length ? `<div class="list">${rows.map(actRow).join("")}</div>` : '<div class="list"><div class="empty">Nothing yet tonight</div></div>'}
      <div class="note">Plan B: the newest 30 rows (file mode has no paging).</div>`;
  }
  function bots() {
    if (!S.state) return `<div class="title">Bots</div>${loading("bots")}`;
    const cards = S.state.bot_cards || [];
    return `<div class="title">Bots</div>${BOT_ORDER.map((k) => {
      const c = cards.find((x) => x.name === k) || {}, b = BOT[k];
      const dec = (S.bots[k] && S.bots[k].decisions) || [];
      const locked = k === "risk" && c.pause_locked;
      return `<div class="bfull"><div class="top"><i class="dot" style="background:${c.alive ? "var(--green)" : "#8e8e93"}"></i><span class="name" style="color:${b.color}">${b.name}</span>
        <span class="muted">${c.today_count != null ? c.today_count : 0} today</span>
        <button class="switch ${c.paused ? "" : "on"}" disabled aria-label="${b.name} running" title="${locked ? "Risk is locked while a position is open" : "Pause via Telegram (Plan B)"}"></button></div>
        <div class="note">${locked ? "Locked: a position is open, Risk keeps guarding." : "Pause/resume goes through Telegram (Plan B)."}</div>
        ${dec.length ? dec.slice(0, 20).map((d) => `<div class="dec"><button class="what" style="text-align:left" data-open="${k === "analyst" || d.verdict === "reject" || d.verdict === "kill" ? "audit" : "coin"}" data-mint="${esc(d.mint || "")}">${esc(d.symbol || "")} · ${esc(d.verdict || "")}${d.reason ? " · " + esc(d.reason) : ""}</button><span class="faint">${hhmm(d.ts)}</span>${d.mint ? fomoBtn(d.link) : ""}</div>`).join("") : '<div class="dec"><span class="what">No decisions yet</span></div>'}
        <div class="dec"><button class="what" style="color:var(--blue);text-align:left" data-go="account">Settings ›</button></div></div>`;
    }).join("")}`;
  }
  function audit() {
    const a = S.audit[S.mint];
    const head = `<div class="ph"><button class="back" data-back>‹ Back</button><h1>Audit</h1></div>`;
    if (a === undefined) return head + loading("coin");
    if (!a || !(a.layers || []).length) return head + `<div class="empty">Not audited yet</div>${a && a.coin ? fomoBtn(a.coin.link) : ""}`;
    const L = a.layers;
    const discs = Array.from({ length: 8 }, (_, i) => { const l = L.find((x) => x.layer === i + 1); return `<div class="disc ${l ? (l.pass === true ? "g" : l.pass === false ? "r" : "n") : "n"}">${l ? (l.pass === true ? "✓" : l.pass === false ? "✕" : "–") : i + 1}</div>`; }).join("");
    return head + `<div class="coin-h"><span class="nm">${esc(a.coin.symbol)}</span><span class="muted">${esc(a.coin.name || "")}</span></div>
      <div class="discs">${discs}<i class="beam"></i></div>
      <div class="list">${L.map((l) => `<div class="lrow"><span class="n">${l.layer}</span><span class="nm">${esc(l.name)}</span><span class="val">${esc(l.value_text)}</span><span class="${l.pass === true ? "ok" : l.pass === false ? "bad" : "faint"}">${l.pass === true ? "✓" : l.pass === false ? "✕" : "–"}</span></div>`).join("")}
      <div class="lrow"><span class="nm">${esc(a.social_line || "Social: off")}</span></div></div>
      <div style="margin-top:12px">${fomoBtn(a.coin.link)}</div>`;
  }
  function coin() {
    const c = S.coin[S.mint];
    const head = `<div class="ph"><button class="back" data-back>‹ Back</button><h1>Coin</h1></div>`;
    if (c === undefined) return head + loading("coin");
    if (!c) return head + `<div class="empty">No data for this coin yet</div>`;
    const co = c.coin || {}, p = c.position, sc = c.scan || {};
    const ageMin = co.created_at ? Math.max(0, (Date.now() / 1000 - co.created_at) / 60) : null;
    const age = ageMin == null ? "—" : ageMin >= 1440 ? Math.round(ageMin / 1440) + "d" : ageMin >= 60 ? Math.round(ageMin / 60) + "h" : Math.round(ageMin) + "m";
    const since = p && p.entry_price ? ((c.price - p.entry_price) / p.entry_price) * 100 : null;
    const mcap = sc.liquidity_usd && sc.liq_mcap ? sc.liquidity_usd / sc.liq_mcap : null;
    const passed = (c.audit_summary || {}).passed, total = (c.audit_summary || {}).total || 8;
    return head + `<div class="coin-h"><span class="nm">${esc(co.name || co.symbol)}</span>${c.mode === "PAPER" ? '<span class="paper">PAPER</span>' : ""}<button class="chip" data-open="audit" data-mint="${esc(S.mint)}">🛡 ${passed != null ? passed : "–"}/${total}</button></div>
      <div class="muted">${esc(co.symbol || "")} · Solana · ${age} old</div>
      <div class="big" style="font-size:66px;margin-top:8px">${c.price != null ? fmtPrice(c.price) : "—"}</div>
      <div class="${since == null ? "muted" : since >= 0 ? "up" : "down"}">${since == null ? "No position" : (since >= 0 ? "▲ " : "▼ ") + Math.abs(since).toFixed(2) + "% since entry"}</div>
      <div class="chart-wrap"><canvas class="chart" id="candles"></canvas></div>
      ${(c.candles || []).length ? "" : '<div class="empty" style="padding:8px">No candles yet</div>'}
      <div class="stats"><div class="stat"><div class="k">Market cap</div><div class="vv">${short(mcap)}</div></div><div class="stat"><div class="k">Liquidity</div><div class="vv">${short(sc.liquidity_usd)}</div></div><div class="stat"><div class="k">Holders</div><div class="vv">${co.holders != null ? (+co.holders).toLocaleString() : "—"}</div></div></div>
      <div class="card" style="margin-top:14px">${p && !p.closed_at ? `Your position · ${usd(p.size_usd)} in · Executor` : '<span class="muted">No open position</span>'}</div>
      <div class="btns">${co.link ? `<a class="btn" href="${esc(co.link)}" target="_blank" rel="noopener noreferrer">Open on FOMO</a>` : `<span class="btn disabled">Open on FOMO${DEMO ? " (demo)" : ""}</span>`}<button class="btn danger ${p && !p.closed_at ? "" : "disabled"}" id="sellnow">Sell now</button></div>`;
  }
  function fmtPrice(v) { return v >= 1 ? usd(v) : "$" + (+v).toPrecision(4); }
  function account() {
    const a = S.account;
    if (!a) return `<div class="title">Account</div>${loading("list")}`;
    const groups = a.settings || {};
    return `<div class="title">Account</div>
      <div class="seg"><button class="${a.mode === "PAPER" ? "on" : ""}" disabled>PAPER</button><button class="${a.mode === "LIVE" ? "on" : ""}" disabled>LIVE</button></div>
      <div class="note">Mode changes go through Telegram (Plan B). LIVE needs you to type LIVE.</div>
      <div class="grp"><h3>Cash</h3><div class="list"><div class="row"><div class="mid"><div class="t">PAPER start cash</div><div class="s">Free now ${usd(a.free_cash)}</div></div><div class="v">${usd(a.paper_start_cash)}</div></div></div></div>
      <div class="grp"><h3>FOMO</h3><div class="list">
        <div class="row"><div class="mid"><div class="t">Your FOMO profile</div><div class="s">${esc(a.fomo_handle ? "@" + a.fomo_handle : "No handle set")}</div></div>${a.profile_url ? `<a class="fomo" href="${esc(a.profile_url)}" target="_blank" rel="noopener noreferrer">Open</a>` : '<span class="fomo faint">Open</span>'}</div>
        <button class="row" id="invite"><div class="mid"><div class="t">Invite a friend</div><div class="s" id="invite-s">Share your FOMO invite link</div></div><span class="fomo">Share</span></button>
      </div></div>
      ${Object.keys(groups).map((g) => `<div class="grp"><h3>${esc(g[0].toUpperCase() + g.slice(1))}</h3><div class="list">${groups[g].map(setRow).join("")}</div></div>`).join("")}
      <div class="grp"><h3>Copy picks</h3><div class="list"><div class="row"><div class="mid"><div class="t">Copy picks</div><div class="s">Off · every 24h / 12h / 6h + time (chapter 3 prompt not pasted yet)</div></div><div class="v muted">Off</div></div></div></div>
      <div class="grp"><h3>Pushes</h3><div class="list">
        <div class="row"><div class="mid"><div class="t">Notifications</div><div class="s">Plan B: Telegram only</div></div><div class="v muted">${esc(a.notifier || "telegram")}</div></div>
        <div class="row"><div class="mid"><div class="t">Send test push</div><div class="s">Send /test in Telegram (STEP 11)</div></div></div>
        <div class="row"><div class="mid"><div class="t">Watch in Grok Bot</div><div class="s">Open your bot's computer preview in the Grok Bot app</div></div></div>
      </div></div>
      <div class="note">Settings are read-only here in Plan B; change them in Telegram. Ranges shown are enforced by the desk.</div>`;
  }
  function setRow(s) {
    const isNum = s.kind === "number" || s.kind === "int";
    return `<div class="set"><div class="top"><span>${esc(s.key.replace(/^[a-z]+\./, ""))}</span><span class="val">${esc(typeof s.value === "boolean" ? (s.value ? "on" : "off") : s.value === "" ? "—" : s.value)}</span></div>
      ${isNum && s.min != null && s.max != null ? `<input type="range" min="${s.min}" max="${s.max}" step="any" value="${s.value}" disabled aria-label="${esc(s.key)}">` : ""}</div>`;
  }

  // ---------- search ----------
  function searchResults(q) {
    q = q.trim().toLowerCase();
    if (!q) return "";
    const pool = new Map();
    ((S.state && S.state.open_positions) || []).forEach((p) => pool.set(p.mint, { mint: p.mint, symbol: p.symbol, name: p.name, link: p.link }));
    ((S.activity && S.activity.rows) || []).forEach((r) => { if (r.mint && !pool.has(r.mint)) pool.set(r.mint, { mint: r.mint, symbol: (r.title || "").split(" ").slice(1).join(" "), name: "", link: r.link }); });
    const hits = [...pool.values()].filter((x) => [x.mint, x.symbol, x.name].some((v) => (v || "").toLowerCase().includes(q)));
    if (!hits.length) return '<div class="list"><div class="empty">No coin matches</div></div>';
    return `<div class="list">${hits.slice(0, 6).map((h) => `<div class="row"><button class="mid" style="text-align:left" data-open="coin" data-mint="${esc(h.mint)}"><div class="t">${esc(h.symbol || h.mint.slice(0, 6))}</div><div class="s">${esc(h.mint)}</div></button>${fomoBtn(h.link)}</div>`).join("")}</div>`;
  }

  // ---------- render ----------
  function render() {
    $("#demo-banner").hidden = !DEMO;
    offlineRow();
    const v = $("#view");
    if (!DEMO && !DATA_PATH) {
      $("#offline").hidden = true;
      v.innerHTML = `<div class="setup"><h2>Not linked to your desk yet</h2><p class="muted">Open the private link your desk sends you on Telegram once. It is kept on this phone only and never put in this site.</p><p class="faint">No numbers are shown until a desk link is set.</p></div>`;
      return;
    }
    const fn = { home, bots, activity, account, audit, coin }[S.screen] || home;
    v.innerHTML = fn();
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === S.screen));
    if (S.screen === "home" && S.state) {
      const odo = $("#odo"); if (odo) { const txt = usd(S.state.balance); odometer(odo, S.prevBal && S.prevBal.length === txt.length ? S.prevBal : txt); requestAnimationFrame(() => requestAnimationFrame(() => odometer(odo, txt))); S.prevBal = txt; }
      const cv = $("#chart"); if (cv) window.DeskChart.lineChart(cv, filterRange(S.chart));
      const qres = $("#qres"); if (qres) qres.innerHTML = searchResults(S.query);
      showFrame();
    }
    if (S.screen === "coin" && S.coin[S.mint]) {
      const c = S.coin[S.mint], cv = $("#candles");
      if (cv) window.DeskChart.candles(cv, c.candles || [], { exit: c.position && !c.position.closed_at ? c.position.stop_price : null });
    }
  }
  function filterRange(ch) {
    if (!ch) return { points: [], marks: [] };
    const win = { LIVE: 3600, "1H": 3600, "4H": 14400, "1D": 86400, "1W": 604800, ALL: null }[S.range];
    const now = Math.max(...(ch.points || []).map((p) => p.ts), 0);
    const pts = win ? (ch.points || []).filter((p) => p.ts >= now - win) : ch.points || [];
    return { points: pts, marks: ch.marks || [], start_value: pts.length ? pts[0].value : ch.start_value };
  }

  // Live screen: double buffered, never flashes
  let front = 0;
  function frameUrl() { return DEMO ? Demo.frame() : (!UPSTASH && DATA_PATH && BASE) ? url("screen.jpg") + "?t=" + Date.now() : null; }
  function frameLabel() {
    const fresh = S.frameTs && Date.now() - S.frameTs < 5000;
    return fresh ? '<i class="dot red"></i>Live · Bot\'s computer' : `<i class="dot grey"></i>Last frame ${S.frameTs ? new Date(S.frameTs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}`;
  }
  function adoptFrame(src, tsMs) {
    if (!src) return;
    S.frameSrc = src; S.frameTs = tsMs;
    const n = $("#fnone"); if (n) n.remove();
    const l = $("#flabel"); if (l) l.innerHTML = frameLabel();
    showFrame();
  }
  function loadFrame() {
    if (DEMO) {
      const u = frameUrl(); if (!u) return;
      const img = new Image();
      img.onload = () => adoptFrame(u, Date.now() - (DEMO === "error" ? 120000 : 1000));
      img.onerror = () => {};
      img.src = u;
      return;
    }
    if (UPSTASH) {
      const ts = S.snapFrameTs;
      if (!ts || ts === S.lastFrameTs) return;
      fetchJSON(upstashGet("desk:" + DATA_PATH + ":frame"), { Authorization: "Bearer " + READ_TOKEN }).then((body) => {
        if (!body || body.result == null || body.result === "") return;
        S.lastFrameTs = ts;
        adoptFrame("data:image/jpeg;base64," + body.result, ts * 1000);
      }).catch(() => {});
      return;
    }
    const u = frameUrl(); if (!u) return;
    const img = new Image();
    img.onload = () => adoptFrame(u, Date.now());
    img.onerror = () => {};
    img.src = u;
  }
  function showFrame() {
    if (!S.frameSrc) return;
    const a = $("#f0"), b = $("#f1"); if (!a || !b) return;
    if (!a.getAttribute("src") && !b.getAttribute("src")) front = 0;
    const [cur, nxt] = front ? [b, a] : [a, b];
    if (cur.src === S.frameSrc) return;
    nxt.onload = () => { nxt.classList.remove("back"); cur.classList.add("back"); front ^= 1; };
    nxt.src = S.frameSrc;
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab],[data-go],[data-open],[data-back],[data-range],#screen,#sellnow,#invite");
    if (!t) return;
    if (t.dataset.tab) return go(t.dataset.tab);
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.open) { if (t.dataset.mint) go(t.dataset.open, t.dataset.mint); return; }
    if (t.hasAttribute("data-back")) return go("home");
    if (t.dataset.range) { S.range = t.dataset.range; return render(); }
    if (t.id === "screen") return fullScreen();
    if (t.id === "sellnow") return sellSheet();
    if (t.id === "invite") return invite();
  });
  document.addEventListener("input", (e) => { if (e.target.id === "q") { S.query = e.target.value; const r = $("#qres"); if (r) r.innerHTML = searchResults(S.query); } });

  function fullScreen() {
    if (!S.frameSrc) return;
    const sym = S.state && S.state.last_order;
    const root = $("#sheet-root");
    root.innerHTML = `<div class="fs"><div class="bar2"><button class="back" id="fsx" style="color:var(--blue);min-height:44px">Done</button>${sym ? fomoBtn(sym.link) : ""}</div><div class="img"><img src="${esc(S.frameSrc)}" alt="Bot's computer"></div></div>`;
    $("#fsx").onclick = () => (root.innerHTML = "");
  }
  function sellSheet() {
    const c = S.coin[S.mint]; if (!c || !c.position) return;
    let sel = 100;
    const root = $("#sheet-root");
    const draw = () => {
      root.innerHTML = `<div class="sheet-bg" id="sbg"><div class="sheet"><div class="t" style="font-weight:600">Sell ${esc((c.coin || {}).symbol || "")}</div>
        <div class="opts">${[25, 50, 100].map((p) => `<button data-p="${p}" class="${sel === p ? "on" : ""}">${p}%</button>`).join("")}</div>
        <button class="btn danger" id="cs" style="width:100%">Confirm sell</button>
        <div class="note" id="cs-n">Plan B: the sell goes through Telegram. Send <span style="font-family:var(--mono)">/sell ${esc((c.coin || {}).symbol || "")} ${sel}</span>; Executor clicks it.</div></div></div>`;
      root.querySelectorAll("[data-p]").forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); sel = +b.dataset.p; draw(); }));
      $("#cs").onclick = (ev) => { ev.stopPropagation(); $("#cs-n").textContent = `Copy this to Telegram: /sell ${(c.coin || {}).symbol || ""} ${sel}`; };
      $("#sbg").onclick = (ev) => { if (ev.target.id === "sbg") root.innerHTML = ""; };
    };
    draw();
  }
  async function invite() {
    const link = S.account && S.account.invite_url;
    const s = $("#invite-s");
    if (!link) { if (s) s.textContent = DEMO ? "Demo: no real link" : "Invite link not loaded"; return; }
    try {
      if (navigator.share) { await navigator.share({ url: link }); return; }
    } catch (_) { /* cancelled */ }
    try { await navigator.clipboard.writeText(link); if (s) s.textContent = "Link copied"; } catch (_) { if (s) s.textContent = link; }
  }

  // ---------- demo data (clearly labelled, never presented as real) ----------
  const Demo = (function () {
    const now = Math.floor(Date.now() / 1000);
    const M = ["DemoMintAAAA1111111111111111111111111111", "DemoMintBBBB2222222222222222222222222222", "DemoMintCCCC3333333333333333333333333333"];
    const empty = DEMO === "empty";
    const pts = empty ? [] : Array.from({ length: 60 }, (_, i) => ({ ts: now - (59 - i) * 60, value: 36 + Math.sin(i / 6) * 1.5 + i * 0.09 }));
    const balance = empty ? 36 : pts[pts.length - 1].value;
    const bot_cards = BOT_ORDER.map((n, i) => ({ name: n, paused: false, pause_locked: n === "risk" && !empty, alive: true, today_count: empty ? 0 : [41, 9, 3, 3, 1][i], status_line: "" }));
    const rows = empty ? [] : [
      { id: 5, ts: now - 200, kind: "bought", mint: M[0], bot: "executor", title: "Bought DEMOA", subtitle: "Executor · " + hhmm(now - 200), value: "$4.32 · 12% of cash", link: null },
      { id: 4, ts: now - 900, kind: "sold", mint: M[1], bot: "executor", title: "Sold DEMOB", subtitle: "Executor · take profit 50%", value: "+$2.10 · +48%", link: null },
      { id: 3, ts: now - 1500, kind: "stopped", mint: M[2], bot: "risk", title: "Stopped DEMOC", subtitle: "Risk · -25% stop", value: "-$1.08", link: null },
      { id: 2, ts: now - 2100, kind: "rejected", mint: M[2], bot: "analyst", title: "Rejected DEMOC", subtitle: "Analyst · insiders 38%", value: "Skipped", link: null },
      { id: 1, ts: now - 2600, kind: "bought", mint: M[1], bot: "executor", title: "Bought DEMOB", subtitle: "Executor · " + hhmm(now - 2600), value: "$4.38 · 12% of cash", link: null },
    ];
    const state = {
      balance, start_balance: 36, today_pct: ((balance - 36) / 36) * 100, multiplier: balance / 36, mode: "PAPER", free_cash: empty ? 36 : 28.1,
      open_position_count: empty ? 0 : 1, bot_cards,
      open_positions: empty ? [] : [{ id: 1, mint: M[0], symbol: "DEMOA", name: "Demo Alpha", entry_price: 0.00102, current_price: 0.00111, size_usd: 4.32, link: null }],
      last_order: empty ? null : { id: 5, mint: M[0], symbol: "DEMOA", side: "buy", usd: 4.32, fill_usd: 4.32, status: "done", checks: { screen: true, api: null, chain: true }, link: null },
      lane_owner: empty ? "Idle" : "Executor · buying", ts: now,
    };
    const chart = { range: "LIVE", start_value: 36, points: pts, marks: empty ? [] : [
      { ts: now - 2600, kind: "buy", label: "Bought DEMOB" }, { ts: now - 1500, kind: "stop", label: "-25% · -$1.08" },
      { ts: now - 900, kind: "sell", label: "+$2.10" }, { ts: now - 200, kind: "buy", label: "Bought DEMOA" }] };
    const groups = { scanner: [["scanner.min_liquidity_usd", 20000, 0, 10000000], ["scanner.max_top10_pct", 25, 0, 100]], analyst: [["analyst.min_score", 70, 0, 100]], brain: [["brain.risk_per_trade_pct", 3, 0.01, 100], ["brain.max_ticket_usd", 50, 0.01, 1000000]], executor: [["executor.dip_pct", 15, 0, 100], ["executor.tp_x", 2, 1, 100]], risk: [["risk.stop_pct", 25, 0.01, 100], ["risk.night_loss_stop_pct", 30, 0.01, 100]] };
    const settings = {}; Object.keys(groups).forEach((g) => (settings[g] = groups[g].map(([key, value, min, max]) => ({ key, value, min, max, kind: "number" }))));
    const account = { mode: "PAPER", paper_start_cash: 36, free_cash: state.free_cash, fomo_handle: "demo", profile_url: null, invite_url: null, notifier: "telegram", push_connected: false, settings };
    const decisions = (bot) => ({ bot, decisions: empty ? [] : bot === "scanner"
      ? [{ ts: now - 120, mint: M[0], symbol: "DEMOA", verdict: "pass", reason: "cleared", link: null }, { ts: now - 300, mint: M[2], symbol: "DEMOC", verdict: "kill", reason: "top10 31%", link: null }]
      : [{ ts: now - 200, mint: M[0], symbol: "DEMOA", verdict: bot === "analyst" ? "pass" : "done", reason: bot === "analyst" ? "score 82" : "dip buy", link: null }] });
    const coinJ = (m) => empty ? { mint: m, coin: { mint: m, symbol: "DEMOA", name: "Demo Alpha", link: null }, price: null, candles: [], position: null, scan: null, audit_summary: { passed: 0, total: 8 }, mode: "PAPER" }
      : { mint: m, mode: "PAPER", coin: { mint: m, symbol: "DEMOA", name: "Demo Alpha", created_at: now - 11 * 3600, holders: 1240, link: null }, price: 0.00111,
        candles: Array.from({ length: 40 }, (_, i) => { const o = 0.00098 + Math.sin(i / 4) * 0.00004 + i * 0.000003; const c = o + (i % 3 - 1) * 0.00001; return { ts: now - (40 - i) * 60, open: o, close: c, high: Math.max(o, c) + 0.000006, low: Math.min(o, c) - 0.000006 }; }),
        position: { entry_price: 0.00102, size_usd: 4.32, stop_price: 0.000796, closed_at: null }, scan: { liquidity_usd: 48200, liq_mcap: 0.21 }, audit_summary: { passed: 8, total: 8 } };
    const auditJ = (m) => empty ? { mint: m, coin: { symbol: "DEMOA", name: "Demo Alpha", link: null }, layers: [], social_line: "Social: off" }
      : { mint: m, coin: { symbol: "DEMOA", name: "Demo Alpha", link: null }, social_line: "Social: off",
        layers: [["Mint & freeze", "Revoked"], ["Dev wallet", "0.9% · sold 0"], ["Creator history", "None"], ["Top 10", "16.8%"], ["LP", "100% burned"], ["Age", "43m"], ["Insiders", "4.1%"], ["FOMO warnings", "None"]].map(([name, v], i) => ({ layer: i + 1, name, value_text: v, pass: true })) };
    function get(file) {
      if (file === "state.json") return state; if (file === "chart.json") return chart; if (file === "activity.json") return { rows };
      if (file === "account.json") return account; if (file.startsWith("bots/")) return decisions(file.slice(5, -5));
      if (file.startsWith("coin/")) return coinJ(file.slice(5, -5)); if (file.startsWith("audit/")) return auditJ(file.slice(6, -5));
      throw new Error("404");
    }
    function frame() {
      if (empty) return null;
      const c = document.createElement("canvas"); c.width = 640; c.height = 360; const x = c.getContext("2d");
      x.fillStyle = "#111"; x.fillRect(0, 0, 640, 360); x.fillStyle = "#1c1c1e"; x.fillRect(380, 30, 230, 300);
      x.fillStyle = "#00d35a"; x.fillRect(400, 260, 190, 44); x.fillStyle = "#fff"; x.font = "bold 22px sans-serif"; x.fillText("DEMO FRAME", 30, 60);
      x.fillStyle = "rgba(235,235,245,0.6)"; x.font = "16px sans-serif"; x.fillText("not a real screenshot", 30, 90);
      return c.toDataURL("image/jpeg", 0.6);
    }
    return { get, frame };
  })();

  // ---------- boot ----------
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  render();
  poll(); loadFrame();
  setInterval(poll, POLL_MS);
  setInterval(loadFrame, FRAME_MS);
  setInterval(offlineRow, 1000);
})();
