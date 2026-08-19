-- ==========================================================
--  Stock Pro — schema.sql
--  รันไฟล์นี้ก่อนไฟล์อื่นใน Supabase SQL editor (Project > SQL Editor > New query)
-- ==========================================================

create extension if not exists "pgcrypto";

-- ---------- profiles (โปรไฟล์ผู้ใช้งาน ผูกกับ auth.users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

-- ---------- categories (หมวดหมู่วัตถุดิบ) ----------
create table if not exists public.categories (
  id bigint generated always as identity primary key,
  name text not null unique
);

-- ---------- items (ข้อมูลหลักวัตถุดิบ) ----------
create table if not exists public.items (
  id bigint generated always as identity primary key,
  sku text not null unique,
  name text not null,
  category text not null default '',
  unit text not null default '',
  qty_on_hand numeric not null default 0,
  reorder_point numeric not null default 0,
  max_stock numeric not null default 0,
  unit_price numeric not null default 0,
  primary_supplier text not null default '',
  storage_location text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- stock_in (รับเข้า) ----------
create table if not exists public.stock_in (
  id bigint generated always as identity primary key,
  txn_date date not null default current_date,
  item_id bigint not null references public.items (id),
  sku text not null,
  item_name text not null,
  lot_batch text not null default '',
  expiry_date date,
  qty numeric not null check (qty > 0),
  unit_price numeric not null default 0,
  total_value numeric generated always as (qty * unit_price) stored,
  supplier text not null default '',
  po_number text not null default '',
  recorded_by uuid references public.profiles (id),
  note text not null default '',
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- stock_out (เบิกออก) ----------
create table if not exists public.stock_out (
  id bigint generated always as identity primary key,
  txn_date date not null default current_date,
  item_id bigint not null references public.items (id),
  sku text not null,
  item_name text not null,
  qty numeric not null check (qty > 0),
  department text not null default '',
  job_order_no text not null default '',
  requested_by text not null default '',
  approved_by text not null default '',
  recorded_by uuid references public.profiles (id),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- adjustments (ปรับสต๊อค) ----------
create table if not exists public.adjustments (
  id bigint generated always as identity primary key,
  txn_date date not null default current_date,
  item_id bigint not null references public.items (id),
  sku text not null,
  item_name text not null,
  qty_before numeric not null,
  qty_after numeric not null check (qty_after >= 0),
  diff numeric generated always as (qty_after - qty_before) stored,
  reason text not null default '',
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------- ledger (audit trail รวมทุกการเคลื่อนไหว) ----------
create table if not exists public.ledger (
  id bigint generated always as identity primary key,
  txn_type text not null check (txn_type in ('IN', 'OUT', 'ADJUST', 'VOID_IN')),
  txn_date date not null default current_date,
  sku text not null,
  item_name text not null,
  delta numeric not null,
  balance_after numeric not null,
  ref text not null default '',
  recorded_by uuid references public.profiles (id),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- settings (ค่าตั้งค่าระบบ) ----------
create table if not exists public.settings (
  key text primary key,
  value text not null default ''
);

insert into public.settings (key, value) values
  ('CompanyName', 'บริษัทของฉัน จำกัด'),
  ('ExpiryAlertDays', '30'),
  ('AlertEmail', ''),
  ('LowStockEmailEnabled', 'TRUE')
on conflict (key) do nothing;

insert into public.categories (name) values
  ('วัตถุดิบหลัก'), ('บรรจุภัณฑ์'), ('สารเคมี'), ('อะไหล่/OEM'), ('อื่นๆ')
on conflict (name) do nothing;

create index if not exists idx_stock_in_item_id on public.stock_in (item_id);
create index if not exists idx_stock_in_created_at on public.stock_in (created_at desc);
create index if not exists idx_stock_out_item_id on public.stock_out (item_id);
create index if not exists idx_ledger_sku on public.ledger (sku);
create index if not exists idx_ledger_created_at on public.ledger (created_at desc);
