import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ==========================================================
//  ตั้งค่า Supabase — เอาค่าจาก Supabase Dashboard > Project Settings > API
//  Project URL และ anon public key ไม่ใช่ข้อมูลลับ ปลอดภัยที่จะใส่ตรงนี้และ
//  commit ขึ้น GitHub เพราะสิทธิ์การเข้าถึงข้อมูลจริงถูกคุมด้วย Row Level
//  Security (RLS) ที่ฝั่ง Postgres (ดู supabase/policies.sql) ไม่ใช่คีย์นี้
// ==========================================================
export const SUPABASE_URL = 'https://gtpeueatnktygzxozawn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0cGV1ZWF0bmt0eWd6eG96YXduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTEzMDgsImV4cCI6MjEwMTQ2NzMwOH0.d_vBA98leCG-vNceoU3KdtDhleVEl2IVWlBEU5g9wJk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});
