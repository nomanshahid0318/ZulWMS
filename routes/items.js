const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// List / search items by barcode or name
router.get('/', async (req, res) => {
  const q = req.query.q;
  let result;
  if (q) {
    result = await pool.query(
      'SELECT * FROM items WHERE barcode ILIKE $1 OR name ILIKE $1 ORDER BY name LIMIT 100',
      [`%${q}%`]
    );
  } else {
    result = await pool.query('SELECT * FROM items ORDER BY name LIMIT 200');
  }
  res.json(result.rows);
});

// Lookup single item by exact barcode (used by scanner during scanning)
router.get('/barcode/:code', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM items WHERE barcode = $1', [req.params.code]);
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

// Create/update item master
router.post('/', async (req, res) => {
  const { barcode, sku, name, unit, category } = req.body;
  if (!barcode || !name) return res.status(400).json({ error: 'barcode and name required' });
  const { rows } = await pool.query(
    `INSERT INTO items (barcode, sku, name, unit, category) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (barcode) DO UPDATE SET sku=$2, name=$3, unit=$4, category=$5
     RETURNING *`,
    [barcode, sku || null, name, unit || 'PCS', category || null]
  );
  res.json(rows[0]);
});

module.exports = router;
