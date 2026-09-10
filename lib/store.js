'use strict';
// ---------------------------------------------------------------------------
// OmniLocal memory core: durable persistence for the server's `state` object.
//
// The application keeps its working set in one in-memory `state` object that
// every handler mutates directly. This module makes that object durable:
//   * on boot, saved collections are loaded over the seeded defaults
//   * after any mutating request the store is marked dirty and flushed
//     (debounced) — only collections whose JSON changed are written
//   * sessions are persisted too, so a restart does not sign anyone out
//   * SIGTERM / SIGINT flush before exit
//
// Storage driver: SQLite through Node's built-in `node:sqlite` (Node >= 22.13),
// one row per top-level collection. Older runtimes fall back to an atomically
// written JSON file. Both live under OMNILOCAL_DATA_DIR.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const SESSIONS_KEY = '__sessions';
const META_KEY = '__meta';

function loadSqlite() {
  try {
    // eslint-disable-next-line global-require
    return require('node:sqlite');
  } catch {
    return null;
  }
}

class SqliteDriver {
  constructor(file) {
    const { DatabaseSync } = loadSqlite();
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);');
    this.upsert = this.db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
    this.remove = this.db.prepare('DELETE FROM kv WHERE key = ?');
  }
  readAll() {
    const out = {};
    for (const row of this.db.prepare('SELECT key, value FROM kv').all()) out[row.key] = row.value;
    return out;
  }
  writeMany(entries, deletions) {
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      for (const [key, value] of entries) this.upsert.run(key, value, now);
      for (const key of deletions) this.remove.run(key);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() { this.db.close(); }
  get name() { return 'sqlite'; }
}

class JsonFileDriver {
  constructor(file) {
    this.file = file;
    this.doc = {};
    if (fs.existsSync(file)) {
      try { this.doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.doc = {}; }
    }
  }
  readAll() { return { ...this.doc }; }
  writeMany(entries, deletions) {
    for (const [key, value] of entries) this.doc[key] = value;
    for (const key of deletions) delete this.doc[key];
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.doc));
    fs.renameSync(tmp, this.file);
  }
  close() {}
  get name() { return 'json-file'; }
}

class Store {
  constructor({ dataDir, flushDelayMs = 300, safetyIntervalMs = 30000, log = console } = {}) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.log = log;
    this.flushDelayMs = flushDelayMs;
    this.lastWritten = new Map(); // key -> json string as persisted
    this.dirty = false;
    this.timer = null;
    this.lastFlushAt = null;
    this.lastLoadAt = null;
    this.writes = 0;
    const sqlite = loadSqlite();
    if (sqlite && sqlite.DatabaseSync) {
      this.driver = new SqliteDriver(path.join(dataDir, 'omnilocal.sqlite'));
    } else {
      this.driver = new JsonFileDriver(path.join(dataDir, 'omnilocal-state.json'));
    }
    this.safety = setInterval(() => { if (this.state) this.flush(); }, safetyIntervalMs);
    if (this.safety.unref) this.safety.unref();
  }

  get file() { return this.driver.file; }
  get driverName() { return this.driver.name; }

  /** Overlay persisted collections onto the seeded state and restore sessions. */
  loadInto(state, sessions) {
    this.state = state;
    this.sessions = sessions;
    const saved = this.driver.readAll();
    let restoredKeys = 0;
    for (const [key, json] of Object.entries(saved)) {
      if (key === META_KEY) continue;
      if (key === SESSIONS_KEY) {
        try {
          for (const [token, sess] of JSON.parse(json)) if (sess && sess.expires > Date.now()) sessions.set(token, sess);
        } catch { /* ignore a corrupt sessions row */ }
        this.lastWritten.set(key, json);
        continue;
      }
      try {
        state[key] = JSON.parse(json);
        this.lastWritten.set(key, json);
        restoredKeys += 1;
      } catch (e) {
        this.log.warn(`[store] skipping corrupt row "${key}": ${e.message}`);
      }
    }
    this.lastLoadAt = new Date().toISOString();
    this.restoredKeys = restoredKeys;
    return restoredKeys;
  }

  markDirty() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.flush(); }, this.flushDelayMs);
    if (this.timer.unref) this.timer.unref();
  }

  /** Write every collection whose serialized form changed. Returns the number of rows written. */
  flush() {
    if (!this.state) return 0;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const entries = [];
    const seen = new Set();
    for (const [key, value] of Object.entries(this.state)) {
      if (value === undefined || typeof value === 'function') continue;
      seen.add(key);
      let json;
      try { json = JSON.stringify(value); } catch (e) { this.log.warn(`[store] cannot serialize "${key}": ${e.message}`); continue; }
      if (this.lastWritten.get(key) !== json) entries.push([key, json]);
    }
    const sessionsJson = JSON.stringify([...this.sessions.entries()].filter(([, s]) => s && s.expires > Date.now()));
    seen.add(SESSIONS_KEY);
    if (this.lastWritten.get(SESSIONS_KEY) !== sessionsJson) entries.push([SESSIONS_KEY, sessionsJson]);
    const deletions = [...this.lastWritten.keys()].filter((k) => !seen.has(k) && k !== META_KEY);
    this.dirty = false;
    if (entries.length === 0 && deletions.length === 0) return 0;
    entries.push([META_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, savedAt: new Date().toISOString(), driver: this.driverName })]);
    try {
      this.driver.writeMany(entries, deletions);
      for (const [key, json] of entries) this.lastWritten.set(key, json);
      for (const key of deletions) this.lastWritten.delete(key);
      this.lastFlushAt = new Date().toISOString();
      this.writes += 1;
      return entries.length - 1;
    } catch (e) {
      this.log.error(`[store] flush failed: ${e.message}`);
      this.dirty = true;
      return 0;
    }
  }

  /** Full JSON snapshot (for backups). */
  snapshot() {
    this.flush();
    const collections = {};
    for (const [key, value] of Object.entries(this.state)) if (typeof value !== 'function') collections[key] = value;
    return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), driver: this.driverName, collections };
  }

  /** Replace the live state with a snapshot's collections (keys not in the snapshot keep their current value). */
  restore(snapshot, { keepSessions = true } = {}) {
    if (!snapshot || typeof snapshot !== 'object' || !snapshot.collections || typeof snapshot.collections !== 'object') {
      throw new Error('Snapshot must be an object with a "collections" map.');
    }
    const applied = [];
    for (const [key, value] of Object.entries(snapshot.collections)) {
      if (key.startsWith('__')) continue;
      this.state[key] = JSON.parse(JSON.stringify(value));
      applied.push(key);
    }
    if (!keepSessions) this.sessions.clear();
    this.flush();
    return applied;
  }

  /** Drop every persisted collection and put the seed back. */
  reset(seed) {
    for (const key of Object.keys(this.state)) if (!(key in seed)) delete this.state[key];
    for (const [key, value] of Object.entries(seed)) this.state[key] = JSON.parse(JSON.stringify(value));
    this.flush();
  }

  status() {
    return {
      driver: this.driverName,
      file: this.file,
      dataDir: this.dataDir,
      restoredCollections: this.restoredKeys || 0,
      lastLoadAt: this.lastLoadAt,
      lastFlushAt: this.lastFlushAt,
      writes: this.writes,
      dirty: this.dirty,
      collections: this.state ? Object.keys(this.state).length : 0
    };
  }

  close() {
    clearInterval(this.safety);
    this.flush();
    this.driver.close();
  }
}

module.exports = { Store, SCHEMA_VERSION };
