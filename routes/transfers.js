const express = require('express');
const pool = require('../db/pool');
const { logAction, ledgerEntry } = require('../db/audit');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.*, wf.name AS from_warehouse_name, wt.name AS to_warehouse_name,
            (SELECT COUNT(*) FROM transfer_lines l WHERE l.transfer_id = t.id) AS line_count
     FROM transfer_header t
     LEFT JOIN warehouses wf ON wf.id = t.from_warehouse_id
     LEFT JOIN warehouses wt ON wt.id = t.to_warehouse_id
     ORDER BY t.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const header = await pool.query('SELECT * FROM transfer_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const lines = await pool.query(
    `SELECT l.*, i.name AS item_name FROM transfer_lines l
     LEFT JOIN items i ON i.id = l.item_id WHERE l.transfer_id = $1`,
    [req.params.id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

router.post('/', async (req, res) => {
  const { transfer_number, from_warehouse_id, to_warehouse_id } = req.body;
  if (!transfer_number || !from_warehouse_id || !to_warehouse_id) {
    return res.status(400).json({ error: 'transfer_number, from_warehouse_id, to_warehouse_id required' });
  }
  if (from_warehouse_id === to_warehouse_id) return res.status(400).json({ error: 'from and to warehouse must differ' });

  const { rows } = await pool.query(
    `INSERT INTO transfer_header (transfer_number, from_warehouse_id, to_warehouse_id, created_by)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [transfer_number, from_warehouse_id, to_warehouse_id, req.user.id]
  );
  res.json(rows[0]);
});

router.post('/:id/lines', async (req, res) => {
  const { barcode_scanned, qty, client_uuid } = req.body;
  const item = await pool.query('SELECT id FROM items WHERE barcode = $1', [barcode_scanned]);
  const item_id = item.rows[0] ? item.rows[0].id : null;

  const { rows } = await pool.query(
    `INSERT INTO transfer_lines (transfer_id, item_id, barcode_scanned, qty, client_uuid)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (client_uuid) DO NOTHING RETURNING *`,
    [req.params.id, item_id, barcode_scanned, qty || 1, client_uuid || null]
  );
  res.json(rows[0] || { info: 'already synced (duplicate client_uuid)' });
});

// Closing a transfer moves stock: subtracts from source, adds to destination.
// Rejects if source doesn't have enough stock for any item.
router.post('/:id/close', async (req, res) => {
  const header = await pool.query('SELECT * FROM transfer_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const { from_warehouse_id, to_warehouse_id } = header.rows[0];

  const lines = await pool.query(
    'SELECT item_id, SUM(qty) AS total_qty FROM transfer_lines WHERE transfer_id = $1 AND item_id IS NOT NULL GROUP BY item_id',
    [req.params.id]
  );

  // validate stock availability first
  for (const line of lines.rows) {
    const stock = await pool.query(
      'SELECT qty_on_hand FROM inventory WHERE warehouse_id = $1 AND item_id = $2',
      [from_warehouse_id, line.item_id]
    );
    const available = stock.rows[0] ? parseFloat(stock.rows[0].qty_on_hand) : 0;
    if (available < parseFloat(line.total_qty)) {
      return res.status(400).json({ error: `insufficient stock for item_id ${line.item_id}: have ${available}, need ${line.total_qty}` });
    }
  }

  for (const line of lines.rows) {
    await pool.query(
      `UPDATE inventory SET qty_on_hand = qty_on_hand - $1, updated_at = NOW() WHERE warehouse_id = $2 AND item_id = $3`,
      [line.total_qty, from_warehouse_id, line.item_id]
    );
    await pool.query(
      `INSERT INTO inventory (warehouse_id, item_id, qty_on_hand) VALUES ($1,$2,$3)
       ON CONFLICT (warehouse_id, item_id) DO UPDATE SET qty_on_hand = inventory.qty_on_hand + $3, updated_at = NOW()`,
      [to_warehouse_id, line.item_id, line.total_qty]
    );
    await ledgerEntry(from_warehouse_id, line.item_id, 'transfer_out', -line.total_qty, 'transfer', req.params.id, req.user.id);
    await ledgerEntry(to_warehouse_id, line.item_id, 'transfer_in', line.total_qty, 'transfer', req.params.id, req.user.id);
  }

  await pool.query("UPDATE transfer_header SET status = 'closed', closed_at = NOW() WHERE id = $1", [req.params.id]);
  await logAction(req.user.id, 'close_transfer', 'transfer', req.params.id, { items: lines.rows.length });
  res.json({ ok: true, items_moved: lines.rows.length });
});

module.exports = router;
