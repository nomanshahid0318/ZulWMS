const pool = require('./pool');

async function logAction(user_id, action, entity_type, entity_id, details = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [user_id || null, action, entity_type || null, entity_id || null, JSON.stringify(details)]
    );
  } catch (e) {
    console.error('audit log failed', e.message);
  }
}

async function ledgerEntry(warehouse_id, item_id, movement_type, qty_change, ref_type, ref_id, created_by) {
  if (!item_id || !warehouse_id) return;
  await pool.query(
    `INSERT INTO stock_ledger (warehouse_id, item_id, movement_type, qty_change, ref_type, ref_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [warehouse_id, item_id, movement_type, qty_change, ref_type, ref_id, created_by || null]
  );
}

module.exports = { logAction, ledgerEntry };
