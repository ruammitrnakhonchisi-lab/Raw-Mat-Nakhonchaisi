-- ==========================================================
--  Migration: ให้ประวัติการเคลื่อนไหว (ledger) และรายงานอ้างอิง "วันที่ทำรายการ"
--  ที่เลือกตอนบันทึกรับเข้า/เบิกออก/ปรับสต๊อค (txn_date) แทนวันที่บันทึกเข้าระบบ
--  (created_at) — เพื่อให้การบันทึกย้อนหลังแสดงผลถูกวันที่จริงในทุกหน้า
--  รันครั้งเดียวใน Supabase SQL editor (ปลอดภัย ไม่กระทบข้อมูลเดิม)
-- ==========================================================

alter table public.ledger add column if not exists txn_date date not null default current_date;

create or replace function public.record_stock_in(
  p_sku text,
  p_txn_date date,
  p_qty numeric,
  p_lot_batch text default '',
  p_expiry_date date default null,
  p_unit_price numeric default null,
  p_supplier text default '',
  p_po_number text default '',
  p_note text default ''
) returns table (stock_in_id bigint, new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_price numeric;
  v_new_qty numeric;
  v_id bigint;
  v_txn_date date;
begin
  if not public.is_active_user() then
    raise exception 'AUTH: ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'กรุณาระบุจำนวนรับเข้าให้ถูกต้อง';
  end if;

  select * into v_item from public.items where sku = p_sku for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบ SKU: %', p_sku;
  end if;

  v_txn_date := coalesce(p_txn_date, current_date);
  v_price := coalesce(p_unit_price, v_item.unit_price, 0);
  v_new_qty := v_item.qty_on_hand + p_qty;

  insert into public.stock_in (
    txn_date, item_id, sku, item_name, lot_batch, expiry_date,
    qty, unit_price, supplier, po_number, recorded_by, note
  ) values (
    v_txn_date, v_item.id, v_item.sku, v_item.name, p_lot_batch, p_expiry_date,
    p_qty, v_price, coalesce(nullif(p_supplier, ''), v_item.primary_supplier), p_po_number, auth.uid(), p_note
  ) returning id into v_id;

  update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('IN', v_txn_date, v_item.sku, v_item.name, p_qty, v_new_qty, 'stock_in#' || v_id, auth.uid(), p_note);

  return query select v_id, v_new_qty;
end;
$$;

create or replace function public.record_stock_out(
  p_sku text,
  p_txn_date date,
  p_qty numeric,
  p_department text default '',
  p_job_order_no text default '',
  p_requested_by text default '',
  p_approved_by text default '',
  p_note text default ''
) returns table (stock_out_id bigint, new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_new_qty numeric;
  v_id bigint;
  v_requested_by text;
  v_txn_date date;
begin
  if not public.is_active_user() then
    raise exception 'AUTH: ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'กรุณาระบุจำนวนเบิกให้ถูกต้อง';
  end if;

  select * into v_item from public.items where sku = p_sku for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบ SKU: %', p_sku;
  end if;

  if p_qty > v_item.qty_on_hand then
    raise exception 'จำนวนคงเหลือไม่เพียงพอ (คงเหลือ % %)', v_item.qty_on_hand, v_item.unit;
  end if;

  v_txn_date := coalesce(p_txn_date, current_date);
  v_new_qty := v_item.qty_on_hand - p_qty;
  select coalesce(nullif(p_requested_by, ''), display_name) into v_requested_by
    from public.profiles where id = auth.uid();

  insert into public.stock_out (
    txn_date, item_id, sku, item_name, qty, department, job_order_no,
    requested_by, approved_by, recorded_by, note
  ) values (
    v_txn_date, v_item.id, v_item.sku, v_item.name, p_qty, p_department, p_job_order_no,
    coalesce(v_requested_by, ''), p_approved_by, auth.uid(), p_note
  ) returning id into v_id;

  update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('OUT', v_txn_date, v_item.sku, v_item.name, -p_qty, v_new_qty, 'stock_out#' || v_id, auth.uid(), p_note);

  return query select v_id, v_new_qty;
end;
$$;

create or replace function public.record_adjustment(
  p_sku text,
  p_txn_date date,
  p_qty_after numeric,
  p_reason text default ''
) returns table (adjustment_id bigint, new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_diff numeric;
  v_id bigint;
  v_txn_date date;
begin
  if not public.is_active_user() then
    raise exception 'AUTH: ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_qty_after is null or p_qty_after < 0 then
    raise exception 'กรุณาระบุจำนวนหลังปรับให้ถูกต้อง';
  end if;

  select * into v_item from public.items where sku = p_sku for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบ SKU: %', p_sku;
  end if;

  v_txn_date := coalesce(p_txn_date, current_date);
  v_diff := p_qty_after - v_item.qty_on_hand;

  insert into public.adjustments (txn_date, item_id, sku, item_name, qty_before, qty_after, reason, recorded_by)
  values (v_txn_date, v_item.id, v_item.sku, v_item.name, v_item.qty_on_hand, p_qty_after, p_reason, auth.uid())
  returning id into v_id;

  update public.items set qty_on_hand = p_qty_after, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('ADJUST', v_txn_date, v_item.sku, v_item.name, v_diff, p_qty_after, 'adjust#' || v_id, auth.uid(), p_reason);

  return query select v_id, p_qty_after;
end;
$$;
