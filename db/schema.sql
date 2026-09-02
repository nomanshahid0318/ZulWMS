-- ZulWMS Replacement -- Fresh schema, designed independently
-- Run this once against your Postgres database (Render free Postgres works fine)

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'operator', -- admin | supervisor | operator
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact VARCHAR(100),
    phone VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    barcode VARCHAR(100) UNIQUE NOT NULL,
    sku VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    unit VARCHAR(20) DEFAULT 'PCS',
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    device_code VARCHAR(50) UNIQUE NOT NULL, -- e.g. MC3200-01, ANDROID-05
    device_type VARCHAR(50),                  -- pdt_windows_ce | android | web
    label VARCHAR(100),
    last_seen TIMESTAMP
);

-- Goods Received Note (GRN) -- inbound shipments
CREATE TABLE IF NOT EXISTS grn_header (
    id SERIAL PRIMARY KEY,
    grn_number VARCHAR(50) UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    warehouse_id INTEGER REFERENCES warehouses(id),
    device_id INTEGER REFERENCES devices(id),
    created_by INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'open', -- open | synced | closed
    scanned_offline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    synced_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS grn_lines (
    id SERIAL PRIMARY KEY,
    grn_id INTEGER REFERENCES grn_header(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id),
    barcode_scanned VARCHAR(100),
    qty NUMERIC(12,2) NOT NULL DEFAULT 1,
    scanned_at TIMESTAMP DEFAULT NOW(),
    client_uuid VARCHAR(64) UNIQUE -- used for offline dedup/sync
);

-- Dispatch / Outbound shipments
CREATE TABLE IF NOT EXISTS dispatch_header (
    id SERIAL PRIMARY KEY,
    dispatch_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(150),
    warehouse_id INTEGER REFERENCES warehouses(id),
    device_id INTEGER REFERENCES devices(id),
    created_by INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'open',
    scanned_offline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    synced_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dispatch_lines (
    id SERIAL PRIMARY KEY,
    dispatch_id INTEGER REFERENCES dispatch_header(id) ON DELETE CASCADE,
    item_id INTEGER REFERENCES items(id),
    barcode_scanned VARCHAR(100),
    qty NUMERIC(12,2) NOT NULL DEFAULT 1,
    scanned_at TIMESTAMP DEFAULT NOW(),
    client_uuid VARCHAR(64) UNIQUE
);

-- Running stock balance per warehouse
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    warehouse_id INTEGER REFERENCES warehouses(id),
    item_id INTEGER REFERENCES items(id),
    qty_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(warehouse_id, item_id)
);

-- Every sync from a handheld device is logged here (audit trail)
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id),
    doc_type VARCHAR(20), -- grn | dispatch
    doc_number VARCHAR(50),
    lines_synced INTEGER,
    synced_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_grn_lines_grn ON grn_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_lines_dispatch ON dispatch_lines(dispatch_id);
