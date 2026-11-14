/**
 * Tiny IndexedDB wrapper (no dependencies) for per-browser history and saved documents.
 * Everything stays on this device; nothing is sent to the server.
 * If IndexedDB is unavailable (private mode, blocked storage), reads resolve to empty results
 * and saveDocument rejects so the UI can say the save failed.
 */

export interface HistoryEntry {
  id: string;
  tool: string;
  createdAt: number;
  input: string;
  output: string;
  /** Short label, e.g. "Paraphrase · Formal" */
  label: string;
}

export interface SavedDocument {
  id: string;
  title: string;
  text: string;
  tool: string;
  updatedAt: number;
}

const DB_NAME = 'shivquill';
const DB_VERSION = 1;
const MAX_HISTORY = 200;
const MAX_STORED_CHARS = 100_000; // keep each entry small so the library stays fast

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openAt(version?: number): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const req = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('history')) {
          db.createObjectStore('history', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  const pending = openAt().then(async db => {
    if (!db) return null;
    const ok = db.objectStoreNames.contains('history') && db.objectStoreNames.contains('documents');
    if (ok) return db;
    // The database exists but is missing stores (e.g. created by an older/foreign version):
    // reopen one version higher so the upgrade handler creates them.
    const next = Math.max(DB_VERSION, db.version + 1);
    db.close();
    return openAt(next);
  }).then(db => {
    if (!db) {
      // Don't cache a failed open: try again on the next call
      if (dbPromise === pending) dbPromise = null;
      return null;
    }
    // Another tab is upgrading the database: step aside and reopen on next use
    const forget = () => {
      if (dbPromise === pending) dbPromise = null;
    };
    db.onversionchange = () => {
      db.close();
      forget();
    };
    db.onclose = forget;
    return db;
  });
  dbPromise = pending;
  return pending;
}

/** Runs one transaction; rejects if there is no database or the transaction fails/aborts. */
function exec<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(db => {
    if (!db) throw new Error('Storage is not available in this browser.');
    return new Promise<T | undefined>((resolve, reject) => {
      try {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
        tx.onerror = () => reject(tx.error || new Error('Storage error.'));
        tx.onabort = () => reject(tx.error || new Error('Storage transaction was aborted.'));
      } catch (err) {
        reject(err);
      }
    });
  });
}

/** Like exec, but failures resolve to undefined (reads/history are best-effort). */
function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return exec(store, mode, fn).catch(() => undefined);
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clip = (s: string) => (s.length > MAX_STORED_CHARS ? `${s.slice(0, MAX_STORED_CHARS)}\n…(truncated)` : s);

// ---------------- History ----------------

export async function addHistory(entry: Omit<HistoryEntry, 'id' | 'createdAt'>): Promise<void> {
  if (!entry.input.trim()) return;
  await run('history', 'readwrite', s => {
    s.put({ ...entry, input: clip(entry.input), output: clip(entry.output), id: uid(), createdAt: Date.now() });
    // Trim the oldest entries, only when over the cap
    if (!s.indexNames.contains('createdAt')) return;
    const count = s.count();
    count.onsuccess = () => {
      let extra = count.result - MAX_HISTORY;
      if (extra <= 0) return;
      const cursor = s.index('createdAt').openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c || extra-- <= 0) return;
        c.delete();
        c.continue();
      };
    };
  });
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const all = (await run<HistoryEntry[]>('history', 'readonly', s => s.getAll())) || [];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteHistory(id: string): Promise<void> {
  await run('history', 'readwrite', s => s.delete(id));
}

export async function clearHistory(): Promise<void> {
  await run('history', 'readwrite', s => s.clear());
}

// ---------------- Documents ----------------

/** Saves (or updates) a document. Rejects when it could not be stored. */
export async function saveDocument(doc: { id?: string; title: string; text: string; tool: string }): Promise<SavedDocument> {
  const saved: SavedDocument = {
    id: doc.id || uid(),
    title: doc.title.trim() || 'Untitled',
    text: doc.text,
    tool: doc.tool,
    updatedAt: Date.now()
  };
  await exec('documents', 'readwrite', s => s.put(saved));
  return saved;
}

export async function listDocuments(): Promise<SavedDocument[]> {
  const all = (await run<SavedDocument[]>('documents', 'readonly', s => s.getAll())) || [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteDocument(id: string): Promise<void> {
  await run('documents', 'readwrite', s => s.delete(id));
}
