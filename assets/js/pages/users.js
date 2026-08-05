import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { esc, field, val, toast, showErr, openModal, closeModal } from '../ui.js';

let usersCache = [];

export async function renderUsers(content) {
  if (!AUTH.profile || AUTH.profile.role !== 'admin') {
    content.innerHTML = '<div class="alert alert-error">เฉพาะผู้ดูแลระบบเท่านั้น</div>';
    return;
  }
  try {
    const users = await api.getUsers();
    usersCache = users;
    const rows = users.map((u) =>
      '<tr><td>' + esc(u.email) + '</td><td>' + esc(u.display_name) + '</td>' +
      '<td>' + (u.role === 'admin' ? '<span class="badge badge-warn">ผู้ดูแลระบบ</span>' : '<span class="badge badge-muted">พนักงาน</span>') + '</td>' +
      '<td>' + (u.status === 'active' ? '<span class="badge badge-success">ใช้งาน</span>' : '<span class="badge badge-danger">ระงับ</span>') + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-edit="' + u.id + '">แก้ไข</button></td></tr>'
    ).join('') || '<tr><td colspan="5" class="empty-state">ยังไม่มีผู้ใช้งาน</td></tr>';

    content.innerHTML =
      '<div class="alert alert-info">การสร้างบัญชีใหม่ (อีเมล + รหัสผ่าน) ทำผ่าน Supabase Dashboard &gt; Authentication &gt; Add User ' +
      'จากนั้นกลับมาตั้งชื่อ/สิทธิ์ที่หน้านี้ได้เลย (ระบบสร้างโปรไฟล์ให้อัตโนมัติเมื่อมีผู้ใช้ใหม่)</div>' +
      '<div class="table-wrap"><table><thead><tr><th>อีเมล</th><th>ชื่อ-สกุล</th><th>สิทธิ์</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';

    content.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => editUser(btn.dataset.edit, content));
    });
  } catch (err) {
    showErr(content)(err);
  }
}

function editUser(userId, content) {
  const u = usersCache.find((x) => x.id === userId);
  if (!u) return;
  const isSelf = AUTH.profile.id === u.id;

  const body =
    '<form id="userForm" class="form-grid">' +
    '<div class="form-field" style="grid-column:1/-1;"><label>อีเมล</label><input type="text" value="' + esc(u.email) + '" disabled></div>' +
    field('ชื่อ-สกุล', 'u_name', u.display_name) +
    '<div class="form-field"><label>สิทธิ์</label><select id="f_u_role" ' + (isSelf ? 'disabled' : '') + '>' +
    '<option value="staff" ' + (u.role !== 'admin' ? 'selected' : '') + '>พนักงาน</option>' +
    '<option value="admin" ' + (u.role === 'admin' ? 'selected' : '') + '>ผู้ดูแลระบบ</option></select></div>' +
    '<div class="form-field"><label>สถานะ</label><select id="f_u_status" ' + (isSelf ? 'disabled' : '') + '>' +
    '<option value="active" ' + (u.status === 'active' ? 'selected' : '') + '>ใช้งาน</option>' +
    '<option value="disabled" ' + (u.status === 'disabled' ? 'selected' : '') + '>ระงับ</option></select></div>' +
    '</form>' +
    (isSelf ? '<p class="muted small">ไม่สามารถเปลี่ยนสิทธิ์/สถานะบัญชีตัวเองได้</p>' : '') +
    '<div class="form-actions"><button class="btn btn-ghost" id="u_cancel">ยกเลิก</button><button class="btn btn-primary" id="u_save">บันทึก</button></div>';

  openModal('แก้ไขผู้ใช้งาน: ' + (u.display_name || u.email), body, function () {
    document.getElementById('u_cancel').addEventListener('click', closeModal);
    document.getElementById('u_save').addEventListener('click', async function () {
      try {
        await api.adminUpdateProfile({
          p_user_id: u.id,
          p_display_name: val('u_name'),
          p_role: isSelf ? null : val('u_role'),
          p_status: isSelf ? null : val('u_status'),
        });
        toast('บันทึกสำเร็จ', 'success');
        closeModal();
        renderUsers(content);
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    });
  });
}
