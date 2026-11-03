export function toast(message, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}

export function fmtNum(n) {
  n = Number(n) || 0;
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

export function fmtMoney(n) {
  return '฿' + fmtNum(n);
}

export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s === undefined || s === null ? '' : s;
  return d.innerHTML;
}

/**
 * อ่านค่า input ตาม id — รองรับทั้ง id ตรงๆ (เช่น select/textarea ที่เขียน
 * id เองแบบ id="si_sku") และ input ที่สร้างผ่าน field() ซึ่งของจริงมี id
 * เป็น "f_" + name เสมอ (ดู field() ด้านล่าง) เพื่อกันบั๊กที่เคยเกิดในโค้ดเดิม
 * (JS.html เดิม: val('si_qty') หา id="si_qty" ไม่เจอเพราะของจริงคือ
 * "f_si_qty" ทำให้ค่าที่อ่านได้เป็น '' เสมอ และ addStockIn ตกเงื่อนไข
 * "กรุณาระบุจำนวนรับเข้าให้ถูกต้อง" ทุกครั้งไม่ว่าจะกรอกอะไรก็ตาม)
 */
export function val(id) {
  const el = document.getElementById(id) || document.getElementById('f_' + id);
  return el ? el.value : '';
}

export function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function field(label, id, value, required, type) {
  return '<div class="form-field"><label>' + esc(label) + '</label>' +
    '<input type="' + (type || 'text') + '" id="f_' + id + '" value="' + esc(value) + '" ' + (required ? 'required' : '') + '></div>';
}

export function statCard(icon, label, value, tone) {
  return '<div class="card stat-card ' + (tone || '') + '"><div class="icon">' + icon + '</div>' +
    '<div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
}

export function showErr(content) {
  return function (err) {
    content.innerHTML = '<div class="alert alert-error">เกิดข้อผิดพลาด: ' + esc(err.message || String(err)) + '</div>';
  };
}

export function openModal(title, bodyHtml, onMount) {
  const root = document.getElementById('modalRoot');
  root.innerHTML =
    '<div class="modal-overlay" id="modalOverlay"><div class="modal-box">' +
    '<button class="modal-close" id="modalCloseBtn">✕</button>' +
    '<h3>' + esc(title) + '</h3><div id="modalBody">' + bodyHtml + '</div></div></div>';
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', function (e) {
    if (e.target.id === 'modalOverlay') closeModal();
  });
  if (onMount) onMount(document.getElementById('modalBody'));
}

export function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

/** ป็อปอัพแจ้งว่าบันทึกสำเร็จ ใช้ร่วมกันหลังบันทึกรับเข้า/เบิกออก */
export function showSuccessPopup(title, lines) {
  const body = '<div class="success-modal"><div class="success-icon">✅</div>' +
    lines.map((l, i) => '<p' + (i > 0 ? ' class="success-sub"' : '') + '>' + esc(l) + '</p>').join('') +
    '<button class="btn btn-primary" id="successPopupOk">ตกลง</button></div>';
  openModal(title, body, function () {
    document.getElementById('successPopupOk').addEventListener('click', closeModal);
  });
}

/** Convert an array of flat objects to CSV text (BOM prefixed for Excel/Thai). */
export function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(function (row) {
    lines.push(headers.map(function (h) {
      let v = row[h] === undefined || row[h] === null ? '' : String(row[h]);
      if (v.indexOf(',') > -1 || v.indexOf('"') > -1 || v.indexOf('\n') > -1) {
        v = '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    }).join(','));
  });
  return '﻿' + lines.join('\n');
}

export function downloadCsv(rows, filename) {
  const csv = toCsv(rows);
  if (!csv) { toast('ไม่มีข้อมูลให้ export', 'error'); return; }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * ดรอปดาวน์ที่พิมพ์ค้นหาได้ — ใช้แทน <select> ที่มีตัวเลือกเยอะ
 * HTML: comboHtml(id, placeholder) แล้วเรียก initCombo(id, options, onPick)
 * ค่าที่เลือกเก็บใน <input type="hidden" id="{id}"> จึงอ่านด้วย val(id) ได้เหมือน select เดิม
 * options: [{ value, label }] — แถวแรกที่ value เป็น '' คือ "ทั้งหมด"
 */
export function comboHtml(id, placeholder) {
  return '<div class="combo"><input type="text" id="' + id + '_text" placeholder="' + esc(placeholder) + '" autocomplete="off">' +
    '<input type="hidden" id="' + id + '" value=""><div class="combo-list" id="' + id + '_list" hidden></div></div>';
}

export function initCombo(id, options, onPick) {
  const text = document.getElementById(id + '_text');
  const hidden = document.getElementById(id);
  const list = document.getElementById(id + '_list');
  let shown = [];
  let active = 0;
  const labelOf = (v) => { const o = options.find((x) => x.value === v); return o && o.value ? o.label : ''; };

  function draw() {
    const words = text.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    shown = options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w))).slice(0, 100);
    active = Math.min(active, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.map((o, i) =>
      '<div class="combo-opt' + (i === active ? ' active' : '') + '" data-i="' + i + '">' + esc(o.label) + '</div>'
    ).join('') || '<div class="combo-empty">ไม่พบรายการ</div>';
    list.hidden = false;
    const el = list.querySelector('.combo-opt.active');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }

  function pick(o) {
    hidden.value = o.value;
    text.value = o.value ? o.label : '';
    list.hidden = true;
    text.blur();
    if (onPick) onPick(o.value);
  }

  text.addEventListener('focus', () => { text.select(); active = 0; draw(); });
  text.addEventListener('input', () => { active = 0; draw(); });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === 'Escape') { list.hidden = true; text.blur(); }
  });
  // mousedown แทน click เพื่อให้เลือกได้ก่อน blur ปิดรายการ
  list.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-opt');
    if (!opt) return;
    e.preventDefault();
    pick(shown[Number(opt.dataset.i)]);
  });
  text.addEventListener('blur', () => {
    list.hidden = true;
    // พิมพ์ค้างไว้แต่ไม่ได้เลือก → คืนค่าเดิม (ถ้าลบจนว่างถือว่าเลือก "ทั้งหมด")
    if (!text.value.trim() && hidden.value) { pick(options.find((o) => !o.value) || { value: '', label: '' }); return; }
    text.value = labelOf(hidden.value);
  });
}
