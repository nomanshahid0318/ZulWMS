# ZulWMS — Offline/Online Warehouse Management System

Free-stack replacement warehouse system: barcode-based GRN (inbound) and Dispatch (outbound),
offline-capable handheld scanning (old Windows CE/Mobile PDTs **and** new Android devices),
auto-sync when the device regains connectivity, live inventory, and a web dashboard.

Built independently from scratch — no proprietary code, database schema, or binaries from any
third-party product were used. Only the general *workflow* (scan → store locally → sync → update
stock) was used as a reference, which is standard practice across the WMS industry.

## Stack (100% free to run)
- Backend: Node.js + Express
- Database: PostgreSQL (Render free tier)
- Dashboard: plain HTML/JS (no build step)
- Scanner: browser-based page, works via keyboard-wedge scanner input, offline queue in
  localStorage, syncs in one batch call when back online

## Local development

```bash
npm install
cp .env.example .env      # edit DATABASE_URL to point at your local/remote Postgres
npm run initdb             # creates tables + seeds admin/admin123
npm start                  # http://localhost:3000
```

Dashboard: `http://localhost:3000`
Scanner page (open on any handheld's browser): `http://localhost:3000/scanner.html`

## Deploy to Render (free) and keep git-pushing updates

1. Push this folder to a new GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial ZulWMS"
   git branch -M main
   git remote add origin https://github.com/<your-username>/zulwms.git
   git push -u origin main
   ```

2. On [render.com](https://render.com) → **New** → **Blueprint** → connect your GitHub repo.
   Render will read `render.yaml` and automatically create:
   - a free Web Service (your app)
   - a free Postgres database, already wired via `DATABASE_URL`

3. After first deploy finishes, open the Render **Shell** tab for the web service and run:
   ```bash
   npm run initdb
   ```
   This creates the tables and seeds the login `admin / admin123`. **Change this password
   immediately after first login** (a "change password" endpoint can be added — ask if you want it).

4. From then on, your workflow is exactly what you asked for:
   ```bash
   git add .
   git commit -m "some change"
   git push
   ```
   Render auto-redeploys on every push. Open the live URL on your phone/PDT browser to test in
   real conditions.

## How the offline sync replaces the old "connect device to PC" step

- Old Zultec flow: scan on PDT → data sits on device → physically connect device to PC → run
  desktop app to download.
- New flow: scan on PDT/Android browser (`/scanner.html`) → each scan is queued in the browser's
  local storage → as soon as the device has **any** connectivity (wifi, hotspot, mobile data —
  no cable needed) → tap **"Sync now"** (or let it auto-retry) → data lands straight in Postgres
  and updates inventory. No cable, no per-device install, works identically on a 2013 PDT and a
  brand-new Android scanner because both just need a browser.

## Project structure

```
zulwms/
├── server.js              # Express app entrypoint
├── db/
│   ├── schema.sql          # fresh, independently-designed schema
│   ├── init.js             # applies schema + seeds admin user
│   └── pool.js              # Postgres connection
├── routes/
│   ├── auth.js              # login/JWT
│   ├── items.js             # barcode/item master
│   ├── grn.js                # inbound documents
│   ├── dispatch.js           # outbound documents
│   ├── sync.js                # batch sync endpoint used by handhelds
│   └── inventory.js           # stock, devices, warehouses
├── public/
│   ├── index.html / app.js / style.css   # PC dashboard
│   └── scanner.html / scanner.js          # handheld scanning page
├── render.yaml             # one-click Render deploy blueprint
└── package.json
```

## Modules included

- **Purchase Orders** — raise a PO against a supplier, receive against it with one click (auto-creates
  a linked GRN), PO auto-closes when fully received.
- **GRN (inbound)** — scan-based goods receipt, closing posts stock and the movement ledger.
- **Dispatch (outbound)** — scan-based shipment, closing deducts stock.
- **Stock transfers** — move inventory between warehouses; validates source stock before allowing the move.
- **Returns / damage** — customer returns (restock), supplier returns and damage write-offs.
- **Inventory** — live stock-on-hand per warehouse.
- **Reports** — stock movement ledger, current stock snapshot, slow-moving stock (30+ day aging),
  audit trail. Stock and movements are exportable as CSV.
- **Item master** — barcode-to-item mapping.
- **Suppliers** — vendor master used by POs.
- **Users & roles** — admin / supervisor / operator, enforced server-side on every write endpoint.
- **Barcode label printing** — `/labels.html`, pulls the item master and prints a label grid (or paste
  specific barcodes) using JsBarcode.
- **Devices** — every handheld that has synced shows up automatically, no manual registration needed.

## Roles

- **operator**: can scan/create GRN, dispatch, transfers; cannot manage suppliers, users, or delete records.
- **supervisor**: operator permissions + manage suppliers and purchase orders.
- **admin**: full access, including user management and deletions.

Change your own password via `POST /api/users/change-password` (a UI screen for this can be added on request).

## Next features to add (tell me which to prioritize)
- Push-based auto-sync (background sync instead of manual button) on modern Android
- Native Android app wrapper (for camera-based scanning without external hardware scanner)
- Batch/lot + expiry UI in the dashboard (columns already exist in the database)
- Per-warehouse dashboards / filtering
- Low-stock alerts / reorder points
