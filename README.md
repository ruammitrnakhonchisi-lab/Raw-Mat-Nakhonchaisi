# Stock Pro — ระบบสต๊อควัตถุดิบโรงงาน (GitHub Pages + Supabase)

ระบบสต๊อควัตถุดิบ รันเป็นเว็บแอปแบบ static site (ไม่มี build step) โฮสต์ฟรีบน **GitHub Pages**
เก็บข้อมูลใน **Supabase** (Postgres + Auth) เรียกตรงจาก browser ผ่าน Row Level Security (RLS)

> เวอร์ชันเดิมที่รันบน Google Apps Script + Google Sheets ถูกย้ายไปเก็บไว้ที่ [`legacy-appsscript/`](legacy-appsscript/) เผื่ออ้างอิง ไม่ได้ใช้งานต่อแล้ว

## ฟีเจอร์หลัก

- **แดชบอร์ด** — สรุปภาพรวม: จำนวนรายการ, มูลค่าสต๊อครวม, รายการต่ำกว่าจุดสั่งซื้อ, ใกล้หมดอายุ, กราฟการเคลื่อนไหว 7 วัน, รายการล่าสุด
- **ข้อมูลวัตถุดิบ (Master Data)** — SKU, ชื่อ, หมวดหมู่, หน่วยนับ, จุดสั่งซื้อขั้นต่ำ/สูงสุด, ราคา, ผู้จำหน่าย, ที่จัดเก็บ, ค้นหา/กรองได้
- **รับเข้า (Stock In)** — บันทึกรับวัตถุดิบพร้อม Lot/Batch, วันหมดอายุ, ราคา, เลขที่ PO, auto-fill ราคา/ผู้จำหน่ายจากทะเบียนวัตถุดิบ, เพิ่มวัตถุดิบใหม่ได้ทันทีจากหน้านี้ถ้ายังไม่มี SKU ในระบบ, ดูประวัติรับเข้าล่าสุดและยกเลิกรายการที่ผิดพลาดได้ (admin) — บันทึกแบบ atomic ทั้งหมดผ่าน Postgres function เดียว
- **เบิกออก (Stock Out)** — บันทึกเบิกใช้ พร้อมแผนก/เลขที่ใบสั่งผลิต ตรวจสอบยอดคงเหลือก่อนเบิกอัตโนมัติ
- **ปรับสต๊อค (Stock Adjustment)** — ปรับยอดหลังตรวจนับจริง พร้อมบันทึกสาเหตุ
- **ประวัติการเคลื่อนไหว (Ledger)** — Audit trail ทุกรายการ กรองตามวันที่/ประเภท/SKU
- **แจ้งเตือน** — วัตถุดิบต่ำกว่าจุดสั่งซื้อ, ล็อตใกล้หมดอายุ/หมดอายุแล้ว (การส่งอีเมลอัตโนมัติรายวันยังไม่ได้ทำในเวอร์ชันนี้ — ดูหัวข้อ "ขอบเขตที่ยังไม่ทำ" ด้านล่าง)
- **รายงาน** — มูลค่าสต๊อคปัจจุบัน, รายงานการเคลื่อนไหวตามช่วงวันที่, ABC Analysis (แบ่งกลุ่มวัตถุดิบตามมูลค่าการเบิกใช้ 80/15/5), Export เป็น CSV (เปิดใน Excel ได้)
- **ผู้ใช้งาน** — Admin กำหนดสิทธิ์ Admin/พนักงาน เปิด-ปิดการใช้งานบัญชี (การสร้างบัญชีใหม่ทำผ่าน Supabase Dashboard)
- **ตั้งค่า** — ชื่อบริษัท, จำนวนวันแจ้งเตือนก่อนหมดอายุ, อีเมลรับแจ้งเตือน, จัดการหมวดหมู่, เปลี่ยนรหัสผ่าน

---

## สถาปัตยกรรม

- **Frontend**: HTML/CSS/JS ธรรมดา (ES modules, ไม่มี build step) ที่ [`index.html`](index.html) และ [`assets/`](assets/)
- **Backend/ข้อมูล**: [Supabase](https://supabase.com) (Postgres + Auth) เรียกตรงจาก browser ด้วย `@supabase/supabase-js` — ไม่มี server แยกต่างหาก
- **สิทธิ์การเข้าถึงข้อมูล**: Row Level Security (RLS) ของ Postgres — ดู [`supabase/policies.sql`](supabase/policies.sql)
- **ธุรกรรมสต๊อก** (รับเข้า/เบิกออก/ปรับ/ยกเลิกรับเข้า): ทำผ่าน Postgres function (RPC) แบบ atomic ทั้งหมด — ดู [`supabase/functions.sql`](supabase/functions.sql)
- **Deploy**: GitHub Actions ([`\.github/workflows/pages.yml`](.github/workflows/pages.yml)) → GitHub Pages เมื่อ push เข้า `main`
- **บัญชีผู้ใช้**: Supabase Auth (อีเมล + รหัสผ่าน)

---

## วิธีติดตั้ง

### ขั้นตอนที่ 1: สร้าง Supabase project

1. ไปที่ [supabase.com](https://supabase.com) สมัคร/เข้าสู่ระบบ แล้วกด **New Project** (ฟรี)
2. ตั้งรหัสผ่านฐานข้อมูล (Database Password) เก็บไว้ให้ดี — ไม่ใช่รหัสผ่านที่ใช้ login เข้าแอป
3. รอจน project สร้างเสร็จ (1-2 นาที)

### ขั้นตอนที่ 2: รัน SQL สร้างตาราง/สิทธิ์/ฟังก์ชัน

ไปที่เมนู **SQL Editor** ในโปรเจกต์ Supabase แล้วรันไฟล์ต่อไปนี้ **ตามลำดับ** (คัดลอกเนื้อหาทั้งไฟล์ไปวางแล้วกด Run ทีละไฟล์):

1. [`supabase/schema.sql`](supabase/schema.sql) — สร้างตารางทั้งหมด
2. [`supabase/policies.sql`](supabase/policies.sql) — เปิด Row Level Security และกำหนดสิทธิ์
3. [`supabase/functions.sql`](supabase/functions.sql) — สร้าง RPC functions สำหรับรับเข้า/เบิกออก/ปรับสต๊อค

### ขั้นตอนที่ 3: เอา Project URL + anon key มาใส่ในโค้ด

1. ในโปรเจกต์ Supabase ไปที่ **Project Settings > API**
2. คัดลอก **Project URL** และ **anon public key**
3. เปิดไฟล์ [`assets/js/supabase-client.js`](assets/js/supabase-client.js) แทนที่ค่า `SUPABASE_URL` และ `SUPABASE_ANON_KEY` ด้วยค่าจริง

> ค่าทั้งสองนี้ไม่ใช่ข้อมูลลับ ปลอดภัยที่จะ commit ขึ้น GitHub เพราะสิทธิ์การเข้าถึงข้อมูลจริงถูกคุมด้วย RLS ไม่ใช่คีย์นี้

### ขั้นตอนที่ 4: สร้างบัญชีผู้ดูแลระบบ (admin) คนแรก

1. ในโปรเจกต์ Supabase ไปที่ **Authentication > Users > Add User**
2. ใส่อีเมล + รหัสผ่าน แล้วกด "Auto Confirm User" (จะได้ login ได้ทันทีโดยไม่ต้องยืนยันอีเมล)
3. ระบบจะสร้างโปรไฟล์ให้อัตโนมัติด้วย role เริ่มต้น `staff` — ต้องอัปเป็น `admin` เองครั้งแรกผ่าน SQL Editor:

   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```

4. หลังจากนั้นสามารถ login เข้าแอปแล้วจัดการสิทธิ์ผู้ใช้คนอื่นได้จากหน้า "ผู้ใช้งาน" ในแอปเลย (แต่การสร้างบัญชีใหม่ยังต้องทำผ่าน Supabase Dashboard เหมือนขั้นตอนนี้)

### ขั้นตอนที่ 5: Push ขึ้น GitHub และเปิด GitHub Pages

1. สร้าง repository ใหม่บน GitHub (ต้องเป็น **Public** ถ้าจะใช้ GitHub Pages แบบฟรี)
2. Push โค้ดในโฟลเดอร์นี้ขึ้น repository:

   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git branch -M main
   git push -u origin main
   ```

3. ในหน้า repository บน GitHub ไปที่ **Settings > Pages**
4. ที่ "Build and deployment" เลือก Source เป็น **GitHub Actions**
5. รอ workflow "Deploy to GitHub Pages" รันเสร็จ (ดูได้ที่แท็บ Actions) แล้วจะได้ลิงก์เว็บแอปที่ `https://<your-username>.github.io/<your-repo>/`

> หลังจากนี้ทุกครั้งที่ push โค้ดเข้า `main` เว็บจะ deploy ใหม่อัตโนมัติ

---

## โครงสร้างข้อมูลใน Supabase

| ตาราง | ใช้เก็บ |
|---|---|
| `items` | ข้อมูลหลักวัตถุดิบ (SKU, ชื่อ, จำนวนคงเหลือ, จุดสั่งซื้อ ฯลฯ) |
| `stock_in` | ประวัติการรับเข้าทุกครั้ง (รวมรายการที่ถูกยกเลิก — เห็นได้จาก `voided_at`) |
| `stock_out` | ประวัติการเบิกออกทุกครั้ง |
| `adjustments` | ประวัติการปรับสต๊อค |
| `ledger` | Audit trail รวมทุกการเคลื่อนไหว (IN/OUT/ADJUST/VOID_IN) |
| `profiles` | โปรไฟล์ผู้ใช้งานและสิทธิ์ (บัญชี login จริงอยู่ใน `auth.users` ของ Supabase) |
| `categories` | รายการหมวดหมู่วัตถุดิบ |
| `settings` | ค่าตั้งค่าระบบ (ชื่อบริษัท, วันแจ้งเตือนหมดอายุ, อีเมล ฯลฯ) |

การเขียนข้อมูลของ `stock_in`/`stock_out`/`adjustments`/`ledger` ทำได้ผ่าน RPC functions เท่านั้น (ไม่มี insert policy ให้เขียนตรง) เพื่อให้การอัปเดตยอดคงเหลือ + บันทึก ledger เป็นธุรกรรมเดียวกันเสมอ (atomic)

## ความปลอดภัย

- บัญชีผู้ใช้จัดการโดย Supabase Auth (อีเมล + รหัสผ่าน) ไม่มีการเก็บรหัสผ่านเองในระบบ
- Row Level Security คุมทุกตาราง: ผู้ใช้ที่ login แล้วและสถานะ `active` เท่านั้นที่อ่านข้อมูลได้, แก้ไขข้อมูลวัตถุดิบ/ผู้ใช้/ตั้งค่าได้เฉพาะ admin
- Supabase anon key ที่ฝังในโค้ด frontend ปลอดภัยที่จะเปิดเผยต่อสาธารณะ เพราะไม่มีสิทธิ์อะไรเกินกว่าที่ RLS อนุญาต

## ขอบเขตที่ยังไม่ทำ (ทำต่อได้)

- อีเมลแจ้งเตือนรายวันอัตโนมัติ (สต๊อคต่ำ/ใกล้หมดอายุ) — แผนคือรันผ่าน GitHub Actions (cron) แทน Apps Script trigger เดิม แต่ยังไม่ได้ทำในเวอร์ชันนี้ตามที่ตกลงกันไว้
- Migrate ข้อมูลจาก Google Sheet เดิม (ถ้ามีข้อมูลจริงอยู่และต้องการย้าย แจ้งได้ทีหลัง)
- FEFO ระดับ lot สำหรับเบิกออก (ปัจจุบันตัดยอดรวมต่อ SKU ไม่ได้ตัดทีละ lot)
- สแกนบาร์โค้ด/QR code, แจ้งเตือนผ่าน LINE Notify, ระบบขอเบิก-อนุมัติหลายขั้นตอน, หลายคลัง/หลายสาขา, แนบไฟล์/รูปภาพ, พิมพ์ใบรับ/ใบเบิกเป็น PDF
