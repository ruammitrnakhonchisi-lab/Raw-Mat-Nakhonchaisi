-- ==========================================================
--  Migration: ใบขอซื้อวัตถุดิบ + สั่งล่วงหน้า (lead time) + ค้างส่ง
--    - items.lead_time_days : สั่งล่วงหน้า (วัน) ต่อวัตถุดิบ
--    - purchase_requests / purchase_request_lines : ใบขอซื้อที่บันทึกไว้
--      ค้างส่ง = จำนวนสั่ง - รับแล้ว ของใบที่ยังเปิด (status = 'open')
--  รันครั้งเดียวใน Supabase SQL editor
-- ==========================================================

alter table public.items add column if not exists lead_time_days int not null default 0 check (lead_time_days >= 0);

create table if not exists public.purchase_requests (
  id bigint generated always as identity primary key,
  req_date date not null default current_date,
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_request_lines (
  id bigint generated always as identity primary key,
  pr_id bigint not null references public.purchase_requests (id) on delete cascade,
  item_id bigint not null references public.items (id),
  qty numeric not null check (qty > 0),
  received_qty numeric not null default 0 check (received_qty >= 0)
);

create index if not exists idx_prl_pr on public.purchase_request_lines (pr_id);
create index if not exists idx_prl_item on public.purchase_request_lines (item_id);

alter table public.purchase_requests enable row level security;
alter table public.purchase_request_lines enable row level security;

drop policy if exists "pr_select" on public.purchase_requests;
create policy "pr_select" on public.purchase_requests for select using (public.is_active_user());
drop policy if exists "pr_insert" on public.purchase_requests;
create policy "pr_insert" on public.purchase_requests for insert with check (public.is_active_user());
drop policy if exists "pr_update" on public.purchase_requests;
create policy "pr_update" on public.purchase_requests for update using (public.is_active_user());
drop policy if exists "pr_delete" on public.purchase_requests;
create policy "pr_delete" on public.purchase_requests for delete using (public.is_admin());

drop policy if exists "prl_select" on public.purchase_request_lines;
create policy "prl_select" on public.purchase_request_lines for select using (public.is_active_user());
drop policy if exists "prl_insert" on public.purchase_request_lines;
create policy "prl_insert" on public.purchase_request_lines for insert with check (public.is_active_user());
drop policy if exists "prl_update" on public.purchase_request_lines;
create policy "prl_update" on public.purchase_request_lines for update using (public.is_active_user());
drop policy if exists "prl_delete" on public.purchase_request_lines;
create policy "prl_delete" on public.purchase_request_lines for delete using (public.is_admin());
