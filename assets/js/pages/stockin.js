import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { STATE } from '../app.js';
import { esc, fmtNum, fmtMoney, field, val, todayISO, toast, showErr, openModal, closeModal, showSuccessPopup } from '../ui.js';

export async function renderStockIn(content) {
  try {
    const items = await api.getItems();
    STATE.itemsCache = items;
    drawStockInForm(content);
    await loadRecentReceipts(content);
  } catch (err) {
    showErr(content)(err);
  }
}

function drawStockInForm(content) {
  const items = STATE.itemsCache || [];
  const options = items.map((it) =>
    '<option value="' + esc(it.sku) + '" data-price="' + it.unit_price + '" data-supplier="' + esc(it.primary_supplier) + '">' +
    esc(it.name) + '</option>'
  ).join('');

  content.innerHTML =
    '<div class="card" style="max-width:760px;">' +
    '<div class="toolbar" style="margin-bottom:0;">' +
    '<div class="form-field" style="flex:1;min-width:220px;"><label>วัตถุดิบ</label>' +
    '<select id="si_sku" required><option value="">-เลือกวัตถุดิบ-</option>' + options + '</select></div>' +
    '<button type="button" class="btn btn-ghost" id="si_newItemBtn" style="margin-top:20px;">+ วัตถุดิบใหม่</button>' +
    '</div>' +
    '<form id="stockInForm" class="form-grid" style="margin-top:14px;">' +
    field('วันที่รับเข้า', 'si_date', todayISO(), false, 'date') +
    field('จำนวนรับเข้า', 'si_qty', '', true, 'number') +
    field('Lot / Batch', 'si_lot', '') +
    field('วันหมดอายุ', 'si_exp', '', false, 'date') +
    field('ราคาต่อหน่วย (บาท)', 'si_price', '', false, 'number') +
    field('ผู้จำหน่าย', 'si_supplier', '') +
    field('เลขที่เอกสาร/PO', 'si_po', '') +
    '<div class="form-field" style="grid-column:1/-1;"><label>หมายเหตุ</label><textarea id="si_note" rows="2"></textarea></div>' +
    '</form>' +
    '<div class="form-actions"><button class="btn btn-primary" id="submitStockIn">✅ บันทึกรับเข้า</button></div>' +
    '</div>' +
    '<div class="section-title"><h3>📥 รับเข้าล่าสุด</h3></div>' +
    '<div id="si_recent"><div class="loading-spinner"><div class="spinner"></div></div></div>';

  document.getElementById('si_sku').addEventListener('change', function () {
    const opt = this.options[this.selectedIndex];
    if (opt && opt.value) {
      document.getElementById('f_si_price').value = opt.dataset.price || '';
      document.getElementById('f_si_supplier').value = opt.dataset.supplier || '';
    }
  });

  document.getElementById('si_newItemBtn').addEventListener('click', () => openQuickAddItemModal(content));

  document.getElementById('submitStockIn').addEventListener('click', async function (e) {
    e.preventDefault();
    const btn = this;
    const sku = val('si_sku');
    if (!sku) { toast('กรุณาเลือกวัตถุดิบ', 'error'); return; }
    const qty = Number(val('si_qty'));
    if (!qty || qty <= 0) { toast('กรุณาระบุจำนวนรับเข้าให้ถูกต้อง', 'error'); return; }

    const itemName = document.getElementById('si_sku').selectedOptions[0].text;

    btn.disabled = true;
    try {
      const res = await api.recordStockIn({
        p_sku: sku,
        p_txn_date: val('si_date') || todayISO(),
        p_qty: qty,
        p_lot_batch: val('si_lot'),
        p_expiry_date: val('si_exp') || null,
        p_unit_price: val('si_price') === '' ? null : Number(val('si_price')),
        p_supplier: val('si_supplier'),
        p_po_number: val('si_po'),
        p_note: val('si_note'),
      });
      toast('บันทึกรับเข้าสำเร็จ', 'success');
      renderStockIn(content);
      showSuccessPopup('รับเข้าสำเร็จ', [
        'รับเข้า ' + itemName + ' จำนวน ' + fmtNum(qty) + ' หน่วย',
        'คงเหลือใหม่: ' + fmtNum(res.new_qty),
      ]);
    } catch (err) {
      toast(err.message || String(err), 'error');
      btn.disabled = false;
    }
  });
}

function openQuickAddItemModal(content) {
  const body =
    '<form id="quickAddItemForm" class="form-grid">' +
    field('SKU', 'qa_sku', '', true) +
    field('ชื่อวัตถุดิบ', 'qa_name', '', true) +
    field('หมวดหมู่', 'qa_cat', '') +
    field('หน่วยนับ (เช่น กก., ลิตร, ชิ้น)', 'qa_unit', '') +
    field('จุดสั่งซื้อขั้นต่ำ', 'qa_min', '0', false, 'number') +
    field('ราคาต่อหน่วย (บาท)', 'qa_price', '0', false, 'number') +
    field('ผู้จำหน่ายหลัก', 'qa_supplier', '') +
    field('ที่จัดเก็บ', 'qa_loc', '') +
    '</form>' +
    '<div class="form-actions"><button class="btn btn-ghost" id="qa_cancel">ยกเลิก</button>' +
    '<button class="btn btn-primary" id="qa_save">เพิ่มวัตถุดิบ</button></div>';

  openModal('เพิ่มวัตถุดิบใหม่ (ระหว่างรับเข้า)', body, function () {
    document.getElementById('qa_cancel').addEventListener('click', closeModal);
    document.getElementById('qa_save').addEventListener('click', async function () {
      const sku = val('qa_sku').trim();
      const name = val('qa_name').trim();
      if (!sku || !name) { toast('กรุณาระบุ SKU และชื่อวัตถุดิบ', 'error'); return; }
      try {
        await api.quickAddItem({
          p_sku: sku,
          p_name: name,
          p_category: val('qa_cat'),
          p_unit: val('qa_unit'),
          p_reorder_point: Number(val('qa_min')) || 0,
          p_max_stock: 0,
          p_unit_price: Number(val('qa_price')) || 0,
          p_primary_supplier: val('qa_supplier'),
          p_storage_location: val('qa_loc'),
        });
        toast('เพิ่มวัตถุดิบสำเร็จ', 'success');
        closeModal();
        const items = await api.getItems();
        STATE.itemsCache = items;
        drawStockInForm(content);
        await loadRecentReceipts(content);
        const select = document.getElementById('si_sku');
        select.value = sku;
        select.dispatchEvent(new Event('change'));
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    });
  });
}

async function loadRecentReceipts(content) {
  const target = document.getElementById('si_recent');
  if (!target) return;
  try {
    const rows = await api.getRecentStockIn(10);
    const isAdmin = AUTH.profile && AUTH.profile.role === 'admin';

    function voidControl(r, voided) {
      return voided
        ? '<span class="badge badge-muted">ยกเลิกแล้ว</span>'
        : (isAdmin ? '<button class="btn btn-ghost btn-sm" data-void="' + r.id + '">ยกเลิกรายการ</button>' : '');
    }

    const body = rows.map((r) => {
      const voided = !!r.voided_at;
      return '<tr' + (voided ? ' style="opacity:.5;text-decoration:line-through;"' : '') + '>' +
        '<td>' + esc(new Date(r.created_at).toLocaleString('th-TH')) + '</td>' +
        '<td>' + esc(r.sku) + '</td><td>' + esc(r.item_name) + '</td>' +
        '<td>' + fmtNum(r.qty) + '</td><td>' + esc(r.lot_batch) + '</td>' +
        '<td>' + esc(r.po_number) + '</td><td>' + esc(r.recorded_by_name) + '</td>' +
        '<td>' + voidControl(r, voided) + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty-state">ยังไม่มีรายการรับเข้า</td></tr>';

    const cards = rows.map((r) => {
      const voided = !!r.voided_at;
      return '<div class="item-card' + (voided ? ' voided' : '') + '">' +
        '<div class="item-card-top"><div><div class="item-card-name">' + esc(r.item_name) + '</div>' +
        '<div class="item-card-meta">' + esc(r.sku) + ' • ' + esc(new Date(r.created_at).toLocaleString('th-TH')) + '</div></div>' +
        voidControl(r, voided) + '</div>' +
        '<div class="item-card-stats">' +
        '<div><span class="lbl">จำนวน</span><span class="val">' + fmtNum(r.qty) + '</span></div>' +
        '<div><span class="lbl">Lot</span><span class="val">' + esc(r.lot_batch || '-') + '</span></div>' +
        '<div><span class="lbl">PO</span><span class="val">' + esc(r.po_number || '-') + '</span></div>' +
        '</div>' +
        '<div class="item-card-loc">ผู้บันทึก: ' + esc(r.recorded_by_name || '-') + '</div>' +
        '</div>';
    }).join('') || '<div class="empty-state">ยังไม่มีรายการรับเข้า</div>';

    target.innerHTML =
      '<div class="table-wrap desktop-only"><table><thead><tr><th>เวลา</th><th>SKU</th><th>ชื่อวัตถุดิบ</th><th>จำนวน</th>' +
      '<th>Lot</th><th>PO</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>' + body + '</tbody></table></div>' +
      '<div class="item-card-list">' + cards + '</div>';

    target.querySelectorAll('[data-void]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        if (!confirm('ยืนยันยกเลิกรายการรับเข้านี้? ยอดคงเหลือจะถูกหักคืน')) return;
        try {
          await api.voidStockIn(Number(btn.dataset.void));
          toast('ยกเลิกรายการสำเร็จ', 'success');
          renderStockIn(content);
        } catch (err) {
          toast(err.message || String(err), 'error');
        }
      });
    });
  } catch (err) {
    target.innerHTML = '<div class="alert alert-error">โหลดประวัติรับเข้าไม่สำเร็จ: ' + esc(err.message || String(err)) + '</div>';
  }
}
