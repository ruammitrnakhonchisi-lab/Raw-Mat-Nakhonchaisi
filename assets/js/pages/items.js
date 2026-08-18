import { api } from '../api.js';
import { STATE } from '../app.js';
import { esc, fmtNum, fmtMoney, field, toast, showErr, openModal, closeModal } from '../ui.js';

export async function renderItems(content) {
  try {
    const [items, categories] = await Promise.all([api.getItems(), api.getCategories()]);
    STATE.itemsCache = items;
    STATE.categoriesCache = categories;
    drawItemsTable(content, '');
  } catch (err) {
    showErr(content)(err);
  }
}

function drawItemsTable(content, filterText) {
  const items = STATE.itemsCache || [];
  const q = filterText.toLowerCase();
  const filtered = items.filter((it) => !q || (it.sku + it.name + it.category).toLowerCase().indexOf(q) > -1);

  function statusBadge(qty, min, max) {
    return qty <= min
      ? '<span class="badge badge-danger">ต่ำกว่าขั้นต่ำ</span>'
      : (max > 0 && qty >= max
        ? '<span class="badge badge-warn">เกินสูงสุด</span>'
        : '<span class="badge badge-success">ปกติ</span>');
  }

  const rows = filtered.map((it) => {
    const qty = Number(it.qty_on_hand);
    const min = Number(it.reorder_point);
    const max = Number(it.max_stock);
    return '<tr>' +
      '<td>' + esc(it.sku) + '</td>' +
      '<td>' + esc(it.name) + '</td>' +
      '<td>' + esc(it.category) + '</td>' +
      '<td>' + fmtNum(qty) + ' ' + esc(it.unit) + '</td>' +
      '<td>' + fmtNum(min) + '</td>' +
      '<td>' + fmtMoney(it.unit_price) + '</td>' +
      '<td>' + esc(it.storage_location) + '</td>' +
      '<td>' + statusBadge(qty, min, max) + '</td>' +
      '<td><button class="btn btn-ghost btn-sm" data-edit="' + it.id + '">แก้ไข</button></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="9" class="empty-state"><div class="emoji">📭</div>ไม่พบข้อมูล</td></tr>';

  const cards = filtered.map((it) => {
    const qty = Number(it.qty_on_hand);
    const min = Number(it.reorder_point);
    const max = Number(it.max_stock);
    return '<div class="item-card">' +
      '<div class="item-card-top"><div><div class="item-card-name">' + esc(it.name) + '</div>' +
      '<div class="item-card-meta">' + esc(it.sku) + (it.category ? ' • ' + esc(it.category) : '') + '</div></div>' +
      statusBadge(qty, min, max) + '</div>' +
      '<div class="item-card-stats">' +
      '<div><span class="lbl">คงเหลือ</span><span class="val">' + fmtNum(qty) + ' ' + esc(it.unit) + '</span></div>' +
      '<div><span class="lbl">ขั้นต่ำ</span><span class="val">' + fmtNum(min) + '</span></div>' +
      '<div><span class="lbl">ราคา/หน่วย</span><span class="val">' + fmtMoney(it.unit_price) + '</span></div>' +
      '</div>' +
      (it.storage_location ? '<div class="item-card-loc">📍 ' + esc(it.storage_location) + '</div>' : '') +
      '<button class="btn btn-ghost btn-sm btn-block" data-edit="' + it.id + '">แก้ไข</button>' +
      '</div>';
  }).join('') || '<div class="empty-state"><div class="emoji">📭</div>ไม่พบข้อมูล</div>';

  content.innerHTML =
    '<div class="toolbar">' +
    '<input type="text" class="search-input" id="itemSearch" placeholder="🔍 ค้นหา SKU / ชื่อ / หมวดหมู่..." value="' + esc(filterText) + '">' +
    '<div class="spacer"></div>' +
    '<button class="btn btn-primary" id="addItemBtn">+ เพิ่มวัตถุดิบ</button>' +
    '</div>' +
    '<div class="table-wrap desktop-only"><table><thead><tr><th>SKU</th><th>ชื่อวัตถุดิบ</th><th>หมวดหมู่</th><th>คงเหลือ</th>' +
    '<th>ขั้นต่ำ</th><th>ราคา/หน่วย</th><th>ที่จัดเก็บ</th><th>สถานะ</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<div class="item-card-list">' + cards + '</div>';

  document.getElementById('itemSearch').addEventListener('input', (e) => drawItemsTable(content, e.target.value));
  document.getElementById('addItemBtn').addEventListener('click', () => editItem(null, content));
  content.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => editItem(Number(btn.dataset.edit), content));
  });
}

function editItem(id, content) {
  const it = id ? STATE.itemsCache.find((x) => x.id === id) : null;
  const cats = (STATE.categoriesCache || []).map((c) =>
    '<option ' + (it && it.category === c ? 'selected' : '') + '>' + esc(c) + '</option>'
  ).join('');

  const body =
    '<form id="itemForm" class="form-grid">' +
    field('SKU', 'sku', it ? it.sku : '', !it) +
    field('ชื่อวัตถุดิบ', 'name', it ? it.name : '') +
    '<div class="form-field"><label>หมวดหมู่</label><select id="f_cat"><option value="">-เลือก-</option>' + cats + '</select></div>' +
    field('หน่วยนับ (เช่น กก., ลิตร, ชิ้น)', 'unit', it ? it.unit : '') +
    field('จุดสั่งซื้อขั้นต่ำ', 'min', it ? it.reorder_point : '0', false, 'number') +
    field('สต๊อคสูงสุด', 'max', it ? it.max_stock : '0', false, 'number') +
    field('ราคาต่อหน่วย (บาท)', 'price', it ? it.unit_price : '0', false, 'number') +
    field('ผู้จำหน่ายหลัก', 'supplier', it ? it.primary_supplier : '') +
    field('ที่จัดเก็บ (โซน/ชั้นวาง)', 'loc', it ? it.storage_location : '') +
    '<div class="form-field"><label>สถานะ</label><select id="f_status">' +
    '<option value="active" ' + (!it || it.status !== 'inactive' ? 'selected' : '') + '>ใช้งาน</option>' +
    '<option value="inactive" ' + (it && it.status === 'inactive' ? 'selected' : '') + '>ระงับ</option></select></div>' +
    '</form>' +
    '<div class="form-actions">' +
    (it ? '<button class="btn btn-danger" id="deleteItemBtn">ลบ</button>' : '') +
    '<button class="btn btn-ghost" id="cancelItemBtn">ยกเลิก</button>' +
    '<button class="btn btn-primary" id="saveItemBtn">บันทึก</button>' +
    '</div>';

  openModal(it ? 'แก้ไขวัตถุดิบ: ' + it.name : 'เพิ่มวัตถุดิบใหม่', body, function () {
    document.getElementById('f_cat').value = it ? it.category : '';
    document.getElementById('cancelItemBtn').addEventListener('click', closeModal);
    if (it) {
      document.getElementById('deleteItemBtn').addEventListener('click', () => deleteItemConfirm(it.id, content));
    }
    document.getElementById('saveItemBtn').addEventListener('click', async function () {
      const payload = {
        sku: document.getElementById('f_sku').value.trim(),
        name: document.getElementById('f_name').value.trim(),
        category: document.getElementById('f_cat').value,
        unit: document.getElementById('f_unit').value.trim(),
        reorder_point: Number(document.getElementById('f_min').value) || 0,
        max_stock: Number(document.getElementById('f_max').value) || 0,
        unit_price: Number(document.getElementById('f_price').value) || 0,
        primary_supplier: document.getElementById('f_supplier').value.trim(),
        storage_location: document.getElementById('f_loc').value.trim(),
        status: document.getElementById('f_status').value,
      };
      if (!payload.sku || !payload.name) { toast('กรุณาระบุ SKU และชื่อวัตถุดิบ', 'error'); return; }
      try {
        if (it) {
          await api.updateItem(it.id, payload);
        } else {
          await api.addItem(payload);
        }
        toast('บันทึกสำเร็จ', 'success');
        closeModal();
        renderItems(content);
      } catch (err) {
        toast(err.message || String(err), 'error');
      }
    });
  });
}

async function deleteItemConfirm(id, content) {
  if (!confirm('ยืนยันการลบวัตถุดิบนี้? การลบไม่สามารถย้อนกลับได้')) return;
  try {
    await api.deleteItem(id);
    toast('ลบสำเร็จ', 'success');
    closeModal();
    renderItems(content);
  } catch (err) {
    toast(err.message || String(err), 'error');
  }
}
