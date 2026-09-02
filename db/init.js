// Run once after deploy: `npm run initdb`
// Creates tables (safe to re-run, uses IF NOT EXISTS) and seeds one admin user.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('Applying schema...');
  await pool.query(schema);
  console.log('Schema applied.');

  const { rows } = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
  if (rows.length === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4)',
      ['admin', hash, 'Administrator', 'admin']
    );
    console.log('Seeded admin user -> username: admin / password: admin123 (CHANGE THIS after first login)');
  } else {
    console.log('Admin user already exists, skipping seed.');
  }

  const wh = await pool.query('SELECT id FROM warehouses LIMIT 1');
  if (wh.rows.length === 0) {
    await pool.query('INSERT INTO warehouses (name, location) VALUES ($1,$2)', ['Main Warehouse', 'Default']);
    console.log('Seeded default warehouse.');
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
