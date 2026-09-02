const express = require('express');
const pool = require('../db/pool');
const router = express.Router();

// Handheld device calls this ONE endpoint when it regains connectivity (wifi/USB-tether/cradle).
// Body: { device_code, doc_type: 'grn'|'dispatch', doc_number, header: {...}, lines: [{barcode_scanned, qty, client_uuid, scanned_at}] }
// This replaces Zultec's "connect device to PC and download" step -- fully automatic instead.
router.post('/batch', async (req, res) => {
  const { device_code, doc_type, doc_number, header = {}, lines = [] } = req.body;
  if (!device_code || !doc_type || !doc_number) {
    return res.status(400).json({ error: 'device_code, doc_type, doc_number required' });
  }

  // Register/touch device
  let device = await pool.query('SELECT * FROM devices WHERE device_code = $1', [device_code]);
  if (device.rows.length === 0) {
    device = await pool.query(
      'INSERT INTO devices (device_code, device_type, last_seen) VALUES ($1,$2,NOW()) RETURNING *',
      [device_code, header.device_type || 'unknown']
    );
  } else {
    await pool.query('UPDATE devices SET last_seen = NOW() WHERE id = $1', [device.rows[0].id]);
  }
  const device_id = device.rows[0].id;

  const table = doc_type === 'grn' ? 'grn_header' : 'dispatch_header';
  const numberCol = doc_type === 'grn' ? 'grn_number' : 'dispatch_number';
  const linesTable = doc_type === 'grn' ? 'grn_lines' : 'dispatch_lines';
  const fkCol = doc_type === 'grn' ? 'grn_id' : 'dispatch_id';

  // Find or create the header (idempotent by doc_number)
  let docRow = await pool.query(`SELECT * FROM ${table} WHERE ${numberCol} = $1`, [doc_number]);
  if (docRow.rows.length === 0) {
    if (doc_type === 'grn') {
      docRow = await pool.query(
        `INSERT INTO grn_header (grn_number, supplier_id, warehouse_id, device_id, scanned_offline)
         VALUES ($1,$2,$3,$4, TRUE) RETURNING *`,
        [doc_number, header.supplier_id || null, header.warehouse_id || null, device_id]
      );
    } else {
      docRow = await pool.query(
        `INSERT INTO dispatch_header (dispatch_number, customer_name, warehouse_id, device_id, scanned_offline)
         VALUES ($1,$2,$3,$4, TRUE) RETURNING *`,
        [doc_number, header.customer_name || null, header.warehouse_id || null, device_id]
      );
    }
  }
  const doc_id = docRow.rows[0].id;

  let inserted = 0;
  for (const line of lines) {
    const itemRes = await pool.query('SELECT id FROM items WHERE barcode = $1', [line.barcode_scanned]);
    const item_id = itemRes.rows[0] ? itemRes.rows[0].id : null;
    const result = await pool.query(
      `INSERT INTO ${linesTable} (${fkCol}, item_id, barcode_scanned, qty, scanned_at, client_uuid)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (client_uuid) DO NOTHING RETURNING id`,
      [doc_id, item_id, line.barcode_scanned, line.qty || 1, line.scanned_at || new Date(), line.client_uuid]
    );
    if (result.rows.length > 0) inserted++;
  }

  await pool.query(
    `UPDATE ${table} SET synced_at = NOW() WHERE id = $1`,
    [doc_id]
  );

  await pool.query(
    'INSERT INTO sync_log (device_id, doc_type, doc_number, lines_synced) VALUES ($1,$2,$3,$4)',
    [device_id, doc_type, doc_number, inserted]
  );

  res.json({ ok: true, doc_id, lines_received: lines.length, lines_newly_inserted: inserted });
});

module.exports = router;
