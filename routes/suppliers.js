const express = require('express');
const pool = require('../db/pool');
const { requireRole } = require('./auth');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY name');
  res.json(rows);
});

router.post('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const { name, contact, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { rows } = await pool.query(
    'INSERT INTO suppliers (name, contact, phone) VALUES ($1,$2,$3) RETURNING *',
    [name, contact || null, phone || null]
  );
  res.json(rows[0]);
});

router.put('/:id', requireRole('admin', 'supervisor'), async (req, res) => {
  const { name, contact, phone } = req.body;
  const { rows } = await pool.query(
    'UPDATE suppliers SET name=$1, contact=$2, phone=$3 WHERE id=$4 RETURNING *',
    [name, contact || null, phone || null, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  await pool.query('DELETE FROM suppliers WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
