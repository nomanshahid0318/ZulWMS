let TOKEN = localStorage.getItem('zulwms_token');

async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  if (TOKEN) opts.headers['Authorization'] = 'Bearer ' + TOKEN;
  if (opts.body) opts.headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, opts);
  if (!res.ok) throw new Error((await res.json()).error || 'request failed');
  return res.json();
}

async function doLogin() {
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    TOKEN = data.token;
    localStorage.setItem('zulwms_token', TOKEN);
    boot();
  } catch (e) {
    document.getElementById('loginError').textContent = 'Login failed: ' + e.message;
  }
}

function logout() {
  localStorage.removeItem('zulwms_token');
  location.reload();
}

function boot() {
  document.getElementById('login').classList.add('hidden');
  document.getElementById('shell').classList.remove('hidden');
  document.querySelectorAll('.nav-item[data-view]').forEach(el => {
    el.onclick = () => setView(el.dataset.view);
  });
  setView('overview');
}

function setView(view) {
  document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const renderers = { overview, grn, dispatch, inventory, items, devices, po, transfers, returns, suppliers, reports, users };
  renderers[view]();
}

const main = () => document.getElementById('main');

// ---------- OVERVIEW ----------
async function overview() {
  main().innerHTML = `<h1>Overview</h1><div class="subtitle">Live status across the warehouse</div><div id="stats" class="stat-grid"></div>`;
  const [grns, dispatches, inv, devs] = await Promise.all([
    api('/grn'), api('/dispatch'), api('/inventory'), api('/inventory/devices')
  ]);
  const openGrn = grns.filter(g => g.status === 'open').length;
  const openDisp = dispatches.filter(d => d.status === 'open').length;
  document.getElementById('stats').innerHTML = `
    <div class="stat"><div class="num">${openGrn}</div><div class="lbl">Open GRNs</div></div>
    <div class="stat"><div class="num">${openDisp}</div><div class="lbl">Open Dispatches</div></div>
    <div class="stat"><div class="num">${inv.length}</div><div class="lbl">SKUs in stock</div></div>
    <div class="stat"><div class="num">${devs.length}</div><div class="lbl">Registered devices</div></div>
  `;
}

// ---------- GRN ----------
async function grn() {
  main().innerHTML = `<h1>Inbound — GRN</h1><div class="subtitle">Goods received from suppliers</div>
    <div class="card"><div class="row">
      <input id="newGrnNum" placeholder="GRN number e.g. GRN-2026-001">
      <button onclick="createGrn()">+ New GRN</button>
    </div></div>
    <div class="card"><table><thead><tr><th>GRN #</th><th>Warehouse</th><th>Supplier</th><th>Lines</th><th>Status</th><th>Source</th><th>Created</th></tr></thead><tbody id="grnBody"></tbody></table></div>`;
  const rows = await api('/grn');
  document.getElementById('grnBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.grn_number}</td>
      <td>${r.warehouse_name || '—'}</td>
      <td>${r.supplier_name || '—'}</td>
      <td>${r.line_count}</td>
      <td><span class="tag ${r.status}">${r.status}</span></td>
      <td>${r.scanned_offline ? 'Handheld (offline)' : 'Web'}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">No GRNs yet</td></tr>';
}

async function createGrn() {
  const grn_number = document.getElementById('newGrnNum').value.trim();
  if (!grn_number) return;
  await api('/grn', { method: 'POST', body: JSON.stringify({ grn_number }) });
  grn();
}

// ---------- DISPATCH ----------
async function dispatch() {
  main().innerHTML = `<h1>Outbound — Dispatch</h1><div class="subtitle">Shipments going out to customers</div>
    <div class="card"><div class="row">
      <input id="newDispNum" placeholder="Dispatch number e.g. DSP-2026-001">
      <input id="newDispCust" placeholder="Customer name">
      <button onclick="createDispatch()">+ New Dispatch</button>
    </div></div>
    <div class="card"><table><thead><tr><th>Dispatch #</th><th>Customer</th><th>Warehouse</th><th>Lines</th><th>Status</th><th>Source</th><th>Created</th></tr></thead><tbody id="dispBody"></tbody></table></div>`;
  const rows = await api('/dispatch');
  document.getElementById('dispBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.dispatch_number}</td>
      <td>${r.customer_name || '—'}</td>
      <td>${r.warehouse_name || '—'}</td>
      <td>${r.line_count}</td>
      <td><span class="tag ${r.status}">${r.status}</span></td>
      <td>${r.scanned_offline ? 'Handheld (offline)' : 'Web'}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">No dispatches yet</td></tr>';
}

async function createDispatch() {
  const dispatch_number = document.getElementById('newDispNum').value.trim();
  const customer_name = document.getElementById('newDispCust').value.trim();
  if (!dispatch_number) return;
  await api('/dispatch', { method: 'POST', body: JSON.stringify({ dispatch_number, customer_name }) });
  dispatch();
}

// ---------- INVENTORY ----------
async function inventory() {
  main().innerHTML = `<h1>Inventory</h1><div class="subtitle">Current stock on hand</div>
    <div class="card"><table><thead><tr><th>Barcode</th><th>Item</th><th>Warehouse</th><th>Qty on hand</th><th>Updated</th></tr></thead><tbody id="invBody"></tbody></table></div>`;
  const rows = await api('/inventory');
  document.getElementById('invBody').innerHTML = rows.map(r => `
    <tr><td class="mono">${r.barcode}</td><td>${r.item_name}</td><td>${r.warehouse_name}</td>
        <td class="mono">${r.qty_on_hand}</td><td>${new Date(r.updated_at).toLocaleString()}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="color:var(--muted)">No stock movements yet</td></tr>';
}

// ---------- ITEM MASTER ----------
async function items() {
  main().innerHTML = `<h1>Item Master</h1><div class="subtitle">Barcode-to-item mapping</div>
    <div class="card"><div class="row">
      <input id="itBarcode" placeholder="Barcode" class="mono">
      <input id="itName" placeholder="Item name">
      <input id="itUnit" placeholder="Unit (PCS)" style="width:90px">
      <button onclick="createItem()">+ Add / Update</button>
    </div></div>
    <div class="card"><input id="itSearch" placeholder="Search items..." oninput="searchItems(this.value)" style="width:100%;margin-bottom:12px;">
    <table><thead><tr><th>Barcode</th><th>Name</th><th>Unit</th><th>Category</th></tr></thead><tbody id="itBody"></tbody></table></div>`;
  searchItems('');
}

async function searchItems(q) {
  const rows = await api('/items' + (q ? '?q=' + encodeURIComponent(q) : ''));
  document.getElementById('itBody').innerHTML = rows.map(r => `
    <tr><td class="mono">${r.barcode}</td><td>${r.name}</td><td>${r.unit}</td><td>${r.category || '—'}</td></tr>`
  ).join('') || '<tr><td colspan="4" style="color:var(--muted)">No items found</td></tr>';
}

async function createItem() {
  const barcode = document.getElementById('itBarcode').value.trim();
  const name = document.getElementById('itName').value.trim();
  const unit = document.getElementById('itUnit').value.trim() || 'PCS';
  if (!barcode || !name) return;
  await api('/items', { method: 'POST', body: JSON.stringify({ barcode, name, unit }) });
  items();
}

// ---------- DEVICES ----------
async function devices() {
  main().innerHTML = `<h1>Devices</h1><div class="subtitle">Handheld scanners that have synced data — old PDTs and new Android devices both show up here</div>
    <div class="card"><table><thead><tr><th>Device code</th><th>Type</th><th>Last seen</th></tr></thead><tbody id="devBody"></tbody></table></div>
    <div class="card"><h1 style="font-size:16px;">Scanner link</h1><div class="subtitle" style="margin-bottom:12px;">Open this URL on any handheld or Android device's browser to start scanning:</div>
    <div class="mono" style="background:var(--panel-alt);padding:12px;border-radius:4px;">${location.origin}/scanner.html</div></div>`;
  const rows = await api('/inventory/devices');
  document.getElementById('devBody').innerHTML = rows.map(r => `
    <tr><td class="mono">${r.device_code}</td><td>${r.device_type || '—'}</td><td>${r.last_seen ? new Date(r.last_seen).toLocaleString() : 'Never'}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="color:var(--muted)">No devices have synced yet</td></tr>';
}

// ---------- SUPPLIERS ----------
async function suppliers() {
  main().innerHTML = `<h1>Suppliers</h1><div class="subtitle">Vendor master for purchase orders</div>
    <div class="card"><div class="row">
      <input id="supName" placeholder="Supplier name">
      <input id="supContact" placeholder="Contact person">
      <input id="supPhone" placeholder="Phone">
      <button onclick="createSupplier()">+ Add supplier</button>
    </div></div>
    <div class="card"><table><thead><tr><th>Name</th><th>Contact</th><th>Phone</th></tr></thead><tbody id="supBody"></tbody></table></div>`;
  const rows = await api('/suppliers');
  document.getElementById('supBody').innerHTML = rows.map(r => `
    <tr><td>${r.name}</td><td>${r.contact || '—'}</td><td>${r.phone || '—'}</td></tr>`
  ).join('') || '<tr><td colspan="3" style="color:var(--muted)">No suppliers yet</td></tr>';
}
async function createSupplier() {
  const name = document.getElementById('supName').value.trim();
  const contact = document.getElementById('supContact').value.trim();
  const phone = document.getElementById('supPhone').value.trim();
  if (!name) return;
  await api('/suppliers', { method: 'POST', body: JSON.stringify({ name, contact, phone }) });
  suppliers();
}

// ---------- PURCHASE ORDERS ----------
async function po() {
  main().innerHTML = `<h1>Purchase Orders</h1><div class="subtitle">Raise a PO, then receive against it with a GRN</div>
    <div class="card"><div class="row">
      <input id="poNum" placeholder="PO number e.g. PO-2026-001">
      <select id="poSupplier"></select>
      <button onclick="createPo()">+ New PO</button>
    </div><div style="font-size:12px;color:var(--muted);margin-top:8px;">Add line items after creating the PO.</div></div>
    <div class="card"><table><thead><tr><th>PO #</th><th>Supplier</th><th>Lines</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody id="poBody"></tbody></table></div>`;

  const [rows, sups] = await Promise.all([api('/po'), api('/suppliers')]);
  document.getElementById('poSupplier').innerHTML = '<option value="">No supplier</option>' + sups.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  document.getElementById('poBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.po_number}</td>
      <td>${r.supplier_name || '—'}</td>
      <td>${r.line_count}</td>
      <td><span class="tag ${r.status === 'closed' ? 'closed' : 'open'}">${r.status}</span></td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
      <td>${r.status !== 'closed' ? `<button class="secondary" onclick="receivePo(${r.id})">Receive (create GRN)</button>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">No purchase orders yet</td></tr>';
}
async function createPo() {
  const po_number = document.getElementById('poNum').value.trim();
  const supplier_id = document.getElementById('poSupplier').value || null;
  if (!po_number) return;
  await api('/po', { method: 'POST', body: JSON.stringify({ po_number, supplier_id, lines: [] }) });
  po();
}
async function receivePo(id) {
  const grn_number = prompt('GRN number for this receipt:');
  if (!grn_number) return;
  await api(`/po/${id}/create-grn`, { method: 'POST', body: JSON.stringify({ grn_number }) });
  alert('GRN created — go to Inbound (GRN) to scan against it.');
  grn();
  setView('grn');
}

// ---------- TRANSFERS ----------
async function transfers() {
  main().innerHTML = `<h1>Stock Transfers</h1><div class="subtitle">Move inventory between warehouses</div>
    <div class="card"><div class="row">
      <input id="trNum" placeholder="Transfer number">
      <select id="trFrom"></select>
      <select id="trTo"></select>
      <button onclick="createTransfer()">+ New transfer</button>
    </div></div>
    <div class="card"><table><thead><tr><th>Transfer #</th><th>From</th><th>To</th><th>Lines</th><th>Status</th><th>Action</th></tr></thead><tbody id="trBody"></tbody></table></div>`;
  const [rows, whs] = await Promise.all([api('/transfers'), api('/inventory/warehouses')]);
  const opts = whs.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  document.getElementById('trFrom').innerHTML = opts;
  document.getElementById('trTo').innerHTML = opts;
  document.getElementById('trBody').innerHTML = rows.map(r => `
    <tr>
      <td class="mono">${r.transfer_number}</td>
      <td>${r.from_warehouse_name}</td>
      <td>${r.to_warehouse_name}</td>
      <td>${r.line_count}</td>
      <td><span class="tag ${r.status}">${r.status}</span></td>
      <td>${r.status !== 'closed' ? `<button class="secondary" onclick="addTransferLine(${r.id})">+ Add item</button> <button class="secondary" onclick="closeTransfer(${r.id})">Close & move stock</button>` : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">No transfers yet</td></tr>';
}
async function addTransferLine(id) {
  const barcode_scanned = prompt('Barcode:');
  if (!barcode_scanned) return;
  const qty = parseFloat(prompt('Qty:', '1')) || 1;
  await api(`/transfers/${id}/lines`, { method: 'POST', body: JSON.stringify({ barcode_scanned, qty, client_uuid: 'web-' + Date.now() + Math.random() }) });
  transfers();
}
async function createTransfer() {
  const transfer_number = document.getElementById('trNum').value.trim();
  const from_warehouse_id = document.getElementById('trFrom').value;
  const to_warehouse_id = document.getElementById('trTo').value;
  if (!transfer_number) return;
  try {
    await api('/transfers', { method: 'POST', body: JSON.stringify({ transfer_number, from_warehouse_id, to_warehouse_id }) });
    transfers();
  } catch (e) { alert(e.message); }
}
async function closeTransfer(id) {
  try {
    await api(`/transfers/${id}/close`, { method: 'POST' });
    transfers();
  } catch (e) { alert('Failed: ' + e.message); }
}

// ---------- RETURNS ----------
async function returns() {
  main().innerHTML = `<h1>Returns / Damage</h1><div class="subtitle">Customer returns, supplier returns, and damaged stock write-offs</div>
    <div class="card">
      <div class="row">
        <input id="retNum" placeholder="Return number">
        <select id="retType">
          <option value="customer_return">Customer return (restock)</option>
          <option value="damage">Damage (write-off)</option>
          <option value="supplier_return">Supplier return (write-off)</option>
        </select>
        <select id="retWarehouse"></select>
      </div>
      <div class="row" style="margin-top:10px;">
        <input id="retBarcode" placeholder="Barcode">
        <input id="retQty" type="number" value="1" style="width:80px;">
        <button onclick="submitReturn()">Submit return</button>
      </div>
    </div>
    <div class="card"><table><thead><tr><th>Return #</th><th>Type</th><th>Warehouse</th><th>Lines</th><th>Created</th></tr></thead><tbody id="retBody"></tbody></table></div>`;
  const [rows, whs] = await Promise.all([api('/returns'), api('/inventory/warehouses')]);
  document.getElementById('retWarehouse').innerHTML = whs.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
  document.getElementById('retBody').innerHTML = rows.map(r => `
    <tr><td class="mono">${r.return_number}</td><td>${r.return_type}</td><td>${r.warehouse_name}</td><td>${r.line_count}</td><td>${new Date(r.created_at).toLocaleString()}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="color:var(--muted)">No returns recorded yet</td></tr>';
}
async function submitReturn() {
  const return_number = document.getElementById('retNum').value.trim();
  const return_type = document.getElementById('retType').value;
  const warehouse_id = document.getElementById('retWarehouse').value;
  const barcode = document.getElementById('retBarcode').value.trim();
  const qty = parseFloat(document.getElementById('retQty').value) || 1;
  if (!return_number || !barcode) return;
  const restock = return_type === 'customer_return';
  await api('/returns', { method: 'POST', body: JSON.stringify({ return_number, return_type, warehouse_id, lines: [{ barcode, qty, restock }] }) });
  returns();
}

// ---------- REPORTS ----------
async function reports() {
  main().innerHTML = `<h1>Reports</h1><div class="subtitle">Stock movement history, snapshots, and audit trail</div>
    <div class="card">
      <div class="row">
        <button onclick="window.open('/api/reports/stock?format=csv','_blank')">Export current stock (CSV)</button>
        <button onclick="window.open('/api/reports/movements?format=csv','_blank')">Export stock movements (CSV)</button>
      </div>
    </div>
    <div class="card"><h1 style="font-size:16px;">Recent stock movements</h1><table><thead><tr><th>Date</th><th>Warehouse</th><th>Item</th><th>Type</th><th>Qty change</th><th>By</th></tr></thead><tbody id="movBody"></tbody></table></div>
    <div class="card"><h1 style="font-size:16px;">Slow-moving stock (30+ days no movement)</h1><table><thead><tr><th>Warehouse</th><th>Item</th><th>Qty</th><th>Last movement</th></tr></thead><tbody id="agingBody"></tbody></table></div>`;

  const [movs, aging] = await Promise.all([api('/reports/movements'), api('/reports/aging')]);
  document.getElementById('movBody').innerHTML = movs.slice(0, 50).map(m => `
    <tr><td>${new Date(m.created_at).toLocaleString()}</td><td>${m.warehouse || '—'}</td><td>${m.item_name || '—'}</td>
        <td>${m.movement_type}</td><td class="mono">${m.qty_change}</td><td>${m.by_user || '—'}</td></tr>`
  ).join('') || '<tr><td colspan="6" style="color:var(--muted)">No movements yet</td></tr>';

  document.getElementById('agingBody').innerHTML = aging.map(a => `
    <tr><td>${a.warehouse}</td><td>${a.item_name}</td><td class="mono">${a.qty_on_hand}</td><td>${Math.round(a.days_since_movement)} days ago</td></tr>`
  ).join('') || '<tr><td colspan="4" style="color:var(--muted)">Nothing sitting idle 30+ days</td></tr>';
}

// ---------- USERS ----------
async function users() {
  main().innerHTML = `<h1>Users</h1><div class="subtitle">Manage staff logins and roles (admin only)</div>
    <div class="card"><div class="row">
      <input id="usrName" placeholder="Username">
      <input id="usrPass" type="password" placeholder="Password">
      <input id="usrFull" placeholder="Full name">
      <select id="usrRole"><option value="operator">Operator</option><option value="supervisor">Supervisor</option><option value="admin">Admin</option></select>
      <button onclick="createUser()">+ Add user</button>
    </div></div>
    <div class="card"><table><thead><tr><th>Username</th><th>Full name</th><th>Role</th><th>Active</th></tr></thead><tbody id="usrBody"></tbody></table></div>`;
  try {
    const rows = await api('/users');
    document.getElementById('usrBody').innerHTML = rows.map(u => `
      <tr><td class="mono">${u.username}</td><td>${u.full_name || '—'}</td><td>${u.role}</td><td>${u.active ? 'Yes' : 'No'}</td></tr>`
    ).join('');
  } catch (e) {
    document.getElementById('usrBody').innerHTML = `<tr><td colspan="4" style="color:var(--bad)">${e.message}</td></tr>`;
  }
}
async function createUser() {
  const username = document.getElementById('usrName').value.trim();
  const password = document.getElementById('usrPass').value;
  const full_name = document.getElementById('usrFull').value.trim();
  const role = document.getElementById('usrRole').value;
  if (!username || !password) return;
  try {
    await api('/users', { method: 'POST', body: JSON.stringify({ username, password, full_name, role }) });
    users();
  } catch (e) { alert(e.message); }
}

if (TOKEN) boot();
