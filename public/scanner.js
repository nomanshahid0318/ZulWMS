// Uses localStorage instead of IndexedDB/ServiceWorker on purpose:
// it works on very old browsers (Windows CE / Windows Mobile IE) as well as modern Android Chrome,
// which is the compatibility requirement across old + new handheld devices.

// Register service worker so the app works fully offline and is installable on the home screen.
// Wrapped in a feature check so it silently does nothing on very old browsers that lack SW support --
// those devices simply fall back to the "Export to file / USB transfer" workflow below.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'block';
});
function installApp() {
  if (!deferredInstallPrompt) { alert('Already installed, or your browser doesn\'t support installable apps. On old devices, use Export/Import via USB instead.'); return; }
  deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  document.getElementById('installBtn').style.display = 'none';
}

const QUEUE_KEY = 'zulwms_scan_queue';
const DEVICE_KEY = 'zulwms_device_code';

function getDeviceCode() {
  let code = localStorage.getItem(DEVICE_KEY);
  if (!code) {
    code = 'DEV-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    localStorage.setItem(DEVICE_KEY, code);
  }
  return code;
}

function getQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch (e) { return []; }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  renderQueue();
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function renderQueue() {
  const q = getQueue();
  document.getElementById('pendingBadge').textContent = q.length;
  document.getElementById('syncCount').textContent = q.length;
  const list = document.getElementById('queueList');
  if (q.length === 0) {
    list.innerHTML = '<div class="empty">No scans queued yet</div>';
    return;
  }
  list.innerHTML = q.slice().reverse().map(item => `
    <div class="queue-item">
      <span>${item.doc_number} — ${item.barcode_scanned}</span>
      <span class="qty">x${item.qty}</span>
    </div>`).join('');
}

function addScan(barcode) {
  const doc_type = document.getElementById('docType').value;
  const doc_number = document.getElementById('docNumber').value.trim();
  const qty = parseFloat(document.getElementById('qtyInput').value) || 1;
  if (!doc_number) { alert('Enter a document number first'); return; }

  const q = getQueue();
  q.push({
    doc_type, doc_number,
    barcode_scanned: barcode,
    qty,
    scanned_at: new Date().toISOString(),
    client_uuid: uuid()
  });
  saveQueue(q);
}

async function syncNow() {
  const q = getQueue();
  if (q.length === 0) { alert('Nothing to sync'); return; }

  // group by doc_type + doc_number so each becomes one batch call
  const groups = {};
  q.forEach(item => {
    const key = item.doc_type + '::' + item.doc_number;
    if (!groups[key]) groups[key] = { doc_type: item.doc_type, doc_number: item.doc_number, lines: [] };
    groups[key].lines.push(item);
  });

  const device_code = getDeviceCode();
  let allOk = true;
  let syncedUuids = [];

  for (const key in groups) {
    const g = groups[key];
    try {
      const res = await fetch('/api/sync/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_code,
          doc_type: g.doc_type,
          doc_number: g.doc_number,
          header: { device_type: /android/i.test(navigator.userAgent) ? 'android' : 'pdt_windows_ce' },
          lines: g.lines
        })
      });
      if (!res.ok) throw new Error('sync failed');
      g.lines.forEach(l => syncedUuids.push(l.client_uuid));
    } catch (e) {
      allOk = false;
    }
  }

  // remove successfully synced lines from local queue
  const remaining = getQueue().filter(item => !syncedUuids.includes(item.client_uuid));
  saveQueue(remaining);

  alert(allOk ? 'Sync complete' : 'Some items failed to sync — will retry, they remain queued.');
}

function clearQueue() {
  if (confirm('Clear all locally queued (unsynced) scans?')) saveQueue([]);
}

// ---------- USB / file-based transfer (works with zero connectivity, replaces the old "connect PDT to PC" step) ----------

function exportQueueToFile() {
  const q = getQueue();
  if (q.length === 0) { alert('Nothing to export -- scan something first'); return; }

  const payload = {
    device_code: getDeviceCode(),
    device_type: /android/i.test(navigator.userAgent) ? 'android' : 'pdt_windows_ce',
    exported_at: new Date().toISOString(),
    scans: q
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zulwms-scans-${getDeviceCode()}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  alert('File saved to your device\'s Downloads folder. Connect this device to a PC via USB, copy that file over, then open the ZulWMS dashboard → "Import Scans" to bring it in -- or keep it queued here and use "Sync now" once you have internet.');
}

function importQueueFromFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const payload = JSON.parse(e.target.result);
      const incoming = payload.scans || payload; // support raw array too
      const existing = getQueue();
      const existingUuids = new Set(existing.map(x => x.client_uuid));
      const merged = existing.concat(incoming.filter(x => !existingUuids.has(x.client_uuid)));
      saveQueue(merged);
      alert(`Imported ${incoming.length} scan(s) into this device's queue. Use "Sync now" to send them to the server.`);
    } catch (err) {
      alert('Could not read this file -- make sure it is a ZulWMS export file.');
    }
  };
  reader.readAsText(file);
}

function updateNetStatus() {
  const el = document.getElementById('netStatus');
  if (navigator.onLine) {
    el.textContent = 'Online — ready to sync';
    el.className = 'status online';
  } else {
    el.textContent = 'Offline — scans saved locally';
    el.className = 'status offline';
  }
}

window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);

document.getElementById('scanInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    const val = this.value.trim();
    if (val) {
      addScan(val);
      this.value = '';
    }
    e.preventDefault();
  }
});

// keep focus on the scan field so hardware scanner (keyboard-wedge) input always lands there
setInterval(() => {
  if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
    document.getElementById('scanInput').focus();
  }
}, 1500);

updateNetStatus();
renderQueue();
