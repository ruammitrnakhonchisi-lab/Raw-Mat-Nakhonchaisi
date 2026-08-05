import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { field, val, toast, showErr } from '../ui.js';

export async function renderSettings(content) {
  try {
    const s = await api.getSettings();
    const isAdmin = AUTH.profile && AUTH.profile.role === 'admin';

    content.innerHTML =
      '<div class="card" style="max-width:640px;">' +
      '<h3>ตั้งค่าทั่วไป</h3>' +
      (isAdmin ? '' : '<p class="muted small">เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขได้</p>') +
      '<form class="form-grid">' +
      field('ชื่อบริษัท', 'st_company', s.CompanyName || '') +
      field('แจ้งเตือนล่วงหน้าก่อนหมดอายุ (วัน)', 'st_expdays', s.ExpiryAlertDays || 30, false, 'number') +
      field('อีเมลรับการแจ้งเตือน', 'st_email', s.AlertEmail || '', false, 'email') +
      '<div class="form-field"><label>เปิดการแจ้งเตือนอัตโนมัติทางอีเมล (รายวัน)</label>' +
      '<select id="f_st_enabled"><option value="TRUE" ' + (s.LowStockEmailEnabled === 'TRUE' ? 'selected' : '') + '>เปิด</option>' +
      '<option value="FALSE" ' + (s.LowStockEmailEnabled === 'FALSE' ? 'selected' : '') + '>ปิด</option></select></div>' +
      '</form>' +
      '<p class="muted small">หมายเหตุ: ยังไม่มีการส่งอีเมลจริงในเวอร์ชันนี้ (จะทำผ่าน GitHub Actions ในเฟสถัดไป)</p>' +
      (isAdmin ? '<div class="form-actions"><button class="btn btn-primary" id="saveSettingsBtn">บันทึกการตั้งค่า</button></div>' : '') +
      '</div>' +

      (isAdmin ?
        '<div class="card" style="max-width:640px;margin-top:16px;">' +
        '<h3>หมวดหมู่วัตถุดิบ</h3>' +
        '<div style="display:flex;gap:8px;"><input type="text" id="newCatInput" placeholder="ชื่อหมวดหมู่ใหม่" style="flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:8px;">' +
        '<button class="btn btn-ghost" id="addCatBtn">+ เพิ่ม</button></div>' +
        '</div>' : '') +

      '<div class="card" style="max-width:640px;margin-top:16px;">' +
      '<h3>เปลี่ยนรหัสผ่านของฉัน</h3>' +
      '<form class="form-grid">' +
      field('รหัสผ่านใหม่', 'pw_new', '', false, 'password') +
      field('ยืนยันรหัสผ่านใหม่', 'pw_confirm', '', false, 'password') +
      '</form>' +
      '<div class="form-actions"><button class="btn btn-ghost" id="changePwBtn">เปลี่ยนรหัสผ่าน</button></div>' +
      '</div>';

    if (isAdmin) {
      document.getElementById('saveSettingsBtn').addEventListener('click', async function () {
        try {
          await api.saveSettings({
            CompanyName: val('st_company'), ExpiryAlertDays: val('st_expdays'),
            AlertEmail: val('st_email'), LowStockEmailEnabled: val('st_enabled'),
          });
          toast('บันทึกการตั้งค่าสำเร็จ', 'success');
        } catch (err) {
          toast(err.message || String(err), 'error');
        }
      });

      document.getElementById('addCatBtn').addEventListener('click', async function () {
        const name = document.getElementById('newCatInput').value.trim();
        if (!name) return;
        try {
          await api.addCategory(name);
          toast('เพิ่มหมวดหมู่สำเร็จ', 'success');
          document.getElementById('newCatInput').value = '';
        } catch (err) {
          toast(err.message || String(err), 'error');
        }
      });
    }

    document.getElementById('changePwBtn').addEventListener('click', async function () {
      const newPw = val('pw_new'), confirmPw = val('pw_confirm');
      if (!newPw || newPw.length < 6) { toast('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return; }
      if (newPw !== confirmPw) { toast('ยืนยันรหัสผ่านไม่ตรงกัน', 'error'); return; }
      try {
        await api.changeMyPassword(newPw);
        toast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    });
  } catch (err) {
    showErr(content)(err);
  }
}
