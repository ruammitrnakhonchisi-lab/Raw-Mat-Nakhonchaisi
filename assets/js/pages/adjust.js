import { api } from '../api.js';
import { STATE } from '../app.js';
import { esc, fmtNum, field, val, todayISO, toast, showErr } from '../ui.js';

export async function renderAdjust(content) {
  try {
    const items = await api.getItems();
    STATE.itemsCache = items;

    const options = items.map((it) =>
      '<option value="' + esc(it.sku) + '" data-qty="' + it.qty_on_hand + '" data-unit="' + esc(it.unit) + '">' +
      esc(it.sku) + ' — ' + esc(it.name) + '</option>'
    ).join('');

    content.innerHTML =
      '<div class="card" style="max-width:720px;">' +
      '<p class="muted small">ใช้เมื่อยอดในระบบไม่ตรงกับยอดนับจริง (เช่น หลังตรวจนับสต๊อคประจำงวด)</p>' +
      '<form id="adjustForm" class="form-grid">' +
      '<div class="form-field"><label>วัตถุดิบ (SKU)</label><select id="aj_sku" required><option value="">-เลือกวัตถุดิบ-</option>' + options + '</select></div>' +
      '<div class="form-field"><label>จำนวนในระบบ (ก่อนปรับ)</label><input type="text" id="aj_before" readonly></div>' +
      field('วันที่ปรับ', 'aj_date', todayISO(), false, 'date') +
      field('จำนวนที่นับได้จริง (หลังปรับ)', 'aj_after', '', true, 'number') +
      '<div class="form-field" style="grid-column:1/-1;"><label>สาเหตุ</label><textarea id="aj_reason" rows="2" placeholder="เช่น นับสต๊อคประจำเดือน, ของเสียหาย, ของหาย"></textarea></div>' +
      '</form>' +
      '<div class="form-actions"><button class="btn btn-primary" id="submitAdjust">🛠️ บันทึกการปรับสต๊อค</button></div>' +
      '</div>';

    document.getElementById('aj_sku').addEventListener('change', function () {
      const opt = this.options[this.selectedIndex];
      document.getElementById('aj_before').value = opt.dataset.qty ? fmtNum(opt.dataset.qty) + ' ' + opt.dataset.unit : '';
    });

    document.getElementById('submitAdjust').addEventListener('click', async function (e) {
      e.preventDefault();
      const btn = this;
      const sku = val('aj_sku');
      if (!sku) { toast('กรุณาเลือกวัตถุดิบ', 'error'); return; }
      const after = val('aj_after');
      if (after === '' || Number(after) < 0) { toast('กรุณาระบุจำนวนหลังปรับให้ถูกต้อง', 'error'); return; }

      btn.disabled = true;
      try {
        await api.recordAdjustment({
          p_sku: sku,
          p_txn_date: val('aj_date') || todayISO(),
          p_qty_after: Number(after),
          p_reason: val('aj_reason'),
        });
        toast('บันทึกการปรับสต๊อคสำเร็จ', 'success');
        renderAdjust(content);
      } catch (err) {
        toast(err.message || String(err), 'error');
        btn.disabled = false;
      }
    });
  } catch (err) {
    showErr(content)(err);
  }
}
