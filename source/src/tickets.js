'use strict';
/* ================= Ticketing (shared online database on Supabase) ================= */
const TK = { sb: null, sbUrl: '', user: null, orgs: null, cache: {}, stream: null, scanLoop: 0, lastCode: '', lastAt: 0 };
const TKS = { sold: 'Paid', free: 'Free', unsold: 'Not sold', reserved: 'Pay at entrance', pending: 'Payment pending', void: 'Cancelled' };

function tkCfg() {
  const c = { ...(window.BB_CONFIG || {}) };
  try { const o = JSON.parse(localStorage.getItem('bb_cfg') || '{}'); for (const k in o) if (o[k]) c[k] = o[k]; } catch { }
  if (!c.siteUrl && /^https?:$/.test(location.protocol)) c.siteUrl = location.origin + location.pathname;
  if (c.siteUrl && !/[\/#]$/.test(c.siteUrl) && !/\.html?$/.test(c.siteUrl)) c.siteUrl += '/';
  return c;
}
function tkClient() {
  const c = tkCfg(); if (!c.supabaseUrl || !c.supabaseKey || !window.supabase) return null;
  if (!TK.sb || TK.sbUrl !== c.supabaseUrl) { TK.sb = supabase.createClient(c.supabaseUrl, c.supabaseKey, { auth: { persistSession: true, storageKey: 'bb-auth', autoRefreshToken: true } }); TK.sbUrl = c.supabaseUrl; TK.orgs = null; }
  return TK.sb;
}
const tkLink = code => { const s = tkCfg().siteUrl; return s ? `${s}#t/${code}` : code; };
const buyLink = slug => `${tkCfg().siteUrl || ''}#buy/${slug}`;
function qrSvg(text, px = 180) { try { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; } catch { } const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }).replace('<svg ', `<svg style="width:${px}px;height:${px}px;display:block" `); }
async function rpc(fn, args) { const { data, error } = await tkClient().rpc(fn, args); if (error) throw new Error(error.message); return data; }
async function q(p) { const { data, error } = await p; if (error) throw new Error(error.message); return data; }
async function allTickets(eventId) {
  const out = []; for (let i = 0; ; i += 1000) { const d = await q(tkClient().from('tickets').select('*').eq('event_id', eventId).order('serial').range(i, i + 999)); out.push(...d); if (d.length < 1000) break; } return out;
}
const tkErr = e => { console.error(e); toast(e.message || String(e)); };
const fmtDT = s => { if (!s) return ''; const d = new Date(s); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; };
const tkHost = () => $('#tk');
const shareWA = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/* ---------- routing ---------- */
function tkPublicRoute() { return ['t', 'buy', 'order'].includes(S.page); }
function tkRenderStandalone() {
  const app = $('#app');
  if (tkPublicRoute()) { app.innerHTML = `<div class="pub"><div id="tk"></div><div class="pubfoot">Budget Book · tickets</div></div>`; tkPublic(); return; }
  app.innerHTML = `<div class="pub wide"><div class="pubhead"><img src="icons/icon-192.png" alt=""><b>Tickets</b><span style="flex:1"></span>${S.ws ? '<a class="btn ghost sm" href="#dash">Budget</a>' : ''}</div><div id="tk"></div></div>`;
  tkPortal();
}
function tkStopCamera() { cancelAnimationFrame(TK.scanLoop); if (TK.stream) { TK.stream.getTracks().forEach(t => t.stop()); TK.stream = null; } }

/* ---------- public pages ---------- */
async function tkPublic() {
  const h = tkHost(), [, arg] = (location.hash.slice(1)).split('/');
  if (!tkClient()) { h.innerHTML = `<div class="card">${emptyBox('Ticketing is not set up', 'The organisers have not connected the ticket database yet.')}</div>`; return; }
  h.innerHTML = `<div class="card">${emptyBox('Loading…', '')}</div>`;
  try {
    if (S.page === 't') return tkTicketPage(h, arg);
    if (S.page === 'order') return tkOrderPage(h, arg);
    if (S.page === 'buy') return tkBuyPage(h, arg);
  } catch (e) { h.innerHTML = `<div class="card">${emptyBox('Something went wrong', esc(e.message))}</div>`; }
}
function ticketCard(t) {
  const st = t.used ? ['Used', 'used'] : t.status === 'sold' || t.status === 'free' ? ['Valid ticket', 'ok'] : t.status === 'reserved' ? ['Pay at the entrance', 'warn'] : t.status === 'pending' ? ['Waiting for payment approval', 'warn'] : t.status === 'void' ? ['Cancelled', 'bad'] : ['Not issued', 'bad'];
  return `<div class="tcard"><div class="tc-top"><small>${esc(t.org)}</small><b>${esc(t.event)}</b><span>${t.starts_at ? fmtDT(t.starts_at) : ''}${t.venue ? ' · ' + esc(t.venue) : ''}</span></div>
  <div class="tc-body"><div class="tc-qr">${qrSvg(tkLink(t.code), 200)}<code>${esc(t.code)}</code></div>
  <div class="tc-info"><div><small>Ticket No.</small><b>${String(t.serial).padStart(4, '0')}</b></div>${t.buyer ? `<div><small>Name</small><b>${esc(t.buyer)}</b></div>` : ''}<div><small>Price</small><b>Rs. ${money(t.price)}</b></div>
  <span class="pill ${st[1]}">${st[0]}</span></div></div><div class="tc-foot">Show this QR code at the entrance.</div></div>`;
}
async function tkTicketPage(h, code) {
  const t = await rpc('bb_ticket', { p_code: code });
  if (!t) { h.innerHTML = `<div class="card">${emptyBox('Ticket not found', 'Check the link or ask the organisers.')}</div>`; return; }
  h.innerHTML = ticketCard(t) + `<div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap"><a class="btn ghost sm" target="_blank" rel="noopener" href="${shareWA(`My ticket for ${t.event}: ${tkLink(t.code)}`)}">Send on WhatsApp</a><button class="btn ghost sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${tkLink(t.code)}').then(()=>toast('Link copied'))">Copy link</button></div>`;
}
async function tkOrderPage(h, id) {
  const o = await rpc('bb_order', { p_order: id });
  if (!o) { h.innerHTML = `<div class="card">${emptyBox('Order not found', '')}</div>`; return; }
  const msg = { pending: o.method === 'card' ? 'We are confirming your card payment. This page updates by itself.' : 'Thank you! We received your bank slip. Your tickets become valid once the treasurer approves the payment. Keep this page link.', reserved: `Your tickets are reserved. Please pay Rs. ${money(o.amount)} at the entrance.`, paid: 'Payment received. Your tickets are ready.', rejected: 'This order was not approved. Please contact the organisers.', cancelled: 'This order was cancelled.' }[o.status] || '';
  const ts = await Promise.all((o.codes || []).map(c => rpc('bb_ticket', { p_code: c })));
  h.innerHTML = `<div class="card" style="margin-bottom:14px"><h3>Order ${esc(o.ref)}</h3><div class="note ${o.status === 'paid' ? 'ok' : ''}" style="margin:0">${esc(msg)}</div><div style="margin-top:10px;color:var(--mute);font-size:13px">${o.qty} ticket${o.qty > 1 ? 's' : ''} · Rs. ${money(o.amount)}</div></div>${ts.map(ticketCard).join('<div style="height:14px"></div>')}`;
  if (o.status === 'pending') setTimeout(() => { if (S.page === 'order') tkOrderPage(h, id).catch(() => { }); }, 12000);
}
async function tkBuyPage(h, slug) {
  const e = await rpc('bb_public_event', { p_slug: slug });
  if (!e) { h.innerHTML = `<div class="card">${emptyBox('Event not found', 'Check the link.')}</div>`; return; }
  if (!e.online) { h.innerHTML = `<div class="card">${emptyBox(esc(e.name), 'Online ticket sales are closed for this event.')}</div>`; return; }
  const methods = [e.bank && ['bank', 'Bank transfer', 'Transfer the money and upload the slip'], e.door && ['door', 'Pay at the entrance', 'Reserve now, pay in cash at the door'], e.card && ['card', 'Card payment', 'Pay now with a debit or credit card']].filter(Boolean);
  h.innerHTML = `<div class="card"><small style="color:var(--mute)">${esc(e.org)}</small><h2 style="margin:4px 0 6px">${esc(e.name)}</h2><div style="color:var(--mute)">${e.starts_at ? fmtDT(e.starts_at) : ''}${e.venue ? ' · ' + esc(e.venue) : ''}</div>${e.notes ? `<p>${esc(e.notes)}</p>` : ''}
  <div class="stat" style="margin:14px 0"><small>Ticket price</small><b>Rs. ${money(e.price)}</b>${e.left != null ? `<small>${e.left} left online</small>` : ''}</div>
  <form id="buy"><div class="two"><label class="f"><span>Number of tickets</span><input name="qty" type="number" min="1" max="10" value="1"></label><label class="f"><span>Total</span><input id="tot" disabled value="Rs. ${money(e.price)}"></label></div>
  <label class="f"><span>Your name</span><input name="name" required autocomplete="name"></label>
  <div class="two"><label class="f"><span>Phone (WhatsApp)</span><input name="phone" required inputmode="tel" autocomplete="tel"></label><label class="f"><span>Email (optional)</span><input name="email" type="email" autocomplete="email"></label></div>
  <div class="f"><span>How will you pay?</span>${methods.map((m, i) => `<label class="radio"><input type="radio" name="method" value="${m[0]}" ${i ? '' : 'checked'}><div><b>${m[1]}</b><small>${m[2]}</small></div></label>`).join('')}</div>
  <div id="bankbox" class="note" style="white-space:pre-wrap">${esc(e.bank_details || 'Ask the organisers for the bank account details.')}</div>
  <div id="slipbox" class="f"><span>Bank slip (photo or screenshot)</span><input type="file" name="slip" accept="image/*"></div>
  <button class="btn" style="width:100%;justify-content:center;padding:13px" type="submit">Get my tickets</button></form></div>`;
  const f = $('#buy'), upd = () => { const n = Math.max(1, Math.min(10, +f.qty.value || 1)); $('#tot').value = 'Rs. ' + money(n * e.price); const m = (f.querySelector('[name=method]:checked') || {}).value; $('#bankbox').style.display = $('#slipbox').style.display = m === 'bank' ? '' : 'none'; };
  f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
  f.onsubmit = async ev => {
    ev.preventDefault(); const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      const m = f.querySelector('[name=method]:checked').value; let slip = null;
      if (m === 'bank') {
        const file = f.slip.files[0]; if (!file) throw new Error('Please attach the bank slip');
        const data = await compress(file, 1600, 0.8); const blob = await (await fetch(data)).blob();
        slip = `${e.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
        const { error } = await tkClient().storage.from('slips').upload(slip, blob, { contentType: 'image/jpeg' }); if (error) throw new Error('Could not upload the slip: ' + error.message);
      }
      const r = await rpc('bb_buy', { p_slug: slug, p_name: f.name.value, p_phone: f.phone.value, p_email: f.email.value, p_qty: +f.qty.value, p_method: m, p_slip: slip });
      if (m === 'card') { await tkPayHere(r.order_id); return; }
      location.hash = '#order/' + r.order_id;
    } catch (e2) { tkErr(e2); btn.disabled = false; btn.textContent = 'Get my tickets'; }
  };
}
async function tkPayHere(orderId) {
  const c = tkCfg(), r = await fetch(`${c.supabaseUrl}/functions/v1/payhere`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: c.supabaseKey, authorization: 'Bearer ' + c.supabaseKey }, body: JSON.stringify({ action: 'start', order_id: orderId, return_url: `${c.siteUrl}#order/${orderId}`, cancel_url: `${c.siteUrl}#order/${orderId}` }) });
  const p = await r.json(); if (!r.ok) throw new Error(p.error || 'Card payment is not available');
  if (!window.payhere) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://www.payhere.lk/lib/payhere.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the card payment page')); document.head.append(s); });
  payhere.onCompleted = () => { location.hash = '#order/' + orderId; };
  payhere.onDismissed = () => { location.hash = '#order/' + orderId; };
  payhere.onError = err => { toast('Card payment error: ' + err); location.hash = '#order/' + orderId; };
  payhere.startPayment(p);
}

/* ---------- portal (staff + admin) ---------- */
async function tkPortal() {
  const h = tkHost(); if (!h) return;
  const sb = tkClient();
  if (!sb) { h.innerHTML = tkSetupHelp(); return; }
  const { data: { session } } = await sb.auth.getSession(); TK.user = session ? session.user : null;
  if (!TK.user) { h.innerHTML = tkLoginForm(); tkBindLogin(); return; }
  try {
    if (!TK.orgs) TK.orgs = await rpc('bb_my_orgs', {});
    const [, view, id] = (location.hash.slice(1)).split('/');
    if (!TK.orgs.length) { h.innerHTML = tkNoOrg(); return; }
    let org = TK.orgs.find(o => o.org_id === localStorage.getItem('bb_org')) || TK.orgs[0]; TK.org = org;
    if (view === 'ev' && id) return await tkEventPage(h, id);
    if (view === 'scan' && id) return await tkScanPage(h, id);
    if (view === 'team') return await tkTeamPage(h);
    return await tkEventsPage(h);
  } catch (e) { h.innerHTML = `<div class="card">${emptyBox('Could not load', esc(e.message))}<div style="text-align:center"><button class="btn ghost sm" data-act="tk-out">Sign out</button></div></div>`; }
}
function tkSetupHelp() {
  return `<div class="top"><h1>Tickets</h1></div><div class="card"><h3>Connect the ticket database</h3><p style="color:var(--mute)">Selling tickets, the sellers' portal, entrance scanning and online sales need a free online database (Supabase), so that everyone sees the same tickets. Your budget records stay on this device.</p>
  <ol style="line-height:1.7"><li>Follow <b>HOSTING.md</b> (in the app download) to create a free Supabase project and run <b>schema.sql</b>.</li><li>Put the project URL and the public (anon) key in <b>config.js</b> on your website, or below for this device only.</li></ol>
  <a class="btn" href="#settings">Open Settings → Ticketing</a></div>`;
}
function tkLoginForm(mode = 'in') {
  return `<div class="card" style="max-width:440px;margin:4vh auto"><h3 style="font-size:19px">${mode === 'in' ? 'Sign in to Tickets' : 'Create your ticket account'}</h3>
  <p style="color:var(--mute);margin-top:0;font-size:14px">${mode === 'in' ? 'For the treasurer, ticket sellers and entrance staff.' : 'Use the same email that your treasurer added to the team.'}</p>
  <form id="tklogin" data-mode="${mode}">${mode === 'up' ? '<label class="f"><span>Your name</span><input name="name" required></label>' : ''}
  <label class="f"><span>Email</span><input name="email" type="email" required autocomplete="email"></label><label class="f"><span>Password</span><input name="pw" type="password" required minlength="6" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></label>
  <button class="btn" style="width:100%;justify-content:center" type="submit">${mode === 'in' ? 'Sign in' : 'Create account'}</button></form>
  <p style="text-align:center;font-size:14px;margin-bottom:0">${mode === 'in' ? 'New here? <a href="javascript:void 0" data-act="tk-mode" data-m="up">Create an account</a>' : 'Have an account? <a href="javascript:void 0" data-act="tk-mode" data-m="in">Sign in</a>'}</p></div>`;
}
function tkBindLogin() {
  const f = $('#tklogin'); if (!f) return;
  f.onsubmit = async e => {
    e.preventDefault(); const sb = tkClient(), up = f.dataset.mode === 'up', btn = f.querySelector('button'); btn.disabled = true;
    try {
      const em = f.email.value.trim().toLowerCase();
      if (up) { const { data, error } = await sb.auth.signUp({ email: em, password: f.pw.value, options: { data: { name: f.name.value.trim() } } }); if (error) throw error; if (!data.session) { tkHost().innerHTML = `<div class="card" style="max-width:440px;margin:4vh auto">${emptyBox('Check your email', `We sent a confirmation link to ${esc(em)}. Open it, then come back and sign in.`)}</div>`; return; } }
      else { const { error } = await sb.auth.signInWithPassword({ email: em, password: f.pw.value }); if (error) throw error; }
      TK.orgs = null; tkPortal();
    } catch (err) { tkErr(err); btn.disabled = false; }
  };
}
function tkNoOrg() {
  return `<div class="card" style="max-width:560px;margin:4vh auto"><h3>Welcome, ${esc(TK.user.email)}</h3><p style="color:var(--mute)">You are not in any society's ticket team yet.</p>
  <div class="note">If you sell tickets or work at the entrance, ask your treasurer to add <b>${esc(TK.user.email)}</b> to the team, then reload this page.</div>
  <p><b>Are you the treasurer?</b> Set up ticketing for your society:</p><form id="neworg"><label class="f"><span>Society name</span><input name="org" required value="${esc(S.ws?.kind === 'society' ? S.ws.name : '')}"></label><label class="f"><span>Your name</span><input name="me" value="${esc(S.ws?.preparedBy?.name || TK.user.user_metadata?.name || '')}"></label><button class="btn">Set up ticketing</button></form>
  <p style="margin-bottom:0"><button class="btn ghost sm" data-act="tk-out">Sign out</button></p></div>`;
}

function tkOrgBar(extra = '') {
  const o = TK.org, many = TK.orgs.length > 1;
  return `<div class="top"><h1>${esc(o.org_name)}</h1>${many ? `<select id="orgsel" class="btn ghost sm">${TK.orgs.map(x => `<option value="${x.org_id}" ${x.org_id === o.org_id ? 'selected' : ''}>${esc(x.org_name)}</option>`).join('')}</select>` : ''}${extra}
  <button class="btn ghost sm" data-act="tk-out" title="${esc(TK.user.email)}">Sign out</button></div>`;
}
function tkBindOrgBar() { const s = $('#orgsel'); if (s) s.onchange = () => { localStorage.setItem('bb_org', s.value); tkPortal(); }; }

async function tkEventsPage(h) {
  const o = TK.org, evs = await q(tkClient().from('tevents').select('*').eq('org_id', o.org_id).order('starts_at', { ascending: false, nullsFirst: true }));
  const role = [o.is_admin && 'Treasurer / admin', o.can_sell && 'Seller', o.can_scan && 'Entrance'].filter(Boolean).join(' · ');
  h.innerHTML = tkOrgBar(o.is_admin ? `<a class="btn ghost sm" href="#tickets/team">Team</a><button class="btn sm" data-act="tk-newev">${svg('plus')} New ticket event</button>` : '') +
    `<div style="color:var(--mute);margin:-10px 0 16px;font-size:13.5px">Signed in as ${esc(o.name || TK.user.email)} · ${role}</div>` +
    (evs.length ? `<div class="grid g3">${evs.map(e => `<div class="card ev"><div class="h"><b>${esc(e.name)}</b><small>${e.starts_at ? fmtDT(e.starts_at) : ''}</small></div><div style="color:var(--mute);font-size:13px;margin:6px 0 12px">${esc(e.venue)} · Rs. ${money(e.price)}${e.online_enabled ? ' · <span class="pill ok">Online sales on</span>' : ''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">${o.is_admin || o.can_sell ? `<a class="btn sm" href="#tickets/ev/${e.id}">${o.is_admin ? 'Open' : 'My tickets'}</a>` : ''}${o.is_admin || o.can_scan ? `<a class="btn ghost sm" href="#tickets/scan/${e.id}">Scan at entrance</a>` : ''}</div></div>`).join('')}</div>`
      : `<div class="card">${emptyBox('No ticket events yet', o.is_admin ? 'Create one to print ticket books and start selling.' : 'The treasurer has not created a ticket event yet.')}</div>`);
  tkBindOrgBar();
}

/* ---------- event page ---------- */
function tkStats(ts) {
  const s = { sold: 0, free: 0, unsold: 0, unpaid: 0, void: 0, money: 0, used: 0, online: 0 };
  ts.forEach(t => { if (t.status === 'sold') { s.sold++; s.money += +t.amount; } else if (t.status === 'free') s.free++; else if (t.status === 'unsold') s.unsold++; else if (t.status === 'void') s.void++; else s.unpaid++; if (t.checked_in_at) s.used++; if (t.channel === 'online' && t.status !== 'void') s.online++; });
  s.money = r2(s.money); return s;
}
async function tkEventPage(h, id) {
  const sb = tkClient(), o = TK.org;
  const [ev] = await q(sb.from('tevents').select('*').eq('id', id));
  if (!ev) { h.innerHTML = `<div class="card">${emptyBox('Event not found', '')}</div>`; return; }
  const [books, ts, members] = await Promise.all([q(sb.from('books').select('*').eq('event_id', id).order('seq')), allTickets(id), q(sb.from('members').select('*').eq('org_id', ev.org_id).order('name'))]);
  TK.cache = { ev, books, ts, members };
  if (!o.is_admin) return tkSellerView(h);
  const s = tkStats(ts), tab = sessionStorage.getItem('tk_tab') || 'books';
  const orders = await q(sb.from('orders').select('*').eq('event_id', id).order('created_at', { ascending: false }));
  TK.cache.orders = orders; const waiting = orders.filter(x => x.status === 'pending' && x.method === 'bank').length;
  h.innerHTML = `<div class="top"><a class="btn ghost sm" href="#tickets">←</a><h1>${esc(ev.name)}</h1><button class="btn ghost sm" data-act="tk-refresh" title="Load the latest sales">↻ Refresh</button><button class="btn ghost sm" data-act="tk-editev">Edit</button><a class="btn ghost sm" href="#tickets/scan/${id}">Scan</a><button class="btn sm" data-act="tk-print">${svg('dl')} Print ticket books</button></div>
  <div style="color:var(--mute);margin:-10px 0 16px">${ev.starts_at ? fmtDT(ev.starts_at) : 'No date'} · ${esc(ev.venue || 'No venue')} · Rs. ${money(ev.price)} per ticket</div>
  <div class="grid g4"><div class="card stat hero"><small>Money from tickets</small><b>Rs. ${money(s.money)}</b></div><div class="card stat"><small>Paid tickets</small><b>${s.sold}</b></div><div class="card stat"><small>Free · Unpaid</small><b>${s.free} · ${s.unpaid}</b></div><div class="card stat"><small>Checked in</small><b>${s.used}</b></div></div>
  <div class="card" style="margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><div style="flex:1;min-width:200px"><b>Online sales ${ev.online_enabled ? '<span class="pill ok">On</span>' : '<span class="pill">Off</span>'}</b><div style="color:var(--mute);font-size:13px">${ev.online_enabled ? `${s.online} sold online${waiting ? ` · <b class="neg">${waiting} slip${waiting > 1 ? 's' : ''} to check</b>` : ''}` : 'Turn it on in Edit to sell tickets on your website.'}</div></div>
  ${ev.online_enabled ? `<button class="btn ghost sm" data-act="tk-buylink">Share buying link</button>` : ''}${S.ws && S.ws.kind === 'society' ? `<button class="btn ghost sm" data-act="tk-tobudget">Copy to budget</button>` : ''}</div>
  <div class="seg" style="margin-top:16px">${[['books', 'Ticket books'], ['sellers', 'Who has the money'], ['orders', `Online orders${waiting ? ` (${waiting})` : ''}`], ['all', 'All tickets']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-act="tk-tab" data-t="${k}">${l}</button>`).join('')}</div><div id="tkt"></div>`;
  tkTab(tab);
}
function tkTab(tab) {
  sessionStorage.setItem('tk_tab', tab); $$('.seg [data-act=tk-tab]').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  const { ev, books, ts, members, orders } = TK.cache, el = $('#tkt'); if (!el) return;
  if (tab === 'books') {
    const sellers = members.filter(m => m.can_sell || m.is_admin);
    el.innerHTML = `<div class="card"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn sm" data-act="tk-addbooks">${svg('plus')} Add ticket books</button><button class="btn ghost sm" data-act="tk-addextra">Add extra tickets</button></div>
    ${books.length ? `<div style="overflow-x:auto"><table class="tbl"><tr><th>Book</th><th>Tickets</th><th>Seller</th><th class="n">Paid</th><th class="n">Free</th><th class="n">Not sold</th><th class="n">Amount (Rs.)</th><th></th></tr>${books.map(b => { const bt = ts.filter(t => t.book_id === b.id), st = tkStats(bt); const r = bt.length ? `${bt[0].serial}–${bt[bt.length - 1].serial}` : ''; return `<tr><td><b>${esc(b.label)}</b></td><td>${r}</td><td>${['Online', 'Entrance'].includes(b.label) ? `<small style="color:var(--mute)">${b.label === 'Online' ? 'Website' : 'Entrance staff'}</small>` : `<select data-act2="tk-assign" data-b="${b.id}" style="border:1px solid var(--line);border-radius:8px;padding:5px;max-width:160px"><option value="">— not given —</option>${sellers.map(m => `<option value="${m.id}" ${b.seller_id === m.id ? 'selected' : ''}>${esc(m.name || m.email)}</option>`).join('')}</select>`}</td><td class="n">${st.sold}</td><td class="n">${st.free}</td><td class="n">${st.unsold}</td><td class="n">${money(st.money)}</td><td><a href="javascript:void 0" data-act="tk-book" data-b="${b.id}">Open</a></td></tr>`; }).join('')}</table></div>` : emptyBox('No ticket books yet', 'Add books to create numbered tickets with QR codes.')}</div>`;
    $$('[data-act2=tk-assign]').forEach(s => s.onchange = async () => { try { await q(tkClient().from('books').update({ seller_id: s.value || null }).eq('id', s.dataset.b)); const b = books.find(x => x.id === s.dataset.b); b.seller_id = s.value || null; toast('Book given to seller'); } catch (e) { tkErr(e); } });
  } else if (tab === 'sellers') {
    const by = {}; ts.forEach(t => { if (t.status !== 'sold') return; const k = t.collected_by || '(not recorded)'; (by[k] ||= { n: 0, a: 0 }); by[k].n++; by[k].a += +t.amount; });
    const sold = {}; ts.forEach(t => { if (!['sold', 'free'].includes(t.status)) return; const k = t.sold_by_name || '(not recorded)'; (sold[k] ||= { p: 0, f: 0 }); t.status === 'free' ? sold[k].f++ : sold[k].p++; });
    el.innerHTML = `<div class="grid g2"><div class="card"><h3>Money held by</h3><table class="tbl"><tr><th>Person / place</th><th class="n">Tickets</th><th class="n">Amount (Rs.)</th></tr>${Object.entries(by).sort((a, b) => b[1].a - a[1].a).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.n}</td><td class="n"><b>${money(v.a)}</b></td></tr>`).join('') || '<tr><td colspan=3>No paid tickets yet</td></tr>'}</table></div>
    <div class="card"><h3>Sold by</h3><table class="tbl"><tr><th>Seller</th><th class="n">Paid</th><th class="n">Free</th></tr>${Object.entries(sold).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.p}</td><td class="n">${v.f}</td></tr>`).join('') || '<tr><td colspan=3>Nothing yet</td></tr>'}</table></div></div>`;
  } else if (tab === 'orders') {
    el.innerHTML = `<div class="card">${orders.length ? `<div class="list">${orders.map(x => `<div class="row" data-act="tk-order" data-id="${x.id}"><div class="ic ${x.status === 'paid' ? 'in' : x.status === 'pending' || x.status === 'reserved' ? 'tr' : 'out'}">${x.qty}</div><div class="mid"><b>${esc(x.buyer_name)} · ${esc(x.buyer_phone)}</b><small>${fmtDT(x.created_at)} · ${{ bank: 'Bank transfer', door: 'Pay at entrance', card: 'Card' }[x.method]} · Ref ${x.ref}</small></div><div><span class="pill ${x.status === 'paid' ? 'ok' : x.status === 'pending' ? 'warn' : x.status === 'reserved' ? '' : 'bad'}">${{ pending: x.method === 'bank' ? 'Check slip' : 'Waiting', reserved: 'Pay at door', paid: 'Paid', rejected: 'Rejected', cancelled: 'Cancelled' }[x.status]}</span><div class="amt" style="text-align:right">${money(x.amount)}</div></div></div>`).join('')}</div>` : emptyBox('No online orders', ev.online_enabled ? 'Share the buying link to start.' : 'Online sales are off.')}</div>`;
  } else {
    el.innerHTML = `<div class="filters"><input id="tkq" placeholder="Search ticket no., name or phone"><select id="tkf"><option value="">All</option>${Object.entries(TKS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}<option value="used">Checked in</option></select></div><div class="card"><div class="list" id="tkl"></div></div>`;
    const draw = () => { const qq = $('#tkq').value.toLowerCase(), f = $('#tkf').value; const L = ts.filter(t => (!f || (f === 'used' ? t.checked_in_at : t.status === f)) && (!qq || `${t.serial} ${t.buyer_name} ${t.buyer_phone}`.toLowerCase().includes(qq))); $('#tkl').innerHTML = L.slice(0, 300).map(tkRow).join('') + (L.length > 300 ? `<div class="empty">${L.length - 300} more. Search to narrow down.</div>` : '') || emptyBox('No tickets', ''); };
    $('#tkq').oninput = draw; $('#tkf').onchange = draw; draw();
  }
}
function tkRow(t) {
  const b = TK.cache.books.find(x => x.id === t.book_id);
  return `<div class="row" data-act="tk-ticket" data-id="${t.id}"><div class="ic ${t.status === 'sold' ? 'in' : t.status === 'unsold' ? 'tr' : t.status === 'void' ? 'out' : 'tr'}" style="font-size:11px">${t.serial}</div><div class="mid"><b>${esc(t.buyer_name || TKS[t.status])}</b><small>Book ${esc(b ? b.label : '?')} · ${TKS[t.status]}${t.sold_by_name ? ' · by ' + esc(t.sold_by_name) : ''}${t.checked_in_at ? ' · ✓ in' : ''}</small></div><div class="amt">${t.status === 'sold' ? money(t.amount) : ''}</div></div>`;
}

/* seller view: my books as a grid of ticket numbers */
function tkSellerView(h) {
  const { ev, books, ts, members } = TK.cache, me = members.find(m => (m.email || '').toLowerCase() === (TK.user.email || '').toLowerCase());
  const mine = books.filter(b => me && b.seller_id === me.id), myT = ts.filter(t => mine.some(b => b.id === t.book_id)), s = tkStats(myT);
  const held = r2(myT.filter(t => t.status === 'sold' && t.collected_by === (me && me.name)).reduce((a, t) => a + +t.amount, 0));
  h.innerHTML = `<div class="top"><a class="btn ghost sm" href="#tickets">←</a><h1>${esc(ev.name)}</h1><button class="btn ghost sm" data-act="tk-refresh">↻</button>${TK.org.can_scan ? `<a class="btn ghost sm" href="#tickets/scan/${ev.id}">Scan</a>` : ''}</div>
  <div class="grid g4"><div class="card stat hero"><small>Money with you</small><b>Rs. ${money(held)}</b></div><div class="card stat"><small>Sold</small><b>${s.sold}</b></div><div class="card stat"><small>Free</small><b>${s.free}</b></div><div class="card stat"><small>Left to sell</small><b>${s.unsold}</b></div></div>
  ${mine.length ? mine.map(b => { const bt = ts.filter(t => t.book_id === b.id); return `<div class="card" style="margin-top:16px"><h3>Book ${esc(b.label)} <small style="color:var(--mute);font-weight:500">· tap a number to record a sale</small></h3><div class="tgrid">${bt.map(t => `<button class="tn ${t.status}${t.checked_in_at ? ' used' : ''}" data-act="tk-ticket" data-id="${t.id}">${t.serial}</button>`).join('')}</div></div>`; }).join('')
      : `<div class="card" style="margin-top:16px">${emptyBox('No ticket books given to you yet', 'Ask the treasurer to give you a book.')}</div>`}
  <div class="legend"><span class="tn unsold">12</span> not sold <span class="tn sold">12</span> paid <span class="tn free">12</span> free <span class="tn sold used">12</span> used</div>`;
}

/* ticket detail / sell modal */
function tkTicketModal(id) {
  const { ev, ts, books } = TK.cache, t = ts.find(x => x.id === id); if (!t) return;
  const admin = TK.org.is_admin, b = books.find(x => x.id === t.book_id), link = tkLink(t.code);
  const canEdit = admin || t.status === 'unsold';
  const m = modal(`Ticket ${t.serial}`, `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div>${qrSvg(link, 128)}</div><div style="flex:1;min-width:160px"><div><span class="pill ${t.status === 'sold' || t.status === 'free' ? 'ok' : t.status === 'void' ? 'bad' : 'warn'}">${TKS[t.status]}</span>${t.checked_in_at ? ' <span class="pill used">Used ' + fmtDT(t.checked_in_at) + '</span>' : ''}</div>
    <div style="color:var(--mute);font-size:13px;margin-top:8px">Book ${esc(b ? b.label : '?')} · code ${t.code}${t.sold_by_name ? `<br>Sold by ${esc(t.sold_by_name)}${t.sold_at ? ' · ' + fmtDT(t.sold_at) : ''}` : ''}${t.collected_by ? `<br>Money with: <b>${esc(t.collected_by)}</b>` : ''}</div></div></div>
    ${canEdit && t.channel !== 'online' ? `<form id="sellf" style="margin-top:16px"><label class="f"><span>Buyer name</span><input name="n" value="${esc(t.buyer_name)}"></label><div class="two"><label class="f"><span>Phone</span><input name="p" inputmode="tel" value="${esc(t.buyer_phone)}"></label><label class="f"><span>Email (optional)</span><input name="e" type="email" value="${esc(t.buyer_email)}"></label></div>
    <label style="display:flex;gap:10px;align-items:center;margin-bottom:6px"><input type="checkbox" name="free" ${t.status === 'free' ? 'checked' : ''}> Free ticket (no money)</label></form>`
      : `<div style="margin-top:14px"><b>${esc(t.buyer_name || '')}</b> ${esc(t.buyer_phone || '')}</div>`}`,
    `${(t.status === 'sold' || t.status === 'free') && t.channel !== 'online' && !t.checked_in_at && (admin || t.sold_by) ? '<button class="btn danger" data-undo style="margin-right:auto">Undo sale</button>' : ''}${t.status !== 'unsold' ? `<a class="btn ghost" target="_blank" rel="noopener" href="${shareWA(`Your ticket for ${ev.name} (No. ${t.serial}): ${link}`)}">Send on WhatsApp</a>` : ''}${canEdit && t.channel !== 'online' ? '<button class="btn" data-save>Save sale</button>' : '<button class="btn" data-x>Close</button>'}`);
  const sv = $('[data-save]', m.el);
  if (sv) sv.onclick = async () => {
    const f = $('#sellf', m.el); sv.disabled = true;
    try { const r = await rpc('bb_sell', { p_ticket: t.id, p_buyer: f.n.value, p_phone: f.p.value, p_email: f.e.value, p_free: f.free.checked, p_amount: null }); Object.assign(t, r); m.close(); toast(`Ticket ${t.serial} recorded`); tkAfterChange(); if (r.buyer_phone) { const ok = confirm('Send the ticket link to the buyer on WhatsApp?'); if (ok) window.open(`https://wa.me/${r.buyer_phone.replace(/\D/g, '').replace(/^0/, '94')}?text=${encodeURIComponent(`Your ticket for ${ev.name} (No. ${t.serial}): ${link}`)}`, '_blank'); } }
    catch (e) { tkErr(e); sv.disabled = false; }
  };
  const ud = $('[data-undo]', m.el); if (ud) ud.onclick = async () => { if (!confirm(`Undo the sale of ticket ${t.serial}?`)) return; try { Object.assign(t, await rpc('bb_unsell', { p_ticket: t.id })); m.close(); tkAfterChange(); } catch (e) { tkErr(e); } };
}
function tkAfterChange() { const h = tkHost(); if (!h) return; if (TK.org.is_admin) { const y = scrollY; tkEventPage(h, TK.cache.ev.id).then(() => scrollTo(0, y)); } else tkSellerView(h); }

/* online order modal (admin) */
async function tkOrderModal(id) {
  const o = TK.cache.orders.find(x => x.id === id); if (!o) return;
  let slip = ''; if (o.slip_path) { const { data } = await tkClient().storage.from('slips').createSignedUrl(o.slip_path, 600); if (data) slip = data.signedUrl || data.signedURL; if (slip && slip.startsWith('/')) slip = tkCfg().supabaseUrl + '/storage/v1' + slip; }
  const m = modal(`Order ${o.ref}`, `<table class="tbl"><tr><td>Buyer</td><td><b>${esc(o.buyer_name)}</b></td></tr><tr><td>Phone</td><td>${esc(o.buyer_phone)}</td></tr>${o.buyer_email ? `<tr><td>Email</td><td>${esc(o.buyer_email)}</td></tr>` : ''}<tr><td>Tickets</td><td>${o.qty} · Rs. ${money(o.amount)}</td></tr><tr><td>Payment</td><td>${{ bank: 'Bank transfer', door: 'Pay at entrance', card: 'Card (PayHere)' }[o.method]}</td></tr><tr><td>Status</td><td>${esc(o.status)}${o.decided_by ? ' by ' + esc(o.decided_by) : ''}</td></tr></table>
  ${slip ? `<div style="margin-top:12px"><img src="${slip}" style="max-width:100%;border-radius:10px;border:1px solid var(--line)" alt="Bank slip"></div>` : ''}${o.method === 'bank' && o.status === 'pending' ? '<div class="note" style="margin-top:12px">Check that the money is in the bank account before approving.</div>' : ''}`,
    `${['pending', 'reserved', 'paid'].includes(o.status) ? `<button class="btn danger" data-no style="margin-right:auto">${o.status === 'paid' ? 'Cancel order' : 'Reject'}</button>` : ''}<a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/${o.buyer_phone.replace(/\D/g, '').replace(/^0/, '94')}?text=${encodeURIComponent(`Your tickets (order ${o.ref}): ${tkCfg().siteUrl}#order/${o.id}`)}">WhatsApp buyer</a>${['pending', 'reserved'].includes(o.status) ? '<button class="btn" data-yes>Payment received</button>' : ''}`);
  const go = async ok => { try { await rpc('bb_decide', { p_order: o.id, p_approve: ok, p_note: '' }); m.close(); toast(ok ? 'Approved. The tickets are now valid.' : 'Order cancelled'); tkAfterChange(); } catch (e) { tkErr(e); } };
  const y = $('[data-yes]', m.el); if (y) y.onclick = () => go(true);
  const n = $('[data-no]', m.el); if (n) n.onclick = () => { if (confirm('Cancel this order? Its tickets stop working.')) go(false); };
}

/* event form */
function tkEventForm(ev) {
  const isNew = !ev; ev = ev || { name: '', starts_at: '', venue: '', price: 150, book_size: 100, online_enabled: false, online_limit: 0, pay_bank: true, pay_door: true, pay_card: false, bank_details: '', payhere_merchant_id: '', payhere_sandbox: true, notes: '' };
  const dt = ev.starts_at ? new Date(new Date(ev.starts_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const m = modal(isNew ? 'New ticket event' : 'Edit ticket event', `<form id="evf2"><label class="f"><span>Event name</span><input name="name" required value="${esc(ev.name)}"></label>
  <div class="two"><label class="f"><span>Date and time</span><input type="datetime-local" name="dt" value="${dt}"></label><label class="f"><span>Venue</span><input name="venue" value="${esc(ev.venue)}"></label></div>
  <div class="two"><label class="f"><span>Ticket price (Rs.)</span><input name="price" inputmode="decimal" value="${ev.price}"></label><label class="f"><span>Tickets per book</span><input name="bs" inputmode="numeric" value="${ev.book_size}"></label></div>
  ${isNew ? '<label class="f"><span>Ticket books to create now</span><input name="nb" inputmode="numeric" value="0"></label>' : ''}
  <label class="f"><span>Note for buyers (optional)</span><textarea name="notes" rows="2">${esc(ev.notes)}</textarea></label>
  <h3 style="margin:18px 0 8px">Online sales</h3><label style="display:flex;gap:10px;margin-bottom:10px"><input type="checkbox" name="online" ${ev.online_enabled ? 'checked' : ''}> Sell tickets on the website</label>
  <label class="f"><span>Most tickets to sell online (0 = no limit)</span><input name="lim" inputmode="numeric" value="${ev.online_limit}"></label>
  <div class="f"><span>Payment methods</span><label style="display:flex;gap:10px;margin:6px 0"><input type="checkbox" name="pb" ${ev.pay_bank ? 'checked' : ''}> Bank transfer with slip</label><label style="display:flex;gap:10px;margin:6px 0"><input type="checkbox" name="pd" ${ev.pay_door ? 'checked' : ''}> Reserve and pay at the entrance</label><label style="display:flex;gap:10px;margin:6px 0"><input type="checkbox" name="pc" ${ev.pay_card ? 'checked' : ''}> Card payment (PayHere)</label></div>
  <label class="f"><span>Bank account details shown to buyers</span><textarea name="bank" rows="3" placeholder="Bank, branch, account name, account number">${esc(ev.bank_details)}</textarea></label>
  <div class="two"><label class="f"><span>PayHere Merchant ID</span><input name="mid" value="${esc(ev.payhere_merchant_id)}"></label><label class="f"><span>PayHere mode</span><select name="sbx"><option value="1" ${ev.payhere_sandbox ? 'selected' : ''}>Sandbox (testing)</option><option value="0" ${!ev.payhere_sandbox ? 'selected' : ''}>Live</option></select></label></div>
  <div class="hint">Card payments also need the PayHere function installed (see HOSTING.md).</div></form>`,
    `${isNew ? '' : '<button class="btn danger" data-del style="margin-right:auto">Delete</button>'}<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Save</button>`);
  $('[data-save]', m.el).onclick = async () => {
    const f = $('#evf2', m.el); if (!f.name.value.trim()) { toast('Enter the event name'); return; }
    const row = { name: f.name.value.trim(), starts_at: f.dt.value ? new Date(f.dt.value).toISOString() : null, venue: f.venue.value.trim(), price: r2(f.price.value), book_size: Math.max(1, Math.min(500, parseInt(f.bs.value) || 100)), notes: f.notes.value.trim(), online_enabled: f.online.checked, online_limit: parseInt(f.lim.value) || 0, pay_bank: f.pb.checked, pay_door: f.pd.checked, pay_card: f.pc.checked, bank_details: f.bank.value.trim(), payhere_merchant_id: f.mid.value.trim(), payhere_sandbox: f.sbx.value === '1' };
    try {
      if (isNew) { const [e] = await q(tkClient().from('tevents').insert({ ...row, org_id: TK.org.org_id }).select()); const nb = parseInt(f.nb.value) || 0; if (nb > 0) await rpc('bb_add_books', { p_event: e.id, p_count: nb, p_size: null, p_label: null }); m.close(); location.hash = '#tickets/ev/' + e.id; }
      else { await q(tkClient().from('tevents').update(row).eq('id', ev.id)); m.close(); tkPortal(); }
    } catch (e) { tkErr(e); }
  };
  const d = $('[data-del]', m.el); if (d) d.onclick = async () => { if (!confirm(`Delete “${ev.name}” and ALL its tickets and orders? This cannot be undone.`)) return; try { await q(tkClient().from('tevents').delete().eq('id', ev.id)); m.close(); location.hash = '#tickets'; } catch (e) { tkErr(e); } };
}

/* team */
async function tkTeamPage(h) {
  const o = TK.org; if (!o.is_admin) { location.hash = '#tickets'; return; }
  const ms = await q(tkClient().from('members').select('*').eq('org_id', o.org_id).order('name'));
  h.innerHTML = `<div class="top"><a class="btn ghost sm" href="#tickets">←</a><h1>Ticket team</h1><button class="btn sm" data-act="tk-addmem">${svg('plus')} Add person</button></div>
  <div class="note">Add each seller and entrance helper by email. They open <b>${esc(tkCfg().siteUrl || 'your website')}#tickets</b>, create an account with the same email, and see only what their role allows.</div>
  <div class="card"><table class="tbl"><tr><th>Name</th><th>Email</th><th>Admin</th><th>Sells</th><th>Entrance</th><th></th></tr>${ms.map(m => `<tr><td><b>${esc(m.name)}</b><br><small style="color:var(--mute)">${esc(m.phone)}</small></td><td>${esc(m.email)}</td>${['is_admin', 'can_sell', 'can_scan'].map(k => `<td><input type="checkbox" data-mem="${m.id}" data-k="${k}" ${m[k] ? 'checked' : ''}></td>`).join('')}<td><a href="javascript:void 0" data-act="tk-delmem" data-id="${m.id}">Remove</a></td></tr>`).join('')}</table></div>`;
  $$('[data-mem]').forEach(c => c.onchange = async () => { try { await q(tkClient().from('members').update({ [c.dataset.k]: c.checked }).eq('id', c.dataset.mem)); toast('Saved'); TK.orgs = null; } catch (e) { tkErr(e); c.checked = !c.checked; } });
}
function tkAddMember() {
  const m = modal('Add a person', `<form id="memf"><label class="f"><span>Name</span><input name="n" required></label><label class="f"><span>Email (they sign in with this)</span><input name="e" type="email" required></label><label class="f"><span>Phone (optional)</span><input name="p"></label>
  <label style="display:flex;gap:10px;margin:6px 0"><input type="checkbox" name="s" checked> Sells tickets</label><label style="display:flex;gap:10px;margin:6px 0"><input type="checkbox" name="c"> Works at the entrance (scans tickets)</label><label style="display:flex;gap:10px;margin:6px 0"><input type="checkbox" name="a"> Admin (full access, approves payments)</label></form>`, '<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Add</button>');
  $('[data-save]', m.el).onclick = async () => { const f = $('#memf', m.el); if (!f.n.value.trim() || !f.e.value.includes('@')) { toast('Enter a name and email'); return; } try { await q(tkClient().from('members').insert({ org_id: TK.org.org_id, name: f.n.value.trim(), email: f.e.value.trim().toLowerCase(), phone: f.p.value.trim(), can_sell: f.s.checked, can_scan: f.c.checked, is_admin: f.a.checked })); m.close(); tkPortal(); } catch (e) { tkErr(e); } };
}

/* add books */
function tkAddBooks(extra) {
  const ev = TK.cache.ev;
  const m = modal(extra ? 'Add extra tickets' : 'Add ticket books', extra ? `<p style="color:var(--mute);margin-top:0">For tickets printed after the books run out. They go in one book called “Additional”.</p><label class="f"><span>How many tickets</span><input name="n" inputmode="numeric" value="50"></label><label class="f"><span>Book name</span><input name="l" value="Additional"></label>` : `<label class="f"><span>How many books</span><input name="n" inputmode="numeric" value="10"></label><label class="f"><span>Tickets in each book</span><input name="s" inputmode="numeric" value="${ev.book_size}"></label>`, '<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Create</button>');
  $('[data-save]', m.el).onclick = async () => { const n = parseInt(val(m.el, 'n')) || 0; try { if (extra) await rpc('bb_add_books', { p_event: ev.id, p_count: 1, p_size: n, p_label: val(m.el, 'l') || 'Additional' }); else await rpc('bb_add_books', { p_event: ev.id, p_count: n, p_size: parseInt(val(m.el, 's')) || ev.book_size, p_label: null }); m.close(); toast('Tickets created'); tkAfterChange(); } catch (e) { tkErr(e); } };
}
function tkBuyLinkModal() {
  const ev = TK.cache.ev, link = buyLink(ev.slug);
  if (!tkCfg().siteUrl) toast('Set the website link in Settings → Ticketing so the QR code opens your site');
  modal('Buy tickets online', `<div style="display:flex;justify-content:center">${qrSvg(link, 220)}</div><p style="text-align:center;word-break:break-all"><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link)}</a></p><p style="text-align:center;color:var(--mute);font-size:13px">Put this QR code on posters, or share the link on WhatsApp and Facebook.</p>`,
    `<button class="btn ghost" onclick="navigator.clipboard&&navigator.clipboard.writeText('${link}').then(()=>toast('Link copied'))">Copy link</button><a class="btn" target="_blank" rel="noopener" href="${shareWA(`Tickets for ${ev.name} are now available online: ${link}`)}">Share on WhatsApp</a>`);
}

/* ---------- scanner ---------- */
async function tkScanPage(h, id) {
  const [ev] = await q(tkClient().from('tevents').select('id,name,price,starts_at').eq('id', id)); if (!ev) { h.innerHTML = emptyBox('Event not found', ''); return; }
  TK.scanEv = ev;
  h.innerHTML = `<div class="top"><a class="btn ghost sm" href="#tickets">←</a><h1>Entrance · ${esc(ev.name)}</h1><button class="btn sm" data-act="tk-door">${svg('plus')} Sell at door</button></div>
  <div class="scan-wrap"><div class="cam"><video id="cam" playsinline muted></video><div class="frame"></div><div id="camMsg" class="cam-msg">Starting camera…</div></div>
  <div><div id="scanRes" class="scan-res idle"><b>Point the camera at a ticket QR code</b><span>Or type the ticket number below.</span></div>
  <form id="manual" style="display:flex;gap:8px;margin-top:12px"><input name="c" placeholder="Ticket no. or code" style="flex:1;border:1px solid var(--line);border-radius:11px;padding:11px"><button class="btn">Check</button></form>
  <div style="color:var(--mute);font-size:13px;margin-top:10px" id="scanCount"></div></div></div>`;
  $('#manual').onsubmit = e => { e.preventDefault(); const v = e.target.c.value.trim(); if (v) { tkCheck(v); e.target.c.value = ''; } };
  tkStartCamera();
}
async function tkStartCamera() {
  const v = $('#cam'), msg = $('#camMsg'); if (!v) return;
  try {
    TK.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
    v.srcObject = TK.stream; await v.play(); msg.style.display = 'none';
  } catch (e) { msg.textContent = 'Camera not available. Allow camera access, or type ticket numbers.'; return; }
  const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!TK.stream || !document.body.contains(v)) { tkStopCamera(); return; }
    if (v.readyState >= 2) {
      const w = 480, hh = Math.round(v.videoHeight / v.videoWidth * w) || 360; c.width = w; c.height = hh; g.drawImage(v, 0, 0, w, hh);
      const r = jsQR(g.getImageData(0, 0, w, hh).data, w, hh, { inversionAttempts: 'dontInvert' });
      if (r && r.data && !TK.busy) { TK.seen ||= new Map(); const at = TK.seen.get(r.data); if (!at || Date.now() - at > 120000) { TK.seen.set(r.data, Date.now()); tkCheck(r.data); } }
    }
    TK.scanLoop = requestAnimationFrame(tick);
  };
  tick();
}
async function tkCheck(code, collect = null) {
  const box = $('#scanRes'); if (!box) return; TK.busy = true;
  try {
    const r = await rpc('bb_check_in', { p_code: code, p_event: TK.scanEv.id, p_collect: collect }); TK.lastRes = { code, r };
    const no = r.serial ? `Ticket ${r.serial}` : '', who = r.buyer ? ` · ${esc(r.buyer)}` : '';
    const V = {
      ok: ['ok', 'ADMIT', `${no}${who}`, ''],
      used: ['bad', 'ALREADY USED', `${no}${who}<br>Entered ${fmtDT(r.at)}${r.by ? ' · checked by ' + esc(r.by) : ''}`, ''],
      unpaid: ['warn', 'NOT PAID', `${no}${who} · Rs. ${money(r.price)} due`, `<button class="btn" data-c="door">Collected Rs. ${money(r.price)} – admit</button>`],
      unrecorded: ['warn', 'SALE NOT RECORDED', `${no} was not marked as sold by a seller.`, `<button class="btn" data-c="seller">Seller has the money – admit</button><button class="btn ghost" data-c="door">Collect Rs. ${money(r.price)} here – admit</button>`],
      void: ['bad', 'CANCELLED', `${no}${who}`, ''], notfound: ['bad', 'NOT A VALID TICKET', 'This QR code is not one of our tickets.', ''],
      wrong_event: ['bad', 'WRONG EVENT', `This ticket is for ${esc(r.event)}.`, ''],
    }[r.result] || ['bad', r.result, '', ''];
    box.className = 'scan-res ' + V[0]; box.innerHTML = `<b>${V[1]}</b><span>${V[2]}</span>${V[3] ? `<div class="acts">${V[3]}</div>` : ''}`;
    $$('[data-c]', box).forEach(b => b.onclick = () => tkCheck(code, b.dataset.c));
    try { navigator.vibrate && navigator.vibrate(V[0] === 'ok' ? 80 : [60, 60, 60]); } catch { }
    tkBeep(V[0] === 'ok');
    tkScanCount();
  } catch (e) { box.className = 'scan-res bad'; box.innerHTML = `<b>ERROR</b><span>${esc(e.message)}</span>`; }
  TK.busy = false;
}
function tkBeep(ok) { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = ok ? 880 : 220; o.connect(g); g.connect(a.destination); g.gain.value = 0.12; o.start(); o.stop(a.currentTime + (ok ? 0.12 : 0.35)); } catch { } }
async function tkScanCount() { try { const { count } = await tkClient().from('tickets').select('id', { count: 'exact', head: true }).eq('event_id', TK.scanEv.id).not('checked_in_at', 'is', null); const el = $('#scanCount'); if (el && count != null) el.textContent = `${count} people checked in so far.`; } catch { } }
function tkDoorSale() {
  const ev = TK.scanEv, m = modal('Sell at the door', `<p style="margin-top:0">Rs. ${money(ev.price)} collected in cash. A new ticket is recorded and the person is admitted.</p><label class="f"><span>Name (optional)</span><input name="n"></label><label class="f"><span>Phone (optional)</span><input name="p" inputmode="tel"></label>`, '<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Sell and admit</button>');
  $('[data-save]', m.el).onclick = async () => { try { const t = await rpc('bb_door_sale', { p_event: ev.id, p_buyer: val(m.el, 'n'), p_phone: val(m.el, 'p') }); m.close(); const box = $('#scanRes'); box.className = 'scan-res ok'; box.innerHTML = `<b>ADMIT</b><span>Door ticket ${t.serial} · Rs. ${money(t.amount)} collected</span>`; tkScanCount(); } catch (e) { tkErr(e); } };
}

/* ---------- printable ticket books (PDF) ---------- */
async function tkPrintBooks() {
  const { ev, books, ts } = TK.cache, printable = books.filter(b => b.label !== 'Online');
  const m = modal('Print ticket books', `<p style="margin-top:0;color:var(--mute)">Five tickets per A4 page, each with a counterfoil and its own QR code.</p><div class="f"><span>Books</span><div style="display:flex;flex-wrap:wrap;gap:8px">${printable.map(b => `<label class="chip" style="font-size:13px;padding:6px 10px"><input type="checkbox" value="${b.id}" checked> ${esc(b.label)}</label>`).join('')}</div></div>${tkCfg().siteUrl ? '' : '<div class="note">Set the website link in Settings → Ticketing first, so buyers who scan the QR with their phone camera can open their ticket.</div>'}`, '<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Make PDF</button>');
  $('[data-save]', m.el).onclick = async () => {
    const ids = $$('input[type=checkbox]:checked', m.el).map(i => i.value); if (!ids.length) return; const b0 = $('[data-save]', m.el); b0.disabled = true; b0.textContent = 'Making PDF…';
    try { const blob = await tkBooksPdf(ev, books.filter(b => ids.includes(b.id)), ts); download(blob, `${fileSafe(ev.name)}_ticket_books.pdf`); m.close(); } catch (e) { tkErr(e); b0.disabled = false; }
  };
}
async function tkBooksPdf(ev, books, ts) {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const logo = S.ws && S.ws.kind === 'society' ? S.ws.logo : '', org = TK.org.org_name, when = ev.starts_at ? fmtDT(ev.starts_at) : '';
  let first = true;
  for (const b of books) {
    const bt = ts.filter(t => t.book_id === b.id);
    for (let i = 0; i < bt.length; i += 5) {
      if (!first) doc.addPage(); first = false;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120); doc.text(`${org} · ${ev.name} · Book ${b.label} · tickets ${bt[0].serial}–${bt[bt.length - 1].serial}`, 10, 8);
      bt.slice(i, i + 5).forEach((t, k) => {
        const y = 12 + k * 56, H = 52, X = 10, CF = 48;
        doc.setDrawColor(0); doc.setLineWidth(0.3); doc.roundedRect(X, y, 190, H, 2, 2);
        doc.setLineDashPattern([1.2, 1.2], 0); doc.line(X + CF, y + 2, X + CF, y + H - 2); doc.setLineDashPattern([], 0);
        // counterfoil
        doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(`No. ${String(t.serial).padStart(4, '0')}`, X + 4, y + 8);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.text(`Book ${b.label}`, X + 4, y + 12.5);
        [['Name', 20], ['Phone', 29], ['Seller', 38]].forEach(([l, yy]) => { doc.text(l, X + 4, y + yy); doc.setDrawColor(150); doc.setLineDashPattern([0.4, 0.8], 0); doc.line(X + 14, y + yy + 0.6, X + CF - 4, y + yy + 0.6); doc.setLineDashPattern([], 0); });
        doc.rect(X + 4, y + 43, 3, 3); doc.text('Paid', X + 8.5, y + 45.6); doc.rect(X + 20, y + 43, 3, 3); doc.text('Free', X + 24.5, y + 45.6);
        // ticket
        const tx0 = X + CF + 5; let ly = y + 9;
        if (logo) { try { const p = doc.getImageProperties(logo), hh = 11, ww = Math.min(22, p.width * hh / p.height); doc.addImage(logo, 'PNG', tx0, y + 4, ww, hh, 'tklogo', 'FAST'); } catch { } }
        const tl = tx0 + (logo ? 25 : 0);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90); doc.text(org.toUpperCase(), tl, ly);
        doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(doc.splitTextToSize(ev.name, 92 - (logo ? 25 : 0))[0], tl, ly + 7);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(when, tx0, y + 27); doc.text(doc.splitTextToSize(ev.venue || '', 92)[0] || '', tx0, y + 32.5);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(`Rs. ${money(ev.price)}`, tx0, y + 42);
        doc.setFontSize(10); doc.text(`Ticket No. ${String(t.serial).padStart(4, '0')}`, tx0, y + 48);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(110); doc.text('One person · keep this ticket · scan at the entrance', tx0 + 45, y + 48);
        // QR
        const qs = 40, qx = X + 190 - qs - 4, qy = y + 4; try { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; } catch { }
        const qq = qrcode(0, 'M'); qq.addData(tkLink(t.code)); qq.make(); const n = qq.getModuleCount(), s = qs / n; doc.setFillColor(0, 0, 0);
        for (let r = 0; r < n; r++) { let c = 0; while (c < n) { if (qq.isDark(r, c)) { let e = c; while (e < n && qq.isDark(r, e)) e++; doc.rect(qx + c * s, qy + r * s, (e - c) * s, s + 0.02, 'F'); c = e; } else c++; } }
        doc.setTextColor(0); doc.setFont('courier', 'bold'); doc.setFontSize(8); doc.text(t.code, qx + qs / 2, qy + qs + 3.5, { align: 'center' });
      });
    }
  }
  return doc.output('blob');
}

/* ---------- copy totals into the local budget ---------- */
function tkToBudget() {
  const { ev, ts, books } = TK.cache, w = S.ws, s = tkStats(ts);
  const match = w.events.find(e => e.ticketEventId === ev.id) || w.events.find(e => e.name.trim().toLowerCase() === ev.name.trim().toLowerCase());
  const m = modal('Copy to budget', `<p style="margin-top:0">Adds the ticket income to <b>${esc(w.name)} ${w.year}</b> and puts the ticket book record in the budget book. Running it again updates the same entries.</p>
  <table class="tbl"><tr><td>Paid tickets</td><td class="n">${s.sold}</td></tr><tr><td>Free tickets</td><td class="n">${s.free}</td></tr><tr><td><b>Ticket income</b></td><td class="n"><b>Rs. ${money(s.money)}</b></td></tr></table>
  <label class="f" style="margin-top:12px"><span>Budget event</span><select name="ev"><option value="__new">+ New event “${esc(ev.name)}”</option>${w.events.map(e => `<option value="${e.id}" ${match && match.id === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
  <label class="f"><span>Money received into</span><select name="acc">${accOptions((w.accounts.find(a => a.type === 'cash') || w.accounts[0] || {}).id)}</select></label>`, '<button class="btn ghost" data-x>Cancel</button><button class="btn" data-save>Copy</button>');
  $('[data-save]', m.el).onclick = async () => {
    let e = w.events.find(x => x.id === val(m.el, 'ev'));
    if (!e) { e = { id: uid(), name: ev.name, date: (ev.starts_at || today()).slice(0, 10), link: '', notes: '' }; w.events.push(e); }
    e.ticketEventId = ev.id;
    // ticket book record: one line per book and seller
    const rows = []; books.forEach(b => { const bt = ts.filter(t => t.book_id === b.id && ['sold', 'free'].includes(t.status)); const g = {}; bt.forEach(t => { const k = (t.sold_by_name || '—') + '|' + (t.collected_by || ''); (g[k] ||= { by: t.sold_by_name || '—', col: t.collected_by || '', paid: 0, free: 0, amt: 0 }); t.status === 'free' ? g[k].free++ : (g[k].paid++, g[k].amt += +t.amount); }); Object.values(g).forEach(r => rows.push({ book: b.label, ...r, amt: r2(r.amt) })); });
    e.ticketRecord = { price: +ev.price, rows, paid: s.sold, free: s.free, total: s.money, updated: today() };
    const src = 'tickets:' + ev.id; let t = w.txns.find(x => x.src === src);
    if (!t) { t = { id: uid(), src, type: 'in', created: Date.now(), bills: [] }; w.txns.push(t); }
    Object.assign(t, { date: (ev.starts_at || today()).slice(0, 10), amount: s.money, accountId: val(m.el, 'acc'), eventId: e.id, desc: 'Ticket sales', remarks: `${s.sold} tickets × Rs. ${money(ev.price)}${s.free ? `; ${s.free} free` : ''}` });
    await save(); m.close(); toast('Copied to your budget');
  };
}

/* ---------- actions ---------- */
Object.assign(ACT, {
  'tk-mode': el => { tkHost().innerHTML = tkLoginForm(el.dataset.m); tkBindLogin(); },
  'tk-out': async () => { try { await tkClient().auth.signOut(); } catch { } TK.orgs = null; TK.user = null; tkPortal(); },
  'tk-newev': () => tkEventForm(), 'tk-editev': () => tkEventForm(TK.cache.ev),
  'tk-tab': el => tkTab(el.dataset.t), 'tk-ticket': el => tkTicketModal(el.dataset.id), 'tk-order': el => tkOrderModal(el.dataset.id),
  'tk-book': el => { sessionStorage.setItem('tk_tab', 'all'); tkTab('all'); const b = TK.cache.books.find(x => x.id === el.dataset.b); setTimeout(() => { const i = $('#tkq'); if (i && b) { const bt = TK.cache.ts.filter(t => t.book_id === b.id); $('#tkl').innerHTML = bt.map(tkRow).join(''); } }, 0); },
  'tk-addbooks': () => tkAddBooks(false), 'tk-addextra': () => tkAddBooks(true), 'tk-buylink': tkBuyLinkModal, 'tk-print': tkPrintBooks, 'tk-tobudget': tkToBudget,
  'tk-addmem': tkAddMember, 'tk-delmem': async el => { if (!confirm('Remove this person from the ticket team?')) return; try { await q(tkClient().from('members').delete().eq('id', el.dataset.id)); tkPortal(); } catch (e) { tkErr(e); } },
  'tk-door': tkDoorSale,
  'tk-refresh': () => { TK.orgs = null; tkPortal(); },
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'neworg') return; e.preventDefault();
  try { const id = await rpc('bb_create_org', { p_name: e.target.org.value, p_my_name: e.target.me.value }); localStorage.setItem('bb_org', id); TK.orgs = null; tkPortal(); } catch (err) { tkErr(err); }
});
