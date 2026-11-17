'use strict';
/* ============ helpers ============ */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const r2 = n => Math.round((+n || 0) * 100) / 100;
const money = n => { n = r2(n); const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return n < 0 ? '(' + s + ')' : s; };
const rs = n => 'Rs. ' + money(n);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dLong = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1]} ${y}`; };
const dShort = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const dMini = iso => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS[+m - 1].slice(0, 3)}`; };
const byDate = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.created || 0) - (b.created || 0);
function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2400); }
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
const fileSafe = s => String(s || 'budget').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'budget';

/* ============ storage (IndexedDB, on this device) ============ */
const DB = {
  db: null,
  open() { return new Promise((res, rej) => { const r = indexedDB.open('budgetbook', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('ws', { keyPath: 'id' }); d.createObjectStore('img', { keyPath: 'id' }); d.createObjectStore('meta', { keyPath: 'k' }); }; r.onsuccess = () => { DB.db = r.result; res(); }; r.onerror = () => rej(r.error); }); },
  tx(store, mode, fn) { return new Promise((res, rej) => { const t = DB.db.transaction(store, mode), s = t.objectStore(store); let out; const r = fn(s); if (r) r.onsuccess = () => out = r.result; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); },
  all: s => DB.tx(s, 'readonly', o => o.getAll()),
  get: (s, k) => DB.tx(s, 'readonly', o => o.get(k)),
  put: (s, v) => DB.tx(s, 'readwrite', o => o.put(v)),
  del: (s, k) => DB.tx(s, 'readwrite', o => o.delete(k)),
};
const IMG = new Map();
async function getImg(id) { if (IMG.has(id)) return IMG.get(id); const r = await DB.get('img', id); const d = r ? r.data : null; IMG.set(id, d); return d; }
async function putImg(id, wsId, data) { IMG.set(id, data); await DB.put('img', { id, ws: wsId, data }); }
async function delImg(id) { IMG.delete(id); await DB.del('img', id); }

/* ============ images ============ */
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function compress(file, max = 1600, q = 0.78, type = 'image/jpeg') {
  const u = URL.createObjectURL(file); const i = await loadImage(u); URL.revokeObjectURL(u);
  let w = i.naturalWidth, h = i.naturalHeight; const s = Math.min(1, max / Math.max(w, h)); w = Math.round(w * s); h = Math.round(h * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
  x.drawImage(i, 0, 0, w, h); return c.toDataURL(type, q);
}

/* ============ model ============ */
const S = { list: [], ws: null, page: 'dash', f: { q: '', ev: '', acc: '', type: '' } };
const terms = (ws = S.ws) => ws && ws.kind === 'personal' ? { ev: 'Category', evs: 'Categories' } : { ev: 'Event', evs: 'Events' };
const SOC_ROLES = ['President', 'Vice President', 'Secretary', 'Assistant Secretary', 'Senior Treasurer', 'Junior Treasurer', 'Editor', 'Assistant Editor'];

function newWorkspace(kind) {
  const y = new Date().getFullYear(), soc = kind === 'society';
  return {
    id: uid(), kind, created: Date.now(), updated: Date.now(),
    name: soc ? '' : 'My Personal Budget', org: '', year: y, contact: '',
    logo: '', uniLogo: '', titleImg: '',
    committee: soc ? SOC_ROLES.map(role => ({ role, name: '' })) : [],
    signers: soc ? [{ name: '', role: 'Junior Treasurer' }, { name: '', role: 'Senior Treasurer' }, { name: '', role: 'President' }] : [],
    preparedBy: { name: '', role: soc ? 'Junior Treasurer' : '' },
    accounts: soc
      ? [{ id: uid(), name: 'Bank Account', type: 'bank', holder: 'Bank', opening: 0 }, { id: uid(), name: 'Cash in Hand', type: 'cash', holder: 'Junior Treasurer', opening: 0 }]
      : [{ id: uid(), name: 'Bank Account', type: 'bank', holder: 'Bank', opening: 0 }, { id: uid(), name: 'Wallet', type: 'cash', holder: 'Me', opening: 0 }],
    events: [], txns: [],
  };
}
async function save() { S.ws.updated = Date.now(); await DB.put('ws', S.ws); }
async function setCurrent(ws) { S.ws = ws; await DB.put('meta', { k: 'cur', v: ws ? ws.id : null }); }

function calc(ws = S.ws) {
  const acc = {}, ev = {}, gen = { id: '', name: 'Other / General', inc: 0, exp: 0, n: 0 };
  ws.accounts.forEach(a => acc[a.id] = { ...a, bal: r2(a.opening), inc: 0, out: 0, n: 0 });
  ws.events.forEach(e => ev[e.id] = { ...e, inc: 0, exp: 0, n: 0 });
  let inc = 0, exp = 0;
  for (const t of [...ws.txns].sort(byDate)) {
    const a = +t.amount || 0, A = acc[t.accountId];
    if (t.type === 'transfer') { if (A) { A.bal -= a; A.out += a; A.n++; } const B = acc[t.toAccountId]; if (B) { B.bal += a; B.inc += a; B.n++; } continue; }
    const E = ev[t.eventId] || gen;
    if (t.type === 'in') { inc += a; E.inc += a; if (A) { A.bal += a; A.inc += a; } } else { exp += a; E.exp += a; if (A) { A.bal -= a; A.out += a; } }
    E.n++; if (A) A.n++;
  }
  let bank = 0, cash = 0, openBank = 0, openCash = 0;
  ws.accounts.forEach(a => { const A = acc[a.id]; A.bal = r2(A.bal); if (a.type === 'bank') { bank += A.bal; openBank += +a.opening || 0; } else { cash += A.bal; openCash += +a.opening || 0; } });
  return { acc, ev, gen, inc: r2(inc), exp: r2(exp), bank: r2(bank), cash: r2(cash), openBank: r2(openBank), openCash: r2(openCash) };
}
const accById = id => S.ws.accounts.find(a => a.id === id);
const evById = id => S.ws.events.find(e => e.id === id);

/* ============ icons ============ */
const IC = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  txns: '<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>',
  events: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  accounts: '<rect x="3" y="6" width="18" height="14" rx="2.5"/><path d="M3 10h18M16 15h2M6 6V5a2 2 0 0 1 2-2h9"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5zM4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3M8 7h8M8 11h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  tickets: '<path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4zM14 6v12" stroke-dasharray="0"/>',
  dl: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 20V8M7 13l5-5 5 5M5 4h14"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M7 8l5-5 5 5"/>',
};
const svg = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`;

/* ============ modal ============ */
function modal(title, body, foot = '') {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="modal"><div class="mh"><h2>${title}</h2><button class="x" data-x>×</button></div><div class="mb">${body}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  const close = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
  document.body.append(ov); return { el: ov, close };
}
const val = (el, n) => { const f = el.querySelector(`[name="${n}"]`); return f ? f.value.trim() : ''; };

/* ============ shell ============ */
const NAV = () => [['dash', 'Overview'], ['txns', 'Transactions'], ['events', terms().evs], ['accounts', 'Accounts'], ...(S.ws && S.ws.kind === 'society' ? [['tickets', 'Tickets']] : []), ['book', 'Book'], ['settings', 'Settings']];
function wsBadge(ws) { return ws.logo ? `<img src="${ws.logo}" alt="">` : `<div class="ph">${esc((ws.name || '?').trim()[0] || '?').toUpperCase()}</div>`; }
function wsBtn() { const w = S.ws; return `<button class="wsbtn" data-act="switch">${wsBadge(w)}<div class="t"><b>${esc(w.name || 'Untitled')}</b><small>${w.kind === 'personal' ? 'Personal' : 'Society'} · ${esc(w.year)}</small></div><span style="color:var(--mute)">⌄</span></button>`; }

function render() {
  const app = $('#app');
  if (tkPublicRoute() || (S.page === 'tickets' && (!S.ws || S.ws.kind !== 'society'))) { tkRenderStandalone(); return; }
  if (!S.ws) { app.innerHTML = welcome(); return; }
  const navItems = NAV(), nav = navItems.map(([k, l]) => `<a class="${S.page === k ? 'on' : ''}" href="#${k}">${svg(k)}<span>${esc(l)}</span></a>`).join('');
  const mnav = navItems.filter(([k]) => !(k === 'accounts' && navItems.length > 6)).map(([k, l]) => `<a class="${S.page === k ? 'on' : ''}" href="#${k}">${svg(k)}<span>${esc(l)}</span></a>`).join('');
  app.innerHTML = `<div class="shell"><aside class="side"><div class="brand"><img class="mark" src="icons/icon-192.png" alt=""><div><b>Budget Book</b><small>Your records, on your device</small></div></div>${wsBtn()}<nav class="nav">${nav}</nav><div class="foot">Data is stored only on this device. Back it up from Settings.</div></aside>
  <main><div class="mtop">${wsBtn()}</div><div id="page"></div></main></div>
  <nav class="mnav">${mnav}</nav><button class="fab" data-act="addtx" aria-label="Add transaction">${svg('plus')}</button>`;
  const P = { dash: pDash, txns: pTxns, events: pEvents, accounts: pAccounts, book: pBook, settings: pSettings, tickets: () => '<div id="tk"></div>' }[S.page] || pDash;
  $('#page').innerHTML = P(); window.scrollTo(0, 0);
  if (S.page === 'txns') bindFilters();
  if (S.page === 'settings') bindSettings();
  if (S.page === 'tickets') tkPortal();
}
function route() { tkStopCamera(); S.page = (location.hash || '#dash').slice(1).split('/')[0] || 'dash'; render(); }

function welcome() {
  return `<div class="welcome"><img class="mark" src="icons/icon-192.png" alt=""><h1>Budget Book</h1><p>Record income, expenses and bills, see who holds the money, and print a complete budget book in one tap. Everything stays on this device.</p>
  <div class="choice"><div class="card" data-act="create" data-kind="society"><span class="badge">Society</span><b>A society or club</b><small>Events, committee, signatures and a full budget book with your logos.</small></div>
  <div class="card" data-act="create" data-kind="personal"><span class="badge p">Personal</span><b>My own budget</b><small>Track your own money by category and accounts. No committee needed.</small></div></div>
  <p style="margin-top:22px"><button class="btn ghost sm" data-act="import">${svg('up')} Restore from a backup file</button></p></div>`;
}

/* ============ rows ============ */
function txRow(t) {
  const a = accById(t.accountId), e = evById(t.eventId), b = accById(t.toAccountId);
  const cls = t.type === 'in' ? 'in' : t.type === 'out' ? 'out' : 'tr';
  const sign = t.type === 'in' ? '+' : t.type === 'out' ? '−' : '';
  const ic = t.type === 'in' ? '↓' : t.type === 'out' ? '↑' : '⇄';
  const sub = t.type === 'transfer' ? `${esc(a?.name || '?')} → ${esc(b?.name || '?')}` : `${esc(e ? e.name : 'General')} · ${esc(a?.name || '—')}`;
  return `<div class="row" data-act="edittx" data-id="${t.id}"><div class="ic ${cls}">${ic}</div><div class="mid"><b>${esc(t.desc || (t.type === 'transfer' ? 'Transfer' : 'Untitled'))}${t.bills?.length ? `<span class="chip">🧾 ${t.bills.length}</span>` : ''}</b><small>${dMini(t.date)} · ${sub}</small></div><div class="amt ${cls === 'in' ? 'pos' : cls === 'out' ? 'neg' : ''}">${sign}${money(t.amount)}</div></div>`;
}
const emptyBox = (t, s, btn = '') => `<div class="empty"><b>${t}</b>${s}${btn ? `<div style="margin-top:14px">${btn}</div>` : ''}</div>`;

/* ============ pages ============ */
function pDash() {
  const c = calc(), T = terms(), w = S.ws, tot = r2(c.bank + c.cash), pr = r2(c.inc - c.exp);
  const holders = w.accounts.map(a => c.acc[a.id]);
  const hold = holders.length ? `<table class="tbl"><tr><th>Account</th><th>Held by</th><th class="n">Balance (Rs.)</th></tr>${holders.map(a => `<tr data-act="ledger" data-id="${a.id}" style="cursor:pointer"><td><b>${esc(a.name)}</b><br><small style="color:var(--mute)">${a.type === 'bank' ? 'Bank' : 'Cash'}</small></td><td>${esc(a.holder || '—')}</td><td class="n ${a.bal < 0 ? 'neg' : ''}"><b>${money(a.bal)}</b></td></tr>`).join('')}</table>` : emptyBox('No accounts', '');
  const evs = Object.values(c.ev).filter(e => e.n).sort(byDate).reverse().slice(0, 6);
  const recent = [...w.txns].sort(byDate).reverse().slice(0, 7);
  const negs = holders.filter(a => a.bal < 0);
  const warn = negs.length ? `<div class="note">${negs.map(a => `<b>${esc(a.name)}</b> is below zero (${money(a.bal)}).`).join(' ')} Check for a missing income or a bank withdrawal that was not recorded as a transfer.</div>` : '';
  return `<div class="top"><h1>Overview</h1><button class="btn add" data-act="addtx">${svg('plus')} Add transaction</button></div>${warn}
  <div class="grid g4"><div class="card stat hero"><small>Total funds</small><b>${rs(tot)}</b></div><div class="card stat"><small>In the bank</small><b>${rs(c.bank)}</b></div><div class="card stat"><small>Cash in hand</small><b>${rs(c.cash)}</b></div><div class="card stat"><small>Profit ${esc(w.year)}</small><b class="${pr < 0 ? 'neg' : 'pos'}">${rs(pr)}</b></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3 style="display:flex;justify-content:space-between">Who holds the money <a href="#accounts" style="font-size:13px;font-weight:600">Accounts</a></h3>${hold}</div>
  <div class="card"><h3>This term</h3><table class="tbl"><tr><td>Brought forward</td><td class="n">${money(c.openBank + c.openCash)}</td></tr><tr><td>Total income</td><td class="n pos">${money(c.inc)}</td></tr><tr><td>Total expenditure</td><td class="n neg">${money(c.exp)}</td></tr><tr><td><b>Profit</b></td><td class="n"><b>${money(pr)}</b></td></tr><tr><td><b>Carried forward</b></td><td class="n"><b>${money(tot)}</b></td></tr></table>
  <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><a class="btn sm" href="#book">${svg('book')} Make the book</a><button class="btn ghost sm" data-act="addtx" data-type="transfer">${svg('swap')} Move money</button></div></div></div>
  <div class="grid g2" style="margin-top:16px"><div class="card"><h3>${T.evs}</h3>${evs.length ? `<div class="list">${evs.map(e => `<div class="row" data-act="event" data-id="${e.id}"><div class="ic tr">${esc((e.name || '?')[0])}</div><div class="mid"><b>${esc(e.name)}</b><small>${dLong(e.date)} · ${e.n} item${e.n > 1 ? 's' : ''}</small></div><div class="amt ${e.inc - e.exp < 0 ? 'neg' : 'pos'}">${money(e.inc - e.exp)}</div></div>`).join('')}</div>` : emptyBox(`No ${T.evs.toLowerCase()} yet`, `Add one from the ${T.evs} tab.`)}</div>
  <div class="card"><h3>Recent transactions</h3>${recent.length ? `<div class="list">${recent.map(txRow).join('')}</div>` : emptyBox('Nothing recorded yet', 'Tap “Add transaction” to record your first income or expense.')}</div></div>`;
}

function filtered() {
  const f = S.f, q = f.q.toLowerCase();
  return [...S.ws.txns].filter(t => (!f.type || t.type === f.type) && (!f.acc || t.accountId === f.acc || t.toAccountId === f.acc) && (!f.ev || (f.ev === '_' ? !t.eventId && t.type !== 'transfer' : t.eventId === f.ev)) && (!q || `${t.desc} ${t.remarks} ${evById(t.eventId)?.name || ''} ${t.amount}`.toLowerCase().includes(q))).sort(byDate).reverse();
}
function txList() {
  const L = filtered(); let inc = 0, exp = 0; L.forEach(t => { if (t.type === 'in') inc += +t.amount; else if (t.type === 'out') exp += +t.amount; });
  return `<div style="color:var(--mute);font-size:13px;margin:0 2px 8px">${L.length} item${L.length === 1 ? '' : 's'} · income <b class="pos">${money(inc)}</b> · expense <b class="neg">${money(exp)}</b></div><div class="card"><div class="list">${L.length ? L.map(txRow).join('') : emptyBox('No transactions', 'Nothing matches these filters.')}</div></div>`;
}
function pTxns() {
  const f = S.f, T = terms();
  return `<div class="top"><h1>Transactions</h1><button class="btn ghost sm" data-act="csv">${svg('dl')} CSV</button><button class="btn add" data-act="addtx">${svg('plus')} Add</button></div>
  <div class="filters"><input id="fq" placeholder="Search description, remarks, amount…" value="${esc(f.q)}">
  <select id="ft"><option value="">All types</option><option value="in" ${f.type === 'in' ? 'selected' : ''}>Income</option><option value="out" ${f.type === 'out' ? 'selected' : ''}>Expense</option><option value="transfer" ${f.type === 'transfer' ? 'selected' : ''}>Transfer</option></select>
  <select id="fe"><option value="">All ${T.evs.toLowerCase()}</option><option value="_" ${f.ev === '_' ? 'selected' : ''}>General (no ${T.ev.toLowerCase()})</option>${[...S.ws.events].sort(byDate).map(e => `<option value="${e.id}" ${f.ev === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>
  <select id="fa"><option value="">All accounts</option>${S.ws.accounts.map(a => `<option value="${a.id}" ${f.acc === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div><div id="txl">${txList()}</div>`;
}
function bindFilters() {
  const up = () => { S.f = { q: $('#fq').value, type: $('#ft').value, ev: $('#fe').value, acc: $('#fa').value }; $('#txl').innerHTML = txList(); };
  $('#fq').addEventListener('input', up); ['#ft', '#fe', '#fa'].forEach(s => $(s).addEventListener('change', up));
}

function pEvents() {
  const c = calc(), T = terms();
  const evs = [...S.ws.events].sort(byDate).reverse().map(e => c.ev[e.id]);
  const card = e => { const p = r2(e.inc - e.exp), max = Math.max(e.inc, e.exp, 1); return `<div class="card ev" data-act="event" data-id="${e.id}"><div class="h"><b>${esc(e.name)}</b><small>${dLong(e.date)}</small></div>
    <div class="kv"><div><small>Income</small><b class="pos">${money(e.inc)}</b></div><div><small>Expense</small><b class="neg">${money(e.exp)}</b></div><div><small>Balance</small><b>${money(p)}</b></div></div>
    <div class="bar"><i style="width:${Math.round(e.exp / max * 100)}%"></i></div><div style="margin-top:8px;font-size:12.5px;color:var(--mute)">${e.n ? `${e.n} transaction${e.n > 1 ? 's' : ''}` : 'No income or expenditure'}${e.link ? ' · 🔗 bills link' : ''}</div></div>`; };
  const gen = c.gen.n ? `<div class="card ev" data-act="event" data-id=""><div class="h"><b>Other / General</b><small>No ${T.ev.toLowerCase()}</small></div><div class="kv"><div><small>Income</small><b class="pos">${money(c.gen.inc)}</b></div><div><small>Expense</small><b class="neg">${money(c.gen.exp)}</b></div><div><small>Balance</small><b>${money(c.gen.inc - c.gen.exp)}</b></div></div></div>` : '';
  return `<div class="top"><h1>${T.evs}</h1><button class="btn" data-act="addev">${svg('plus')} New ${T.ev.toLowerCase()}</button></div>
  ${evs.length || gen ? `<div class="grid g3">${evs.map(card).join('')}${gen}</div>` : `<div class="card">${emptyBox(`No ${T.evs.toLowerCase()} yet`, S.ws.kind === 'personal' ? 'Create categories like Food, Transport or Studies.' : 'Create one for each event or project, e.g. a drama, a workshop or a magazine launch.', `<button class="btn" data-act="addev">${svg('plus')} New ${T.ev.toLowerCase()}</button>`)}</div>`}`;
}

function pAccounts() {
  const c = calc();
  return `<div class="top"><h1>Accounts</h1><button class="btn ghost" data-act="addtx" data-type="transfer">${svg('swap')} Move money</button><button class="btn" data-act="addacc">${svg('plus')} New account</button></div>
  <div class="note">Make one account for the bank and one <b>cash</b> account for each person who keeps money. Then you always know who holds what.</div>
  <div class="grid g3">${S.ws.accounts.map(a => { const A = c.acc[a.id]; return `<div class="card ev" data-act="ledger" data-id="${a.id}"><div class="h"><b>${esc(a.name)}</b><span class="badge ${a.type === 'cash' ? 'p' : ''}">${a.type === 'bank' ? 'BANK' : 'CASH'}</span></div>
  <div style="color:var(--mute);font-size:13px;margin-top:4px">Held by ${esc(a.holder || '—')}</div><div class="stat" style="margin-top:10px"><b class="${A.bal < 0 ? 'neg' : ''}">${rs(A.bal)}</b></div>
  <div class="kv"><div><small>Opening</small><b>${money(a.opening)}</b></div><div><small>In</small><b class="pos">${money(A.inc)}</b></div><div><small>Out</small><b class="neg">${money(A.out)}</b></div></div></div>`; }).join('')}</div>
  <div class="card" style="margin-top:16px"><h3>Totals</h3><table class="tbl"><tr><td>In the bank</td><td class="n">${money(c.bank)}</td></tr><tr><td>Cash in hand</td><td class="n">${money(c.cash)}</td></tr><tr><td><b>Total</b></td><td class="n"><b>${money(c.bank + c.cash)}</b></td></tr></table></div>`;
}

function pBook() {
  const w = S.ws, c = calc(), T = terms(), soc = w.kind === 'society';
  const withTx = Object.values(c.ev).filter(e => e.n).length, noTx = Object.values(c.ev).filter(e => !e.n).length;
  const links = w.events.filter(e => e.link).length, bills = w.txns.reduce((s, t) => s + (t.bills?.length || 0), 0);
  const warn = [];
  if (!w.name) warn.push('Add a name in Settings.');
  if (soc && !w.logo) warn.push('Add the society logo in Settings.');
  if (soc && !w.uniLogo) warn.push('Add the university logo in Settings.');
  if (soc && !(w.signers || []).some(s => s.name)) warn.push('Add the names of the people who sign the book.');
  if (!w.txns.length) warn.push('No transactions yet. The book will be mostly empty.');
  return `<div class="top"><h1>Budget Book ${esc(w.year)}</h1></div>
  <div class="grid g2"><div class="card"><h3>What goes in the book</h3><table class="tbl">
  <tr><td>Cover${soc ? ' with logos and committee' : ''}</td><td class="n">✓</td></tr><tr><td>Contents with page numbers</td><td class="n">✓</td></tr>
  <tr><td>Budget for ${esc(w.year)}${soc ? ' with signatures' : ''}</td><td class="n">✓</td></tr><tr><td>Bills and receipts QR page</td><td class="n">${links} link${links === 1 ? '' : 's'}</td></tr>
  <tr><td>${T.ev} financial reports</td><td class="n">${withTx}</td></tr><tr><td>Account records (bank and cash)</td><td class="n">${w.accounts.length}</td></tr>
  <tr><td>${T.evs} with no expenditure</td><td class="n">${noTx}</td></tr><tr><td>Bill photos attached</td><td class="n">${bills}</td></tr></table></div>
  <div class="card"><h3>Options</h3>
  <label class="f"><span>Prepared date shown on the cover</span><input type="month" id="bk-date" value="${today().slice(0, 7)}"></label>
  <label style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><input type="checkbox" id="bk-photos" ${bills ? 'checked' : ''}> Include bill photos in the reports</label>
  <label style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><input type="checkbox" id="bk-ledgers" checked> Include account records (Bank Account Record, Cash Book)</label>
  <label style="display:flex;gap:10px;align-items:center;margin-bottom:16px"><input type="checkbox" id="bk-noexp" checked> Include ${T.evs.toLowerCase()} with no expenditure</label>
  ${warn.length ? `<div class="note">${warn.map(esc).join('<br>')}</div>` : `<div class="note ok">Everything is ready.</div>`}
  <button class="btn" data-act="makebook" style="width:100%;justify-content:center;padding:13px">${svg('book')} Generate PDF</button></div></div>
  <div id="bk-out" style="margin-top:16px"></div>`;
}

function pSettings() {
  const w = S.ws, soc = w.kind === 'society';
  const lp = (k, label) => `<div style="text-align:center"><div class="lp" data-act="pickimg" data-k="${k}" style="${w[k] ? `background-image:url(${w[k]});border-style:solid` : ''}">${w[k] ? '' : 'Tap to add'}</div><small style="color:var(--mute);font-size:11.5px">${label}</small>${w[k] ? `<br><a style="font-size:11.5px;cursor:pointer" data-act="clrimg" data-k="${k}">Remove</a>` : ''}</div>`;
  return `<div class="top"><h1>Settings</h1></div>
  <div class="grid g2" style="align-items:start"><div class="card"><h3>${soc ? 'Society profile' : 'Profile'}</h3><form id="prof">
  <label class="f"><span>${soc ? 'Society name (as on the book)' : 'Title of this budget'}</span><input name="name" value="${esc(w.name)}" placeholder="${soc ? 'e.g. Vibhava Literary Association' : 'e.g. My Budget'}"></label>
  ${soc ? `<label class="f"><span>University / institution</span><input name="org" value="${esc(w.org)}" placeholder="e.g. University of Peradeniya"></label>` : ''}
  <div class="two"><label class="f"><span>Year</span><input name="year" inputmode="numeric" value="${esc(w.year)}"></label>
  <label class="f"><span>Type</span><select name="kind"><option value="society" ${soc ? 'selected' : ''}>Society</option><option value="personal" ${!soc ? 'selected' : ''}>Personal</option></select></label></div>
  ${soc ? `<label class="f"><span>Contact line (under the letterhead)</span><input name="contact" value="${esc(w.contact)}" placeholder="T.P: 07X XXX XXXX | E-mail: name@gmail.com"></label>` : ''}
  <div class="f"><span>Logos</span><div class="logo-pick" style="gap:18px;flex-wrap:wrap">${soc ? lp('uniLogo', 'University (left)') + lp('logo', 'Society (right)') + lp('titleImg', 'Title image (optional)') : lp('logo', 'Picture (optional)')}</div></div>
  ${soc ? `<div class="hint">The optional title image replaces the typed name in the page header, for example a Sinhala letterhead title. Use a PNG with a transparent background.</div>` : ''}
  <div class="two"><label class="f"><span>Prepared by (name)</span><input name="pbname" value="${esc(w.preparedBy?.name)}"></label><label class="f"><span>${soc ? 'Role' : 'Note'}</span><input name="pbrole" value="${esc(w.preparedBy?.role)}"></label></div>
  ${soc ? `<div class="f"><span>Executive committee (shown on the cover)</span><div id="com">${(w.committee || []).map((m, i) => comRow(m, i)).join('')}</div><button type="button" class="btn ghost sm" data-act="addcom">${svg('plus')} Add member</button></div>
  <div class="f"><span>Signatures (“Prepared and certified by”)</span>${[0, 1, 2].map(i => { const s = (w.signers || [])[i] || {}; return `<div class="com-row" style="grid-template-columns:1fr 1fr"><input name="sgn${i}" placeholder="Name" value="${esc(s.name)}"><input name="sgr${i}" placeholder="Role" value="${esc(s.role)}"></div>`; }).join('')}</div>` : ''}
  <button class="btn" type="submit" style="width:100%;justify-content:center">Save profile</button></form></div>
  <div><div class="card"><h3>Workspaces</h3><div class="hint" style="margin:0 0 10px">One person can keep several societies and a personal budget here.</div><div class="wslist">${wsListHtml()}</div><button class="btn ghost sm" data-act="newws">${svg('plus')} New workspace</button></div>
  <div class="card" style="margin-top:16px"><h3>Backup and handover</h3><div class="hint" style="margin:0 0 12px">Your data lives only in this browser. Save a backup file often. To hand over to the next committee, send them the backup file and they restore it on their device.</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="export">${svg('dl')} Save backup</button><button class="btn ghost sm" data-act="import">${svg('up')} Restore backup</button><button class="btn ghost sm" data-act="csv">${svg('dl')} Transactions CSV</button></div></div>
  ${soc ? tkSettingsCard() : ''}
  <div class="card" style="margin-top:16px"><h3>New year</h3><div class="hint" style="margin:0 0 12px">Start ${+w.year + 1} with today's balances carried forward. This year stays in your workspaces.</div><button class="btn ghost sm" data-act="newyear">Start ${+w.year + 1}</button></div>
  <div class="card" style="margin-top:16px"><h3>Danger zone</h3><button class="btn danger sm" data-act="delws">Delete this workspace</button></div></div></div>`;
}
function tkSettingsCard() {
  const c = tkCfg(), o = (() => { try { return JSON.parse(localStorage.getItem('bb_cfg') || '{}'); } catch { return {}; } })(), site = window.BB_CONFIG || {};
  return `<div class="card" style="margin-top:16px"><h3>Ticketing</h3><div class="hint" style="margin:0 0 12px">${c.supabaseUrl ? `Connected to <b>${esc(c.supabaseUrl.replace(/^https?:\/\//, ''))}</b>${site.supabaseUrl && !o.supabaseUrl ? ' (from config.js on the website)' : ''}.` : 'Not connected. Follow HOSTING.md to create the free ticket database.'}</div>
  <form id="tkcfg"><label class="f"><span>Supabase project URL</span><input name="u" placeholder="https://xxxx.supabase.co" value="${esc(o.supabaseUrl || '')}"></label>
  <label class="f"><span>Supabase public (anon) key</span><input name="k" placeholder="eyJ…" value="${esc(o.supabaseKey || '')}"></label>
  <label class="f"><span>Your website link (used in ticket QR codes)</span><input name="s" placeholder="https://yourname.github.io/budget-book/" value="${esc(o.siteUrl || '')}"></label>
  <div class="hint">Leave these empty on the website if config.js is filled in. Fill them in on the desktop app.</div><button class="btn ghost sm">Save ticketing settings</button></form></div>`;
}
const comRow = (m, i) => `<div class="com-row"><input data-c="role" placeholder="Role" value="${esc(m.role)}"><input data-c="name" placeholder="Name" value="${esc(m.name)}"><button type="button" data-act="delcom">×</button></div>`;
function wsListHtml() { return [...S.list].sort((a, b) => (a.name || '').localeCompare(b.name || '') || b.year - a.year).map(w => `<div class="ws ${w.id === S.ws?.id ? 'on' : ''}" data-act="usews" data-id="${w.id}">${wsBadge(w)}<div style="flex:1;min-width:0"><b>${esc(w.name || 'Untitled')}</b><div style="font-size:12.5px;color:var(--mute)">${w.year} · ${w.txns.length} transactions</div></div><span class="badge ${w.kind === 'personal' ? 'p' : ''}">${w.kind === 'personal' ? 'Personal' : 'Society'}</span></div>`).join(''); }

function readProfile() {
  const f = $('#prof'), w = S.ws; if (!f) return;
  w.name = val(f, 'name'); if (f.querySelector('[name=org]')) w.org = val(f, 'org');
  w.year = parseInt(val(f, 'year')) || w.year; w.kind = val(f, 'kind') || w.kind;
  if (f.querySelector('[name=contact]')) w.contact = val(f, 'contact');
  w.preparedBy = { name: val(f, 'pbname'), role: val(f, 'pbrole') };
  if ($('#com')) w.committee = $$('#com .com-row').map(r => ({ role: r.querySelector('[data-c=role]').value.trim(), name: r.querySelector('[data-c=name]').value.trim() })).filter(m => m.role || m.name);
  if (f.querySelector('[name=sgn0]')) w.signers = [0, 1, 2].map(i => ({ name: val(f, 'sgn' + i), role: val(f, 'sgr' + i) })).filter(s => s.name || s.role);
}
function bindSettings() {
  const tf = $('#tkcfg'); if (tf) tf.onsubmit = e => { e.preventDefault(); localStorage.setItem('bb_cfg', JSON.stringify({ supabaseUrl: tf.u.value.trim().replace(/\/+$/, ''), supabaseKey: tf.k.value.trim(), siteUrl: tf.s.value.trim() })); TK.sb = null; toast('Ticketing settings saved'); render(); };
  $('#prof').addEventListener('submit', async e => { e.preventDefault(); const k = S.ws.kind; readProfile(); if (S.ws.kind === 'society' && !S.ws.signers.length) S.ws.signers = []; await save(); toast('Profile saved'); if (k !== S.ws.kind) { if (S.ws.kind === 'society' && !S.ws.committee.length) { S.ws.committee = SOC_ROLES.map(role => ({ role, name: '' })); S.ws.signers = newWorkspace('society').signers; await save(); } } render(); });
}

/* ============ forms ============ */
function accOptions(sel, skip) { return S.ws.accounts.filter(a => a.id !== skip).map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}${a.holder && a.type === 'cash' ? ' (' + esc(a.holder) + ')' : ''}</option>`).join(''); }
function evOptions(sel) { const T = terms(); return `<option value="">General (no ${T.ev.toLowerCase()})</option>${[...S.ws.events].sort(byDate).reverse().map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}<option value="__new">+ New ${T.ev.toLowerCase()}…</option>`; }

function txForm(orig, preset = {}) {
  const T = terms(), isNew = !orig;
  const cash = S.ws.accounts.find(a => a.type === 'cash');
  const t = orig ? JSON.parse(JSON.stringify(orig)) : { id: uid(), type: 'out', date: today(), amount: '', accountId: (cash || S.ws.accounts[0] || {}).id, toAccountId: '', eventId: '', desc: '', remarks: '', bills: [], created: Date.now(), ...preset };
  if (!S.ws.accounts.length) { toast('Add an account first'); location.hash = '#accounts'; return; }
  const pend = []; const removed = [];
  const m = modal(isNew ? 'New transaction' : 'Edit transaction', `
    <div class="seg" id="tt"><button type="button" data-t="in" class="in">Income</button><button type="button" data-t="out" class="out">Expense</button><button type="button" data-t="transfer">Transfer</button></div>
    <div class="f amount"><span>Amount (Rs.)</span><input name="amount" inputmode="decimal" placeholder="0.00" value="${esc(t.amount)}"></div>
    <label class="f"><span>Description</span><input name="desc" value="${esc(t.desc)}" placeholder="e.g. Ticket sales, Refreshments, Printing"></label>
    <div class="two"><label class="f"><span>Date</span><input type="date" name="date" value="${esc(t.date)}"></label><label class="f" id="evf"><span>${T.ev}</span><select name="eventId">${evOptions(t.eventId)}</select></label></div>
    <div class="two"><label class="f"><span id="acl">Account</span><select name="accountId">${accOptions(t.accountId)}</select></label><label class="f" id="tof"><span>To account</span><select name="toAccountId">${accOptions(t.toAccountId)}</select></label></div>
    <label class="f"><span>Remarks (optional)</span><input name="remarks" value="${esc(t.remarks)}" placeholder="e.g. Paid by Ishini, Receipt no. 12"></label>
    <div class="f"><span>Bills and receipts (photos)</span><div class="thumbs" id="th"></div></div>`,
    `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">Delete</button>'}<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Save</button>`);
  const el = m.el;
  const setType = ty => { t.type = ty; $$('#tt button', el).forEach(b => b.classList.toggle('on', b.dataset.t === ty)); $('#tof', el).style.display = ty === 'transfer' ? '' : 'none'; $('#evf', el).style.display = ty === 'transfer' ? 'none' : ''; $('#acl', el).textContent = ty === 'transfer' ? 'From account' : ty === 'in' ? 'Received into' : 'Paid from'; };
  $$('#tt button', el).forEach(b => b.onclick = () => setType(b.dataset.t)); setType(t.type);
  const sel = $('[name=eventId]', el);
  sel.onchange = async () => { if (sel.value !== '__new') return; const n = await askText(`New ${T.ev.toLowerCase()}`, 'Name'); if (!n) { sel.value = t.eventId || ''; return; } const e = { id: uid(), name: n.trim(), date: $('[name=date]', el).value || today(), link: '', notes: '' }; S.ws.events.push(e); await save(); t.eventId = e.id; sel.innerHTML = evOptions(e.id); };
  const drawThumbs = async () => {
    const th = $('#th', el); const items = [];
    for (const id of t.bills) items.push(`<div class="th" style="background-image:url(${await getImg(id) || ''})" data-view="${id}"><button type="button" data-rm="${id}">×</button></div>`);
    pend.forEach((p, i) => items.push(`<div class="th" style="background-image:url(${p})"><button type="button" data-rmp="${i}">×</button></div>`));
    th.innerHTML = items.join('') + `<label class="th add">＋<br>Add photo<input type="file" accept="image/*" multiple hidden></label>`;
    $('input', th).onchange = async ev => { for (const f of ev.target.files) { try { pend.push(await compress(f)); } catch { toast('Could not read that image'); } } drawThumbs(); };
    $$('[data-rm]', th).forEach(b => b.onclick = e => { e.stopPropagation(); removed.push(b.dataset.rm); t.bills = t.bills.filter(x => x !== b.dataset.rm); drawThumbs(); });
    $$('[data-rmp]', th).forEach(b => b.onclick = e => { e.stopPropagation(); pend.splice(+b.dataset.rmp, 1); drawThumbs(); });
    $$('[data-view]', th).forEach(d => d.onclick = async () => viewImg(await getImg(d.dataset.view)));
  };
  drawThumbs();
  $('[data-save]', el).onclick = async () => {
    const amt = r2(String(val(el, 'amount')).replace(/,/g, ''));
    if (!(amt > 0)) { toast('Enter an amount'); $('[name=amount]', el).focus(); return; }
    Object.assign(t, { amount: amt, desc: val(el, 'desc'), date: val(el, 'date') || today(), accountId: val(el, 'accountId'), remarks: val(el, 'remarks') });
    if (t.type === 'transfer') { t.toAccountId = val(el, 'toAccountId'); t.eventId = ''; if (!t.toAccountId || t.toAccountId === t.accountId) { toast('Choose two different accounts'); return; } if (!t.desc) t.desc = `Transfer to ${accById(t.toAccountId).name}`; }
    else { t.toAccountId = ''; t.eventId = sel.value === '__new' ? '' : sel.value; }
    for (const p of pend) { const id = uid(); await putImg(id, S.ws.id, p); t.bills.push(id); }
    for (const id of removed) await delImg(id);
    const i = S.ws.txns.findIndex(x => x.id === t.id); if (i >= 0) S.ws.txns[i] = t; else S.ws.txns.push(t);
    await save(); m.close(); toast(isNew ? 'Saved' : 'Updated'); render();
  };
  const del = $('[data-del]', el); if (del) del.onclick = async () => { if (!confirm('Delete this transaction?')) return; for (const id of orig.bills || []) await delImg(id); S.ws.txns = S.ws.txns.filter(x => x.id !== t.id); await save(); m.close(); toast('Deleted'); render(); };
  if (isNew) setTimeout(() => $('[name=amount]', el).focus(), 50);
}
function askText(title, label) {
  return new Promise(res => {
    const m = modal(esc(title), `<label class="f"><span>${esc(label)}</span><input name="v" autocomplete="off"></label>`, `<button class="btn ghost" data-no>Cancel</button><button class="btn" data-ok>Add</button>`);
    const inp = $('[name=v]', m.el); let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); };
    $('[data-ok]', m.el).onclick = () => fin(inp.value.trim() || null); $('[data-no]', m.el).onclick = () => fin(null);
    inp.onkeydown = e => { if (e.key === 'Enter') fin(inp.value.trim() || null); };
    m.el.addEventListener('click', e => { if (e.target === m.el || e.target.closest('[data-x]')) fin(null); });
    setTimeout(() => inp.focus(), 30);
  });
}
function viewImg(src) { if (!src) return; const m = modal('Bill', `<div class="viewer"><img src="${src}"></div>`); }

function evForm(orig) {
  const T = terms(), isNew = !orig, e = orig ? { ...orig } : { id: uid(), name: '', date: today(), link: '', notes: '' };
  const m = modal(isNew ? `New ${T.ev.toLowerCase()}` : `Edit ${T.ev.toLowerCase()}`, `
    <label class="f"><span>Name</span><input name="name" value="${esc(e.name)}" placeholder="${S.ws.kind === 'personal' ? 'e.g. Food' : 'e.g. Drama Festival'}"></label>
    <label class="f"><span>${S.ws.kind === 'personal' ? 'Start date' : 'Event date'}</span><input type="date" name="date" value="${esc(e.date)}"></label>
    <label class="f"><span>Bills folder link (optional)</span><input name="link" value="${esc(e.link)}" placeholder="https://drive.google.com/…"></label>
    <div class="hint">If you add a Google Drive link, the book prints a QR code for it.</div>
    <label class="f"><span>Notes (optional)</span><textarea name="notes" rows="2">${esc(e.notes)}</textarea></label>`,
    `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">Delete</button>'}<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Save</button>`);
  $('[data-save]', m.el).onclick = async () => {
    const n = val(m.el, 'name'); if (!n) { toast('Enter a name'); return; }
    Object.assign(e, { name: n, date: val(m.el, 'date'), link: val(m.el, 'link'), notes: val(m.el, 'notes') });
    const i = S.ws.events.findIndex(x => x.id === e.id); if (i >= 0) S.ws.events[i] = e; else S.ws.events.push(e);
    await save(); m.close(); render();
  };
  const d = $('[data-del]', m.el); if (d) d.onclick = async () => { const n = S.ws.txns.filter(t => t.eventId === e.id).length; if (!confirm(n ? `This ${T.ev.toLowerCase()} has ${n} transactions. They will move to General. Delete?` : `Delete this ${T.ev.toLowerCase()}?`)) return; S.ws.txns.forEach(t => { if (t.eventId === e.id) t.eventId = ''; }); S.ws.events = S.ws.events.filter(x => x.id !== e.id); await save(); m.close(); render(); };
}
function evDetail(id) {
  const T = terms(), c = calc(), e = id ? c.ev[id] : c.gen; if (!e) return;
  const list = S.ws.txns.filter(t => t.type !== 'transfer' && (id ? t.eventId === id : !evById(t.eventId))).sort(byDate);
  const m = modal(esc(e.name), `<div style="color:var(--mute);margin-top:-4px">${e.date ? dLong(e.date) : ''}${e.link ? ` · <a href="${esc(e.link)}" target="_blank" rel="noopener">Bills folder</a>` : ''}</div>
    <div class="kv" style="margin:14px 0"><div><small>Income</small><b class="pos">${money(e.inc)}</b></div><div><small>Expense</small><b class="neg">${money(e.exp)}</b></div><div><small>Balance</small><b>${money(e.inc - e.exp)}</b></div></div>
    <div class="list">${list.length ? list.map(txRow).join('') : emptyBox('No transactions', `This ${T.ev.toLowerCase()} will be listed under “${T.evs} with No Expenditure”.`)}</div>`,
    `${id ? '<button class="btn ghost" data-edit style="margin-right:auto">Edit</button>' : ''}<button class="btn" data-add>${svg('plus')} Add transaction</button>`);
  const ed = $('[data-edit]', m.el); if (ed) ed.onclick = () => { m.close(); evForm(evById(id)); };
  $('[data-add]', m.el).onclick = () => { m.close(); txForm(null, { eventId: id || '', date: (id && evById(id).date) || today() }); };
  m.el.addEventListener('click', ev => { const r = ev.target.closest('[data-act=edittx]'); if (r) m.close(); });
}
function accForm(orig) {
  const isNew = !orig, a = orig ? { ...orig } : { id: uid(), name: '', type: 'cash', holder: '', opening: 0 };
  const m = modal(isNew ? 'New account' : 'Edit account', `
    <div class="two"><label class="f"><span>Type</span><select name="type"><option value="bank" ${a.type === 'bank' ? 'selected' : ''}>Bank account</option><option value="cash" ${a.type === 'cash' ? 'selected' : ''}>Cash in hand</option></select></label>
    <label class="f"><span>Opening balance (Rs.)</span><input name="opening" inputmode="decimal" value="${esc(a.opening)}"></label></div>
    <label class="f"><span>Account name</span><input name="name" value="${esc(a.name)}" placeholder="e.g. Bank Account, Cash – Treasurer"></label>
    <label class="f"><span>Held by</span><input name="holder" value="${esc(a.holder)}" placeholder="e.g. Junior Treasurer, Ishini, BOC Peradeniya"></label>
    <div class="hint">Opening balance is the money in this account at the start of the term (brought forward).</div>`,
    `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">Delete</button>'}<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Save</button>`);
  $('[data-save]', m.el).onclick = async () => {
    const n = val(m.el, 'name'); if (!n) { toast('Enter a name'); return; }
    Object.assign(a, { name: n, type: val(m.el, 'type'), holder: val(m.el, 'holder'), opening: r2(String(val(m.el, 'opening')).replace(/,/g, '')) });
    const i = S.ws.accounts.findIndex(x => x.id === a.id); if (i >= 0) S.ws.accounts[i] = a; else S.ws.accounts.push(a);
    await save(); m.close(); render();
  };
  const d = $('[data-del]', m.el); if (d) d.onclick = async () => { if (S.ws.txns.some(t => t.accountId === a.id || t.toAccountId === a.id)) { alert('This account has transactions. Move or delete them first.'); return; } if (!confirm('Delete this account?')) return; S.ws.accounts = S.ws.accounts.filter(x => x.id !== a.id); await save(); m.close(); render(); };
}
function ledgerRows(accId) {
  const a = accById(accId); let bal = +a.opening || 0; const rows = [];
  for (const t of [...S.ws.txns].sort(byDate)) {
    let inn = 0, out = 0;
    if (t.type === 'transfer') { if (t.accountId === accId) out = +t.amount; else if (t.toAccountId === accId) inn = +t.amount; else continue; }
    else if (t.accountId === accId) { if (t.type === 'in') inn = +t.amount; else out = +t.amount; } else continue;
    bal = r2(bal + inn - out); rows.push({ t, inn, out, bal });
  }
  return rows;
}
function ledger(id) {
  const a = accById(id), rows = ledgerRows(id);
  const m = modal(esc(a.name), `<div style="color:var(--mute);margin-top:-4px">${a.type === 'bank' ? 'Bank account' : 'Cash in hand'} · held by ${esc(a.holder || '—')}</div>
  <table class="tbl" style="margin-top:12px"><tr><th>Date</th><th>Description</th><th class="n">In</th><th class="n">Out</th><th class="n">Balance</th></tr>
  <tr><td></td><td><i>Balance brought forward</i></td><td></td><td></td><td class="n">${money(a.opening)}</td></tr>
  ${rows.map(r => `<tr data-act="edittx" data-id="${r.t.id}" style="cursor:pointer"><td>${dMini(r.t.date)}</td><td>${esc(r.t.desc)}</td><td class="n pos">${r.inn ? money(r.inn) : ''}</td><td class="n neg">${r.out ? money(r.out) : ''}</td><td class="n"><b>${money(r.bal)}</b></td></tr>`).join('')}</table>`,
    `<button class="btn ghost" data-edit style="margin-right:auto">Edit account</button><button class="btn" data-x>Close</button>`);
  $('[data-edit]', m.el).onclick = () => { m.close(); accForm(a); };
  m.el.addEventListener('click', ev => { if (ev.target.closest('[data-act=edittx]')) m.close(); });
}

/* ============ workspaces & data ============ */
function switcher() {
  const m = modal('Your workspaces', `<div class="wslist">${wsListHtml()}</div>`, `<button class="btn" data-act="newws">${svg('plus')} New workspace</button>`);
  m.el.addEventListener('click', e => { if (e.target.closest('[data-act]')) m.close(); });
}
function chooseKind() {
  const m = modal('New workspace', `<div class="choice"><div class="card" data-act="create" data-kind="society"><span class="badge">Society</span><b>A society or club</b><small>Events, committee and signatures.</small></div><div class="card" data-act="create" data-kind="personal"><span class="badge p">Personal</span><b>My own budget</b><small>Categories and accounts only.</small></div></div>`);
  m.el.addEventListener('click', e => { if (e.target.closest('[data-act]')) m.close(); });
}
async function createWs(kind) {
  const w = newWorkspace(kind); S.list.push(w); await DB.put('ws', w); await setCurrent(w);
  location.hash = '#settings'; render(); toast(kind === 'society' ? 'Add your society name, logos and committee' : 'Workspace created');
}
async function exportWs() {
  const w = S.ws, ids = new Set(); w.txns.forEach(t => (t.bills || []).forEach(i => ids.add(i)));
  const images = []; for (const id of ids) { const d = await getImg(id); if (d) images.push({ id, data: d }); }
  const blob = new Blob([JSON.stringify({ app: 'budgetbook', v: 1, exported: new Date().toISOString(), ws: w, images })], { type: 'application/json' });
  download(blob, `${fileSafe(w.name)}_${w.year}_backup.json`); toast('Backup saved');
}
function importWs() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try {
      const d = JSON.parse(await inp.files[0].text()); if (d.app !== 'budgetbook' || !d.ws) throw 0;
      let w = d.ws; const exists = S.list.find(x => x.id === w.id);
      if (exists && !confirm(`“${w.name} ${w.year}” is already here. Replace it with the backup? (Cancel keeps both.)`)) w.id = uid();
      for (const im of d.images || []) await putImg(im.id, w.id, im.data);
      w.events ||= []; w.txns ||= []; w.accounts ||= [];
      S.list = S.list.filter(x => x.id !== w.id); S.list.push(w); await DB.put('ws', w); await setCurrent(w);
      toast('Backup restored'); location.hash = '#dash'; render();
    } catch { alert('This is not a Budget Book backup file.'); }
  };
  inp.click();
}
function exportCsv() {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['Date', 'Type', 'Description', terms().ev, 'Account', 'To account', 'Amount', 'Remarks'].map(q).join(',')];
  [...S.ws.txns].sort(byDate).forEach(t => rows.push([t.date, { in: 'Income', out: 'Expense', transfer: 'Transfer' }[t.type], t.desc, evById(t.eventId)?.name || '', accById(t.accountId)?.name || '', accById(t.toAccountId)?.name || '', (+t.amount).toFixed(2), t.remarks].map(q).join(',')));
  download(new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' }), `${fileSafe(S.ws.name)}_${S.ws.year}_transactions.csv`);
}
async function newYear() {
  const w = S.ws, c = calc(), ny = +w.year + 1;
  if (!confirm(`Start ${ny}? The closing balances will become the opening balances. ${w.year} stays saved.`)) return;
  const n = JSON.parse(JSON.stringify(w)); n.id = uid(); n.year = ny; n.created = Date.now(); n.events = []; n.txns = [];
  n.accounts = w.accounts.map(a => ({ ...a, opening: c.acc[a.id].bal }));
  n.committee = (w.committee || []).map(m => ({ role: m.role, name: m.name }));
  S.list.push(n); await DB.put('ws', n); await setCurrent(n); location.hash = '#settings'; render(); toast(`${ny} started. Update the committee for the new term.`);
}
async function delWs() {
  const w = S.ws; if (!confirm(`Delete “${w.name || 'Untitled'} ${w.year}” and all its transactions and bill photos from this device?`)) return;
  if (!confirm('This cannot be undone. Save a backup first if you may need it. Delete now?')) return;
  for (const t of w.txns) for (const id of t.bills || []) await delImg(id);
  await DB.del('ws', w.id); S.list = S.list.filter(x => x.id !== w.id); await setCurrent(S.list[0] || null); location.hash = '#dash'; render();
}

/* ============ book ============ */
async function makeBook() {
  const out = $('#bk-out'), btn = $('[data-act=makebook]');
  btn.disabled = true; btn.textContent = 'Building the book…';
  try {
    const [yy, mm] = ($('#bk-date').value || today().slice(0, 7)).split('-');
    const blob = await buildBook(S.ws, { photos: $('#bk-photos').checked, ledgers: $('#bk-ledgers').checked, noexp: $('#bk-noexp').checked, month: `${MONTHS[+mm - 1]} ${yy}` });
    const name = `${fileSafe(S.ws.name)}_Budget_Book_${S.ws.year}.pdf`, url = URL.createObjectURL(blob);
    const file = new File([blob], name, { type: 'application/pdf' });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    out.innerHTML = `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><b style="flex:1">Your book is ready (${(blob.size / 1048576).toFixed(1)} MB)</b>
      <button class="btn sm" id="bk-dl">${svg('dl')} Download PDF</button><a class="btn ghost sm" href="${url}" target="_blank" rel="noopener">Open / print</a>${canShare ? `<button class="btn ghost sm" id="bk-sh">${svg('share')} Share</button>` : ''}</div>
      <iframe src="${url}" style="width:100%;height:78vh;border:1px solid var(--line);border-radius:12px;background:#eee" title="Book preview"></iframe></div>`;
    $('#bk-dl').onclick = () => download(blob, name);
    const sh = $('#bk-sh'); if (sh) sh.onclick = () => navigator.share({ files: [file], title: name }).catch(() => { });
    out.scrollIntoView({ behavior: 'smooth' });
  } catch (e) { console.error(e); alert('Could not build the book: ' + e.message); }
  btn.disabled = false; btn.innerHTML = `${svg('book')} Generate PDF`;
}

/* ============ actions ============ */
const ACT = {
  switch: switcher, newws: chooseKind,
  create: el => createWs(el.dataset.kind),
  usews: async el => { const w = S.list.find(x => x.id === el.dataset.id); if (w) { await setCurrent(w); S.f = { q: '', ev: '', acc: '', type: '' }; location.hash = '#dash'; render(); } },
  addtx: el => txForm(null, el.dataset.type ? { type: el.dataset.type, accountId: (S.ws.accounts.find(a => a.type === 'bank') || S.ws.accounts[0]).id, toAccountId: (S.ws.accounts.find(a => a.type === 'cash') || {}).id } : {}),
  edittx: el => { const t = S.ws.txns.find(x => x.id === el.dataset.id); if (t) txForm(t); },
  addev: () => evForm(), event: el => evDetail(el.dataset.id),
  addacc: () => accForm(), ledger: el => ledger(el.dataset.id),
  makebook: makeBook, export: exportWs, import: importWs, csv: exportCsv, newyear: newYear, delws: delWs,
  addcom: () => $('#com').insertAdjacentHTML('beforeend', comRow({ role: '', name: '' })),
  delcom: el => el.closest('.com-row').remove(),
  pickimg: el => { const k = el.dataset.k, inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { readProfile(); S.ws[k] = await compress(inp.files[0], k === 'titleImg' ? 1600 : 700, 0.92, 'image/png'); await save(); render(); }; inp.click(); },
  clrimg: async el => { readProfile(); S.ws[el.dataset.k] = ''; await save(); render(); },
};
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || !ACT[el.dataset.act]) return; if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); ACT[el.dataset.act](el, e); });

/* ============ boot ============ */
async function boot() {
  await DB.open(); try { navigator.storage?.persist?.(); } catch { }
  S.list = await DB.all('ws'); const m = await DB.get('meta', 'cur');
  S.ws = S.list.find(w => w.id === m?.v) || S.list[0] || null;
  window.addEventListener('hashchange', route); route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
}
boot();
