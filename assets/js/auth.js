import { supabase } from './supabase-client.js';

export const STATE = {
  session: null,
  profile: null, // { id, email, display_name, role, status }
};

export async function loadProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: mapAuthError(error) };

  const profile = await loadProfile(data.user.id);
  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, message: 'ไม่พบโปรไฟล์ผู้ใช้งาน กรุณาติดต่อผู้ดูแลระบบ' };
  }
  if (profile.status !== 'active') {
    await supabase.auth.signOut();
    return { ok: false, message: 'บัญชีนี้ถูกระงับการใช้งาน' };
  }

  STATE.session = data.session;
  STATE.profile = profile;
  return { ok: true };
}

export async function logout() {
  await supabase.auth.signOut();
  STATE.session = null;
  STATE.profile = null;
}

export async function restoreSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;

  const profile = await loadProfile(data.session.user.id);
  if (!profile || profile.status !== 'active') {
    await supabase.auth.signOut();
    return false;
  }
  STATE.session = data.session;
  STATE.profile = profile;
  return true;
}

function mapAuthError(error) {
  var msg = String(error && error.message || '');
  if (msg.indexOf('Invalid login credentials') > -1) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (msg.indexOf('Email not confirmed') > -1) return 'อีเมลนี้ยังไม่ได้ยืนยัน';
  return msg || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
}
