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

   The web service's start command is `node db/init.js && node server.js` — the database schema
   is applied **automatically on every deploy and restart**. You do not need to open the Render
   Shell at all. It's safe to run repeatedly (it only creates what's missing and never re-seeds
   an existing admin user).

3. That's it — no manual step needed after the first deploy. Just:
   ```bash
   git add .
   git commit -m "some change"
   git push
   ```
   Render auto-redeploys on every push, re-applying the schema automatically, then starting the
   app. Open the live URL on your phone/PDT browser to test in real conditions.

   First login: `admin / admin123` — **change this immediately** via
   `POST /api/users/change-password` once logged in (ask if you want a UI screen for this).

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

## Devices with different IPs / 10-15 handhelds — is that a problem?

**No.** This is a client-server system, not device-to-device. Every handheld (10, 15, or 100 of
them) only ever talks to **one fixed address**: your Render app's URL
(e.g. `https://zulwms.onrender.com`). Devices never talk to each other and never need to know
each other's IP or be on the same network as each other. Each device just needs *any* internet
connection (WiFi, hotspot, mobile data) to reach that one URL. This is exactly how apps like
WhatsApp or Gmail work across thousands of phones with different IPs — nothing to configure per
device.

## Two ways data gets from a handheld to the server

**1. Online sync (primary, no cable)**
Open `/scanner.html` on the device's browser → scan → tap **Sync now** whenever the device has any
connectivity. Data goes straight to the server. This should be the default for every device that
has WiFi in the warehouse.

**2. USB / offline file transfer (backup, works with zero connectivity ever)**
For devices that never get online, or as your accustomed workflow:
- On the handheld: Scanner page → **"Export to file"** → saves a `.json` file to the device's
  Downloads folder.
- Connect the device to a PC via USB cable (mass storage / file transfer mode), copy that file
  onto the PC.
- On the PC: open the dashboard → **Import Scans (USB)** → select the file → **Upload & sync**.
  Data is applied to the same database, same as online sync — this replaces the old
  "connect device to PC and download" step exactly, just via a file instead of proprietary
  software.

Both methods can be used side by side — some devices sync online, others via USB, all landing in
the same system.

## Installing the scanner as an app on a device

On a modern Android device: open `/scanner.html` in Chrome → a green **"Install this app on
device"** button appears (or use Chrome's menu → *Add to Home Screen*) → it now behaves like a
normal installed app with its own icon, and keeps working fully offline once installed.

On very old Windows CE / Windows Mobile PDTs, the built-in browser usually can't install apps this
way — that's fine, those devices should just keep the scanner page open and use the
**Export to file / USB** workflow above.

---

## Full "how to use" guide

### First-time setup (once)
1. Log in to the dashboard at your Render URL with `admin / admin123`.
2. Go to **Users** → change your password (there's no screen for this yet in the UI — use
   `POST /api/users/change-password` with your current + new password, or ask for a settings
   screen to be added).
3. Go to **Users** → add one account per staff member, with the right role (`operator` for
   scanning-only staff, `supervisor` for staff who also manage suppliers/POs, `admin` for you).
4. Go to **Suppliers** → add your suppliers.
5. Go to **Item Master** → add your barcodes and item names (or add them as you go — scanning an
   unknown barcode still records the scan, you can map it to an item afterward).
6. If you have more than one warehouse, add the others from the dashboard (currently via
   `POST /api/inventory/warehouses` — a UI screen for this can be added on request).

### Receiving stock (inbound)
1. **Dashboard → Purchase Orders → New PO**, pick the supplier, note the PO number.
2. When goods arrive: **Purchase Orders → Receive (create GRN)** on that PO → gives you a GRN
   number, already linked to the PO.
3. On the handheld: open the scanner page → Document type = **Inbound (GRN)** → type in that GRN
   number → scan every box/item → **Sync now** (or export/import via USB).
4. Back on the dashboard: **Inbound (GRN)** → open the GRN → **Close** → stock is added to
   inventory and the PO auto-updates (marked received / partially received / closed).

   *(You can also skip the PO step entirely and just create a GRN directly from the GRN screen —
   POs are optional, useful when you want to track what was ordered vs what arrived.)*

### Shipping stock (outbound)
1. **Dashboard → Outbound (Dispatch) → New Dispatch**, enter customer name, note the dispatch
   number.
2. On the handheld: Document type = **Outbound (Dispatch)** → enter that dispatch number → scan →
   sync.
3. Dashboard → **Outbound (Dispatch)** → open it → **Close** → stock is deducted.

### Moving stock between warehouses
1. **Dashboard → Transfers → New transfer**, pick source and destination warehouse.
2. **+ Add item** on that transfer row → enter barcode + qty (repeat per item) — or extend the
   handheld app to support transfers too, if you'd like that added.
3. **Close & move stock** — stock is deducted from source, added to destination. It will refuse to
   close if the source doesn't have enough stock.

### Handling returns or damaged goods
**Dashboard → Returns/Damage → New** → pick type:
- *Customer return* → stock goes back into inventory.
- *Damage* or *Supplier return* → stock is written off / removed, not added back.

### Checking stock and history
- **Inventory** → live stock per warehouse.
- **Reports** → full movement history (every stock change with who/when/why), a slow-moving stock
  list (nothing touched in 30+ days), and CSV export buttons for both stock and movement history.
- **Devices** → every handheld that has ever synced shows up automatically here — nothing to
  register manually.

### Printing barcode labels
**Sidebar → Print Labels ↗** opens a new tab, pulls your whole item master, generates a label
grid, and has a Print button (browser's native print-to-any-printer).

### Adding a new handheld device
Nothing to configure. Open `/scanner.html` in the device's browser (or the installed app), start
scanning — the device registers itself in **Devices** automatically the first time it syncs.

