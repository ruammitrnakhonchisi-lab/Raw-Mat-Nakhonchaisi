import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { STATE } from '../app.js';
import { isPcWireCategory } from '../report-categories.js';
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

function coilRowHtml() {
  return '<div class="coil-row" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;align-items:flex-end;">' +
    '<div class="form-field" style="flex:2;min-width:140px;margin:0;"><label>เลข Coil (จากแท็ก/ใบส่งของ)</label>' +
    '<input type="text" class="coil-no-input" placeholder="เลข Coil"></div>' +
    '<div class="form-field" style="flex:1;min-width:100px;margin:0;"><label>น้ำหนัก/จำนวน</label>' +
    '<input type="number" step="any" class="coil-qty-input" placeholder="0"></div>' +
    '<button type="button" class="btn btn-ghost btn-sm coil-row-remove" title="ลบแถวนี้">✕</button>' +
    '</div>';
}

function drawStockInForm(content) {
  const items = STATE.itemsCache || [];
  const options = items.map((it) =>
    '<option value="' + esc(it.sku) + '" data-price="' + it.unit_price + '" data-supplier="' + esc(it.primary_supplier) + '" data-category="' + esc(it.category) + '">' +
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
    '<div class="form-field si-normal-only"><label>จำนวนรับเข้า</label><input type="number" id="f_si_qty"></div>' +
    '<div class="form-field si-normal-only"><label>Lot / Batch</label><input type="text" id="f_si_lot"></div>' +
    '<div class="form-field si-normal-only"><label>วันหมดอายุ</label><input type="date" id="f_si_exp"></div>' +
    '<div class="si-coil-only" style="display:none;grid-column:1/-1;">' +
    '<label style="display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:5px;">' +
    'รายการ Coil (คีย์เลข Coil จากใบส่งของ + น้ำหนักที่รับเข้าจริงของแต่ละม้วน)</label>' +
    '<div id="si_coil_rows"></div>' +
    '<button type="button" class="btn btn-ghost btn-sm" id="si_addCoilRow">+ เพิ่ม Coil</button>' +
    '<div style="margin-top:8px;font-size:13px;color:var(--muted);">รวมทั้งหมด: <b id="si_coil_total">0</b></div>' +
    '</div>' +
    field('ราคาต่อหน่วย (บาท)', 'si_price', '', false, 'number') +
    field('ผู้จำหน่าย', 'si_supplier', '') +
    field('เลขที่เอกสาร/PO', 'si_po', '') +
    '<div class="form-field" style="grid-column:1/-1;"><label>หมายเหตุ</label><textarea id="si_note" rows="2"></textarea></div>' +
    '</form>' +
    '<div class="form-actions"><button class="btn btn-primary" id="submitStockIn">✅ บันทึกรับเข้า</button></div>' +
    '</div>' +
    '<div class="section-title"><h3>📥 รับเข้าล่าสุด</h3></div>' +
    '<div id="si_recent"><div class="loading-spinner"><div class="spinner"></div></div></div>';

  const coilRows = document.getElementById('si_coil_rows');

  function recalcCoilTotal() {
    let total = 0;
    coilRows.querySelectorAll('.coil-qty-input').forEach((inp) => { total += Number(inp.value) || 0; });
    document.getElementById('si_coil_total').textContent = fmtNum(total);
  }

  function addCoilRow() {
    coilRows.insertAdjacentHTML('beforeend', coilRowHtml());
  }

  coilRows.addEventListener('click', function (e) {
    if (e.target.classList.contains('coil-row-remove')) {
      if (coilRows.querySelectorAll('.coil-row').length > 1) {
        e.target.closest('.coil-row').remove();
      } else {
        e.target.closest('.coil-row').querySelectorAll('input').forEach((inp) => { inp.value = ''; });
      }
      recalcCoilTotal();
    }
  });
  coilRows.addEventListener('input', function (e) {
    if (e.target.classList.contains('coil-qty-input')) recalcCoilTotal();
  });
  document.getElementById('si_addCoilRow').addEventListener('click', addCoilRow);

  function setStockInMode(isPcWire) {
    document.querySelectorAll('.si-normal-only').forEach((el) => { el.style.display = isPcWire ? 'none' : 'block'; });
    document.querySelector('.si-coil-only').style.display = isPcWire ? 'block' : 'none';
    if (isPcWire && !coilRows.querySelector('.coil-row')) {
      addCoilRow();
      recalcCoilTotal();
    }
  }

  document.getElementById('si_sku').addEventListener('change', function () {
    const opt = this.options[this.selectedIndex];
    if (opt && opt.value) {
      document.getElementById('f_si_price').value = opt.dataset.price || '';
      document.getElementById('f_si_supplier').value = opt.dataset.supplier || '';
    }
    setStockInMode(!!(opt && opt.value) && isPcWireCategory(opt.dataset.category));
  });

  document.getElementById('si_newItemBtn').addEventListener('click', () => openQuickAddItemModal(content));

  document.getElementById('submitStockIn').addEventListener('click', async function (e) {
    e.preventDefault();
    const btn = this;
    const sku = val('si_sku');
    if (!sku) { toast('กรุณาเลือกวัตถุดิบ', 'error'); return; }

    const skuSelect = document.getElementById('si_sku');
    const opt = skuSelect.selectedOptions[0];
    const itemName = opt.text;
    const isPcWire = isPcWireCategory(opt.dataset.category);
    const common = {
      p_sku: sku,
      p_txn_date: val('si_date') || todayISO(),
      p_unit_price: val('si_price') === '' ? null : Number(val('si_price')),
      p_supplier: val('si_supplier'),
      p_po_number: val('si_po'),
      p_note: val('si_note'),
    };

    btn.disabled = true;
    try {
      if (isPcWire) {
        const rows = Array.from(coilRows.querySelectorAll('.coil-row')).map((row) => ({
          coilNo: row.querySelector('.coil-no-input').value.trim(),
          qty: Number(row.querySelector('.coil-qty-input').value),
        }));
        const filled = rows.filter((r) => r.coilNo || r.qty > 0);
        const valid = filled.filter((r) => r.coilNo && r.qty > 0);
        if (!filled.length) { toast('กรุณาระบุเลข Coil และน้ำหนักอย่างน้อย 1 ม้วน', 'error'); btn.disabled = false; return; }
        if (valid.length !== filled.length) { toast('กรุณาระบุเลข Coil และน้ำหนักให้ครบทุกแถว หรือลบแถวที่ไม่ใช้ออก', 'error'); btn.disabled = false; return; }

        let newQty = 0;
        let totalQty = 0;
        for (const row of valid) {
          const res = await api.recordStockIn({ ...common, p_qty: row.qty, p_lot_batch: row.coilNo });
          newQty = res.new_qty;
          totalQty += row.qty;
        }
        toast('บันทึกรับเข้าสำเร็จ', 'success');
        renderStockIn(content);
        showSuccessPopup('รับเข้าสำเร็จ', [
          'รับเข้า ' + itemName + ' ' + valid.length + ' coil รวม ' + fmtNum(totalQty) + ' หน่วย',
          'เลข Coil: ' + valid.map((r) => r.coilNo).join(', '),
          'คงเหลือใหม่: ' + fmtNum(newQty),
        ]);
      } else {
        const qty = Number(val('si_qty'));
        if (!qty || qty <= 0) { toast('กรุณาระบุจำนวนรับเข้าให้ถูกต้อง', 'error'); btn.disabled = false; return; }
        const res = await api.recordStockIn({ ...common, p_qty: qty, p_lot_batch: val('si_lot'), p_expiry_date: val('si_exp') || null });
        toast('บันทึกรับเข้าสำเร็จ', 'success');
        renderStockIn(content);
        showSuccessPopup('รับเข้าสำเร็จ', [
          'รับเข้า ' + itemName + ' จำนวน ' + fmtNum(qty) + ' หน่วย',
          'คงเหลือใหม่: ' + fmtNum(res.new_qty),
        ]);
      }
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

    function txnDateLabel(r) {
      return r.txn_date
        ? new Date(r.txn_date + 'T00:00:00').toLocaleDateString('th-TH')
        : new Date(r.created_at).toLocaleString('th-TH');
    }

    const body = rows.map((r) => {
      const voided = !!r.voided_at;
      return '<tr' + (voided ? ' style="opacity:.5;text-decoration:line-through;"' : '') + '>' +
        '<td>' + esc(txnDateLabel(r)) + '</td>' +
        '<td>' + esc(r.sku) + '</td><td>' + esc(r.item_name) + '</td>' +
        '<td>' + fmtNum(r.qty) + '</td><td>' + esc(r.lot_batch) + '</td>' +
        '<td>' + esc(r.po_number) + '</td><td>' + esc(r.recorded_by_name) + '</td>' +
        '<td>' + voidControl(r, voided) + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty-state">ยังไม่มีรายการรับเข้า</td></tr>';

    const cards = rows.map((r) => {
      const voided = !!r.voided_at;
      return '<div class="item-card' + (voided ? ' voided' : '') + '">' +
        '<div class="item-card-top"><div><div class="item-card-name">' + esc(r.item_name) + '</div>' +
        '<div class="item-card-meta">' + esc(r.sku) + ' • ' + esc(txnDateLabel(r)) + '</div></div>' +
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
      '<div class="table-wrap desktop-only"><table><thead><tr><th>วันที่</th><th>SKU</th><th>ชื่อวัตถุดิบ</th><th>จำนวน</th>' +
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
