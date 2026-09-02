const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

// Stock movement ledger -- optional filters: warehouse_id, item_id, from, to (ISO dates)
router.get('/movements', async (req, res) => {
  const { warehouse_id, item_id, from, to, format } = req.query;
  const clauses = [];
  const params = [];
  if (warehouse_id) { params.push(warehouse_id); clauses.push(`sl.warehouse_id = $${params.length}`); }
  if (item_id) { params.push(item_id); clauses.push(`sl.item_id = $${params.length}`); }
  if (from) { params.push(from); clauses.push(`sl.created_at >= $${params.length}`); }
  if (to) { params.push(to); clauses.push(`sl.created_at <= $${params.length}`); }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

  const { rows } = await pool.query(
    `SELECT sl.created_at, w.name AS warehouse, i.barcode, i.name AS item_name,
            sl.movement_type, sl.qty_change, sl.ref_type, sl.ref_id, u.username AS by_user
     FROM stock_ledger sl
     LEFT JOIN warehouses w ON w.id = sl.warehouse_id
     LEFT JOIN items i ON i.id = sl.item_id
     LEFT JOIN users u ON u.id = sl.created_by
     ${where}
     ORDER BY sl.created_at DESC LIMIT 2000`,
    params
  );

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="stock_movements.csv"');
    return res.send(toCsv(rows));
  }
  res.json(rows);
});

// Current stock snapshot, exportable
router.get('/stock', async (req, res) => {
  const { format } = req.query;
  const { rows } = await pool.query(
    `SELECT w.name AS warehouse, i.barcode, i.name AS item_name, i.category, inv.qty_on_hand, inv.updated_at
     FROM inventory inv
     JOIN warehouses w ON w.id = inv.warehouse_id
     JOIN items i ON i.id = inv.item_id
     ORDER BY w.name, i.name`
  );
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="stock_snapshot.csv"');
    return res.send(toCsv(rows));
  }
  res.json(rows);
});

// Simple dead-stock / aging report: items with no movement in N days (default 30)
router.get('/aging', async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const { rows } = await pool.query(
    `SELECT w.name AS warehouse, i.barcode, i.name AS item_name, inv.qty_on_hand, inv.updated_at,
            EXTRACT(DAY FROM NOW() - inv.updated_at) AS days_since_movement
     FROM inventory inv
     JOIN warehouses w ON w.id = inv.warehouse_id
     JOIN items i ON i.id = inv.item_id
     WHERE inv.updated_at < NOW() - ($1 || ' days')::interval AND inv.qty_on_hand > 0
     ORDER BY inv.updated_at ASC`,
    [days]
  );
  res.json(rows);
});

// Audit trail viewer (admin/supervisor)
router.get('/audit', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.created_at, u.username, a.action, a.entity_type, a.entity_id, a.details
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.created_at DESC LIMIT 500`
  );
  res.json(rows);
});

module.exports = router;
