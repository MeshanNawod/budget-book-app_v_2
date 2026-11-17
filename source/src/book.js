'use strict';
/* Builds the Budget Book PDF in the same layout as the printed Vibhava Budget Book. */
async function buildBook(ws, opt = {}) {
  try { await Promise.all([document.fonts.load('16px "Noto Sans Sinhala"'), document.fonts.load('bold 16px "Noto Sans Sinhala"')]); } catch { }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, H = 297, L = 18, R = 192, CW = R - L, TOP = 50, BOT = 276, PT = 0.3528;
  const soc = ws.kind === 'society', T = terms(ws), c = calc(ws);
  const name = ws.name || 'Budget', year = ws.year;
  const pb = ws.preparedBy || {};
  const BLACK = [0, 0, 0], GREY = [95, 95, 95], LINK = [20, 20, 20];
  let y = TOP;

  /* ---------- text (non-Latin text such as Sinhala is drawn through a canvas) ---------- */
  const isCx = s => /[^\x20-\x7E\xA0-\xFF–—‘’“”•…€]/.test(s);
  const FAM = '"Noto Sans Sinhala","Iskoola Pota","Nirmala UI","Sinhala Sangam MN",Arial,sans-serif';
  const cvCache = new Map(); let cvN = 0;
  function cvText(s, size, bold, col) {
    const key = `${s}|${size}|${bold}|${col}`; if (cvCache.has(key)) return cvCache.get(key);
    const K = 12, fp = size * PT * K, font = `${bold ? 'bold ' : ''}${fp}px ${FAM}`;
    const g0 = document.createElement('canvas').getContext('2d'); g0.font = font;
    const wpx = Math.ceil(g0.measureText(s).width) + 4, hpx = Math.ceil(fp * 1.55);
    const cv = document.createElement('canvas'); cv.width = wpx; cv.height = hpx;
    const g = cv.getContext('2d'); g.font = font; g.fillStyle = `rgb(${col.join(',')})`; g.textBaseline = 'alphabetic'; g.fillText(s, 2, fp * 1.12);
    const r = { url: cv.toDataURL('image/png'), w: wpx / K, h: hpx / K, asc: fp * 1.12 / K, alias: 'cv' + (cvN++) };
    cvCache.set(key, r); return r;
  }
  function font(o) { doc.setFont('helvetica', o.bold ? 'bold' : o.italic ? 'italic' : 'normal'); doc.setFontSize(o.size || 10); doc.setTextColor(...(o.color || BLACK)); }
  function tw(s, o = {}) { s = String(s ?? ''); if (isCx(s)) return cvText(s, o.size || 10, o.bold, o.color || BLACK).w; font(o); return doc.getTextWidth(s); }
  function tx(s, x, yy, o = {}) {
    s = String(s ?? ''); if (!s) return 0; font(o);
    if (!isCx(s)) { doc.text(s, x, yy, { align: o.align || 'left' }); return doc.getTextWidth(s); }
    const im = cvText(s, o.size || 10, o.bold, o.color || BLACK); let k = 1;
    if (o.maxWidth && im.w > o.maxWidth) k = o.maxWidth / im.w;
    const w = im.w * k; let X = x; if (o.align === 'center') X = x - w / 2; else if (o.align === 'right') X = x - w;
    doc.addImage(im.url, 'PNG', X, yy - im.asc * k, w, im.h * k, im.alias, 'FAST'); return w;
  }
  function wrap(s, maxW, o) { s = String(s ?? ''); if (isCx(s)) return [s]; font(o); return doc.splitTextToSize(s, maxW); }
  function para(s, x, o = {}) { const lines = wrap(s, o.maxWidth || CW, o), lh = (o.size || 10) * PT * 1.45; lines.forEach(l => { ensure(lh); tx(l, x, y, o); y += lh; }); }
  // rich line: runs [{t,bold}] wrapped within width
  function runs(list, x, maxW, o = {}) {
    const size = o.size || 9.5, lh = size * PT * 1.45, words = [];
    list.forEach(r => String(r.t).split(/(\s+)/).forEach(w => w && words.push({ w, bold: r.bold })));
    let cx = x;
    for (const p of words) { const wd = tw(p.w, { size, bold: p.bold }); if (cx + wd > x + maxW && /\S/.test(p.w) && cx > x) { y += lh; cx = x; } if (cx === x && !/\S/.test(p.w)) continue; tx(p.w, cx, y, { size, bold: p.bold }); cx += wd; }
    y += lh;
  }

  /* ---------- images ---------- */
  const fmt = d => /^data:image\/png/.test(d) ? 'PNG' : 'JPEG';
  function fit(data, x, yy, maxW, maxH, align = 'left', alias) {
    if (!data) return 0; const p = doc.getImageProperties(data); const k = Math.min(maxW / p.width, maxH / p.height); const w = p.width * k, h = p.height * k;
    let X = x; if (align === 'center') X = x - w / 2; else if (align === 'right') X = x - w;
    doc.addImage(data, fmt(data), X, yy + (maxH - h) / 2, w, h, alias, 'FAST'); return w;
  }

  /* ---------- page furniture ---------- */
  function header() {
    if (ws.uniLogo) fit(ws.uniLogo, L, 9, 28, 25, 'left', 'uni');
    if (ws.logo) fit(ws.logo, R, 9, 28, 25, 'right', 'soc');
    if (ws.titleImg) fit(ws.titleImg, W / 2, 9.5, 118, 22, 'center', 'title');
    else { tx(name, W / 2, 20, { size: 17, bold: true, align: 'center', maxWidth: 118 }); if (ws.org) tx(ws.org, W / 2, 27.5, { size: 11, align: 'center', maxWidth: 118 }); }
    if (ws.contact) tx(ws.contact, W / 2, 38.2, { size: 8.5, align: 'center', color: [40, 40, 40] });
    doc.setDrawColor(0); doc.setLineWidth(0.6); doc.line(L, 41, R, 41); doc.setLineWidth(0.2); doc.line(L, 42.1, R, 42.1);
  }
  function footer(n) {
    doc.setDrawColor(0); doc.setLineWidth(0.25); doc.line(L, 283, R, 283);
    tx(`${name} | Budget Book ${year}`, L, 288, { size: 8, color: [60, 60, 60] }); tx(`Page ${n}`, R, 288, { size: 8, align: 'right', color: [60, 60, 60] });
  }
  const page = () => doc.getNumberOfPages();
  function newPage() { doc.addPage(); y = TOP; }
  function ensure(h) { if (y + h > BOT) newPage(); }
  const toc = [];
  function title(s, tocLevel = 1, tocText) {
    toc.push({ t: tocText || s.replace(/[“”]/g, ''), p: page(), lvl: tocLevel });
    const lines = wrap(s, CW - 10, { size: 14, bold: true });
    lines.forEach(l => { tx(l, W / 2, y + 2, { size: 14, bold: true, align: 'center', maxWidth: CW }); y += 6.5; }); y += 1.5;
  }
  const sub = s => { tx(s, W / 2, y, { size: 10, align: 'center', maxWidth: CW }); y += 5.2; };
  const heading = s => { ensure(14); y += 2; tx(s, L, y, { size: 11.5, bold: true }); y += 4; };
  function rule(x1, x2, yy, w = 0.4) { doc.setDrawColor(0); doc.setLineWidth(w); doc.line(x1, yy, x2, yy); }

  /* ---------- tables ---------- */
  function table(head, body, o = {}) {
    const bold = new Set(o.bold || []);
    doc.autoTable({
      startY: y, head: head ? [head] : undefined, body, theme: 'grid', showHead: 'everyPage',
      margin: { left: o.left ?? L, right: o.width ? W - (o.left ?? L) - o.width : W - R, top: TOP, bottom: H - BOT },
      tableWidth: o.width || 'auto',
      styles: { font: 'helvetica', fontSize: o.size || 9, textColor: 0, lineColor: [0, 0, 0], lineWidth: 0.2, cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 }, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [232, 232, 232], textColor: 0, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fillColor: false }, alternateRowStyles: { fillColor: false },
      columnStyles: o.cols || {},
      didParseCell: d => {
        if (d.section === 'body' && bold.has(d.row.index)) { d.cell.styles.fontStyle = 'bold'; if (o.shadeBold) d.cell.styles.fillColor = [232, 232, 232]; }
        const raw = d.cell.raw && typeof d.cell.raw === 'object' && 'content' in d.cell.raw ? d.cell.raw.content : d.cell.raw;
        if (typeof raw === 'string' && isCx(raw)) { d.cell.__cx = raw; d.cell.text = [raw.replace(/[^\x20-\x7E]/g, 'n')]; }
      },
      willDrawCell: d => { if (d.cell.__cx) d.cell.text = []; },
      didDrawCell: d => {
        const cell = d.cell;
        if (cell.__cx) { const sz = cell.styles.fontSize, im = cvText(cell.__cx, sz, cell.styles.fontStyle === 'bold', BLACK); const maxW = cell.width - 4; const k = Math.min(1, maxW / im.w); const w = im.w * k; let X = cell.x + 2; if (cell.styles.halign === 'center') X = cell.x + (cell.width - w) / 2; else if (cell.styles.halign === 'right') X = cell.x + cell.width - 2 - w; doc.addImage(im.url, 'PNG', X, cell.y + cell.height / 2 + sz * PT * 0.36 - im.asc * k, w, im.h * k, im.alias, 'FAST'); }
        if (o.links && d.section === 'body') { const u = o.links(d.row.index, d.column.index); if (u) doc.link(cell.x, cell.y, cell.width, cell.height, { url: u }); }
      },
    });
    y = doc.lastAutoTable.finalY + (o.after ?? 6);
  }
  const num = { halign: 'right' }, ctr = { halign: 'center' };

  /* ---------- QR ---------- */
  function qr(url, x, yy, size) {
    try { qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; } catch { }
    const q = qrcode(0, 'M'); q.addData(url); q.make(); const n = q.getModuleCount(), s = size / n;
    doc.setFillColor(0, 0, 0);
    for (let r = 0; r < n; r++) { let k = 0; while (k < n) { if (q.isDark(r, k)) { let e = k; while (e < n && q.isDark(r, e)) e++; doc.rect(x + k * s, yy + r * s, (e - k) * s, s + 0.02, 'F'); k = e; } else k++; } }
    doc.link(x, yy, size, size, { url });
  }
  function linkText(s, x, yy, url, o = {}) { const w = tx(s, x, yy, { ...o, color: LINK }); doc.setDrawColor(...LINK); doc.setLineWidth(0.2); doc.line(x, yy + 0.8, x + w, yy + 0.8); doc.link(x, yy - 3.5, w, 4.5, { url }); }
  function qrBox(ev) {
    ensure(36); const h = 30; doc.setDrawColor(0); doc.setLineWidth(0.3); doc.rect(L, y, CW, h);
    qr(ev.link, L + 3, y + 3, h - 6); const x = L + h + 2, y0 = y; y = y0 + 8;
    tx('Bills and receipts', x, y, { size: 10.5, bold: true }); y += 5.5;
    runs([{ t: 'Scan the QR code to view the bills for ' }, { t: ev.name, bold: true }, { t: ' on Google Drive.' }], x, R - x - 4, { size: 9.5 });
    y += 0.8; linkText('Open bills folder', x, y, ev.link, { size: 9.5 });
    y = y0 + h + 7;
  }

  /* ---------- signatures ---------- */
  function signatures() {
    const sg = (ws.signers || []).filter(s => s.name || s.role); if (!soc || !sg.length) return;
    ensure(44); y += 4; tx('Prepared and certified by:', L, y, { size: 10, bold: true }); y += 22;
    const cw = CW / Math.max(sg.length, 3);
    sg.forEach((s, i) => {
      const x = L + i * cw, w = cw - 10;
      doc.setDrawColor(0); doc.setLineWidth(0.3); doc.setLineDashPattern([0.5, 0.9], 0); doc.line(x, y, x + w, y); doc.setLineDashPattern([], 0);
      tx(s.name, x, y + 5, { size: 9.5, bold: true, maxWidth: w }); tx(s.role, x, y + 10, { size: 9, maxWidth: w }); tx(name + '.', x, y + 15, { size: 9, maxWidth: w });
    });
    y += 22;
  }

  /* ---------- data ---------- */
  const evAll = [...ws.events].sort(byDate).map(e => c.ev[e.id]);
  const evTx = evAll.filter(e => e.n), evNo = evAll.filter(e => !e.n);
  const projects = [...evTx]; if (c.gen.n) projects.push(c.gen);
  const txOf = id => ws.txns.filter(t => t.type !== 'transfer' && (id ? t.eventId === id : !ws.events.some(e => e.id === t.eventId))).sort(byDate);
  const accName = id => (ws.accounts.find(a => a.id === id) || {}).name || '';
  const mode = id => { const a = ws.accounts.find(a => a.id === id); return a ? (a.type === 'bank' ? 'Bank' : 'Cash') : ''; };

  /* ================= COVER ================= */
  {
    const logos = soc ? [ws.uniLogo, ws.logo].filter(Boolean) : [ws.logo].filter(Boolean);
    if (logos.length) { const hh = 32, ws_ = logos.map(d => { const p = doc.getImageProperties(d); return Math.min(46, p.width * hh / p.height); }); const gap = 16, tot = ws_.reduce((a, b) => a + b, 0) + gap * (logos.length - 1); let x = W / 2 - tot / 2; logos.forEach((d, i) => { fit(d, x, 26, ws_[i], hh, 'left', i === 0 && soc ? 'uni' : 'soc'); x += ws_[i] + gap; }); }
    let yy = logos.length ? 72 : 60;
    if (ws.titleImg) { fit(ws.titleImg, W / 2, yy - 6, 150, 30, 'center', 'title'); yy += 32; }
    else { wrap(name, 160, { size: 24, bold: true }).forEach(l => { tx(l, W / 2, yy + 4, { size: 24, bold: true, align: 'center', maxWidth: 170 }); yy += 10; }); if (ws.org) { yy += 1; tx(ws.org, W / 2, yy + 2, { size: 13, align: 'center', maxWidth: 170 }); yy += 8; } }
    rule(L + 22, R - 22, yy + 4, 0.5); yy += 26;
    doc.setCharSpace(1.6); tx('BUDGET BOOK', W / 2, yy, { size: 30, bold: true, align: 'center' }); doc.setCharSpace(0);
    yy += 17; tx(String(year), W / 2, yy, { size: 40, bold: true, align: 'center', color: [70, 70, 70] });
    yy += 11; tx(soc ? 'Budget Summary and Event Financial Reports' : 'Budget Summary and Financial Reports', W / 2, yy, { size: 12, align: 'center' });
    rule(L + 22, R - 22, yy + 6, 0.5); yy += 20;
    const com = (ws.committee || []).filter(m => m.name);
    if (soc && com.length) {
      tx(`Executive Committee ${year}`, W / 2, yy, { size: 13, bold: true, align: 'center' }); yy += 10;
      const cols = com.length > 12 ? 3 : 2, cwid = 150 / cols, step = com.length > 12 ? 11 : 12.5;
      com.forEach((m, i) => { const col = i % cols, row = Math.floor(i / cols); const x = W / 2 - 75 + cwid * col + cwid / 2, yr = yy + row * step; doc.setCharSpace(0.4); tx(String(m.role).toUpperCase(), x, yr, { size: 7.5, align: 'center', color: GREY, maxWidth: cwid - 4 }); doc.setCharSpace(0); tx(m.name, x, yr + 5, { size: 10.5, bold: true, align: 'center', maxWidth: cwid - 4 }); });
    }
    const pbl = pb.name ? `Prepared by ${pb.name}${pb.role ? ', ' + pb.role : ''} | ${opt.month || ''}` : (opt.month || '');
    tx(pbl, W / 2, 278, { size: 9.5, align: 'center', color: [70, 70, 70] });
  }

  /* ================= CONTENTS (reserved, filled at the end) ================= */
  const nToc = 2 + projects.length + (ws.events.some(e => e.link) ? 1 : 0) + (opt.ledgers !== false ? 1 + ws.accounts.length : 0) + (opt.noexp !== false && evNo.length ? 1 : 0) + 1;
  const tocPages = Math.max(1, Math.ceil(nToc / 27)); const tocStart = page() + 1;
  for (let i = 0; i < tocPages; i++) newPage();

  /* ================= BUDGET ================= */
  newPage();
  title(`Budget for ${year}`, 1, `Budget for ${year}`);
  if (soc && ws.org) sub(`${name}, ${ws.org}`);
  y += 2;
  const BW = 120, BX = W / 2 - BW / 2;
  table([{ content: 'Balance brought forward from the previous term', colSpan: 2 }], [['In account', money(c.openBank)], ['In hand', money(c.openCash)], ['Total', money(c.openBank + c.openCash)]], { left: BX, width: BW, cols: { 1: { ...num, cellWidth: 40 } }, bold: [2] });
  const pRows = projects.map((e, i) => [String(i + 1), e.name, money(e.exp), money(e.inc), money(e.inc - e.exp)]);
  pRows.push(['', 'Total', money(c.exp), money(c.inc), money(c.inc - c.exp)]);
  table(['No', soc ? 'Projects' : 'Categories', 'Expenditure (Rs.)', 'Income/Donations (Rs.)', 'Profit (Rs.)'], pRows,
    { cols: { 0: { ...ctr, cellWidth: 11 }, 2: { ...num, cellWidth: 31 }, 3: { ...num, cellWidth: 36 }, 4: { ...num, cellWidth: 29 } }, bold: [pRows.length - 1], links: (r, col) => col === 1 && projects[r] ? projects[r].link : null });
  table([{ content: 'Balance for the current term', colSpan: 2 }], [['Total income', money(c.inc)], ['Total expenditure', money(c.exp)], ['Profit', money(c.inc - c.exp)]], { left: BX, width: BW, cols: { 1: { ...num, cellWidth: 40 } }, bold: [2] });
  table([{ content: 'Balance carried forward to the next term', colSpan: 2 }], [['In account', money(c.bank)], ['In hand', money(c.cash)], ['Total', money(c.bank + c.cash)]], { left: BX, width: BW, cols: { 1: { ...num, cellWidth: 40 } }, bold: [2] });
  const holders = ws.accounts.map(a => c.acc[a.id]);
  if (holders.length > 1 || holders.some(a => a.type === 'cash')) {
    ensure(30); tx('Money held at the end of the term', W / 2, y + 1, { size: 10.5, bold: true, align: 'center' }); y += 4;
    table(['Account', 'Held by', 'Balance (Rs.)'], [...holders.map(a => [a.name, a.holder || '', money(a.bal)]), ['Total', '', money(c.bank + c.cash)]], { left: BX - 10, width: BW + 20, cols: { 2: { ...num, cellWidth: 36 } }, bold: [holders.length] });
  }
  signatures();

  /* ================= BILLS QR PAGE ================= */
  const linked = evAll.filter(e => e.link);
  if (linked.length) {
    newPage(); title('Bills and Receipts');
    sub('Scan a QR code to open the bills and receipts folder on Google Drive.'); y += 4;
    const cols = 4, cw = CW / cols, qs = 30, rh = 54;
    linked.forEach((e, i) => {
      const col = i % cols; if (col === 0 && i) y += rh; if (col === 0) ensure(rh);
      const x = L + col * cw, cxm = x + cw / 2; qr(e.link, cxm - qs / 2, y, qs);
      const lines = wrap(e.name, cw - 4, { size: 8.5, bold: true }).slice(0, 2);
      lines.forEach((l, k) => tx(l, cxm, y + qs + 5 + k * 3.8, { size: 8.5, bold: true, align: 'center', maxWidth: cw - 4 }));
      const lw = tw('Open bills', { size: 8 }); linkText('Open bills', cxm - lw / 2, y + qs + 6 + lines.length * 3.8, e.link, { size: 8 });
    });
    y += rh;
  }

  /* ================= EVENT REPORTS ================= */
  const imgCache = {};
  let firstRep = true;
  for (const e of projects) {
    newPage();
    if (firstRep) { toc.push({ t: soc ? 'Event Financial Reports' : 'Financial Reports', p: page(), lvl: 1 }); firstRep = false; }
    toc.push({ t: e.name, p: page(), lvl: 2 });
    const tl = wrap(`“${e.name}” ${soc ? 'Event ' : ''}Financial Report`, CW - 10, { size: 14, bold: true });
    tl.forEach(l => { tx(l, W / 2, y + 2, { size: 14, bold: true, align: 'center', maxWidth: CW }); y += 6.5; }); y += 1.5;
    if (e.date) sub(`${soc ? 'Event Date' : 'Date'}: ${dLong(e.date)}`);
    if (soc && pb.role) sub(`Prepared by: ${pb.role}`);
    y += 2; heading('Summary');
    table(['Total Income (Rs.)', 'Total Expenses (Rs.)', 'Balance (Rs.)'], [[money(e.inc), money(e.exp), money(e.inc - e.exp)]], { cols: { 0: ctr, 1: ctr, 2: ctr } });
    heading('Detailed Report');
    let bal = 0; const list = txOf(e.id);
    const rows = list.map(t => { const i = t.type === 'in' ? +t.amount : 0, o = t.type === 'out' ? +t.amount : 0; bal = r2(bal + i - o); return [dShort(t.date), t.desc, i ? money(i) : '', o ? money(o) : '', money(bal), mode(t.accountId), t.remarks || '']; });
    rows.push(['', 'Total', money(e.inc), money(e.exp), money(e.inc - e.exp), '', '']);
    table(['Date', 'Description', 'Income (Rs.)', 'Expense (Rs.)', 'Balance (Rs.)', 'Mode', 'Remarks'], rows,
      { size: 8.5, cols: { 0: { cellWidth: 19 }, 2: { ...num, cellWidth: 21 }, 3: { ...num, cellWidth: 21 }, 4: { ...num, cellWidth: 21 }, 5: { ...ctr, cellWidth: 13 }, 6: { cellWidth: 30 } }, bold: [rows.length - 1] });
    if (e.link) qrBox(e);
    if (e.ticketRecord && e.ticketRecord.rows.length) {
      const R = e.ticketRecord; heading('Ticket Books – Detailed Record');
      const body = [], byBook = {}; R.rows.forEach(r => (byBook[r.book] ||= []).push(r));
      Object.entries(byBook).forEach(([bk, rs]) => { const tot = rs.reduce((a, r) => a + r.amt, 0); rs.forEach((r, i) => body.push([...(i ? [] : [{ content: bk, rowSpan: rs.length, styles: { halign: 'center' } }]), r.by, String(r.paid || ''), String(r.free || ''), money(r.amt), ...(i ? [] : [{ content: money(tot), rowSpan: rs.length, styles: { halign: 'right' } }]), r.col])); });
      body.push(['', 'Total', String(R.paid), String(R.free), money(R.total), money(R.total), '']);
      table(['Book No.', 'Sold by / at', 'Paid Tickets', 'Free Tickets', 'Amount (Rs.)', 'Book Total (Rs.)', 'Money with'], body,
        { size: 8, cols: { 0: { cellWidth: 16 }, 2: { ...ctr, cellWidth: 15 }, 3: { ...ctr, cellWidth: 15 }, 4: { ...num, cellWidth: 24 }, 5: { ...num, cellWidth: 25 }, 6: { cellWidth: 30 } }, bold: [body.length - 1] });
      para(`Ticket income: ${R.paid} paid tickets × Rs. ${money(R.price)} = Rs. ${money(R.total)}${R.free ? `. ${R.free} free tickets are not counted as income.` : '.'}`, L, { size: 8.5, color: GREY });
      y += 2;
    }
    if (opt.photos) {
      const pics = []; for (const t of list) for (const id of t.bills || []) { const d = imgCache[id] ?? (imgCache[id] = await getImg(id)); if (d) pics.push({ d, id, cap: `${dShort(t.date)} · ${t.desc || ''}` }); }
      if (pics.length) {
        heading('Attached Bills'); y += 1;
        const cols = 3, gap = 5, bw = (CW - gap * (cols - 1)) / cols, bh = 70;
        pics.forEach((p, i) => {
          const col = i % cols; if (col === 0 && i) y += bh + 10; if (col === 0) ensure(bh + 8);
          const x = L + col * (bw + gap); doc.setDrawColor(170); doc.setLineWidth(0.2); doc.rect(x, y, bw, bh);
          fit(p.d, x + bw / 2, y + 1.5, bw - 3, bh - 3, 'center', 'b' + p.id);
          const cap = wrap(p.cap, bw, { size: 7.5 })[0]; tx(cap, x, y + bh + 4, { size: 7.5, color: GREY, maxWidth: bw });
        });
        y += bh + 12;
      }
    }
  }

  /* ================= ACCOUNT RECORDS ================= */
  if (opt.ledgers !== false && ws.accounts.length) {
    let first = true;
    for (const a of ws.accounts) {
      newPage();
      const ttl = a.type === 'bank' ? (ws.accounts.filter(x => x.type === 'bank').length > 1 ? `Bank Account Record – ${a.name}` : 'Bank Account Record') : (ws.accounts.filter(x => x.type === 'cash').length > 1 ? `Cash Book – ${a.holder || a.name}` : 'Cash Book');
      if (first) { toc.push({ t: 'Account Records', p: page(), lvl: 1 }); first = false; }
      title(ttl, 2);
      sub(`${a.name}${a.holder ? ' · Held by ' + a.holder : ''}`); y += 2;
      let bal = +a.opening || 0;
      const rows = [['', 'Balance brought forward', '', '', '', money(bal)]];
      let ti = 0, to = 0;
      for (const t of [...ws.txns].sort(byDate)) {
        let i = 0, o = 0, d = t.desc;
        if (t.type === 'transfer') { if (t.accountId === a.id) { o = +t.amount; d = d || `Transfer to ${accName(t.toAccountId)}`; } else if (t.toAccountId === a.id) { i = +t.amount; d = (t.desc && !/^Transfer to /.test(t.desc)) ? t.desc : `Transfer from ${accName(t.accountId)}`; } else continue; }
        else if (t.accountId === a.id) { if (t.type === 'in') i = +t.amount; else o = +t.amount; } else continue;
        bal = r2(bal + i - o); ti += i; to += o;
        rows.push([dShort(t.date), d, t.type === 'transfer' ? 'Transfer' : ((ws.events.find(e => e.id === t.eventId) || {}).name || 'General'), i ? money(i) : '', o ? money(o) : '', money(bal)]);
      }
      rows.push(['', 'Total / Closing balance', '', money(ti), money(to), money(bal)]);
      table(['Date', 'Description', soc ? 'Event' : 'Category', 'In (Rs.)', 'Out (Rs.)', 'Balance (Rs.)'], rows,
        { size: 8.5, cols: { 0: { cellWidth: 19 }, 2: { cellWidth: 36 }, 3: { ...num, cellWidth: 22 }, 4: { ...num, cellWidth: 22 }, 5: { ...num, cellWidth: 24 } }, bold: [rows.length - 1] });
    }
  }

  /* ================= NO EXPENDITURE ================= */
  if (opt.noexp !== false && evNo.length) {
    newPage(); title(`${T.evs} with No Expenditure`);
    para(soc ? 'The following events were held during the year without any income or expenditure.' : 'The following categories had no income or expenditure during the year.', L, { size: 10 }); y += 3;
    table(['No', T.ev, 'Date', 'Remarks'], evNo.map((e, i) => [String(i + 1), e.name, dLong(e.date), e.notes || 'No expenditure']), { cols: { 0: { ...ctr, cellWidth: 12 }, 2: { cellWidth: 38 }, 3: { cellWidth: 46 } } });
  }
  if (soc) { signatures(); }

  /* ================= CONTENTS ================= */
  {
    let p = tocStart; doc.setPage(p); y = TOP; title('Contents'); toc.pop(); y += 6;
    const lh = 7.6;
    for (const e of toc) {
      if (y > BOT - 4) { p++; doc.setPage(p); y = TOP + 4; }
      const x = e.lvl === 1 ? L : L + 7, o = { size: e.lvl === 1 ? 11 : 10, bold: e.lvl === 1 };
      const pn = String(e.p), pw = tw(pn, o);
      let t = e.t; const maxT = R - x - pw - 10; let w = tw(t, o); if (!isCx(t)) while (w > maxT && t.length > 4) { t = t.slice(0, -2); w = tw(t + '…', o); if (w <= maxT) t += '…'; }
      w = tx(t, x, y, { ...o, maxWidth: maxT }); tx(pn, R, y, { ...o, align: 'right' });
      const x1 = x + w + 2, x2 = R - pw - 2;
      if (x2 > x1) { doc.setDrawColor(110); doc.setLineWidth(0.35); doc.setLineDashPattern([0.01, 1.3], 0); doc.setLineCap('round'); doc.line(x1, y - 0.5, x2, y - 0.5); doc.setLineDashPattern([], 0); doc.setLineCap('butt'); }
      doc.link(x, y - 4.5, R - x, 6, { pageNumber: e.p });
      y += lh;
    }
  }

  /* ================= HEADERS / FOOTERS ================= */
  const n = page();
  for (let i = 2; i <= n; i++) { doc.setPage(i); header(); footer(i); }
  doc.setProperties({ title: `${name} – Budget Book ${year}`, author: pb.name || name, creator: 'Budget Book' });
  return doc.output('blob');
}
