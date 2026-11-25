// HealthPilot – lokale Speicherung (IndexedDB). Es werden keine Daten an Server gesendet.
const DB_VERSION = 1;
const MODE_KEY = 'healthpilot-mode'; // enthält nur "echt" oder "demo", keine Gesundheitsdaten

export function getMode() {
  try { return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'echt'; } catch { return 'echt'; }
}
export function setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch { /* ignoriert */ } }
const dbName = () => (getMode() === 'demo' ? 'healthpilot-demo' : 'healthpilot');

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('date', 'date'); s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains('plan')) {
        const s = db.createObjectStore('plan', { keyPath: 'id' });
        s.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Datenbank blockiert – bitte andere geöffnete HealthPilot-Fenster schließen.'));
  });
  return dbp;
}
export function resetConnection() { if (dbp) dbp.then((d) => d.close()).catch(() => {}); dbp = null; }

function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Speichern abgebrochen'));
    result = fn(Array.isArray(store) ? store.map((s) => t.objectStore(s)) : t.objectStore(store), t);
  }));
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export async function kvGet(key, fallback = null) {
  const db = await open();
  const v = await reqP(db.transaction('kv').objectStore('kv').get(key));
  return v === undefined ? fallback : v;
}
export const kvSet = (key, val) => tx('kv', 'readwrite', (s) => { s.put(val, key); });

export async function allEntries() {
  const db = await open();
  return reqP(db.transaction('entries').objectStore('entries').getAll());
}
export const putEntry = (e) => tx('entries', 'readwrite', (s) => { s.put(e); });
export const putEntries = (list) => tx('entries', 'readwrite', (s) => { list.forEach((e) => s.put(e)); });
export const deleteEntry = (id) => tx('entries', 'readwrite', (s) => { s.delete(id); });

export async function allPlan() {
  const db = await open();
  return reqP(db.transaction('plan').objectStore('plan').getAll());
}
export const putPlanItems = (list) => tx('plan', 'readwrite', (s) => { list.forEach((e) => s.put(e)); });
export const deletePlanItems = (ids) => tx('plan', 'readwrite', (s) => { ids.forEach((id) => s.delete(id)); });

/* ---------- Backup ---------- */
export async function exportAll() {
  const db = await open();
  const t = db.transaction(['kv', 'entries', 'plan']);
  const kvStore = t.objectStore('kv');
  const [keys, vals, entries, plan] = await Promise.all([
    reqP(kvStore.getAllKeys()), reqP(kvStore.getAll()),
    reqP(t.objectStore('entries').getAll()), reqP(t.objectStore('plan').getAll()),
  ]);
  const kv = {};
  keys.forEach((k, i) => { if (k !== 'preRestoreSnapshot') kv[k] = vals[i]; });
  // Den API-Schlüssel nie in Sicherungsdateien schreiben
  if (kv.ai) kv.ai = { ...kv.ai, apiKey: '' };
  return { format: 'healthpilot-backup', version: 1, exported: new Date().toISOString(), mode: getMode(), kv, entries, plan };
}

export function validateBackup(data) {
  if (!data || data.format !== 'healthpilot-backup') return 'Das ist keine HealthPilot-Sicherung.';
  if (!Array.isArray(data.entries) || !Array.isArray(data.plan) || typeof data.kv !== 'object') return 'Die Sicherung ist unvollständig oder beschädigt.';
  if (data.version > 1) return 'Diese Sicherung stammt aus einer neueren HealthPilot-Version. Bitte zuerst die App aktualisieren.';
  const bad = data.entries.find((e) => !e || !e.id || !e.type || !/^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
  if (bad) return 'Die Sicherung enthält fehlerhafte Einträge.';
  return null;
}

// Ersetzt alle Daten. Vorher wird automatisch ein Schnappschuss des aktuellen Stands angelegt.
export async function restoreAll(data) {
  const err = validateBackup(data);
  if (err) throw new Error(err);
  const snapshot = await exportAll();
  await tx(['kv', 'entries', 'plan'], 'readwrite', ([kv, en, pl]) => {
    kv.clear(); en.clear(); pl.clear();
    for (const [k, v] of Object.entries(data.kv)) kv.put(v, k);
    data.entries.forEach((e) => en.put(e));
    data.plan.forEach((p) => pl.put(p));
    kv.put(snapshot, 'preRestoreSnapshot');
  });
}

export async function wipeAll() {
  await tx(['kv', 'entries', 'plan'], 'readwrite', ([kv, en, pl]) => { kv.clear(); en.clear(); pl.clear(); });
}

export async function storageInfo() {
  const info = { persisted: null, usage: null, quota: null };
  try {
    if (navigator.storage?.persisted) info.persisted = await navigator.storage.persisted();
    if (navigator.storage?.estimate) { const e = await navigator.storage.estimate(); info.usage = e.usage; info.quota = e.quota; }
  } catch { /* nicht unterstützt */ }
  return info;
}
export async function requestPersist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
