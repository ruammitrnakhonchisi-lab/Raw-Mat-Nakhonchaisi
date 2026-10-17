import { supabase } from './supabase-client.js';

async function unwrap(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data;
}

/** เติม recorded_by_name จาก embedded profiles(display_name) ให้ใช้ง่ายในหน้า UI */
function flattenRecordedBy(rows) {
  return rows.map((r) => {
    r.recorded_by_name = (r.profiles && r.profiles.display_name) || '';
    return r;
  });
}

export const api = {
  /* ---------- items ---------- */
  getItems: () => unwrap(supabase.from('items').select('*').order('sku')),

  addItem: (item) => unwrap(supabase.from('items').insert(item).select().single()),

  updateItem: (id, item) => unwrap(supabase.from('items').update(item).eq('id', id).select().single()),

  deleteItem: (id) => unwrap(supabase.from('items').delete().eq('id', id)),

  quickAddItem: (payload) => unwrap(supabase.rpc('quick_add_item', payload)).then((rows) => rows[0]),

  /* ---------- categories ---------- */
  getCategories: () =>
    unwrap(supabase.from('categories').select('name').order('name')).then((rows) => rows.map((r) => r.name)),

  addCategory: (name) => unwrap(supabase.from('categories').insert({ name })),

  /* ---------- stock in ---------- */
  recordStockIn: (payload) => unwrap(supabase.rpc('record_stock_in', payload)).then((rows) => rows[0]),

  voidStockIn: (stockInId) =>
    unwrap(supabase.rpc('void_stock_in', { p_stock_in_id: stockInId })).then((rows) => rows[0]),

  getRecentStockIn: (limit) =>
    unwrap(
      supabase.from('stock_in').select('*, profiles!recorded_by(display_name)').order('created_at', { ascending: false }).limit(limit || 10)
    ).then(flattenRecordedBy),

  /** Coil ที่ยังมีของเหลืออยู่สำหรับวัตถุดิบชิ้นนี้ (ใช้เลือกตอนเบิกออกแบบเจาะจง coil เช่น PC wire) */
  getAvailableCoils: (itemId) =>
    unwrap(
      supabase.from('stock_in').select('id, lot_batch, remaining_qty, txn_date, po_number')
        .eq('item_id', itemId).is('voided_at', null).gt('remaining_qty', 0).order('created_at', { ascending: true })
    ),

  /** Coil ที่ยังอยู่ในสต๊อกของวัตถุดิบ PC wire หลาย SKU พร้อมกัน (หน้า "สต๊อก PC wire") */
  getPcWireStock: (itemIds) =>
    unwrap(
      supabase.from('stock_in').select('id, item_id, lot_batch, remaining_qty, txn_date, po_number, created_at')
        .in('item_id', itemIds).is('voided_at', null).gt('remaining_qty', 0).order('created_at', { ascending: true }).limit(5000)
    ),

  /** Coil ที่ถูกเบิกไปแล้วผ่านระบบ (ล่าสุดก่อน) พร้อมวันที่เบิกและ "ใช้งาน" */
  getUsedCoils: (itemId, limit) =>
    unwrap(
      supabase.from('stock_out').select('txn_date, usage_type, stock_in!coil_stock_in_id(lot_batch, po_number)')
        .eq('item_id', itemId).not('coil_stock_in_id', 'is', null)
        .order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(limit || 300)
    ),

  /** เลข Coil ที่ระบบบันทึกว่าใช้หมดแล้ว (ใช้เตือนตอนนับสต๊อกเจอเลขที่เคยเบิกไปแล้ว) */
  getDepletedCoilNumbers: (itemId) =>
    unwrap(
      supabase.from('stock_in').select('lot_batch').eq('item_id', itemId).is('voided_at', null).eq('remaining_qty', 0).limit(5000)
    ).then((rows) => rows.map((r) => r.lot_batch)),

  /* ---------- stock out ---------- */
  recordStockOut: (payload) => unwrap(supabase.rpc('record_stock_out', payload)).then((rows) => rows[0]),

  getStockOutInRange: (dateFrom, dateTo) => {
    let q = supabase.from('stock_out').select('*').order('txn_date');
    if (dateFrom) q = q.gte('txn_date', dateFrom);
    if (dateTo) q = q.lte('txn_date', dateTo);
    return unwrap(q);
  },

  /* ---------- adjustments ---------- */
  recordAdjustment: (payload) => unwrap(supabase.rpc('record_adjustment', payload)).then((rows) => rows[0]),

  recordPcWireCountAdjustment: (payload) =>
    unwrap(supabase.rpc('record_pcwire_count_adjustment', payload)).then((rows) => rows[0]),

  /* ---------- cement silos ---------- */
  getCementSilos: () => unwrap(supabase.from('cement_silos').select('*').order('code')),

  getCementDaily: () =>
    unwrap(supabase.from('cement_daily').select('*').order('txn_date', { ascending: true }).limit(10000)),

  saveCementDay: (payload) => unwrap(supabase.rpc('save_cement_day', payload)),

  updateCementSilo: (code, fields) =>
    unwrap(supabase.from('cement_silos').update(fields).eq('code', code).select().single()),

  /* ---------- ledger ---------- */
  getLedger: (filters) => {
    filters = filters || {};
    let q = supabase.from('ledger').select('*, profiles(display_name)').order('created_at', { ascending: false });
    if (filters.sku) q = q.eq('sku', filters.sku);
    if (filters.type) q = q.eq('txn_type', filters.type);
    if (filters.dateFrom) q = q.gte('txn_date', filters.dateFrom);
    if (filters.dateTo) q = q.lte('txn_date', filters.dateTo);
    return unwrap(q.limit(filters.limit || 2000)).then(flattenRecordedBy);
  },

  /* ---------- alerts ---------- */
  getExpiringStockIn: (days) => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + (days || 30));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return unwrap(
      supabase
        .from('stock_in')
        .select('*')
        .is('voided_at', null)
        .not('expiry_date', 'is', null)
        .lte('expiry_date', cutoffStr)
        .order('expiry_date', { ascending: true })
    );
  },

  /* ---------- settings ---------- */
  getSettings: () =>
    unwrap(supabase.from('settings').select('*')).then((rows) => {
      const out = {};
      rows.forEach((r) => { out[r.key] = r.value; });
      return out;
    }),

  saveSettings: (settings) =>
    Promise.all(
      Object.keys(settings).map((key) => unwrap(supabase.from('settings').upsert({ key, value: String(settings[key]) })))
    ),

  /* ---------- users (profiles) ---------- */
  getUsers: () => unwrap(supabase.from('profiles').select('*').order('display_name')),

  adminUpdateProfile: (payload) => unwrap(supabase.rpc('admin_update_profile', payload)),

  /* ---------- account ---------- */
  changeMyPassword: (newPassword) => unwrap(supabase.auth.updateUser({ password: newPassword })),
};
