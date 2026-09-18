import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { STATE } from '../app.js';
import { isPcWireCategory } from '../report-categories.js';
import { esc, fmtNum, field, val, todayISO, toast, showErr, showSuccessPopup } from '../ui.js';

export async function renderStockOut(content) {
  try {
    const items = await api.getItems();
    STATE.itemsCache = items;

    const options = items.map((it) =>
      '<option value="' + esc(it.sku) + '" data-qty="' + it.qty_on_hand + '" data-unit="' + esc(it.unit) + '" data-id="' + it.id + '" data-category="' + esc(it.category) + '">' +
      esc(it.name) + '</option>'
    ).join('');

    content.innerHTML =
      '<div class="card" style="max-width:720px;">' +
      '<form id="stockOutForm" class="form-grid">' +
      '<div class="form-field"><label>วัตถุดิบ</label><select id="so_sku" required><option value="">-เลือกวัตถุดิบ-</option>' + options + '</select></div>' +
      '<div class="form-field"><label>คงเหลือปัจจุบัน</label><input type="text" id="so_avail" readonly value=""></div>' +
      field('วันที่เบิก', 'so_date', todayISO(), false, 'date') +
      '<div class="form-field so-normal-only"><label>จำนวนเบิก</label><input type="number" id="f_so_qty" required></div>' +
      '<div class="form-field so-coil-only" style="display:none;"><label>เลือก Coil (อ่านเลขจากแท็กที่ติดมากับม้วนลวด)</label>' +
      '<select id="so_coil"><option value="">-เลือก Coil-</option></select></div>' +
      '<div class="form-field so-coil-only" style="display:none;"><label>จำนวนที่เบิกจาก Coil นี้</label>' +
      '<input type="number" step="any" id="f_so_coil_qty"></div>' +
      field('หน่วยงาน/แผนกที่เบิก', 'so_dept', '') +
      field('เลขที่ใบสั่งผลิต (Job/WO)', 'so_job', '') +
      field('ผู้เบิก', 'so_by', (AUTH.profile && AUTH.profile.display_name) || '') +
      field('ผู้อนุมัติ', 'so_approve', '') +
      '<div class="form-field" style="grid-column:1/-1;"><label>หมายเหตุ</label><textarea id="so_note" rows="2"></textarea></div>' +
      '</form>' +
      '<div class="form-actions"><button class="btn btn-danger" id="submitStockOut">📤 บันทึกเบิกออก</button></div>' +
      '</div>';

    let availableCoils = [];

    function setStockOutMode(isPcWire) {
      document.querySelectorAll('.so-normal-only').forEach((el) => { el.style.display = isPcWire ? 'none' : 'block'; });
      document.querySelectorAll('.so-coil-only').forEach((el) => { el.style.display = isPcWire ? 'block' : 'none'; });
    }

    async function loadCoilsForItem(itemId) {
      const select = document.getElementById('so_coil');
      select.innerHTML = '<option value="">กำลังโหลด...</option>';
      document.getElementById('f_so_coil_qty').value = '';
      try {
        availableCoils = await api.getAvailableCoils(itemId);
        select.innerHTML = '<option value="">-เลือก Coil-</option>' +
          availableCoils.map((c) =>
            '<option value="' + c.id + '" data-remaining="' + c.remaining_qty + '">' +
            'Coil ' + esc(c.lot_batch || '(ไม่มีเลข)') + ' — คงเหลือ ' + fmtNum(c.remaining_qty) + '</option>'
          ).join('') || '<option value="">ไม่มี Coil คงเหลือ</option>';
      } catch (err) {
        availableCoils = [];
        select.innerHTML = '<option value="">โหลด Coil ไม่สำเร็จ</option>';
        toast(err.message || String(err), 'error');
      }
    }

    document.getElementById('so_sku').addEventListener('change', async function () {
      const opt = this.options[this.selectedIndex];
      document.getElementById('so_avail').value = opt.dataset.qty ? fmtNum(opt.dataset.qty) + ' ' + opt.dataset.unit : '';
      const isPcWire = !!opt.value && isPcWireCategory(opt.dataset.category);
      setStockOutMode(isPcWire);
      if (isPcWire) await loadCoilsForItem(Number(opt.dataset.id));
    });

    document.getElementById('so_coil').addEventListener('change', function () {
      const opt = this.options[this.selectedIndex];
      document.getElementById('f_so_coil_qty').value = opt && opt.dataset.remaining ? opt.dataset.remaining : '';
    });

    document.getElementById('submitStockOut').addEventListener('click', async function (e) {
      e.preventDefault();
      const btn = this;
      const sku = val('so_sku');
      if (!sku) { toast('กรุณาเลือกวัตถุดิบ', 'error'); return; }
      const opt = document.getElementById('so_sku').selectedOptions[0];
      const itemName = opt.text;
      const isPcWire = isPcWireCategory(opt.dataset.category);

      const common = {
        p_sku: sku,
        p_txn_date: val('so_date') || todayISO(),
        p_department: val('so_dept'),
        p_job_order_no: val('so_job'),
        p_requested_by: val('so_by'),
        p_approved_by: val('so_approve'),
        p_note: val('so_note'),
      };

      btn.disabled = true;
      try {
        let payload;
        let qty;
        if (isPcWire) {
          const coilId = val('so_coil');
          if (!coilId) { toast('กรุณาเลือก Coil ที่จะเบิก (อ่านเลขจากแท็กที่ติดมากับม้วน)', 'error'); btn.disabled = false; return; }
          qty = Number(val('so_coil_qty'));
          if (!qty || qty <= 0) { toast('กรุณาระบุจำนวนที่เบิกจาก Coil นี้ให้ถูกต้อง', 'error'); btn.disabled = false; return; }
          const coil = availableCoils.find((c) => String(c.id) === String(coilId));
          if (coil && qty > Number(coil.remaining_qty)) {
            toast('จำนวนคงเหลือใน Coil นี้ไม่พอ (คงเหลือ ' + fmtNum(coil.remaining_qty) + ')', 'error');
            btn.disabled = false;
            return;
          }
          payload = { ...common, p_qty: qty, p_coil_stock_in_id: Number(coilId) };
        } else {
          qty = Number(val('so_qty'));
          if (!qty || qty <= 0) { toast('กรุณาระบุจำนวนเบิกให้ถูกต้อง', 'error'); btn.disabled = false; return; }
          payload = { ...common, p_qty: qty };
        }

        const res = await api.recordStockOut(payload);
        toast('บันทึกเบิกออกสำเร็จ', 'success');
        renderStockOut(content);
        showSuccessPopup('เบิกออกสำเร็จ', [
          'เบิกออก ' + itemName + ' จำนวน ' + fmtNum(qty) + ' หน่วย',
          'คงเหลือใหม่: ' + fmtNum(res.new_qty),
        ]);
      } catch (err) {
        toast(err.message || String(err), 'error');
        btn.disabled = false;
      }
    });
  } catch (err) {
    showErr(content)(err);
  }
}
