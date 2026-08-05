import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { STATE } from '../app.js';
import { esc, fmtNum, field, val, todayISO, toast, showErr } from '../ui.js';

export async function renderStockOut(content) {
  try {
    const items = await api.getItems();
    STATE.itemsCache = items;

    const options = items.map((it) =>
      '<option value="' + esc(it.sku) + '" data-qty="' + it.qty_on_hand + '" data-unit="' + esc(it.unit) + '">' +
      esc(it.sku) + ' — ' + esc(it.name) + '</option>'
    ).join('');

    content.innerHTML =
      '<div class="card" style="max-width:720px;">' +
      '<form id="stockOutForm" class="form-grid">' +
      '<div class="form-field"><label>วัตถุดิบ (SKU)</label><select id="so_sku" required><option value="">-เลือกวัตถุดิบ-</option>' + options + '</select></div>' +
      '<div class="form-field"><label>คงเหลือปัจจุบัน</label><input type="text" id="so_avail" readonly value=""></div>' +
      field('วันที่เบิก', 'so_date', todayISO(), false, 'date') +
      field('จำนวนเบิก', 'so_qty', '', true, 'number') +
      field('หน่วยงาน/แผนกที่เบิก', 'so_dept', '') +
      field('เลขที่ใบสั่งผลิต (Job/WO)', 'so_job', '') +
      field('ผู้เบิก', 'so_by', (AUTH.profile && AUTH.profile.display_name) || '') +
      field('ผู้อนุมัติ', 'so_approve', '') +
      '<div class="form-field" style="grid-column:1/-1;"><label>หมายเหตุ</label><textarea id="so_note" rows="2"></textarea></div>' +
      '</form>' +
      '<div class="form-actions"><button class="btn btn-danger" id="submitStockOut">📤 บันทึกเบิกออก</button></div>' +
      '</div>';

    document.getElementById('so_sku').addEventListener('change', function () {
      const opt = this.options[this.selectedIndex];
      document.getElementById('so_avail').value = opt.dataset.qty ? fmtNum(opt.dataset.qty) + ' ' + opt.dataset.unit : '';
    });

    document.getElementById('submitStockOut').addEventListener('click', async function (e) {
      e.preventDefault();
      const btn = this;
      const sku = val('so_sku');
      if (!sku) { toast('กรุณาเลือกวัตถุดิบ', 'error'); return; }
      const qty = Number(val('so_qty'));
      if (!qty || qty <= 0) { toast('กรุณาระบุจำนวนเบิกให้ถูกต้อง', 'error'); return; }

      btn.disabled = true;
      try {
        const res = await api.recordStockOut({
          p_sku: sku,
          p_txn_date: val('so_date') || todayISO(),
          p_qty: qty,
          p_department: val('so_dept'),
          p_job_order_no: val('so_job'),
          p_requested_by: val('so_by'),
          p_approved_by: val('so_approve'),
          p_note: val('so_note'),
        });
        toast('บันทึกเบิกออกสำเร็จ — คงเหลือใหม่ ' + fmtNum(res.new_qty), 'success');
        renderStockOut(content);
      } catch (err) {
        toast(err.message || String(err), 'error');
        btn.disabled = false;
      }
    });
  } catch (err) {
    showErr(content)(err);
  }
}
