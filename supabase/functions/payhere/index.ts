// Budget Book – PayHere card payments (Supabase Edge Function)
// Deploy with JWT verification OFF (PayHere's server calls this without a login).
// Needs one secret:  PAYHERE_SECRET = your PayHere "Merchant Secret" for this website's domain.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'content-type': 'application/json' } });
// MD5 (PayHere signs with MD5; Web Crypto does not offer it)
function md5hex(str: string): string {
  const b = new TextEncoder().encode(str), n = ((b.length + 8) >> 6) + 1, w = new Uint32Array(n * 16);
  for (let i = 0; i < b.length; i++) w[i >> 2] |= b[i] << ((i % 4) * 8);
  w[b.length >> 2] |= 0x80 << ((b.length % 4) * 8); w[n * 16 - 2] = b.length * 8;
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const R = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let o = 0; o < w.length; o += 16) {
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const t = D; D = C; C = B;
      const x = (A + F + K[i] + w[o + g]) >>> 0, r = R[(i >> 4) * 4 + (i % 4)];
      B = (B + ((x << r) | (x >>> (32 - r)))) >>> 0; A = t;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map(v => [0, 8, 16, 24].map(s => ((v >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}
const md5 = async (s: string) => md5hex(s).toUpperCase();
const amt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const secret = Deno.env.get('PAYHERE_SECRET') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!, key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const type = req.headers.get('content-type') ?? '';

  // 1) The website asks to start a card payment for an order
  if (type.includes('application/json')) {
    const { action, order_id, return_url, cancel_url } = await req.json().catch(() => ({}));
    if (action !== 'start' || !order_id) return json({ error: 'Bad request' }, 400);
    if (!secret) return json({ error: 'Card payments are not set up yet' }, 400);
    const { data: o } = await db.from('orders').select('*, tevents(name, payhere_merchant_id, payhere_sandbox, pay_card)').eq('id', order_id).single();
    if (!o || o.method !== 'card' || o.status !== 'pending') return json({ error: 'This order cannot be paid by card' }, 400);
    const ev = o.tevents; if (!ev?.pay_card || !ev.payhere_merchant_id) return json({ error: 'Card payments are off for this event' }, 400);
    const amount = amt(Number(o.amount));
    const hash = await md5(ev.payhere_merchant_id + o.id + amount + 'LKR' + await md5(secret));
    const [first, ...rest] = String(o.buyer_name).trim().split(/\s+/);
    return json({
      sandbox: !!ev.payhere_sandbox, merchant_id: ev.payhere_merchant_id,
      return_url, cancel_url, notify_url: `${url}/functions/v1/payhere`,
      order_id: o.id, items: `${ev.name} – ${o.qty} ticket${o.qty > 1 ? 's' : ''}`, amount, currency: 'LKR', hash,
      first_name: first || 'Buyer', last_name: rest.join(' ') || '-', email: o.buyer_email || 'noreply@example.com', phone: o.buyer_phone,
      address: '-', city: '-', country: 'Sri Lanka',
    });
  }

  // 2) PayHere's server reports the result (form post)
  const f = await req.formData().catch(() => null); if (!f) return json({ error: 'Bad request' }, 400);
  const g = (k: string) => String(f.get(k) ?? '');
  const merchant = g('merchant_id'), orderId = g('order_id'), payAmount = g('payhere_amount'), cur = g('payhere_currency'), code = g('status_code');
  const expected = await md5(merchant + orderId + payAmount + cur + code + await md5(secret));
  if (!secret || expected !== g('md5sig').toUpperCase()) return new Response('bad signature', { status: 400 });
  const { data: o } = await db.from('orders').select('*, tevents(price, payhere_merchant_id)').eq('id', orderId).single();
  if (!o || o.tevents?.payhere_merchant_id !== merchant) return new Response('unknown order', { status: 400 });
  if (code === '2') {
    if (cur !== 'LKR' || amt(Number(payAmount)) !== amt(Number(o.amount))) return new Response('amount mismatch', { status: 400 });
    if (o.status === 'pending') {
      await db.from('orders').update({ status: 'paid', decided_at: new Date().toISOString(), decided_by: 'PayHere', note: 'Payment ID ' + g('payment_id') }).eq('id', o.id);
      await db.from('tickets').update({ status: 'sold', amount: o.tevents.price, collected_by: 'Card (PayHere)' }).eq('order_id', o.id).eq('status', 'pending');
    }
  } else if ((code === '-1' || code === '-2') && o.status === 'pending') {
    await db.from('orders').update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: 'PayHere', note: code === '-1' ? 'Cancelled by buyer' : 'Card payment failed' }).eq('id', o.id);
    await db.from('tickets').update({ status: 'void' }).eq('order_id', o.id);
  }
  return new Response('ok');
});
