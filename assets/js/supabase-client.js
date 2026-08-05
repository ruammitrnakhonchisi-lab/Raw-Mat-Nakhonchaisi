import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ==========================================================
//  ตั้งค่า Supabase — เอาค่าจาก Supabase Dashboard > Project Settings > API
//  Project URL และ anon public key ไม่ใช่ข้อมูลลับ ปลอดภัยที่จะใส่ตรงนี้และ
//  commit ขึ้น GitHub เพราะสิทธิ์การเข้าถึงข้อมูลจริงถูกคุมด้วย Row Level
//  Security (RLS) ที่ฝั่ง Postgres (ดู supabase/policies.sql) ไม่ใช่คีย์นี้
// ==========================================================
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR_ANON_PUBLIC_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
