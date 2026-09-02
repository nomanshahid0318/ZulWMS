const express = require('express');
const pool = require('../db/pool');
const { requireRole } = require('./auth');
const { logAction } = require('../db/audit');
const router = express.Router();

// List POs
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, s.name AS supplier_name, w.name AS warehouse_name,
            (SELECT COUNT(*) FROM po_lines l WHERE l.po_id = p.id) AS line_count
     FROM po_header p
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     LEFT JOIN warehouses w ON w.id = p.warehouse_id
     ORDER BY p.created_at DESC LIMIT 200`
  );
  res.json(rows);
});

// Get one PO with lines + receipt progress
router.get('/:id', async (req, res) => {
  const header = await pool.query('SELECT * FROM po_header WHERE id = $1', [req.params.id]);
  if (header.rows.length === 0) return res.status(404).json({ error: 'not found' });
  const lines = await pool.query(
    `SELECT l.*, i.name AS item_name, i.barcode FROM po_lines l
     LEFT JOIN items i ON i.id = l.item_id WHERE l.po_id = $1`,
    [req.params.id]
  );
  res.json({ ...header.rows[0], lines: lines.rows });
});

// Create PO with lines: { po_number, supplier_id, warehouse_id, expected_date, lines: [{item_id, qty_ordered, unit_price}] }
router.post('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const { po_number, supplier_id, warehouse_id, expected_date, lines = [] } = req.body;
  if (!po_number) return res.status(400).json({ error: 'po_number required' });

  const header = await pool.query(
    `INSERT INTO po_header (po_number, supplier_id, warehouse_id, expected_date, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [po_number, supplier_id || null, warehouse_id || null, expected_date || null, req.user.id]
  );

  for (const line of lines) {
    await pool.query(
      'INSERT INTO po_lines (po_id, item_id, qty_ordered, unit_price) VALUES ($1,$2,$3,$4)',
      [header.rows[0].id, line.item_id, line.qty_ordered, line.unit_price || null]
    );
  }

  await logAction(req.user.id, 'create_po', 'po', header.rows[0].id, { lines: lines.length });
  res.json(header.rows[0]);
});

// Create a GRN directly from a PO (pre-fills expected items so the handheld/dashboard just scans against it)
router.post('/:id/create-grn', async (req, res) => {
  const { grn_number } = req.body;
  if (!grn_number) return res.status(400).json({ error: 'grn_number required' });

  const po = await pool.query('SELECT * FROM po_header WHERE id = $1', [req.params.id]);
  if (po.rows.length === 0) return res.status(404).json({ error: 'PO not found' });

  const grn = await pool.query(
    `INSERT INTO grn_header (grn_number, supplier_id, warehouse_id, po_id, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [grn_number, po.rows[0].supplier_id, po.rows[0].warehouse_id, po.rows[0].id, req.user.id]
  );
  res.json(grn.rows[0]);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM po_header WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
