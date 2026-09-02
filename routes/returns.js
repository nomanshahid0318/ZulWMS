const express = require('express');
const pool = require('../db/pool');
const { logAction, ledgerEntry } = require('../db/audit');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT r.*, w.name AS warehouse_name,
            (SELECT COUNT(*) FROM returns_lines l WHERE l.return_id = r.id) AS line_count
     FROM returns_header r
     LEFT JOIN warehouses w ON w.id = r.warehouse_id
     ORDER BY r.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

// Create a return/damage record and immediately apply stock effect.
// return_type: customer_return | damage | supplier_return
// lines: [{ barcode, qty, restock: true/false }]
// restock=true adds back to inventory (customer return of good stock).
// restock=false writes it off (damaged goods, or supplier return leaving the warehouse) -- no stock added, and if warehouse had it, it's removed.
router.post('/', async (req, res) => {
  const { return_number, return_type, warehouse_id, notes, lines = [] } = req.body;
  if (!return_number || !return_type || !warehouse_id) {
    return res.status(400).json({ error: 'return_number, return_type, warehouse_id required' });
  }

  const header = await pool.query(
    `INSERT INTO returns_header (return_number, return_type, warehouse_id, created_by, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [return_number, return_type, warehouse_id, req.user.id, notes || null]
  );

  for (const line of lines) {
    const item = await pool.query('SELECT id FROM items WHERE barcode = $1', [line.barcode]);
    const item_id = item.rows[0] ? item.rows[0].id : null;
    if (!item_id) continue;

    await pool.query(
      'INSERT INTO returns_lines (return_id, item_id, qty, restock) VALUES ($1,$2,$3,$4)',
      [header.rows[0].id, item_id, line.qty, line.restock !== false]
    );

    if (line.restock !== false) {
      // customer return of good stock -> add back
      await pool.query(
        `INSERT INTO inventory (warehouse_id, item_id, qty_on_hand) VALUES ($1,$2,$3)
         ON CONFLICT (warehouse_id, item_id) DO UPDATE SET qty_on_hand = inventory.qty_on_hand + $3, updated_at = NOW()`,
        [warehouse_id, item_id, line.qty]
      );
      await ledgerEntry(warehouse_id, item_id, 'adjustment', line.qty, 'return', header.rows[0].id, req.user.id);
    } else if (return_type === 'supplier_return') {
      // stock leaving the warehouse back to supplier
      await pool.query(
        `UPDATE inventory SET qty_on_hand = GREATEST(qty_on_hand - $1, 0), updated_at = NOW() WHERE warehouse_id = $2 AND item_id = $3`,
        [line.qty, warehouse_id, item_id]
      );
      await ledgerEntry(warehouse_id, item_id, 'adjustment', -line.qty, 'return', header.rows[0].id, req.user.id);
    }
    // damage: no inventory change assumed already removed via a prior dispatch/write-off; logged only for audit
  }

  await logAction(req.user.id, 'create_return', 'return', header.rows[0].id, { return_type, lines: lines.length });
  res.json(header.rows[0]);
});

module.exports = router;
