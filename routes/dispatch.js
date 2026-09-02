const express = require('express');
const pool = require('../db/pool');
const { logAction, ledgerEntry } = require('../db/audit');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, w.name AS warehouse_name,
            (SELECT COUNT(*) FROM dispatch_lines l WHERE l.dispatch_id = d.id) AS line_count
     FROM dispatch_header d
     LEFT JOIN warehouses w ON w.id = d.warehouse_id
     ORDER BY d.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const header = await pool.query('SELECT * FROM dispatch_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const lines = await pool.query(
    `SELECT l.*, i.name AS item_name FROM dispatch_lines l
     LEFT JOIN items i ON i.id = l.item_id WHERE l.dispatch_id = $1 ORDER BY l.scanned_at`,
    [req.params.id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

router.post('/', async (req, res) => {
  const { dispatch_number, customer_name, warehouse_id, device_id, created_by } = req.body;
  if (!dispatch_number) return res.status(400).json({ error: 'dispatch_number required' });
  const { rows } = await pool.query(
    `INSERT INTO dispatch_header (dispatch_number, customer_name, warehouse_id, device_id, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [dispatch_number, customer_name || null, warehouse_id || null, device_id || null, created_by || null]
  );
  res.json(rows[0]);
});

router.post('/:id/lines', async (req, res) => {
  const { barcode_scanned, qty, client_uuid } = req.body;
  const item = await pool.query('SELECT id FROM items WHERE barcode = $1', [barcode_scanned]);
  const item_id = item.rows[0] ? item.rows[0].id : null;

  const { rows } = await pool.query(
    `INSERT INTO dispatch_lines (dispatch_id, item_id, barcode_scanned, qty, client_uuid)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (client_uuid) DO NOTHING
     RETURNING *`,
    [req.params.id, item_id, barcode_scanned, qty || 1, client_uuid || null]
  );
  res.json(rows[0] || { info: 'already synced (duplicate client_uuid)' });
});

router.post('/:id/close', async (req, res) => {
  const header = await pool.query('SELECT * FROM dispatch_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const warehouse_id = header.rows[0].warehouse_id;

  const lines = await pool.query('SELECT item_id, SUM(qty) AS total_qty FROM dispatch_lines WHERE dispatch_id = $1 AND item_id IS NOT NULL GROUP BY item_id', [req.params.id]);
  for (const line of lines.rows) {
    await pool.query(
      `INSERT INTO inventory (warehouse_id, item_id, qty_on_hand)
       VALUES ($1,$2,$3)
       ON CONFLICT (warehouse_id, item_id)
       DO UPDATE SET qty_on_hand = inventory.qty_on_hand - $3, updated_at = NOW()`,
      [warehouse_id, line.item_id, line.total_qty]
    );
    await ledgerEntry(warehouse_id, line.item_id, 'dispatch_out', -line.total_qty, 'dispatch', req.params.id, req.user ? req.user.id : null);
  }
  await pool.query("UPDATE dispatch_header SET status = 'closed' WHERE id = $1", [req.params.id]);
  await logAction(req.user ? req.user.id : null, 'close_dispatch', 'dispatch', req.params.id, { items_posted: lines.rows.length });
  res.json({ ok: true, items_posted: lines.rows.length });
});

module.exports = router;
