const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// List GRNs
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT g.*, w.name AS warehouse_name, s.name AS supplier_name,
            (SELECT COUNT(*) FROM grn_lines l WHERE l.grn_id = g.id) AS line_count
     FROM grn_header g
     LEFT JOIN warehouses w ON w.id = g.warehouse_id
     LEFT JOIN suppliers s ON s.id = g.supplier_id
     ORDER BY g.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

// Get one GRN with lines
router.get('/:id', async (req, res) => {
  const header = await pool.query('SELECT * FROM grn_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const lines = await pool.query(
    `SELECT l.*, i.name AS item_name FROM grn_lines l
     LEFT JOIN items i ON i.id = l.item_id WHERE l.grn_id = $1 ORDER BY l.scanned_at`,
    [req.params.id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// Create a GRN header (used by PC/web to start a new inbound doc; handheld can also create offline and sync later via /sync)
router.post('/', async (req, res) => {
  const { grn_number, supplier_id, warehouse_id, device_id, created_by } = req.body;
  if (!grn_number) return res.status(400).json({ error: 'grn_number required' });
  const { rows } = await pool.query(
    `INSERT INTO grn_header (grn_number, supplier_id, warehouse_id, device_id, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [grn_number, supplier_id || null, warehouse_id || null, device_id || null, created_by || null]
  );
  res.json(rows[0]);
});

// Add a scanned line to a GRN (live/online scanning mode)
router.post('/:id/lines', async (req, res) => {
  const { barcode_scanned, qty, client_uuid } = req.body;
  const item = await pool.query('SELECT id FROM items WHERE barcode = $1', [barcode_scanned]);
  const item_id = item.rows[0] ? item.rows[0].id : null;

  const { rows } = await pool.query(
    `INSERT INTO grn_lines (grn_id, item_id, barcode_scanned, qty, client_uuid)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (client_uuid) DO NOTHING
     RETURNING *`,
    [req.params.id, item_id, barcode_scanned, qty || 1, client_uuid || null]
  );
  res.json(rows[0] || { info: 'already synced (duplicate client_uuid)' });
});

// Close GRN and post quantities into inventory
router.post('/:id/close', async (req, res) => {
  const header = await pool.query('SELECT * FROM grn_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const warehouse_id = header.rows[0].warehouse_id;

  const lines = await pool.query('SELECT item_id, SUM(qty) AS total_qty FROM grn_lines WHERE grn_id = $1 AND item_id IS NOT NULL GROUP BY item_id', [req.params.id]);
  for (const line of lines.rows) {
    await pool.query(
      `INSERT INTO inventory (warehouse_id, item_id, qty_on_hand)
       VALUES ($1,$2,$3)
       ON CONFLICT (warehouse_id, item_id)
       DO UPDATE SET qty_on_hand = inventory.qty_on_hand + $3, updated_at = NOW()`,
      [warehouse_id, line.item_id, line.total_qty]
    );
  }
  await pool.query("UPDATE grn_header SET status = 'closed' WHERE id = $1", [req.params.id]);
  res.json({ ok: true, items_posted: lines.rows.length });
});

module.exports = router;
