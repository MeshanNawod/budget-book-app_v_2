-- =====================================================================
-- Budget Book – Ticketing database
-- Run this ONCE in Supabase:  SQL Editor  ->  New query  ->  paste  ->  Run
-- Safe to run again: it only creates what is missing.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.bb_code(n int default 10) returns text
language plpgsql volatile as $$
declare a text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(n); r text := ''; i int;
begin
  for i in 0..n-1 loop r := r || substr(a, (get_byte(b, i) % 32) + 1, 1); end loop;
  return r;
end $$;

-- ---------- tables ----------
create table if not exists public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  email text not null,
  name text not null default '',
  phone text not null default '',
  is_admin boolean not null default false,
  can_sell boolean not null default false,
  can_scan boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);

create table if not exists public.tevents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs on delete cascade,
  slug text not null unique default lower(public.bb_code(8)),
  name text not null,
  starts_at timestamptz,
  venue text not null default '',
  price numeric(10,2) not null default 0,
  book_size int not null default 100 check (book_size between 1 and 500),
  online_enabled boolean not null default false,
  online_limit int not null default 0,            -- 0 = no limit
  pay_bank boolean not null default true,
  pay_door boolean not null default true,
  pay_card boolean not null default false,
  bank_details text not null default '',
  payhere_merchant_id text not null default '',
  payhere_sandbox boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tevents on delete cascade,
  label text not null,                             -- "1", "2", ... "Additional", "Online"
  seq int not null,
  seller_id uuid references public.members on delete set null,
  unique (event_id, label)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tevents on delete cascade,
  ref text not null unique default public.bb_code(8),
  buyer_name text not null,
  buyer_phone text not null default '',
  buyer_email text not null default '',
  qty int not null check (qty between 1 and 10),
  amount numeric(10,2) not null,
  method text not null check (method in ('bank','door','card')),
  status text not null default 'pending' check (status in ('pending','reserved','paid','rejected','cancelled')),
  slip_path text,
  note text not null default '',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tevents on delete cascade,
  book_id uuid references public.books on delete cascade,
  serial int not null,                               -- printed ticket number
  code text not null unique default public.bb_code(10),  -- secret inside the QR code
  status text not null default 'unsold' check (status in ('unsold','sold','free','reserved','pending','void')),
  amount numeric(10,2) not null default 0,           -- money received for this ticket
  buyer_name text not null default '',
  buyer_phone text not null default '',
  buyer_email text not null default '',
  sold_by uuid references public.members on delete set null,
  sold_by_name text not null default '',
  collected_by text not null default '',             -- who holds the money
  channel text not null default 'book' check (channel in ('book','online','door')),
  order_id uuid references public.orders on delete set null,
  sold_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by text,
  unique (event_id, serial)
);
create index if not exists tickets_event_idx on public.tickets (event_id, serial);
create index if not exists tickets_book_idx on public.tickets (book_id);
create index if not exists orders_event_idx on public.orders (event_id, created_at);

-- ---------- who am I ----------
create or replace function public.bb_email() returns text
language sql stable security definer set search_path = public as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.bb_me(p_org uuid) returns public.members
language sql stable security definer set search_path = public as $$
  select * from public.members where org_id = p_org and lower(email) = public.bb_email() limit 1
$$;

create or replace function public.bb_is(p_org uuid, p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m
    where m.org_id = p_org and lower(m.email) = public.bb_email()
      and (p_role = 'any' or m.is_admin
           or (p_role = 'sell' and m.can_sell) or (p_role = 'scan' and m.can_scan)))
$$;

create or replace function public.bb_event_org(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$ select org_id from public.tevents where id = p_event $$;

-- ---------- security rules ----------
alter table public.orgs enable row level security;
alter table public.members enable row level security;
alter table public.tevents enable row level security;
alter table public.books enable row level security;
alter table public.orders enable row level security;
alter table public.tickets enable row level security;

drop policy if exists orgs_read on public.orgs;
create policy orgs_read on public.orgs for select using (public.bb_is(id, 'any'));
drop policy if exists orgs_admin on public.orgs;
create policy orgs_admin on public.orgs for update using (public.bb_is(id, 'admin'));

drop policy if exists members_read on public.members;
create policy members_read on public.members for select using (public.bb_is(org_id, 'any'));
drop policy if exists members_admin on public.members;
create policy members_admin on public.members for all using (public.bb_is(org_id, 'admin')) with check (public.bb_is(org_id, 'admin'));

drop policy if exists tevents_read on public.tevents;
create policy tevents_read on public.tevents for select using (public.bb_is(org_id, 'any'));
drop policy if exists tevents_admin on public.tevents;
create policy tevents_admin on public.tevents for all using (public.bb_is(org_id, 'admin')) with check (public.bb_is(org_id, 'admin'));

drop policy if exists books_read on public.books;
create policy books_read on public.books for select using (public.bb_is(public.bb_event_org(event_id), 'any'));
drop policy if exists books_admin on public.books;
create policy books_admin on public.books for all using (public.bb_is(public.bb_event_org(event_id), 'admin')) with check (public.bb_is(public.bb_event_org(event_id), 'admin'));

drop policy if exists orders_admin on public.orders;
create policy orders_admin on public.orders for select using (public.bb_is(public.bb_event_org(event_id), 'admin'));

-- admins and entrance staff see every ticket; sellers see the tickets in their own books
drop policy if exists tickets_read on public.tickets;
create policy tickets_read on public.tickets for select using (
  public.bb_is(public.bb_event_org(event_id), 'admin') or public.bb_is(public.bb_event_org(event_id), 'scan')
  or exists (select 1 from public.books b join public.members m on m.id = b.seller_id
             where b.id = tickets.book_id and lower(m.email) = public.bb_email()));
drop policy if exists tickets_admin on public.tickets;
create policy tickets_admin on public.tickets for update using (public.bb_is(public.bb_event_org(event_id), 'admin'));
drop policy if exists tickets_admin_del on public.tickets;
create policy tickets_admin_del on public.tickets for delete using (public.bb_is(public.bb_event_org(event_id), 'admin'));

-- ---------- functions used by the app ----------
-- Create a society (the caller becomes its admin)
create or replace function public.bb_create_org(p_name text, p_my_name text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  insert into public.orgs(name) values (trim(p_name)) returning id into o;
  insert into public.members(org_id, email, name, is_admin, can_sell, can_scan)
    values (o, public.bb_email(), coalesce(nullif(trim(p_my_name), ''), split_part(public.bb_email(), '@', 1)), true, true, true);
  return o;
end $$;

-- My societies and roles
create or replace function public.bb_my_orgs() returns table(org_id uuid, org_name text, member_id uuid, name text, is_admin boolean, can_sell boolean, can_scan boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, m.id, m.name, m.is_admin, m.can_sell, m.can_scan
  from public.members m join public.orgs o on o.id = m.org_id
  where lower(m.email) = public.bb_email() order by o.name
$$;

-- Add ticket books (numbered books, or one extra book such as "Additional")
create or replace function public.bb_add_books(p_event uuid, p_count int, p_size int default null, p_label text default null)
returns int language plpgsql security definer set search_path = public as $$
declare ev public.tevents; s int; nb int; next_serial int; next_seq int; i int; bid uuid; lbl text;
begin
  select * into ev from public.tevents where id = p_event;
  if ev.id is null or not public.bb_is(ev.org_id, 'admin') then raise exception 'Only an admin can add ticket books'; end if;
  s := coalesce(p_size, ev.book_size);
  if p_count < 1 or p_count > 100 or s < 1 or s > 500 then raise exception 'Too many books or tickets'; end if;
  select coalesce(max(serial), 0) + 1 into next_serial from public.tickets where event_id = p_event;
  select coalesce(max(seq), 0) into next_seq from public.books where event_id = p_event and seq < 9000;
  nb := 0;
  for i in 1..p_count loop
    next_seq := next_seq + 1;
    lbl := case when p_label is not null and p_count = 1 then p_label else next_seq::text end;
    insert into public.books(event_id, label, seq) values (p_event, lbl, next_seq) returning id into bid;
    insert into public.tickets(event_id, book_id, serial)
      select p_event, bid, g from generate_series(next_serial, next_serial + s - 1) g;
    next_serial := next_serial + s; nb := nb + 1;
  end loop;
  return nb;
end $$;

-- A seller records a sale from their own book (admins can record any)
create or replace function public.bb_sell(p_ticket uuid, p_buyer text, p_phone text default '', p_email text default '', p_free boolean default false, p_amount numeric default null)
returns public.tickets language plpgsql security definer set search_path = public as $$
declare t public.tickets; ev public.tevents; me public.members; seller uuid;
begin
  select * into t from public.tickets where id = p_ticket for update;
  if t.id is null then raise exception 'Ticket not found'; end if;
  select * into ev from public.tevents where id = t.event_id;
  me := public.bb_me(ev.org_id);
  select seller_id into seller from public.books where id = t.book_id;
  if me.id is null or not coalesce(me.is_admin or (me.can_sell and seller is not null and seller = me.id), false) then raise exception 'This ticket is not in your book'; end if;
  if t.status <> 'unsold' and not coalesce(me.is_admin, false) then raise exception 'Ticket % is already recorded', t.serial; end if;
  if t.checked_in_at is not null then raise exception 'Ticket % was already used at the entrance', t.serial; end if;
  update public.tickets set
    status = case when p_free then 'free' else 'sold' end,
    amount = case when p_free then 0 else coalesce(p_amount, ev.price) end,
    buyer_name = trim(coalesce(p_buyer, '')), buyer_phone = trim(coalesce(p_phone, '')), buyer_email = trim(coalesce(p_email, '')),
    sold_by = me.id, sold_by_name = me.name, collected_by = case when p_free then '' else me.name end,
    channel = case when t.channel = 'online' then 'online' else 'book' end, sold_at = now()
  where id = t.id returning * into t;
  return t;
end $$;

-- Undo a sale (seller: own unused sale; admin: any unused sale)
create or replace function public.bb_unsell(p_ticket uuid) returns public.tickets
language plpgsql security definer set search_path = public as $$
declare t public.tickets; ev public.tevents; me public.members;
begin
  select * into t from public.tickets where id = p_ticket for update;
  select * into ev from public.tevents where id = t.event_id;
  me := public.bb_me(ev.org_id);
  if t.id is null then raise exception 'Ticket not found'; end if;
  if me.id is null or not coalesce(me.is_admin or (t.sold_by is not null and t.sold_by = me.id), false) then raise exception 'Not allowed'; end if;
  if t.checked_in_at is not null then raise exception 'Ticket already used at the entrance'; end if;
  if t.channel = 'online' then raise exception 'Online tickets are changed from the Online orders list'; end if;
  update public.tickets set status = 'unsold', amount = 0, buyer_name = '', buyer_phone = '', buyer_email = '',
    sold_by = null, sold_by_name = '', collected_by = '', sold_at = null where id = t.id returning * into t;
  return t;
end $$;

-- Entrance check. p_collect: null = just check; 'door' = money collected at the door now; 'seller' = the book's seller already has the money
create or replace function public.bb_check_in(p_code text, p_event uuid default null, p_collect text default null)
returns json language plpgsql security definer set search_path = public as $$
declare t public.tickets; ev public.tevents; me public.members; res text; sname text; c text;
begin
  c := upper(regexp_replace(coalesce(p_code, ''), '^.*[/#]', ''));   -- accepts the full QR link or the code
  select * into t from public.tickets where code = c or (p_event is not null and event_id = p_event and serial::text = c) for update;
  if t.id is null then return json_build_object('result', 'notfound'); end if;
  select * into ev from public.tevents where id = t.event_id;
  me := public.bb_me(ev.org_id);
  if me.id is null or not coalesce(me.is_admin or me.can_scan, false) then raise exception 'You do not have entrance access for this society'; end if;
  if p_event is not null and t.event_id <> p_event then
    return json_build_object('result', 'wrong_event', 'event', ev.name, 'serial', t.serial); end if;
  if t.status = 'void' then return json_build_object('result', 'void', 'serial', t.serial, 'buyer', t.buyer_name); end if;
  if t.checked_in_at is not null then
    return json_build_object('result', 'used', 'serial', t.serial, 'buyer', t.buyer_name, 'at', t.checked_in_at, 'by', t.checked_in_by); end if;
  if t.status in ('unsold', 'reserved', 'pending') then
    if p_collect is null then
      return json_build_object('result', case when t.status = 'unsold' then 'unrecorded' else 'unpaid' end,
        'serial', t.serial, 'buyer', t.buyer_name, 'price', ev.price, 'status', t.status); end if;
    if p_collect = 'seller' then
      select m.name into sname from public.books b join public.members m on m.id = b.seller_id where b.id = t.book_id;
    end if;
    update public.tickets set status = 'sold', amount = ev.price,
      collected_by = case when p_collect = 'seller' then coalesce(sname, '') else me.name end,
      sold_by = case when p_collect = 'door' and t.status = 'unsold' then me.id else sold_by end,
      sold_by_name = case when t.status = 'unsold' then case when p_collect = 'door' then me.name else coalesce(sname, '') end else sold_by_name end,
      channel = case when t.status = 'unsold' and p_collect = 'door' then 'door' else channel end,
      sold_at = coalesce(sold_at, now())
    where id = t.id;
    if t.order_id is not null then
      update public.orders o set status = 'paid', decided_at = now(), decided_by = me.name
      where o.id = t.order_id and not exists (select 1 from public.tickets x where x.order_id = o.id and x.id <> t.id and x.status in ('reserved','pending'));
    end if;
  end if;
  update public.tickets set checked_in_at = now(), checked_in_by = me.name where id = t.id returning * into t;
  return json_build_object('result', 'ok', 'serial', t.serial, 'buyer', t.buyer_name, 'status', t.status, 'at', t.checked_in_at);
end $$;

-- Sell a brand-new ticket at the entrance (from the "Entrance" book) and admit
create or replace function public.bb_door_sale(p_event uuid, p_buyer text default '', p_phone text default '')
returns public.tickets language plpgsql security definer set search_path = public as $$
declare ev public.tevents; me public.members; bid uuid; t public.tickets; s int;
begin
  select * into ev from public.tevents where id = p_event;
  me := public.bb_me(ev.org_id);
  if me.id is null or not coalesce(me.is_admin or me.can_scan, false) then raise exception 'You do not have entrance access'; end if;
  select id into bid from public.books where event_id = p_event and label = 'Entrance';
  if bid is null then insert into public.books(event_id, label, seq) values (p_event, 'Entrance', 9001) returning id into bid; end if;
  select coalesce(max(serial), 0) + 1 into s from public.tickets where event_id = p_event;
  insert into public.tickets(event_id, book_id, serial, status, amount, buyer_name, buyer_phone, sold_by, sold_by_name, collected_by, channel, sold_at, checked_in_at, checked_in_by)
    values (p_event, bid, s, 'sold', ev.price, trim(coalesce(p_buyer, '')), trim(coalesce(p_phone, '')), me.id, me.name, me.name, 'door', now(), now(), me.name)
    returning * into t;
  return t;
end $$;

-- Public: event details for the online ticket page
create or replace function public.bb_public_event(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('id', e.id, 'name', e.name, 'starts_at', e.starts_at, 'venue', e.venue, 'price', e.price,
    'org', o.name, 'notes', e.notes, 'online', e.online_enabled, 'bank', e.pay_bank, 'door', e.pay_door,
    'card', e.pay_card and e.payhere_merchant_id <> '', 'bank_details', e.bank_details,
    'left', case when e.online_limit > 0 then greatest(0, e.online_limit - (select count(*) from public.tickets t where t.event_id = e.id and t.channel = 'online' and t.status <> 'void')) else null end)
  from public.tevents e join public.orgs o on o.id = e.org_id where e.slug = lower(p_slug)
$$;

-- Public: buy tickets online. Returns the order and the ticket codes.
create or replace function public.bb_buy(p_slug text, p_name text, p_phone text, p_email text, p_qty int, p_method text, p_slip text default null)
returns json language plpgsql security definer set search_path = public as $$
declare e public.tevents; o public.orders; bid uuid; s int; st text; lft int; codes text[];
begin
  select * into e from public.tevents where slug = lower(p_slug) for update;
  if e.id is null or not e.online_enabled then raise exception 'Online sales are closed for this event'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then raise exception 'Please enter your name and phone number'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'You can buy 1 to 10 tickets at a time'; end if;
  if not ((p_method = 'bank' and e.pay_bank) or (p_method = 'door' and e.pay_door) or (p_method = 'card' and e.pay_card and e.payhere_merchant_id <> '')) then
    raise exception 'This payment method is not available'; end if;
  if p_method = 'bank' and coalesce(p_slip, '') = '' then raise exception 'Please attach the bank slip'; end if;
  if (select count(*) from public.orders where event_id = e.id and buyer_phone = trim(p_phone) and status in ('pending', 'reserved')) >= 3 then
    raise exception 'You already have orders waiting. Please contact the organisers.'; end if;
  if e.online_limit > 0 then
    select e.online_limit - count(*) into lft from public.tickets where event_id = e.id and channel = 'online' and status <> 'void';
    if lft < p_qty then raise exception 'Only % tickets are left online', greatest(lft, 0); end if;
  end if;
  st := case p_method when 'door' then 'reserved' else 'pending' end;
  insert into public.orders(event_id, buyer_name, buyer_phone, buyer_email, qty, amount, method, status, slip_path)
    values (e.id, trim(p_name), trim(p_phone), trim(coalesce(p_email, '')), p_qty, p_qty * e.price, p_method, st, p_slip) returning * into o;
  select id into bid from public.books where event_id = e.id and label = 'Online';
  if bid is null then insert into public.books(event_id, label, seq) values (e.id, 'Online', 9000) returning id into bid; end if;
  select coalesce(max(serial), 0) into s from public.tickets where event_id = e.id;
  insert into public.tickets(event_id, book_id, serial, status, amount, buyer_name, buyer_phone, buyer_email, sold_by_name, channel, order_id, sold_at)
    select e.id, bid, s + g, st, 0, trim(p_name), trim(p_phone), trim(coalesce(p_email, '')), 'Online', 'online', o.id, now()
    from generate_series(1, p_qty) g;
  select array_agg(code order by serial) into codes from public.tickets where order_id = o.id;
  return json_build_object('order_id', o.id, 'ref', o.ref, 'status', o.status, 'amount', o.amount, 'codes', codes);
end $$;

-- Public: look at one ticket (the QR link opens this)
create or replace function public.bb_ticket(p_code text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('serial', t.serial, 'code', t.code, 'status', t.status, 'buyer', t.buyer_name,
    'used', t.checked_in_at is not null, 'event', e.name, 'starts_at', e.starts_at, 'venue', e.venue, 'price', e.price, 'org', o.name,
    'order_ref', (select ref from public.orders where id = t.order_id))
  from public.tickets t join public.tevents e on e.id = t.event_id join public.orgs o on o.id = e.org_id
  where t.code = upper(p_code)
$$;

-- Public: status of an online order
create or replace function public.bb_order(p_order uuid) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object('ref', o.ref, 'status', o.status, 'amount', o.amount, 'method', o.method, 'qty', o.qty,
    'codes', (select array_agg(code order by serial) from public.tickets where order_id = o.id))
  from public.orders o where o.id = p_order
$$;

-- Admin: approve or reject an online order
create or replace function public.bb_decide(p_order uuid, p_approve boolean, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; ev public.tevents; me public.members;
begin
  select * into o from public.orders where id = p_order for update;
  select * into ev from public.tevents where id = o.event_id;
  me := public.bb_me(ev.org_id);
  if me.id is null or not coalesce(me.is_admin, false) then raise exception 'Only an admin can approve payments'; end if;
  if p_approve then
    update public.orders set status = 'paid', decided_at = now(), decided_by = me.name, note = coalesce(p_note, '') where id = o.id;
    update public.tickets set status = 'sold', amount = ev.price,
      collected_by = case o.method when 'bank' then 'Bank' when 'card' then 'Card (PayHere)' else me.name end
    where order_id = o.id and status in ('pending', 'reserved');
  else
    update public.orders set status = case when o.status = 'paid' then 'cancelled' else 'rejected' end, decided_at = now(), decided_by = me.name, note = coalesce(p_note, '') where id = o.id;
    update public.tickets set status = 'void', amount = 0 where order_id = o.id and checked_in_at is null;
  end if;
end $$;

-- Who may call what
revoke all on function public.bb_create_org(text, text), public.bb_add_books(uuid, int, int, text), public.bb_sell(uuid, text, text, text, boolean, numeric),
  public.bb_unsell(uuid), public.bb_check_in(text, uuid, text), public.bb_door_sale(uuid, text, text), public.bb_decide(uuid, boolean, text), public.bb_my_orgs() from anon, public;
grant execute on function public.bb_create_org(text, text), public.bb_add_books(uuid, int, int, text), public.bb_sell(uuid, text, text, text, boolean, numeric),
  public.bb_unsell(uuid), public.bb_check_in(text, uuid, text), public.bb_door_sale(uuid, text, text), public.bb_decide(uuid, boolean, text), public.bb_my_orgs() to authenticated;
grant execute on function public.bb_public_event(text), public.bb_buy(text, text, text, text, int, text, text), public.bb_ticket(text), public.bb_order(uuid) to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- ---------- bank slip photos ----------
insert into storage.buckets (id, name, public) values ('slips', 'slips', false) on conflict (id) do nothing;
drop policy if exists slips_upload on storage.objects;
create policy slips_upload on storage.objects for insert to anon, authenticated with check (bucket_id = 'slips');
drop policy if exists slips_admin_read on storage.objects;
create policy slips_admin_read on storage.objects for select to authenticated using (
  bucket_id = 'slips' and public.bb_is(public.bb_event_org(((storage.foldername(name))[1])::uuid), 'admin'));
