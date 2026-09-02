const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireRole } = require('./auth');
const { logAction } = require('../db/audit');
const router = express.Router();

router.get('/', requireRole('admin', 'supervisor'), async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY username');
  res.json(rows);
});

router.post('/', requireRole('admin'), async (req, res) => {
  const { username, password, full_name, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4)
     RETURNING id, username, full_name, role, active, created_at`,
    [username, hash, full_name || null, role || 'operator']
  );
  await logAction(req.user.id, 'create_user', 'user', rows[0].id, { username, role });
  res.json(rows[0]);
});

router.put('/:id', requireRole('admin'), async (req, res) => {
  const { full_name, role, active } = req.body;
  const { rows } = await pool.query(
    `UPDATE users SET full_name = COALESCE($1, full_name), role = COALESCE($2, role), active = COALESCE($3, active)
     WHERE id = $4 RETURNING id, username, full_name, role, active`,
    [full_name, role, active, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  await logAction(req.user.id, 'update_user', 'user', req.params.id, req.body);
  res.json(rows[0]);
});

// Any logged-in user can change their own password
router.post('/change-password', async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'current_password and new_password required' });

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const ok = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'current password incorrect' });

  const hash = await bcrypt.hash(new_password, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  await logAction(req.user.id, 'change_password', 'user', req.user.id, {});
  res.json({ ok: true });
});

module.exports = router;
