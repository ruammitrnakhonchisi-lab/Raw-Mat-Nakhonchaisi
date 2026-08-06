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

  /* ---------- ledger ---------- */
  getLedger: (filters) => {
    filters = filters || {};
    let q = supabase.from('ledger').select('*, profiles(display_name)').order('created_at', { ascending: false });
    if (filters.sku) q = q.eq('sku', filters.sku);
    if (filters.type) q = q.eq('txn_type', filters.type);
    if (filters.dateFrom) q = q.gte('created_at', filters.dateFrom);
    if (filters.dateTo) q = q.lte('created_at', filters.dateTo + 'T23:59:59');
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
