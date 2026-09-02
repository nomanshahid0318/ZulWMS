const { Pool } = require('pg');

// On Render, set DATABASE_URL env var to your Render Postgres "Internal Connection String".
// Locally, you can point it to any Postgres instance.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

module.exports = pool;
