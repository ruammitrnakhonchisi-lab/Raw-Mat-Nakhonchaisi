-- ==========================================================
--  Migration: เพิ่มการติดตามระดับ Coil สำหรับวัตถุดิบหมวด "PC wire" เท่านั้น
--  (รับเข้า = คีย์เลข Coil จากใบส่งของทีละม้วน, เบิกออก = เลือก Coil ตามแท็ก
--  เหล็กที่ติดมากับม้วนลวด แล้วตัดยอดเฉพาะม้วนนั้น)
--
--  ไม่กระทบวัตถุดิบหมวดอื่น: ฟิลด์/เงื่อนไขใหม่ทั้งหมดเป็น optional (default
--  เป็นค่าที่ทำให้พฤติกรรมเดิมเหมือนเดิมทุกประการเมื่อไม่ได้ระบุ)
--  รันครั้งเดียวใน Supabase SQL editor (ต้องรันหลัง schema.sql, policies.sql,
--  functions.sql, add_ledger_txn_date.sql, restrict_adjustment_to_admin.sql)
-- ==========================================================

-- stock_in.remaining_qty: ยอดคงเหลือของ "ล็อตนี้/coil นี้" (แยกจาก qty ที่รับเข้าครั้งแรก)
-- ใช้ตัดยอดตอนเบิกแบบเจาะจง coil (ปัจจุบันใช้กับ PC wire) — สำหรับวัตถุดิบอื่นที่ไม่เคย
-- เบิกแบบเจาะจง coil ค่านี้จะเท่ากับ qty เสมอ ไม่มีผลต่อพฤติกรรมเดิม
alter table public.stock_in add column if not exists remaining_qty numeric;
update public.stock_in set remaining_qty = qty where remaining_qty is null;
alter table public.stock_in alter column remaining_qty set not null;
alter table public.stock_in alter column remaining_qty set default 0;
alter table public.stock_in drop constraint if exists stock_in_remaining_qty_range;
alter table public.stock_in add constraint stock_in_remaining_qty_range check (remaining_qty >= 0 and remaining_qty <= qty);

-- stock_out.coil_stock_in_id: อ้างอิงว่าเบิกออกครั้งนี้ตัดยอดมาจาก stock_in (coil) แถวไหน
-- (null สำหรับการเบิกแบบปกติที่ไม่ได้เจาะจง coil — วัตถุดิบอื่นทั้งหมดยังเป็น null เหมือนเดิม)
alter table public.stock_out add column if not exists coil_stock_in_id bigint references public.stock_in (id);

create index if not exists idx_stock_in_available_coil
  on public.stock_in (item_id, remaining_qty)
  where voided_at is null;

-- ---------- รับเข้า (Stock In) — เพิ่ม remaining_qty เริ่มต้น = qty ที่รับ ----------
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
    qty, remaining_qty, unit_price, supplier, po_number, recorded_by, note
  ) values (
    v_txn_date, v_item.id, v_item.sku, v_item.name, p_lot_batch, p_expiry_date,
    p_qty, p_qty, v_price, coalesce(nullif(p_supplier, ''), v_item.primary_supplier), p_po_number, auth.uid(), p_note
  ) returning id into v_id;

  update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('IN', v_txn_date, v_item.sku, v_item.name, p_qty, v_new_qty, 'stock_in#' || v_id, auth.uid(), p_note);

  return query select v_id, v_new_qty;
end;
$$;

-- ---------- ยกเลิกรายการรับเข้า (admin only) — กันยกเลิก coil ที่เบิกไปแล้วบางส่วน ----------
create or replace function public.void_stock_in(p_stock_in_id bigint)
returns table (new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.stock_in%rowtype;
  v_item public.items%rowtype;
  v_new_qty numeric;
begin
  if not public.is_admin() then
    raise exception 'AUTH: ต้องเป็นผู้ดูแลระบบเท่านั้น';
  end if;

  select * into v_row from public.stock_in where id = p_stock_in_id for update;
  if not found then
    raise exception 'ไม่พบรายการรับเข้านี้';
  end if;
  if v_row.voided_at is not null then
    raise exception 'รายการนี้ถูกยกเลิกไปแล้ว';
  end if;
  if v_row.remaining_qty < v_row.qty then
    raise exception 'ยกเลิกไม่ได้: มีการเบิกใช้จากล็อต/coil นี้ไปแล้วบางส่วน (คงเหลือ % จากที่รับเข้า %)', v_row.remaining_qty, v_row.qty;
  end if;

  select * into v_item from public.items where id = v_row.item_id for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบที่เกี่ยวข้อง';
  end if;

  v_new_qty := v_item.qty_on_hand - v_row.qty;
  if v_new_qty < 0 then
    raise exception 'ยกเลิกไม่ได้: จะทำให้ยอดคงเหลือติดลบ (คงเหลือปัจจุบัน %, จำนวนที่จะคืน %)', v_item.qty_on_hand, v_row.qty;
  end if;

  update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
  update public.stock_in set voided_at = now(), voided_by = auth.uid() where id = p_stock_in_id;

  insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('VOID_IN', v_row.sku, v_row.item_name, -v_row.qty, v_new_qty, 'stock_in#' || p_stock_in_id, auth.uid(), 'ยกเลิกรายการรับเข้า');

  return query select v_new_qty;
end;
$$;

-- ---------- เบิกออก (Stock Out) — เพิ่มออปชันเจาะจง coil (p_coil_stock_in_id) ----------
create or replace function public.record_stock_out(
  p_sku text,
  p_txn_date date,
  p_qty numeric,
  p_department text default '',
  p_job_order_no text default '',
  p_requested_by text default '',
  p_approved_by text default '',
  p_note text default '',
  p_coil_stock_in_id bigint default null
) returns table (stock_out_id bigint, new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_coil public.stock_in%rowtype;
  v_new_qty numeric;
  v_id bigint;
  v_requested_by text;
  v_txn_date date;
  v_coil_no text := '';
  v_note text;
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

  if p_coil_stock_in_id is not null then
    select * into v_coil from public.stock_in where id = p_coil_stock_in_id for update;
    if not found or v_coil.item_id <> v_item.id or v_coil.voided_at is not null then
      raise exception 'ไม่พบ coil ที่เลือก หรือ coil นี้ถูกยกเลิกไปแล้ว';
    end if;
    if p_qty > v_coil.remaining_qty then
      raise exception 'จำนวนคงเหลือใน coil นี้ไม่พอ (coil % คงเหลือ % %)', v_coil.lot_batch, v_coil.remaining_qty, v_item.unit;
    end if;
    update public.stock_in set remaining_qty = remaining_qty - p_qty where id = v_coil.id;
    v_coil_no := v_coil.lot_batch;
  end if;

  v_txn_date := coalesce(p_txn_date, current_date);
  v_new_qty := v_item.qty_on_hand - p_qty;
  select coalesce(nullif(p_requested_by, ''), display_name) into v_requested_by
    from public.profiles where id = auth.uid();
  v_note := case when v_coil_no <> '' then trim('[Coil: ' || v_coil_no || '] ' || p_note) else p_note end;

  insert into public.stock_out (
    txn_date, item_id, sku, item_name, qty, department, job_order_no,
    requested_by, approved_by, recorded_by, note, coil_stock_in_id
  ) values (
    v_txn_date, v_item.id, v_item.sku, v_item.name, p_qty, p_department, p_job_order_no,
    coalesce(v_requested_by, ''), p_approved_by, auth.uid(), v_note, p_coil_stock_in_id
  ) returning id into v_id;

  update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('OUT', v_txn_date, v_item.sku, v_item.name, -p_qty, v_new_qty, 'stock_out#' || v_id, auth.uid(), v_note);

  return query select v_id, v_new_qty;
end;
$$;

grant execute on all functions in schema public to authenticated;
