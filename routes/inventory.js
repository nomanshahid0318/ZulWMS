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

module.exports = router;
