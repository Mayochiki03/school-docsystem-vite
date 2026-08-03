// routes-extra.js
// เพิ่มเติมจาก server.js เดิม — แยกไฟล์ต่างหากเพื่อลดความเสี่ยงในการแก้ไขโค้ดเดิมที่ทดสอบแล้ว
// เรียกใช้จาก server.js: require('./routes-extra')(api, helpers)

const path = require('path');
const fs = require('fs');
const { parse: csvParse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

module.exports = function registerExtraRoutes(api, helpers) {
  const { db, auth, perm, sendJson, readBody, logAudit, sanitizeUser, ROOT } = helpers;

  // ---------------------------------------------------------------
  // PWA Push Notifications (ต้องเสิร์ฟผ่าน HTTPS หรือ localhost เท่านั้น ตามข้อกำหนดของเบราว์เซอร์)
  // ---------------------------------------------------------------
  const push = require('./lib/push');
  api['GET /api/push/public-key'] = async (req, res, ctx, user) => {
    if (!user) return sendJson(res, 401, {});
    sendJson(res, 200, { publicKey: push.getPublicKey(), configured: push.isConfigured() });
  };
  api['POST /api/push/subscribe'] = async (req, res, ctx, user) => {
    if (!user) return sendJson(res, 401, {});
    const body = await readBody(req); // { subscription: PushSubscriptionJSON }
    if (!body.subscription || !body.subscription.endpoint) return sendJson(res, 400, { error: 'ข้อมูล subscription ไม่ถูกต้อง' });
    const existing = db.pushSubscriptions.findOne(s => s.endpoint === body.subscription.endpoint);
    if (existing) db.pushSubscriptions.update(existing.id, { userId: user.id, subscription: body.subscription });
    else db.pushSubscriptions.insert({ userId: user.id, endpoint: body.subscription.endpoint, subscription: body.subscription, createdAt: new Date().toISOString() });
    sendJson(res, 200, { ok: true });
  };
  api['POST /api/push/unsubscribe'] = async (req, res, ctx, user) => {
    if (!user) return sendJson(res, 401, {});
    const body = await readBody(req);
    const existing = db.pushSubscriptions.findOne(s => s.endpoint === body.endpoint && s.userId === user.id);
    if (existing) db.pushSubscriptions.remove(existing.id);
    sendJson(res, 200, { ok: true });
  };
  // ทดสอบส่ง push แจ้งเตือนหาตัวเองทันที — ไว้เช็คว่าทั้งระบบ (VAPID + service worker + subscription) ทำงานจริง
  // โดยไม่ต้องรอให้มีเอกสาร/ประกาศจริงเข้ามาก่อน
  api['POST /api/push/test'] = async (req, res, ctx, user) => {
    if (!user) return sendJson(res, 401, {});
    if (!push.isConfigured()) return sendJson(res, 400, { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า VAPID key (ดูวิธีตั้งค่าใน server/README.md)' });
    const subs = db.pushSubscriptions.find(s => s.userId === user.id);
    if (subs.length === 0) return sendJson(res, 400, { error: 'ยังไม่ได้กดเปิดการแจ้งเตือนบนอุปกรณ์นี้ (กดปุ่ม "เปิดการแจ้งเตือน" ก่อน)' });
    await push.sendPushToUser(db, user.id, { title: 'ทดสอบการแจ้งเตือน', body: `ถ้าเห็นข้อความนี้เด้งขึ้นมา แปลว่า Push Notification ทำงานถูกต้องแล้ว (${new Date().toLocaleTimeString('th-TH', { hour12: false })})` });
    sendJson(res, 200, { ok: true, deviceCount: subs.length });
  };

  // ---------------------------------------------------------------
  // NAS: สถานะการเชื่อมต่อ + พื้นที่คงเหลือ (แสดงในหน้าแอดมิน)
  // ---------------------------------------------------------------
  api['GET /api/admin/nas-status'] = async (req, res, ctx, user) => {
    if (!user || !perm.hasCapability(user, 'manage_backups_nas')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
    const nasPath = process.env.NAS_BACKUP_PATH || '';
    const result = { configured: !!nasPath, path: nasPath, reachable: false, freeBytes: null, totalBytes: null, error: null };
    if (nasPath) {
      try {
        result.reachable = fs.existsSync(nasPath);
        if (result.reachable && fs.statfsSync) {
          const st = fs.statfsSync(nasPath);
          result.totalBytes = st.blocks * st.bsize;
          result.freeBytes = st.bfree * st.bsize;
        }
      } catch (e) {
        result.error = e.message;
      }
    }
    sendJson(res, 200, result);
  };

  // ---------------------------------------------------------------
  // NAS: รายการสำรองข้อมูลย้อนหลัง จัดกลุ่มเป็นรายเดือน (ย้อนหลังได้ 1 ปีแบบละเอียด, เก่ากว่านั้น sort เป็นก้อนปี)
  // ---------------------------------------------------------------
  api['GET /api/admin/nas-backups/monthly'] = async (req, res, ctx, user) => {
    if (!user || !perm.hasCapability(user, 'manage_backups_nas')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
    const nasPath = process.env.NAS_BACKUP_PATH || '';
    if (!nasPath || !fs.existsSync(nasPath)) return sendJson(res, 200, { configured: !!nasPath, months: [] });

    const entries = fs.readdirSync(nasPath).filter(n => n.startsWith('backup-'));
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const groups = {}; // 'YYYY-MM' -> { count, items: [] } หรือ 'YYYY' -> ก้อนปีถ้าเก่ากว่า 1 ปี
    for (const name of entries) {
      const m = name.match(/^backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/);
      if (!m) continue;
      const [, y, mo, d, h, mi, s] = m;
      const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).getTime();
      const key = t >= oneYearAgo ? `${y}-${mo}` : `${y} (เก่ากว่า 1 ปี)`;
      if (!groups[key]) groups[key] = { key, count: 0, items: [] };
      groups[key].count++;
      groups[key].items.push({ name, time: new Date(t).toISOString() });
    }
    const months = Object.values(groups).sort((a, b) => b.key.localeCompare(a.key));
    months.forEach(g => g.items.sort((a, b) => new Date(b.time) - new Date(a.time)));
    sendJson(res, 200, { configured: true, months });
  };

  // ---------------------------------------------------------------
  // NAS: ลบชุดสำรองเก่า — อนุญาตเฉพาะชุดที่มีอายุเกิน 1 ปีขึ้นไปเท่านั้น (ป้องกันลบผิดพลาด)
  // เพื่อคืนพื้นที่ว่างบน NAS เมื่อใกล้เต็ม
  // ---------------------------------------------------------------
  api['DELETE /api/admin/nas-backups/:name'] = async (req, res, ctx, user) => {
    if (!user || !perm.hasCapability(user, 'manage_backups_nas')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
    const nasPath = process.env.NAS_BACKUP_PATH || '';
    if (!nasPath) return sendJson(res, 400, { error: 'ยังไม่ได้ตั้งค่า NAS_BACKUP_PATH' });
    const name = ctx.params.name;
    const m = name.match(/^backup-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/);
    if (!m) return sendJson(res, 400, { error: 'ชื่อชุดสำรองไม่ถูกต้อง' });
    const [, y, mo, d, h, mi, s] = m;
    const t = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).getTime();
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    if (t >= oneYearAgo) return sendJson(res, 400, { error: 'ลบได้เฉพาะชุดสำรองที่มีอายุมากกว่า 1 ปีขึ้นไปเท่านั้น เพื่อป้องกันการลบข้อมูลที่ยังจำเป็นต้องใช้' });
    const target = path.join(nasPath, name);
    if (!fs.existsSync(target)) return sendJson(res, 404, { error: 'ไม่พบชุดสำรองนี้บน NAS' });
    if (!target.startsWith(nasPath)) return sendJson(res, 403, { error: 'พาธไม่ถูกต้อง' });
    fs.rmSync(target, { recursive: true, force: true });
    logAudit(null, user.id, 'delete_old_nas_backup', name);
    sendJson(res, 200, { ok: true });
  };

  // ---------------------------------------------------------------
  // Feature toggles: เปิด/ปิดเมนูฟังก์ชันของระบบจากหน้าแอดมิน
  // ---------------------------------------------------------------
  api['GET /api/admin/feature-toggles'] = async (req, res, ctx, user) => {
    if (!user) return sendJson(res, 401, {});
    const s = db.settings.get('main');
    sendJson(res, 200, (s && s.featureToggles) || {});
  };
  api['PUT /api/admin/feature-toggles'] = async (req, res, ctx, user) => {
    if (!user || !perm.hasCapability(user, 'manage_feature_toggles')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
    const body = await readBody(req);
    let s = db.settings.get('main');
    if (!s) s = db.settings.insert({ id: 'main', schoolName: '', guardChecklistEnabled: false, featureToggles: {} });
    s = db.settings.update('main', { featureToggles: body.featureToggles || {} });
    logAudit(null, user.id, 'update_feature_toggles', JSON.stringify(body.featureToggles || {}));
    sendJson(res, 200, s.featureToggles);
  };

  // ---------------------------------------------------------------
  // นำเข้าผู้ใช้งานจาก Excel / CSV / TXT (คั่นด้วย , หรือ tab)
  // รูปแบบคอลัมน์ที่รองรับ: username, password, fullName, position, role, department
  // ---------------------------------------------------------------
  function parseRowsFromBuffer(filename, base64) {
    const buf = Buffer.from(base64.replace(/^data:.*;base64,/, ''), 'base64');
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.csv' || ext === '.txt') {
      const text = buf.toString('utf8');
      const delimiter = text.includes('\t') && !text.includes(',') ? '\t' : ',';
      const records = csvParse(text, { columns: true, skip_empty_lines: true, trim: true, delimiter, bom: true });
      return { rows: records, sheetPromise: null };
    }
    return { rows: null, bufferForXlsx: buf };
  }

  async function parseXlsxRows(buf) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    const headerRow = ws.getRow(1).values.slice(1).map(v => String(v || '').trim());
    const rows = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values = row.values.slice(1);
      const obj = {};
      headerRow.forEach((h, i) => { obj[h] = values[i] !== undefined ? String(values[i]).trim() : ''; });
      rows.push(obj);
    });
    return rows;
  }

  const COLUMN_ALIASES = {
    username: ['username', 'ชื่อผู้ใช้', 'user'],
    password: ['password', 'รหัสผ่าน'],
    fullName: ['fullname', 'full_name', 'ชื่อ-สกุล', 'ชื่อสกุล', 'ชื่อนามสกุล', 'name'],
    position: ['position', 'ตำแหน่ง'],
    role: ['role', 'บทบาท', 'สิทธิ์'],
    department: ['department', 'แผนก', 'dept']
  };
  function normalizeRow(row) {
    const out = {};
    const lowerKeys = {};
    Object.keys(row).forEach(k => { lowerKeys[k.trim().toLowerCase()] = row[k]; });
    for (const field of Object.keys(COLUMN_ALIASES)) {
      for (const alias of COLUMN_ALIASES[field]) {
        if (lowerKeys[alias] !== undefined && lowerKeys[alias] !== '') { out[field] = String(lowerKeys[alias]).trim(); break; }
      }
    }
    return out;
  }

  // preview=true -> ตรวจสอบและคืนตัวอย่างผลลัพธ์โดยยังไม่บันทึกจริง
  api['POST /api/admin/users/import'] = async (req, res, ctx, user) => {
    if (!user || !perm.hasCapability(user, 'manage_users_basic')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
    const body = await readBody(req); // { fileName, base64, preview }
    if (!body.fileName || !body.base64) return sendJson(res, 400, { error: 'ไม่พบไฟล์' });

    let rawRows;
    try {
      const parsed = parseRowsFromBuffer(body.fileName, body.base64);
      rawRows = parsed.rows || await parseXlsxRows(parsed.bufferForXlsx);
    } catch (e) {
      return sendJson(res, 400, { error: 'อ่านไฟล์ไม่สำเร็จ: ' + e.message + ' (รองรับ .xlsx, .csv, .txt เท่านั้น)' });
    }

    const departments = db.departments.all();
    const deptByName = {}; departments.forEach(d => deptByName[d.name.trim()] = d.id);
    const existingUsernames = new Set(db.users.all().map(u => u.username));

    const results = { created: [], skipped: [] };
    for (const raw of rawRows) {
      const row = normalizeRow(raw);
      if (!row.username || !row.fullName) { results.skipped.push({ row: raw, reason: 'ไม่มี username หรือ fullName' }); continue; }
      if (existingUsernames.has(row.username)) { results.skipped.push({ row: raw, reason: 'มีชื่อผู้ใช้นี้อยู่แล้ว' }); continue; }
      const role = ['admin', 'director', 'office_head', 'staff', 'guard'].includes(row.role) ? row.role : 'staff';
      if (['admin', 'director'].includes(role) && !['admin', 'director'].includes(user.role)) {
        results.skipped.push({ row: raw, reason: 'เฉพาะผู้อำนวยการ/แอดมินกำหนดบทบาทนี้ได้' }); continue;
      }
      const departmentIds = row.department && deptByName[row.department.trim()] ? [deptByName[row.department.trim()]] : [];
      const password = row.password || (Math.random().toString(36).slice(2, 10));
      if (!body.preview) {
        const newUser = db.users.insert({
          username: row.username, passwordHash: auth.hashPassword(password),
          fullName: row.fullName, position: row.position || '', role, active: true, departmentIds
        });
        existingUsernames.add(row.username);
        results.created.push({ username: newUser.username, fullName: newUser.fullName, tempPassword: row.password ? undefined : password });
      } else {
        results.created.push({ username: row.username, fullName: row.fullName, role, department: row.department || '-', willGeneratePassword: !row.password });
      }
    }
    if (!body.preview) {
      db.importLogs.insert({
        fileName: body.fileName, importedBy: user.id, createdAt: new Date().toISOString(),
        createdCount: results.created.length, skippedCount: results.skipped.length
      });
      logAudit(null, user.id, 'import_users', `${body.fileName}: สร้าง ${results.created.length} คน, ข้าม ${results.skipped.length} แถว`);
    }
    sendJson(res, 200, { preview: !!body.preview, ...results });
  };

  // ---------------------------------------------------------------
  // ทดสอบส่งอีเมลรายงานสำรองข้อมูล (แอดมินกดทดสอบการตั้งค่า SMTP)
  // ---------------------------------------------------------------
  api['POST /api/admin/backups/test-email'] = async (req, res, ctx, user) => {
    if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
    const mailer = require('./lib/mailer');
    if (!mailer.isConfigured()) return sendJson(res, 400, { error: 'ยังไม่ได้ตั้งค่า SMTP_HOST/SMTP_USER/SMTP_PASS ในไฟล์ .env' });
    const result = await mailer.sendBackupReport({
      subject: 'ทดสอบระบบอีเมลรายงานสำรองข้อมูล',
      html: `<p>นี่คืออีเมลทดสอบจากระบบแจ้งหนังสือราชการออนไลน์ ส่งเมื่อ ${new Date().toLocaleString('th-TH')}</p>`
    });
    sendJson(res, result.ok ? 200 : 500, result);
  };

  // ---------------------------------------------------------------
  // สถานะระบบ + Log ภาพรวมแบบเรียลไทม์ (สำหรับแอดมินเช็คว่าระบบยังทำงานปกติ ไม่ต้องไปเปิด cmd ที่เครื่อง server)
  // ---------------------------------------------------------------
  const os = require('os');
  const SERVER_STARTED_AT = new Date().toISOString();

  api['GET /api/admin/system-status'] = async (req, res, ctx, user) => {
    if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
    const mem = process.memoryUsage();
    let diskInfo = null;
    try {
      const backupRoot = path.join(ROOT, 'backups');
      if (fs.existsSync(backupRoot)) {
        // ประมาณขนาดโฟลเดอร์ backups คร่าวๆ (ไม่ลึกมาก ป้องกันช้าถ้ามีไฟล์เยอะ)
        const entries = fs.readdirSync(backupRoot);
        diskInfo = { backupSetCount: entries.filter(e => e.startsWith('backup-')).length };
      }
    } catch (e) { /* เพิกเฉยได้ ไม่ใช่ข้อมูลสำคัญ */ }
    sendJson(res, 200, {
      serverStartedAt: SERVER_STARTED_AT,
      uptimeSeconds: process.uptime(),
      nodeVersion: process.version,
      platform: `${os.platform()} ${os.release()}`,
      processMemoryMB: Math.round(mem.rss / 1024 / 1024),
      systemMemory: { totalMB: Math.round(os.totalmem() / 1024 / 1024), freeMB: Math.round(os.freemem() / 1024 / 1024) },
      loadAverage: os.loadavg(), // [1min, 5min, 15min] เฉพาะ Linux/Mac มีค่าจริง บน Windows จะได้ [0,0,0] เสมอ (ข้อจำกัดของ Node เอง ไม่ใช่บั๊ก)
      cpuCount: os.cpus().length,
      diskInfo,
      docCount: db.documents.all().length,
      userCount: db.users.all().length
    });
  };

  api['GET /api/admin/system-log'] = async (req, res, ctx, user) => {
    if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
    const limit = Math.min(parseInt(ctx.query.limit || '100', 10), 300);
    const usersById = {}; db.users.all().forEach(u => usersById[u.id] = u.fullName);
    const docsById = {}; db.documents.all().forEach(d => docsById[d.id] = d.subject);
    const entries = db.auditLog.all()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit)
      .map(e => ({
        ...e,
        actorName: e.userId ? (usersById[e.userId] || 'ไม่ทราบผู้ใช้') : 'ระบบ',
        documentSubject: e.documentId ? (docsById[e.documentId] || null) : null
      }));
    sendJson(res, 200, entries);
  };
};
