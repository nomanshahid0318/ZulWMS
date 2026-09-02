const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT inv.*, w.name AS warehouse_name, i.name AS item_name, i.barcode
     FROM inventory inv
     JOIN warehouses w ON w.id = inv.warehouse_id
     JOIN items i ON i.id = inv.item_id
     ORDER BY i.name`
  );
  res.json(rows);
});

router.get('/devices', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM devices ORDER BY last_seen DESC NULLS LAST');
  res.json(rows);
});

router.get('/warehouses', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM warehouses ORDER BY name');
  res.json(rows);
});

router.post('/warehouses', async (req, res) => {
  const { name, location } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { rows } = await pool.query('INSERT INTO warehouses (name, location) VALUES ($1,$2) RETURNING *', [name, location || null]);
  res.json(rows[0]);
});

module.exports = router;
