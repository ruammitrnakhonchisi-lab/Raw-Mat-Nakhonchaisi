-- ==========================================================
--  Fix ด่วน: "could not choose the best candidate function" ตอนเบิกออก (ทุกวัตถุดิบ)
--
--  สาเหตุ: ตอนเพิ่มพารามิเตอร์ p_coil_stock_in_id / p_usage_type ให้ record_stock_out
--  ใน add_pcwire_coil_tracking.sql นั้น "create or replace function" จะแทนที่ฟังก์ชันเดิม
--  ได้ก็ต่อเมื่อจำนวน/ชนิดพารามิเตอร์ตรงกันเป๊ะเท่านั้น — พอจำนวนพารามิเตอร์เปลี่ยน
--  (8 -> 10 ตัว) Postgres เลยสร้างฟังก์ชันใหม่แยกซ้อนขึ้นมาอีกตัว แทนที่จะแทนที่ของเดิม
--  ทำให้มี record_stock_out ค้างอยู่ 2 เวอร์ชันพร้อมกัน (8 พารามิเตอร์ กับ 10 พารามิเตอร์)
--  เวลาเรียกแบบเบิกปกติ (ไม่ส่ง coil/usage) ที่พารามิเตอร์ตรงกับได้ทั้ง 2 ฟังก์ชัน
--  Postgres เลยงงว่าจะเรียกตัวไหน เกิด error นี้กับการเบิกออกทุกวัตถุดิบ ไม่ใช่แค่ PC wire
--
--  วิธีแก้: ลบฟังก์ชันเวอร์ชันเก่า (8 พารามิเตอร์) ทิ้ง เหลือแค่เวอร์ชันใหม่ (10 พารามิเตอร์)
--  รันครั้งเดียวใน Supabase SQL Editor — ไม่กระทบข้อมูลใดๆ ในตาราง
-- ==========================================================

drop function if exists public.record_stock_out(
  text, date, numeric, text, text, text, text, text
);

-- ตรวจสอบว่าเหลือ record_stock_out อยู่เวอร์ชันเดียว (ควรเจอแค่ 1 แถว หลังรันด้านบน)
select p.oid::regprocedure as function_signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'record_stock_out';
