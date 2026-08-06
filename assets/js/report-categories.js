/* หมวดหมู่วัตถุดิบที่ใช้สรุปทั้งในหน้ารายงานและแดชบอร์ด เรียงตามลำดับที่ต้องการให้แสดง
   รายการที่ไม่ตรงกับหมวดเหล่านี้จะถูกจัดกลุ่มตามชื่อหมวดหมู่จริงต่อท้ายโดยอัตโนมัติ */
export const CATEGORY_SECTIONS = [
  { title: 'PC wire', match: ['pc wire'] },
  { title: 'ลวดปั่นปลอก', match: ['ลวดปั่นปลอก'] },
  { title: 'เหล็กหนวดกุ้ง', match: ['เหล็กหนวดกุ้ง'] },
  { title: 'หัวเพลท', match: ['หัวเพลท'] },
  { title: 'น้ำยาเร่งคอนกรีต', match: ['น้ำยาเร่งคอนกรีต'] },
  { title: 'เหล็กเสริม และเหล็กเข็มเจาะ', match: ['เหล็กเสริม', 'เหล็กเข็มเจาะ'] },
];

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

export function findCategorySection(category) {
  const c = norm(category);
  return CATEGORY_SECTIONS.find((s) => s.match.indexOf(c) > -1);
}

/** จัดกลุ่มรายการตามหมวดหมู่ที่กำหนดไว้ข้างบน คืนค่าเป็น [{ title, items }] */
export function groupByCategory(list, getCategory) {
  const groups = CATEGORY_SECTIONS.map((s) => ({ title: s.title, items: [] }));
  const extraMap = {};
  list.forEach((it) => {
    const section = findCategorySection(getCategory(it));
    if (section) {
      groups.find((g) => g.title === section.title).items.push(it);
    } else {
      const key = String(getCategory(it) || '').trim() || 'ไม่ระบุหมวดหมู่';
      (extraMap[key] = extraMap[key] || []).push(it);
    }
  });
  const extraGroups = Object.keys(extraMap)
    .sort((a, b) => a.localeCompare(b, 'th'))
    .map((key) => ({ title: key, items: extraMap[key] }));
  return groups.concat(extraGroups).filter((g) => g.items.length);
}
