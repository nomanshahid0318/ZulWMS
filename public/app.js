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
  const renderers = { overview, grn, dispatch, inventory, items, devices };
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

if (TOKEN) boot();
