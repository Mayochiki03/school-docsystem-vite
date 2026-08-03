// db/sqliteStore.js
//
// เลเยอร์เก็บข้อมูลแบบ SQLite (ไฟล์เดียว ปลอดภัย รองรับใช้งานระยะยาว)
// ใช้แทน db/store.js เดิม (JSON) โดย "หน้าตา" เมธอด (all/get/find/findOne/insert/update/remove)
// เหมือนกันทุกประการ ตามที่ store.js เดิมออกแบบไว้ให้สลับได้โดยไม่ต้องแก้โค้ดส่วน routes
//
// ทำไมใช้ SQLite แทน SQL Server:
//  - ไม่ต้องมี database server แยกให้ดูแล/อัปเดต — เป็นไฟล์เดียว (data/database.db)
//  - เป็น SQL จริง มี transaction/index/query จริง ปลอดภัยกว่าการเขียนทับไฟล์ JSON ทั้งไฟล์ทุกครั้ง
//  - ไฟล์เดียวสำรองข้อมูลง่าย (copy ไฟล์ไป NAS ได้ตรงๆ)
//  - เหมาะกับสเปกเครื่องที่จำกัดและจำนวนผู้ใช้งานระดับสำนักงานโรงเรียน (ไม่ถึงหลักพันคนพร้อมกัน)
//  - ย้ายไป Postgres/SQL Server ในอนาคตได้ไม่ยาก เพราะ schema เป็นมาตรฐาน (ดู db/schema.sql อ้างอิง)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'database.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const COLLECTIONS = [
  'users', 'departments', 'documentTypes', 'documents',
  'tasks', 'history', 'attachments', 'notifications', 'auditLog', 'counters',
  'guardChecklistItems', 'guardLogs', 'settings', 'announcements',
  'dutyTypes', 'dutyCoverage', 'dutyLogs', 'dutyHeads', 'vehicleLogs',
  'featureToggles', 'importLogs', 'pushSubscriptions'
];

for (const name of COLLECTIONS) {
  db.exec(`CREATE TABLE IF NOT EXISTS "${name}" (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    createdAtIdx TEXT
  )`);
}
// ดัชนีช่วยให้ query ตามเวลาสร้างเร็วขึ้น (เอกสาร/ประวัติ/แจ้งเตือน มักเรียงตามเวลา)
db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(createdAtIdx)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_history_created ON history(createdAtIdx)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(createdAtIdx)`);

let idSeq = Date.now() % 1000000;
function genId(prefix) {
  idSeq += 1;
  return prefix.slice(0, 3) + '_' + idSeq.toString(36) + Math.random().toString(36).slice(2, 6);
}

class SqliteCollection {
  constructor(name) {
    this.name = name;
    this._selectAll = db.prepare(`SELECT id, data FROM "${name}"`);
    this._selectOne = db.prepare(`SELECT id, data FROM "${name}" WHERE id = ?`);
    this._insert = db.prepare(`INSERT INTO "${name}" (id, data, createdAtIdx) VALUES (?, ?, ?)`);
    this._update = db.prepare(`UPDATE "${name}" SET data = ?, createdAtIdx = ? WHERE id = ?`);
    this._delete = db.prepare(`DELETE FROM "${name}" WHERE id = ?`);
  }
  _row(r) { return r ? JSON.parse(r.data) : null; }
  all() {
    return this._selectAll.all().map(r => this._row(r));
  }
  get(id) {
    if (!id) return null;
    return this._row(this._selectOne.get(id));
  }
  find(fn) {
    return this.all().filter(fn);
  }
  findOne(fn) {
    return this.all().find(fn) || null;
  }
  insert(record) {
    if (!record.id) record.id = genId(this.name);
    const createdAtIdx = record.createdAt || record.timestamp || record.submittedAt || '';
    this._insert.run(record.id, JSON.stringify(record), createdAtIdx);
    return record;
  }
  update(id, patch) {
    const existing = this.get(id);
    if (!existing) return null;
    const merged = Object.assign({}, existing, patch);
    const createdAtIdx = merged.createdAt || merged.timestamp || merged.submittedAt || '';
    this._update.run(JSON.stringify(merged), createdAtIdx, id);
    return merged;
  }
  remove(id) {
    const res = this._delete.run(id);
    return res.changes > 0;
  }
}

const store = { _raw: db };
for (const c of COLLECTIONS) store[c] = new SqliteCollection(c);

// ---------- Migration จาก JSON เดิม (data_seed/*.json) เข้า SQLite ครั้งแรกที่รัน ----------
function migrateFromJsonSeedIfEmpty() {
  const seedDir = path.join(__dirname, '..', 'data_seed');
  if (!fs.existsSync(seedDir)) return;
  const anyRow = db.prepare(`SELECT COUNT(*) as c FROM users`).get();
  if (anyRow.c > 0) return; // มีข้อมูลอยู่แล้ว ไม่ต้อง migrate ซ้ำ

  const tx = db.transaction(() => {
    for (const name of COLLECTIONS) {
      const file = path.join(seedDir, name + '.json');
      if (!fs.existsSync(file)) continue;
      let rows;
      try { rows = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { continue; }
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (!row.id) continue;
        store[name].insert(row);
      }
    }
  });
  tx();
  console.log('[db] นำเข้าข้อมูลชุดเดิมจาก data_seed/*.json เข้า SQLite เรียบร้อย (' +
    db.prepare('SELECT COUNT(*) as c FROM users').get().c + ' ผู้ใช้งาน)');
}

migrateFromJsonSeedIfEmpty();

module.exports = store;
