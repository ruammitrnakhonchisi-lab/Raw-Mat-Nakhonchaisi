import { api } from '../api.js';
import { esc, fmtNum, val, showErr, toast, openModal, closeModal } from '../ui.js';
import { STATE as AUTH } from '../auth.js';

const TYPE_LABEL = { IN: 'รับเข้า', OUT: 'เบิกออก', ADJUST: 'ปรับสต๊อค', VOID_IN: 'ยกเลิกรับเข้า' };
const TYPE_BADGE = { IN: 'badge-success', OUT: 'badge-danger', ADJUST: 'badge-warn', VOID_IN: 'badge-muted' };

/** แสดงวันที่ทำรายการจริง (txn_date) แทนวันที่บันทึกเข้าระบบ เพื่อให้รายการย้อนหลัง
 * แสดงวันที่ถูกต้อง — ถ้ายังไม่ได้รัน migration (add_ledger_txn_date.sql) จะ fallback ไปใช้ created_at */
function txnDateLabel(r) {
  return r.txn_date
    ? new Date(r.txn_date + 'T00:00:00').toLocaleDateString('th-TH')
    : new Date(r.created_at).toLocaleString('th-TH');
}

/** ผู้ดูแลระบบแก้ไขได้เฉพาะรายการรับเข้า/เบิกออกที่มี ref ต้นทาง */
function canEdit(r) {
  return AUTH.profile && AUTH.profile.role === 'admin' && (r.txn_type === 'IN' || r.txn_type === 'OUT') &&
    /^stock_(in|out)#/.test(r.ref || '');
}

function editBtn(r) {
  return canEdit(r) ? '<button class="btn btn-ghost lg_edit" data-id="' + r.id + '">✏️ แก้ไข</button>' : '';
}

function openEditModal(r, reload) {
  const isIn = r.txn_type === 'IN';
  const label = isIn ? 'รับเข้า' : 'เบิกออก';
  const body =
    '<div class="small muted" style="margin-bottom:10px">' + label + ' · ' + esc(r.item_name) +
    ' · ปัจจุบัน ' + fmtNum(Math.abs(r.delta)) + '</div>' +
    '<div class="form-grid">' +
    '<div class="form-field"><label>จำนวน' + label + ' (ที่ถูกต้อง)</label>' +
    '<input type="number" id="ed_qty" min="0" step="any" value="' + esc(Math.abs(r.delta)) + '"></div>' +
    '<div class="form-field"><label>วันที่ทำรายการ</label><input type="date" id="ed_date" value="' + esc(r.txn_date || '') + '"></div>' +
    '<div class="form-field" style="grid-column:1 / -1"><label>หมายเหตุ</label>' +
    '<textarea id="ed_note" rows="2">' + esc(r.note || '') + '</textarea></div>' +
    '</div>' +
    '<div class="small muted">ระบบจะปรับยอดคงเหลือและยอดสะสมในประวัติให้ถูกต้องอัตโนมัติ ' +
    'หากบันทึกผิดวัตถุดิบ ให้ยกเลิกรายการแล้วบันทึกใหม่</div>' +
    '<div class="form-actions"><button class="btn btn-ghost" id="ed_cancel">ยกเลิก</button>' +
    '<button class="btn btn-primary" id="ed_save">บันทึกการแก้ไข</button></div>';
  openModal('แก้ไขรายการ', body, function () {
    document.getElementById('ed_cancel').addEventListener('click', closeModal);
    document.getElementById('ed_save').addEventListener('click', async function (e) {
      const qty = Number(document.getElementById('ed_qty').value);
      if (!(qty > 0)) { toast('กรุณาระบุจำนวนให้ถูกต้อง', 'error'); return; }
      e.target.disabled = true;
      try {
        await api.editLedgerEntry({
          p_ledger_id: r.id,
          p_qty: qty,
          p_txn_date: document.getElementById('ed_date').value || null,
          p_note: document.getElementById('ed_note').value.trim(),
        });
        closeModal();
        toast('แก้ไขรายการแล้ว');
        reload();
      } catch (err) {
        e.target.disabled = false;
        toast(err.message, 'error');
      }
    });
  });
}

export async function renderLedger(content) {
  let items = [];
  try {
    items = await api.getItems();
  } catch (err) {
    // ไม่ต้องบล็อกทั้งหน้าถ้าโหลดรายชื่อวัตถุดิบไม่สำเร็จ — แค่ตัวกรองวัตถุดิบจะว่างไป
  }
  const itemOptions = items.map((it) =>
    '<option value="' + esc(it.sku) + '">' + esc(it.sku) + ' — ' + esc(it.name) + '</option>'
  ).join('');

  content.innerHTML =
    '<div class="toolbar">' +
    '<select id="lg_sku"><option value="">ทุกวัตถุดิบ</option>' + itemOptions + '</select>' +
    '<input type="date" id="lg_from"><input type="date" id="lg_to">' +
    '<select id="lg_type"><option value="">ทุกประเภท</option><option value="IN">รับเข้า</option>' +
    '<option value="OUT">เบิกออก</option><option value="ADJUST">ปรับสต๊อค</option><option value="VOID_IN">ยกเลิกรับเข้า</option></select>' +
    '<button class="btn btn-ghost" id="lg_filter">กรอง</button>' +
    '<div class="spacer"></div>' +
    '</div><div id="lg_table"></div>';

  async function load() {
    try {
      const rows = await api.getLedger({ sku: val('lg_sku'), dateFrom: val('lg_from'), dateTo: val('lg_to'), type: val('lg_type') });
      const tbody = rows.map((r) => {
        const badge = TYPE_BADGE[r.txn_type] || 'badge-muted';
        const label = TYPE_LABEL[r.txn_type] || r.txn_type;
        return '<tr><td>' + esc(txnDateLabel(r)) + '</td><td><span class="badge ' + badge + '">' + label + '</span></td>' +
          '<td>' + esc(r.item_name) + '</td><td>' + fmtNum(r.delta) + '</td>' +
          '<td>' + fmtNum(r.balance_after) + '</td><td>' + esc(r.note) + '</td><td>' + esc(r.recorded_by_name) + '</td><td>' + editBtn(r) + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty-state">ไม่พบรายการ</td></tr>';

      const cards = rows.map((r) => {
        const badge = TYPE_BADGE[r.txn_type] || 'badge-muted';
        const label = TYPE_LABEL[r.txn_type] || r.txn_type;
        return '<div class="item-card">' +
          '<div class="item-card-top"><div><div class="item-card-name">' + esc(r.item_name) + '</div>' +
          '<div class="item-card-meta">' + esc(txnDateLabel(r)) + '</div></div>' +
          '<span class="badge ' + badge + '">' + label + '</span></div>' +
          '<div class="item-card-stats">' +
          '<div><span class="lbl">เปลี่ยนแปลง</span><span class="val">' + fmtNum(r.delta) + '</span></div>' +
          '<div><span class="lbl">คงเหลือ</span><span class="val">' + fmtNum(r.balance_after) + '</span></div>' +
          '<div><span class="lbl">ผู้บันทึก</span><span class="val">' + esc(r.recorded_by_name || '-') + '</span></div>' +
          '</div>' +
          '<div class="item-card-loc">หมายเหตุ: ' + esc(r.note || '-') + '</div>' +
          (canEdit(r) ? '<div style="margin-top:8px">' + editBtn(r) + '</div>' : '') +
          '</div>';
      }).join('') || '<div class="empty-state">ไม่พบรายการ</div>';

      document.getElementById('lg_table').innerHTML =
        '<div class="table-wrap desktop-only"><table><thead><tr><th>วันที่</th><th>ประเภท</th><th>ชื่อวัตถุดิบ</th>' +
        '<th>จำนวนเปลี่ยนแปลง</th><th>คงเหลือ</th><th>หมายเหตุ</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>' + tbody + '</tbody></table></div>' +
        '<div class="item-card-list">' + cards + '</div>';
      document.querySelectorAll('.lg_edit').forEach((b) => b.addEventListener('click', () => {
        openEditModal(rows.find((x) => String(x.id) === b.dataset.id), load);
      }));
    } catch (err) {
      showErr(content)(err);
    }
  }
  document.getElementById('lg_filter').addEventListener('click', load);
  load();
}
