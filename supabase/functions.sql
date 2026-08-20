-- ==========================================================
--  Stock Pro — functions.sql
--  รันหลัง schema.sql และ policies.sql
--  RPC ทั้งหมดเป็น SECURITY DEFINER + เช็คสิทธิ์เองภายในฟังก์ชัน จึงเป็นทางเดียว
--  ที่เขียนลง stock_in/stock_out/adjustments/ledger ได้ (ตารางเหล่านี้ไม่มี
--  insert policy ให้ client เขียนตรงตาม policies.sql)
-- ==========================================================

-- ---------- auto-create profile เมื่อมี auth user ใหม่ ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'staff',
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- รับเข้า (Stock In) — atomic ----------
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

-- ---------- ยกเลิกรายการรับเข้า (admin only) — atomic ----------
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

-- ---------- เพิ่มวัตถุดิบใหม่แบบด่วน (ระหว่างรับเข้า, ไม่ต้องเป็น admin) ----------
create or replace function public.quick_add_item(
  p_sku text,
  p_name text,
  p_category text default '',
  p_unit text default '',
  p_reorder_point numeric default 0,
  p_max_stock numeric default 0,
  p_unit_price numeric default 0,
  p_primary_supplier text default '',
  p_storage_location text default ''
) returns table (item_id bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.is_active_user() then
    raise exception 'AUTH: ต้องเข้าสู่ระบบก่อน';
  end if;
  if p_sku is null or trim(p_sku) = '' or p_name is null or trim(p_name) = '' then
    raise exception 'กรุณาระบุ SKU และชื่อวัตถุดิบ';
  end if;
  if exists (select 1 from public.items where sku = p_sku) then
    raise exception 'มี SKU นี้อยู่แล้วในระบบ';
  end if;

  insert into public.items (sku, name, category, unit, reorder_point, max_stock, unit_price, primary_supplier, storage_location)
  values (p_sku, p_name, p_category, p_unit, p_reorder_point, p_max_stock, p_unit_price, p_primary_supplier, p_storage_location)
  returning id into v_id;

  return query select v_id;
end;
$$;

-- ---------- เบิกออก (Stock Out) — atomic, กันเบิกเกิน ----------
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

-- ---------- ปรับสต๊อค (Adjustment) — atomic ----------
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
  if not public.is_admin() then
    raise exception 'AUTH: เฉพาะผู้ดูแลระบบเท่านั้นที่ปรับสต๊อคได้';
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

-- ---------- เปลี่ยน role/สถานะผู้ใช้งาน (admin only) ----------
create or replace function public.admin_update_profile(
  p_user_id uuid,
  p_display_name text default null,
  p_role text default null,
  p_status text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'AUTH: ต้องเป็นผู้ดูแลระบบเท่านั้น';
  end if;
  update public.profiles set
    display_name = coalesce(p_display_name, display_name),
    role = coalesce(p_role, role),
    status = coalesce(p_status, status)
  where id = p_user_id;
end;
$$;

-- ---------- ให้สิทธิ์เรียกใช้ฟังก์ชันทั้งหมดแก่ผู้ใช้ที่ login แล้ว ----------
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
