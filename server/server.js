// server.js
// รันด้วย: node server.js
// ไม่ใช้ external dependency ใดๆ (เพื่อให้ npm install ไม่จำเป็นตอน dev)
// พอร์ต default 3000 เปลี่ยนได้ด้วย env PORT

require('dotenv').config();
const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const db = require('./db/sqliteStore');
const auth = require('./lib/auth');
const perm = require('./lib/permissions');
const { runBackup, scheduleDailyBackup } = require('./scripts/backup');
require('./db/seed')(); // seed ถ้ายังไม่มีข้อมูล

// สำรองข้อมูลทันทีตอนเริ่มเซิร์ฟเวอร์ 1 ครั้ง แล้วตั้งเวลาให้รันอัตโนมัติทุกวัน (ค่าเริ่มต้น 02:00 น. ปรับได้ด้วย env BACKUP_HOUR)
try { runBackup(); } catch (e) { console.error('สำรองข้อมูลเริ่มต้นล้มเหลว:', e.message); }
scheduleDailyBackup();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const STATIC_FORMS_DIR = path.join(__dirname, 'static-forms');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.ico': 'image/x-icon'
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 30 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return resolve({});
      try { resolve(JSON.parse(buf.toString('utf8'))); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.session;
  if (!token) return null;
  const s = auth.getSession(token);
  if (!s) return null;
  const user = db.users.get(s.userId);
  if (!user || !user.active) return null;
  return user;
}

const push = require('./lib/push');
function notify(userId, documentId, message) {
  db.notifications.insert({ userId, documentId, message, isRead: false, createdAt: new Date().toISOString() });
  // เฟส 9: ส่ง push notification ไปยังอุปกรณ์ (PWA) ของผู้ใช้ ถ้าตั้งค่า VAPID ไว้แล้ว — ล้มเหลวเงียบๆ ถ้ายังไม่ได้ตั้งค่า ไม่กระทบระบบหลัก
  push.sendPushToUser(db, userId, { title: 'SNKDocSystem', body: message, documentId }).catch(() => {});
}

function logAudit(documentId, userId, action, detail) {
  db.auditLog.insert({ documentId, userId, action, detail: detail || '', timestamp: new Date().toISOString() });
}

function sanitizeUser(u) {
  if (!u) return u;
  const { passwordHash, ...rest } = u;
  return rest;
}

// ---------- Static file serving ----------
if (!fs.existsSync(STATIC_FORMS_DIR)) fs.mkdirSync(STATIC_FORMS_DIR, { recursive: true });

function serveStatic(req, res, pathname) {
  let baseDir = PUBLIC_DIR;
  let relative = pathname;
  if (pathname.startsWith('/uploads/')) {
    baseDir = UPLOAD_DIR;
    relative = pathname.slice('/uploads'.length);
  } else if (pathname.startsWith('/static-forms/')) {
    // ฟอร์ม PDF คงที่ (เช่นฟอร์มราชการซับซ้อนที่ยังไม่รองรับกรอกดิจิทัล) — ดู server/static-forms/README.md
    baseDir = STATIC_FORMS_DIR;
    relative = pathname.slice('/static-forms'.length);
  } else if (pathname === '/') {
    relative = '/index.html';
  }
  let filePath = path.join(baseDir, relative);
  if (!filePath.startsWith(baseDir)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // SPA fallback -> index.html สำหรับ path ที่ไม่มีนามสกุลไฟล์
      if (path.extname(pathname) === '') {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, data2) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache', 'Expires': '0' });
          res.end(data2);
        });
      }
      res.writeHead(404); return res.end('Not found');
    }

    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';
    const isUpload = baseDir === UPLOAD_DIR;
    const baseHeaders = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes' };
    if (['.js', '.css', '.html'].includes(ext) || pathname === '/') {
      baseHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      baseHeaders['Pragma'] = 'no-cache';
      baseHeaders['Expires'] = '0';
    } else if (isUpload) {
      // ไฟล์แนบ (PDF/รูป) ไม่เปลี่ยนชื่อซ้ำ (มี timestamp ในชื่อไฟล์อยู่แล้ว) แคชได้นานปลอดภัย
      // และที่สำคัญ: รองรับ Range request (206) — จำเป็นมากสำหรับตัวแสดง PDF ในตัวของ iOS Safari/iPad
      // ที่จะขอไฟล์เป็นช่วงๆ เพื่อเรนเดอร์หน้าแรกได้ทันทีโดยไม่ต้องรอโหลดทั้งไฟล์ก่อน
      // (สาเหตุหลักที่พรีวิว PDF ช้ามากบนมือถือ/ไอแพดเมื่อก่อน เพราะเซิร์ฟเวอร์ไม่รองรับ Range เลย)
      baseHeaders['Cache-Control'] = 'public, max-age=31536000, immutable';
    }

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] ? parseInt(m[1], 10) : 0;
        let end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
        if (isNaN(start) || isNaN(end) || start > end || end >= stat.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        res.writeHead(206, {
          ...baseHeaders,
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
          'Content-Length': end - start + 1
        });
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }
    }

    res.writeHead(200, { ...baseHeaders, 'Content-Length': stat.size });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ---------- API handlers ----------
const api = {};

api['POST /api/login'] = async (req, res) => {
  const body = await readBody(req);
  const user = db.users.findOne(u => u.username === body.username);
  if (!user || !user.active || !auth.verifyPassword(body.password || '', user.passwordHash)) {
    return sendJson(res, 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }
  const token = auth.createSession(user.id);
  res.setHeader('Set-Cookie', `session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 12}`);
  sendJson(res, 200, { user: sanitizeUser(user) });
};

api['POST /api/logout'] = async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.session) auth.destroySession(cookies.session);
  res.setHeader('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  sendJson(res, 200, { ok: true });
};

api['GET /api/me'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, { error: 'unauthorized' });
  const depts = (user.departmentIds || []).map(id => db.departments.get(id)).filter(Boolean);
  sendJson(res, 200, { user: sanitizeUser(user), departments: depts });
};

// ---- ฟอร์ม PDF คงที่: เดิมต้องเข้าไปวางไฟล์เองผ่าน Windows Explorer/NAS แล้วพิมพ์ชื่อไฟล์ให้ตรงเป๊ะในหน้าเว็บ
// (พิมพ์ผิด/พิมพ์ตกแม้แค่ตัวเดียวก็เจอ 404 ตอนพนักงานเปิดฟอร์ม) ตอนนี้เพิ่ม 2 endpoint ให้ทำทุกอย่างผ่านหน้าเว็บได้เลย:
// 1) list ไฟล์ที่มีอยู่แล้ว ให้เลือกจาก dropdown แทนพิมพ์เอง (กันพิมพ์ผิด)
// 2) upload ไฟล์ใหม่ตรงจากเบราว์เซอร์ ไม่ต้องเปิด File Explorer ไปวางที่เครื่อง server เอง
api['GET /api/static-forms'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  let files = [];
  try {
    files = fs.readdirSync(STATIC_FORMS_DIR)
      .filter(f => /\.pdf$/i.test(f) && f !== 'README.md')
      .map(f => {
        const stat = fs.statSync(path.join(STATIC_FORMS_DIR, f));
        return { fileName: f, sizeKb: Math.round(stat.size / 1024), uploadedAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  } catch (e) { /* โฟลเดอร์ว่าง/ยังไม่มีไฟล์ ก็คืน [] ปกติ */ }
  sendJson(res, 200, files);
};
api['POST /api/static-forms'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_document_types')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req); // { fileName, base64 }
  if (!body.fileName || !body.base64) return sendJson(res, 400, { error: 'ข้อมูลไฟล์ไม่ครบ' });
  if (!/\.pdf$/i.test(body.fileName)) return sendJson(res, 400, { error: 'รองรับเฉพาะไฟล์ .pdf เท่านั้น' });
  // บังคับกติกาเดียวกับที่ README.md เขียนไว้ (อังกฤษ/ตัวเลข/ขีดกลางเท่านั้น ห้ามช่องว่าง/ภาษาไทย)
  // กันตั้งแต่ต้นทาง ไม่ต้องพึ่งให้ผู้ใช้พิมพ์ตามคู่มือเองแล้วอาจพลาด
  const baseName = body.fileName.replace(/\.pdf$/i, '');
  if (!/^[a-zA-Z0-9-]+$/.test(baseName)) {
    return sendJson(res, 400, { error: 'ชื่อไฟล์ต้องเป็นอักษรอังกฤษ/ตัวเลข/ขีดกลางเท่านั้น ห้ามมีช่องว่างหรือภาษาไทย เช่น edu-welfare-child-kt16.pdf' });
  }
  const safeName = baseName + '.pdf';
  const filePath = path.join(STATIC_FORMS_DIR, safeName);
  if (fs.existsSync(filePath) && !body.overwrite) {
    return sendJson(res, 409, { error: `มีไฟล์ชื่อ "${safeName}" อยู่แล้ว ถ้าต้องการแทนที่ไฟล์เดิม กรุณายืนยันการเขียนทับ` });
  }
  const base64Data = body.base64.replace(/^data:.*;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  logAudit(null, user.id, 'upload_static_form', safeName);
  sendJson(res, 201, { fileName: safeName });
};
api['DELETE /api/static-forms/:fileName'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_document_types')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const fileName = ctx.params.fileName;
  if (!/^[a-zA-Z0-9-]+\.pdf$/i.test(fileName)) return sendJson(res, 400, { error: 'ชื่อไฟล์ไม่ถูกต้อง' });
  // กันลบไฟล์ที่ยังมีประเภทเอกสารอ้างอิงอยู่ ไม่งั้นประเภทเอกสารเดิมจะเปิดฟอร์มไม่ได้ทันที
  const inUse = db.documentTypes.find(t => t.staticPdfFileName === fileName);
  if (inUse.length) return sendJson(res, 400, { error: `ลบไม่ได้ — ยังมีประเภทเอกสาร "${inUse.map(t => t.name).join(', ')}" ใช้ไฟล์นี้อยู่` });
  const filePath = path.join(STATIC_FORMS_DIR, fileName);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  logAudit(null, user.id, 'delete_static_form', fileName);
  sendJson(res, 200, { ok: true });
};

// ---- Departments (admin CRUD) ----
api['GET /api/departments'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  sendJson(res, 200, db.departments.all());
};
api['POST /api/departments'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_users_basic')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  if (!body.name) return sendJson(res, 400, { error: 'ต้องระบุชื่อแผนก' });
  const dep = db.departments.insert({ name: body.name, headUserId: body.headUserId || null });
  sendJson(res, 201, dep);
};
api['PUT /api/departments/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_users_basic')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  const dep = db.departments.update(ctx.params.id, body);
  if (!dep) return sendJson(res, 404, { error: 'ไม่พบแผนก' });
  sendJson(res, 200, dep);
};
api['DELETE /api/departments/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_users_basic')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const memberCount = db.users.find(u => (u.departmentIds || []).includes(ctx.params.id)).length;
  if (memberCount > 0) return sendJson(res, 400, { error: `ยังมีบุคลากร ${memberCount} คนอยู่ในแผนกนี้ กรุณาย้ายออกก่อนลบ` });
  db.departments.remove(ctx.params.id);
  sendJson(res, 200, { ok: true });
};

// ---- Users (admin CRUD) ----
api['GET /api/users'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  sendJson(res, 200, db.users.all().map(sanitizeUser));
};
api['POST /api/users'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const body = await readBody(req);
  if (!body.username || !body.password || !body.fullName) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบ' });
  if (db.users.findOne(u => u.username === body.username)) return sendJson(res, 400, { error: 'มีชื่อผู้ใช้นี้แล้ว' });

  const canManageAll = perm.hasCapability(user, 'manage_users_basic');
  // หัวหน้าแผนก (ที่ไม่มีสิทธิ์ manage_users_basic เต็ม) เพิ่มคนของตัวเองเข้าแผนกตัวเองได้ เพื่อลดภาระงาน แต่ทำได้แค่นี้
  const myHeadedDeptIds = db.departments.find(d => d.headUserId === user.id).map(d => d.id);
  const isSelfServiceDeptHead = !canManageAll && myHeadedDeptIds.length > 0;
  if (!canManageAll && !isSelfServiceDeptHead) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });

  let role = body.role || 'staff';
  let departmentIds = body.departmentIds || [];
  if (isSelfServiceDeptHead) {
    role = 'staff'; // หัวหน้าแผนกเพิ่มได้เฉพาะบุคลากรทั่วไปในแผนกตัวเองเท่านั้น
    departmentIds = myHeadedDeptIds;
  }
  if (['admin', 'director'].includes(role) && !['admin', 'director'].includes(user.role)) {
    return sendJson(res, 403, { error: 'เฉพาะผู้อำนวยการ/แอดมิน เท่านั้นที่กำหนดบทบาทนี้ได้' });
  }
  const newUser = db.users.insert({
    username: body.username, passwordHash: auth.hashPassword(body.password),
    fullName: body.fullName, position: body.position || '', role,
    active: true, departmentIds
  });
  logAudit(null, user.id, 'create_user', `${newUser.username} (${newUser.role})`);
  sendJson(res, 201, sanitizeUser(newUser));
};
api['PUT /api/users/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_users_basic')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์แก้ไขผู้ใช้งาน' });
  const body = await readBody(req);
  const patch = Object.assign({}, body);
  delete patch.passwordHash;
  delete patch.extraPermissions; // แก้สิทธิ์เพิ่มเติมต้องผ่าน endpoint /permissions โดยเฉพาะ (ต้องมี manage_permissions)
  // การเปลี่ยนบทบาทเป็นระดับสูง (admin/director) สงวนไว้เฉพาะ admin/director เท่านั้น ป้องกันการยกระดับสิทธิ์ตัวเอง
  if (patch.role && ['admin', 'director'].includes(patch.role) && !['admin', 'director'].includes(user.role)) {
    return sendJson(res, 403, { error: 'เฉพาะผู้อำนวยการ/แอดมิน เท่านั้นที่กำหนดบทบาทนี้ได้' });
  }
  if (patch.password) { patch.passwordHash = auth.hashPassword(patch.password); delete patch.password; }
  const updated = db.users.update(ctx.params.id, patch);
  if (!updated) return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
  sendJson(res, 200, sanitizeUser(updated));
};
api['PUT /api/users/:id/permissions'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_permissions')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์มอบสิทธิ์ให้ผู้อื่น' });
  const body = await readBody(req);
  const validKeys = perm.ALL_CAPABILITIES.map(c => c.key);
  const extraPermissions = (Array.isArray(body.extraPermissions) ? body.extraPermissions : []).filter(k => validKeys.includes(k));
  const updated = db.users.update(ctx.params.id, { extraPermissions });
  if (!updated) return sendJson(res, 404, { error: 'ไม่พบผู้ใช้' });
  logAudit(null, user.id, 'grant_permissions', `${updated.fullName}: ${extraPermissions.join(', ') || '(ไม่มี)'}`);
  sendJson(res, 200, sanitizeUser(updated));
};
api['GET /api/permissions/list'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  sendJson(res, 200, perm.ALL_CAPABILITIES);
};
api['DELETE /api/users/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_users_basic')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const target = db.users.get(ctx.params.id);
  if (target && target.role === 'admin' && user.role !== 'admin') {
    return sendJson(res, 403, { error: 'เฉพาะแอดมินเท่านั้นที่ลบบัญชีแอดมินได้' });
  }
  db.users.remove(ctx.params.id);
  sendJson(res, 200, { ok: true });
};

// ---- Document Types (admin CRUD, ยืดหยุ่นเพิ่มประเภทใหม่ได้) ----
api['GET /api/documentTypes'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  sendJson(res, 200, db.documentTypes.all());
};
api['POST /api/documentTypes'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_document_types')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  if (!body.name || !body.formSchema) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบ' });
  const t = db.documentTypes.insert({
    name: body.name, category: body.category || 'other',
    recipientMode: body.recipientMode || 'single', requiresScan: !!body.requiresScan,
    formSchema: body.formSchema, active: true,
    headerTitle: body.headerTitle || 'บันทึกข้อความ',
    workflowMode: body.workflowMode || 'standard', fixedDeptId: body.fixedDeptId || null
  });
  sendJson(res, 201, t);
};
api['PUT /api/documentTypes/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_document_types')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  const t = db.documentTypes.update(ctx.params.id, body);
  if (!t) return sendJson(res, 404, { error: 'ไม่พบประเภทเอกสาร' });
  sendJson(res, 200, t);
};
api['DELETE /api/documentTypes/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_document_types')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  db.documentTypes.update(ctx.params.id, { active: false });
  sendJson(res, 200, { ok: true });
};

// ---- Documents ----
api['GET /api/documents'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const box = ctx.query.box || 'all';
  let docs = db.documents.all();

  if (box === 'created') {
    docs = docs.filter(d => d.createdBy === user.id);
  } else if (box === 'trash') {
    // ถังขยะเอกสารไม่อนุมัติ: admin/หัวหน้าสำนักงาน เห็นทั้งหมด, ผอ. เห็นเฉพาะของตัวเอง, ผู้ได้รับมอบสิทธิ์ตรวจกรองเห็นทั้งหมด, คนอื่นไม่เห็น
    // หมายเหตุ: เช็ค role === 'director' ก่อนเสมอ เพราะ hasCapability(director, ...) จะ true ทุกอย่างจาก wildcard '*'
    if (user.role === 'director') {
      docs = docs.filter(d => d.status === 'rejected' && d.createdBy === user.id);
    } else if (user.role === 'admin' || user.role === 'office_head' || perm.hasCapability(user, 'review_documents')) {
      docs = docs.filter(d => d.status === 'rejected');
    } else {
      docs = [];
    }
  } else if (box === 'pending_office_review') {
    if (!perm.hasCapability(user, 'review_documents')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
    docs = docs.filter(d => d.status === 'pending_office_review');
  } else if (box === 'inbox') {
    // เรื่องที่รอ user คนนี้ดำเนินการ (มี task pending/acknowledged ของตัวเอง หรือของแผนกที่ตัวเองเป็น "หัวหน้า")
    // หมายเหตุ: จงใจไม่เช็ค user.departmentIds (แค่เป็นสมาชิกแผนก) เพราะ 1 คนอยู่ได้หลายแผนก งานที่ส่งถึง "แผนก"
    // ต้องเห็นเฉพาะหัวหน้าแผนกนั้นก่อน ตรงตามที่ตกลงกันไว้ (isDeptHeadOf) ไม่งั้นคนที่สังกัดหลายแผนกจะเห็นงาน
    // ของแผนกอื่นที่ตัวเองไม่ใช่หัวหน้าด้วย ทั้งที่หัวหน้าแผนกตัวจริงยังไม่ได้ส่งต่อ/มอบหมายให้เลย
    const myDocIds = new Set(
      db.tasks.find(t =>
        t.status !== 'done' &&
        (t.assignedToUserId === user.id || (t.assignedToDeptId && perm.isDeptHeadOf(user, t.assignedToDeptId)))
      ).map(t => t.documentId)
    );
    if (user.role === 'director') {
      docs.filter(d => d.status === 'pending_director').forEach(d => myDocIds.add(d.id));
    }
    docs = docs.filter(d => myDocIds.has(d.id));
  } else {
    // 'all' -> กรองด้วย visibility
    docs = docs.filter(d => perm.canView(user, d));
  }

  docs = docs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const typesById = {}; db.documentTypes.all().forEach(t => typesById[t.id] = t);
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const enriched = docs.map(d => ({
    ...d,
    typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-',
    createdByName: usersById[d.createdBy] ? usersById[d.createdBy].fullName : '-'
  }));
  sendJson(res, 200, enriched);
};

api['POST /api/documents'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const body = await readBody(req);
  const type = db.documentTypes.get(body.typeId);
  if (!type) return sendJson(res, 400, { error: 'ไม่พบประเภทเอกสาร' });
  if (!body.subject) return sendJson(res, 400, { error: 'ต้องระบุเรื่อง' });

  // เอกสารบางประเภทไม่ต้องผ่านหัวหน้าสำนักงาน/ผอ. เลย — ส่งตรงถึงหัวหน้าแผนกที่กำหนดไว้ (เช่น การเงิน/ทะเบียน/พัสดุ)
  // ตั้งค่าไว้ที่หน้า "ประเภทเอกสาร" (workflowMode: 'direct_to_dept')
  if (type.workflowMode === 'direct_to_dept') {
    const targetDeptId = type.fixedDeptId || body.targetDeptId;
    if (!targetDeptId) return sendJson(res, 400, { error: 'เอกสารประเภทนี้ต้องระบุแผนกปลายทาง' });
    const dept = db.departments.get(targetDeptId);
    if (!dept) return sendJson(res, 400, { error: 'ไม่พบแผนกปลายทางที่เลือก' });
    if (!dept.headUserId) return sendJson(res, 400, { error: `แผนก "${dept.name}" ยังไม่ได้กำหนดหัวหน้าแผนก กรุณาแจ้งแอดมินตั้งหัวหน้าแผนกก่อน (หน้าจัดการผู้ใช้งาน)` });
    const doc = db.documents.insert({
      docNumber: body.docNumber || '', docYear: body.docYear || '',
      typeId: body.typeId, subject: body.subject, fields: body.fields || {},
      confidential: !!body.confidential, status: 'in_progress',
      createdBy: user.id, dueDate: body.dueDate || null, createdAt: new Date().toISOString(),
      creatorSignature: body.signature || null
    });
    logAudit(doc.id, user.id, 'created', `สร้างเอกสารประเภท ${type.name} (ส่งตรงถึงแผนก ${dept.name})`);
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'created', note: `ส่งตรงถึงแผนก "${dept.name}" (ไม่ผ่านหัวหน้าสำนักงาน/ผอ.)`, timestamp: new Date().toISOString() });
    db.tasks.insert({
      documentId: doc.id, assignedToUserId: null, assignedToDeptId: dept.id,
      assignedBy: user.id, instructions: '', status: 'pending',
      createdAt: new Date().toISOString(), completedAt: null
    });
    notify(dept.headUserId, doc.id, `มีเอกสารใหม่ส่งถึงแผนก "${dept.name}" โดยตรง (คุณเป็นหัวหน้าแผนก): ${doc.subject}`);
    return sendJson(res, 201, doc);
  }

  // ถ้าผู้อำนวยการเป็นผู้จัดทำเอกสารเอง ถือว่าอนุมัติ/เกษียนแล้วโดยอัตโนมัติ ไม่ต้องกดอนุมัติซ้ำ
  const isDirectorAuthored = user.role === 'director';

  // เฟส 9: เอกสารทุกฉบับ (ยกเว้น ผอ. จัดทำเอง) ต้องผ่านหัวหน้าสำนักงานตรวจกรองก่อน ถึงจะไปถึง ผอ.
  const doc = db.documents.insert({
    docNumber: body.docNumber || '', docYear: body.docYear || '',
    typeId: body.typeId, subject: body.subject, fields: body.fields || {},
    confidential: !!body.confidential, status: isDirectorAuthored ? 'endorsed' : 'pending_office_review',
    createdBy: user.id, dueDate: body.dueDate || null, createdAt: new Date().toISOString(),
    creatorSignature: body.signature || null
  });
  logAudit(doc.id, user.id, 'created', `สร้างเอกสารประเภท ${type.name}`);
  db.history.insert({ documentId: doc.id, actorId: user.id, action: 'created', note: '', timestamp: new Date().toISOString() });

  if (isDirectorAuthored) {
    db.history.insert({
      documentId: doc.id, actorId: user.id, action: 'endorsed',
      note: 'ผู้อำนวยการจัดทำเรื่องนี้ด้วยตนเอง ถือเป็นการอนุมัติโดยอัตโนมัติ', signatureName: user.fullName,
      timestamp: new Date().toISOString()
    });
    db.users.find(u => u.role === 'office_head' && u.active).forEach(h => notify(h.id, doc.id, `ผู้อำนวยการจัดทำและอนุมัติเรื่องแล้ว รอส่งต่อ: ${doc.subject}`));
  } else {
    // แจ้งเตือนหัวหน้าสำนักงาน (และผู้ที่ได้รับสิทธิ์ตรวจกรองเอกสารเพิ่มเติม) ให้มาตรวจก่อนถึง ผอ.
    db.users.find(u => u.active && (u.role === 'office_head' || perm.hasCapability(u, 'review_documents'))).forEach(h => {
      notify(h.id, doc.id, `มีเอกสารใหม่รอตรวจกรองก่อนถึง ผอ.: ${doc.subject}`);
    });
  }
  sendJson(res, 201, doc);
};

api['GET /api/documents/:id'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const doc = db.documents.get(ctx.params.id);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (!perm.canView(user, doc)) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์เข้าถึงเอกสารนี้' });

  const history = db.history.find(h => h.documentId === doc.id).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const tasks = db.tasks.find(t => t.documentId === doc.id);
  const attachments = db.attachments.find(a => a.documentId === doc.id);
  const type = db.documentTypes.get(doc.typeId);
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const deptById = {}; db.departments.all().forEach(d => deptById[d.id] = d);

  const enrich = (arr, actorKey) => arr.map(x => ({
    ...x,
    actorName: usersById[x[actorKey]] ? usersById[x[actorKey]].fullName : '-'
  }));

  sendJson(res, 200, {
    document: doc, type,
    history: enrich(history, 'actorId'),
    tasks: tasks.map(t => ({
      ...t,
      assignedToName: t.assignedToUserId ? (usersById[t.assignedToUserId] || {}).fullName : (deptById[t.assignedToDeptId] || {}).name,
      assignedByName: usersById[t.assignedBy] ? usersById[t.assignedBy].fullName : '-'
    })),
    attachments
  });
};

api['PUT /api/documents/:id/number'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'edit_doc_number')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์กำหนดเลขที่หนังสือ' });
  const doc = db.documents.get(ctx.params.id);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  const body = await readBody(req);
  const updated = db.documents.update(doc.id, { docNumber: body.docNumber || '', docYear: body.docYear || '' });
  logAudit(doc.id, user.id, 'set_number', `ที่ ${body.docNumber || '-'}/${body.docYear || '-'}`);
  db.history.insert({ documentId: doc.id, actorId: user.id, action: 'numbered', note: `กำหนดเลขที่ ${body.docNumber || '-'}/${body.docYear || '-'}`, timestamp: new Date().toISOString() });
  sendJson(res, 200, updated);
};

api['POST /api/documents/:id/actions'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const doc = db.documents.get(ctx.params.id);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (!perm.canView(user, doc)) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  const action = body.action;

  if (action === 'endorse') {
    // ผอ. เกษียนหนังสือ: approve / acknowledge / reject (ต้องผ่านการตรวจกรองจากหัวหน้าสำนักงานมาก่อนแล้ว)
    if (user.role !== 'director' && user.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้อำนวยการ' });
    if (doc.status !== 'pending_director' && user.role !== 'admin') return sendJson(res, 400, { error: 'เอกสารนี้ยังไม่ผ่านการตรวจกรองจากหัวหน้าสำนักงาน' });
    const decision = body.decision || 'acknowledge'; // approve / acknowledge / reject
    const patch = { status: decision === 'reject' ? 'rejected' : 'endorsed' };
    const nowIso = new Date().toISOString();
    if (decision === 'reject') { patch.rejectedBy = user.id; patch.rejectedAt = nowIso; patch.restoreToStatus = 'pending_director'; }
    db.documents.update(doc.id, patch);
    db.history.insert({
      documentId: doc.id, actorId: user.id, action: 'endorsed',
      note: body.note || '', signatureName: user.fullName, signatureImage: body.signature || null,
      timestamp: nowIso
    });
    logAudit(doc.id, user.id, 'endorse', decision);
    // แจ้งผู้สร้างและหัวหน้าสำนักงาน
    notify(doc.createdBy, doc.id, `ผอ. ${decision === 'reject' ? 'ไม่อนุมัติ' : 'เกษียนหนังสือแล้ว'}: ${doc.subject}`);
    db.users.find(u => u.role === 'office_head' && u.active).forEach(h => notify(h.id, doc.id, `ผอ. เกษียนแล้ว รอส่งต่อ: ${doc.subject}`));
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'forward') {
    // หัวหน้าสำนักงาน (หรือผู้ที่ได้รับมอบสิทธิ์ review_documents จากหัวหน้าสำนักงาน) ส่งต่องานให้ผู้ปฏิบัติ/แผนก (รองรับส่งหลายคน/หลายแผนกพร้อมกัน)
    if (!['office_head', 'admin', 'director'].includes(user.role) && !perm.hasCapability(user, 'review_documents')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์ส่งต่องาน' });
    const targets = body.targets || []; // [{userId?, deptId?, instructions?}]
    if (!targets.length) return sendJson(res, 400, { error: 'ต้องระบุผู้รับมอบหมายอย่างน้อย 1 คน' });
    // ตรวจสอบก่อนว่าทุกแผนกที่จะส่งถึง มีหัวหน้าแผนกกำหนดไว้แล้ว — ถ้าไม่มีจะไม่มีใครเห็นงานนี้เลย
    // ต้องเช็คให้ครบก่อนสร้างงานจริง ป้องกันสร้างไปครึ่งๆ กลางๆ แล้วพังกลางทาง
    for (const tg of targets) {
      if (tg.deptId) {
        const dept = db.departments.get(tg.deptId);
        if (!dept) return sendJson(res, 400, { error: 'ไม่พบแผนกที่เลือก' });
        if (!dept.headUserId) return sendJson(res, 400, { error: `แผนก "${dept.name}" ยังไม่ได้กำหนดหัวหน้าแผนก กรุณาตั้งหัวหน้าแผนกก่อน (หน้าผู้ใช้งาน) หรือเลือกส่งถึงบุคคลเฉพาะเจาะจงแทน` });
      }
    }
    // กันส่งซ้ำซ้อน: ถ้าเลือกทั้ง "แผนก" และ "ตัวหัวหน้าแผนกนั้นเป็นรายบุคคล" พร้อมกันในการส่งต่อครั้งเดียว จะกลาย
    // เป็นงาน 2 ชิ้นแยกกัน (งานของแผนก + งานของบุคคล) ที่ต้องกดรับทราบ/เสร็จสิ้นครบทั้งคู่เอกสารถึงจะเปลี่ยนสถานะ
    // เป็น "เสร็จสิ้น" ได้ — ถ้าหัวหน้าแผนกกดเสร็จสิ้นแค่ชิ้นเดียว (นึกว่าเป็นงานเดียวกัน) เอกสารจะค้างที่ "กำลัง
    // ดำเนินการ" ตลอดไปทั้งที่งานจริงเสร็จแล้ว — ตัดรายการบุคคลที่ซ้ำกับหัวหน้าแผนกที่เลือกไว้แล้วออกก่อนสร้างงานจริง
    const deptHeadIds = new Set(
      targets.filter(tg => tg.deptId).map(tg => (db.departments.get(tg.deptId) || {}).headUserId).filter(Boolean)
    );
    const dedupedTargets = targets.filter(tg => !(tg.userId && deptHeadIds.has(tg.userId)));
    dedupedTargets.forEach(tg => {
      const task = db.tasks.insert({
        documentId: doc.id, assignedToUserId: tg.userId || null, assignedToDeptId: tg.deptId || null,
        assignedBy: user.id, instructions: tg.instructions || '', status: 'pending',
        createdAt: new Date().toISOString(), completedAt: null
      });
      if (tg.userId) notify(tg.userId, doc.id, `มีงานใหม่มอบหมายให้คุณ: ${doc.subject}`);
      if (tg.deptId) {
        // แจ้งเตือนเฉพาะหัวหน้าแผนกเท่านั้น (ไม่ใช่สมาชิกทุกคนในแผนก) — หัวหน้าแผนกจะเป็นผู้มอบหมายต่อเองอีกที
        const dept = db.departments.get(tg.deptId);
        notify(dept.headUserId, doc.id, `มีงานใหม่ถึงแผนก "${dept.name}" (คุณเป็นหัวหน้าแผนก): ${doc.subject}`);
      }
    });
    db.documents.update(doc.id, { status: 'in_progress' });
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'forwarded', note: body.note || '', timestamp: new Date().toISOString() });
    logAudit(doc.id, user.id, 'forward', JSON.stringify(targets));
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'acknowledge') {
    // ผู้ได้รับมอบหมายลงชื่อรับทราบ
    const task = db.tasks.findOne(t => t.id === body.taskId && t.documentId === doc.id);
    if (!task) return sendJson(res, 404, { error: 'ไม่พบงานที่มอบหมาย' });
    // งานที่มอบหมายถึง "แผนก" ให้เฉพาะหัวหน้าแผนกนั้นรับทราบ/ดำเนินการเองได้โดยตรง (ไม่ใช่สมาชิกแผนกทุกคน เพราะ
    // 1 คนอยู่ได้หลายแผนก เช็คแค่สมาชิกภาพจะทำให้คนแผนกอื่นมากดรับทราบแทนได้ก่อนหัวหน้าแผนกตัวจริงจะเห็นด้วยซ้ำ)
    const allowed = task.assignedToUserId === user.id || (task.assignedToDeptId && perm.isDeptHeadOf(user, task.assignedToDeptId));
    if (!allowed) return sendJson(res, 403, { error: 'คุณไม่ได้รับมอบหมายงานนี้' });
    db.tasks.update(task.id, { status: 'acknowledged' });
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'acknowledged', note: '', signatureName: user.fullName, timestamp: new Date().toISOString() });
    logAudit(doc.id, user.id, 'acknowledge', '');
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'complete') {
    // ผู้ปฏิบัติงานรายงานผลเสร็จสิ้น — ต้องพิมพ์ข้อความรายงานผลเสมอ (รูป/PDF แนบเพิ่มได้แต่ไม่บังคับ)
    const task = db.tasks.findOne(t => t.id === body.taskId && t.documentId === doc.id);
    if (!task) return sendJson(res, 404, { error: 'ไม่พบงานที่มอบหมาย' });
    // เช่นเดียวกับ acknowledge: งานที่มอบหมายถึง "แผนก" ให้เฉพาะหัวหน้าแผนกนั้นกดเสร็จสิ้นเองได้โดยตรง
    const allowed = task.assignedToUserId === user.id || (task.assignedToDeptId && perm.isDeptHeadOf(user, task.assignedToDeptId));
    if (!allowed) return sendJson(res, 403, { error: 'คุณไม่ได้รับมอบหมายงานนี้' });
    if (!body.note || !body.note.trim()) return sendJson(res, 400, { error: 'กรุณาพิมพ์รายงานผลการดำเนินงานก่อนกดเสร็จสิ้น' });
    db.tasks.update(task.id, { status: 'done', completedAt: new Date().toISOString() });
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'completed', note: body.note.trim(), taskId: task.id, signatureName: user.fullName, timestamp: new Date().toISOString() });
    logAudit(doc.id, user.id, 'complete', body.note || '');

    const remaining = db.tasks.find(t => t.documentId === doc.id && t.status !== 'done');
    if (remaining.length === 0) {
      db.documents.update(doc.id, { status: 'completed' });
      notify(doc.createdBy, doc.id, `งานของคุณเสร็จสิ้นแล้ว: ${doc.subject}`);
      db.users.find(u => u.role === 'office_head' || u.role === 'director').forEach(h => notify(h.id, doc.id, `งานเสร็จสิ้นทั้งหมด: ${doc.subject}`));
    } else {
      // ถ้ายังเหลืองานย่อยที่ตนเองส่งต่อ (delegate) ให้คนอื่นทำต่อ ยังไม่ถือว่าเสร็จทั้งเอกสาร
      // แต่แจ้งผู้ที่มอบหมายงานนี้ให้ทราบว่างานย่อยนี้เสร็จแล้ว (รายงานผลย้อนกลับขึ้นไปตามลำดับชั้น)
      if (task.assignedBy) notify(task.assignedBy, doc.id, `${user.fullName} รายงานผลงานเสร็จสิ้นแล้ว: ${doc.subject}`);
    }
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'delegate') {
    // มอบหมายงานต่อให้บุคคลอื่น (ใช้เมื่อ ผอ./สนง. ส่งงานถึง "ทั้งแผนก" แล้วหัวหน้าแผนกต้องเลือกตัวแทนในแผนกตนเอง)
    const task = db.tasks.findOne(t => t.id === body.taskId && t.documentId === doc.id);
    if (!task) return sendJson(res, 404, { error: 'ไม่พบงานที่มอบหมาย' });
    if (task.status === 'done') return sendJson(res, 400, { error: 'งานนี้เสร็จสิ้นแล้ว ไม่สามารถมอบหมายต่อได้' });
    const targetUser = db.users.get(body.targetUserId);
    if (!targetUser) return sendJson(res, 400, { error: 'ไม่พบผู้รับมอบหมายที่ระบุ' });

    const hasBroadRights = ['office_head', 'admin', 'director'].includes(user.role);
    const isTaskOwner = task.assignedToUserId === user.id;
    const isHeadOfTaskDept = task.assignedToDeptId && perm.isDeptHeadOf(user, task.assignedToDeptId);
    if (!hasBroadRights && !isTaskOwner && !isHeadOfTaskDept) {
      return sendJson(res, 403, { error: 'คุณไม่มีสิทธิ์มอบหมายงานนี้ต่อ' });
    }
    // หัวหน้าแผนก (ที่ไม่ใช่ สนง./ผอ./แอดมิน) มอบหมายต่อได้เฉพาะบุคคลภายในแผนกเดียวกันเท่านั้น
    if (!hasBroadRights && task.assignedToDeptId) {
      const targetInDept = (targetUser.departmentIds || []).includes(task.assignedToDeptId);
      if (!targetInDept) return sendJson(res, 403, { error: 'สามารถมอบหมายต่อได้เฉพาะบุคลากรภายในแผนกเดียวกันเท่านั้น' });
    }

    db.tasks.update(task.id, { assignedToUserId: targetUser.id, status: 'pending' });
    db.history.insert({
      documentId: doc.id, actorId: user.id, action: 'delegated',
      note: `มอบหมายต่อให้ ${targetUser.fullName}${body.note ? ' — ' + body.note : ''}`,
      timestamp: new Date().toISOString()
    });
    notify(targetUser.id, doc.id, `มีงานมอบหมายต่อถึงคุณ: ${doc.subject}`);
    logAudit(doc.id, user.id, 'delegate', targetUser.id);
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'return') {
    // ตีกลับให้แก้ไข
    db.documents.update(doc.id, { status: 'returned' });
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'returned', note: body.note || '', timestamp: new Date().toISOString() });
    notify(doc.createdBy, doc.id, `เอกสารถูกตีกลับให้แก้ไข: ${doc.subject}`);
    logAudit(doc.id, user.id, 'return', body.note || '');
    return sendJson(res, 200, { ok: true });
  }

  // ---- เฟส 9: หัวหน้าสำนักงาน (หรือผู้ได้รับมอบสิทธิ์ review_documents) ตรวจกรองเอกสารก่อนถึง ผอ. ----
  if (action === 'office_review') {
    if (!perm.hasCapability(user, 'review_documents')) return sendJson(res, 403, { error: 'เฉพาะหัวหน้าสำนักงาน/ผู้ได้รับมอบสิทธิ์ตรวจกรองเอกสาร' });
    if (doc.status !== 'pending_office_review') return sendJson(res, 400, { error: 'เอกสารนี้ไม่ได้อยู่ในสถานะรอตรวจกรอง' });
    const decision = body.decision; // 'approve' | 'return' | 'reject'
    if (!['approve', 'return', 'reject'].includes(decision)) return sendJson(res, 400, { error: 'ระบุผลการตรวจกรองไม่ถูกต้อง' });
    if (decision !== 'approve' && !body.note) return sendJson(res, 400, { error: 'กรุณาระบุความเห็น/สิ่งที่ต้องแก้ไข' });

    if (decision === 'approve') {
      db.documents.update(doc.id, { status: 'pending_director' });
      db.history.insert({ documentId: doc.id, actorId: user.id, action: 'office_reviewed', note: body.note || 'ตรวจกรองแล้ว ผ่าน ส่งต่อ ผอ.', signatureName: user.fullName, timestamp: new Date().toISOString() });
      db.users.find(u => u.role === 'director' && u.active).forEach(d => notify(d.id, doc.id, `มีเอกสารใหม่รอเกษียน: ${doc.subject}`));
    } else if (decision === 'return') {
      db.documents.update(doc.id, { status: 'returned_for_revision', officeComment: body.note });
      db.history.insert({ documentId: doc.id, actorId: user.id, action: 'returned_for_revision', note: body.note, signatureName: user.fullName, timestamp: new Date().toISOString() });
      notify(doc.createdBy, doc.id, `เอกสารถูกตีกลับให้แก้ไข (จากหัวหน้าสำนักงาน): ${doc.subject}`);
    } else {
      const nowIso = new Date().toISOString();
      db.documents.update(doc.id, {
        status: 'rejected', officeComment: body.note,
        rejectedBy: user.id, rejectedAt: nowIso, restoreToStatus: 'pending_office_review'
      });
      db.history.insert({ documentId: doc.id, actorId: user.id, action: 'rejected', note: body.note, signatureName: user.fullName, timestamp: nowIso });
      notify(doc.createdBy, doc.id, `เอกสารไม่ได้รับการอนุมัติ: ${doc.subject}`);
    }
    logAudit(doc.id, user.id, 'office_review', decision + (body.note ? ': ' + body.note : ''));
    return sendJson(res, 200, { ok: true });
  }

  // ผู้จัดทำแก้ไขเอกสารที่ถูกตีกลับ แล้วส่งกลับเข้าคิวตรวจกรองใหม่
  if (action === 'update') {
    // แก้ไขเอกสารของตัวเองได้ตอนยัง "รอตรวจกรอง" อยู่ (ยังไม่มีใครเริ่มพิจารณาจริงจัง) — ต่างจาก resubmit ตรงที่
    // ไม่เปลี่ยนสถานะ (อยู่ที่ pending_office_review เหมือนเดิม ไม่ต้องเข้าคิวใหม่) และไม่ถือเป็นการ "ตีกลับแล้วแก้"
    // พอสถานะเปลี่ยนไปจากนี้แล้ว (เข้าสู่การพิจารณาจริง) จะแก้ไม่ได้อีกจนกว่าจะถูกตีกลับกลับมา
    if (doc.createdBy !== user.id && user.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้จัดทำเอกสารเท่านั้น' });
    if (doc.status !== 'pending_office_review') return sendJson(res, 400, { error: 'แก้ไขได้เฉพาะตอนเอกสารยังอยู่ในสถานะรอตรวจกรองเท่านั้น (ถ้าผ่านการพิจารณาไปแล้วต้องรอถูกตีกลับก่อน)' });
    const patch = {};
    if (body.subject) patch.subject = body.subject;
    if (body.fields) patch.fields = body.fields;
    if (body.confidential !== undefined) patch.confidential = body.confidential;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
    if (body.signature !== undefined) patch.creatorSignature = body.signature;
    db.documents.update(doc.id, patch);
    // ลง log ว่าใครแก้ไขและเมื่อไหร่ แต่ไม่ลงรายละเอียดว่าแก้ตรงไหนบ้าง (ตามที่ขอไว้ตอนออกแบบหน้าแก้ไขเอกสารตีกลับ)
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'edited', note: body.note || 'แก้ไขข้อมูลระหว่างรอตรวจกรอง', signatureName: user.fullName, timestamp: new Date().toISOString() });
    logAudit(doc.id, user.id, 'update', body.note || '');
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'resubmit') {
    if (doc.createdBy !== user.id && user.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้จัดทำเอกสารเท่านั้น' });
    if (!['returned', 'returned_for_revision'].includes(doc.status)) return sendJson(res, 400, { error: 'เอกสารนี้ไม่ได้อยู่ในสถานะตีกลับ' });
    const patch = { status: 'pending_office_review' };
    if (body.subject) patch.subject = body.subject;
    if (body.fields) patch.fields = body.fields;
    if (body.docNumber !== undefined) patch.docNumber = body.docNumber;
    if (body.docYear !== undefined) patch.docYear = body.docYear;
    if (body.confidential !== undefined) patch.confidential = body.confidential;
    if (body.dueDate !== undefined) patch.dueDate = body.dueDate;
    if (body.signature !== undefined) patch.creatorSignature = body.signature;
    db.documents.update(doc.id, patch);
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'resubmitted', note: body.note || 'แก้ไขแล้วส่งใหม่', timestamp: new Date().toISOString() });
    db.users.find(u => u.active && (u.role === 'office_head' || perm.hasCapability(u, 'review_documents'))).forEach(h => notify(h.id, doc.id, `เอกสารแก้ไขแล้ว ส่งกลับมาให้ตรวจกรองอีกครั้ง: ${doc.subject}`));
    logAudit(doc.id, user.id, 'resubmit', body.note || '');
    return sendJson(res, 200, { ok: true });
  }

  if (action === 'restore') {
    // กู้คืนเอกสารจากถังขยะ (สถานะ 'rejected') — ทำได้เฉพาะคนที่เป็นคนตีกลับ/ไม่อนุมัติเอกสารนี้เอง (หรือแอดมิน)
    // และต้องกู้คืนภายใน 30 วันนับจากวันที่ถูกปฏิเสธ ป้องกันการกู้คืนเอกสารเก่าเก็บฝุ่นย้อนหลังนานๆ
    if (doc.status !== 'rejected') return sendJson(res, 400, { error: 'เอกสารนี้ไม่ได้อยู่ในถังขยะ' });
    if (doc.rejectedBy !== user.id && user.role !== 'admin') return sendJson(res, 403, { error: 'กู้คืนได้เฉพาะผู้ที่ตีกลับ/ไม่อนุมัติเอกสารนี้เท่านั้น' });
    const RESTORE_WINDOW_DAYS = 30;
    const rejectedAt = doc.rejectedAt ? new Date(doc.rejectedAt) : null;
    const daysPassed = rejectedAt ? (Date.now() - rejectedAt.getTime()) / 86400000 : Infinity;
    if (daysPassed > RESTORE_WINDOW_DAYS) return sendJson(res, 400, { error: `พ้นกำหนด ${RESTORE_WINDOW_DAYS} วันแล้ว ไม่สามารถกู้คืนได้อีก` });
    const restoreToStatus = doc.restoreToStatus || 'pending_office_review';
    db.documents.update(doc.id, { status: restoreToStatus, rejectedBy: null, rejectedAt: null, restoreToStatus: null });
    db.history.insert({ documentId: doc.id, actorId: user.id, action: 'restored', note: body.note || 'กู้คืนจากถังขยะ', signatureName: user.fullName, timestamp: new Date().toISOString() });
    notify(doc.createdBy, doc.id, `เอกสารถูกกู้คืนจากถังขยะและกลับเข้าสู่การพิจารณาอีกครั้ง: ${doc.subject}`);
    logAudit(doc.id, user.id, 'restore', body.note || '');
    return sendJson(res, 200, { ok: true });
  }

  sendJson(res, 400, { error: 'ไม่รู้จัก action นี้' });
};

api['POST /api/documents/:id/attachments'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const doc = db.documents.get(ctx.params.id);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (!perm.canView(user, doc)) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req); // { fileName, base64, taskId? }
  if (!body.fileName || !body.base64) return sendJson(res, 400, { error: 'ข้อมูลไฟล์ไม่ครบ' });
  const safeName = Date.now() + '_' + body.fileName.replace(/[^a-zA-Z0-9ก-๙._-]/g, '_');
  const filePath = path.join(UPLOAD_DIR, safeName);
  const base64Data = body.base64.replace(/^data:.*;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
  const att = db.attachments.insert({
    documentId: doc.id, taskId: body.taskId || null, fileName: body.fileName,
    filePath: '/uploads/' + safeName, uploadedBy: user.id, uploadedAt: new Date().toISOString()
  });
  logAudit(doc.id, user.id, 'attach_file', body.fileName);
  sendJson(res, 201, att);
};

// ลบไฟล์แนบ — ใช้ตอนแก้ไขเอกสารที่ถูกตีกลับ หรือตอนยังรอตรวจกรองอยู่เท่านั้น (ผู้จัดทำเอกสารเอง หรือแอดมิน)
// กันไม่ให้ใครมาลบไฟล์แนบของเอกสารที่ผ่านการพิจารณาไปแล้ว เพราะจะทำให้หลักฐานที่ผู้ตรวจเคยเห็นหายไป
api['DELETE /api/documents/:id/attachments/:attId'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const doc = db.documents.get(ctx.params.id);
  if (!doc) return sendJson(res, 404, { error: 'ไม่พบเอกสาร' });
  if (doc.createdBy !== user.id && user.role !== 'admin') return sendJson(res, 403, { error: 'เฉพาะผู้จัดทำเอกสารเท่านั้น' });
  if (!['returned', 'returned_for_revision', 'pending_office_review'].includes(doc.status)) return sendJson(res, 400, { error: 'ลบไฟล์แนบได้เฉพาะตอนเอกสารถูกตีกลับให้แก้ไข หรือยังรอตรวจกรองอยู่เท่านั้น' });
  const att = db.attachments.find(a => a.documentId === doc.id).find(a => a.id === ctx.params.attId);
  if (!att) return sendJson(res, 404, { error: 'ไม่พบไฟล์แนบ' });
  try {
    const diskPath = path.join(__dirname, att.filePath.replace(/^\/uploads\//, 'uploads/'));
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
  } catch (e) { /* ไฟล์อาจถูกลบไปแล้ว ไม่เป็นไร */ }
  db.attachments.remove(att.id);
  logAudit(doc.id, user.id, 'remove_attachment', att.fileName);
  sendJson(res, 200, { ok: true });
};

// ---- Backup (admin only) ----
function listBackupDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return [];
  try {
    return fs.readdirSync(dirPath)
      .filter(n => n.startsWith('backup-'))
      .map(n => {
        const full = path.join(dirPath, n);
        const stat = fs.statSync(full);
        return { name: n, time: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  } catch (e) { return []; }
}
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry), d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

api['GET /api/admin/backups'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const backupDir = path.join(__dirname, 'backups');
  const nasPath = process.env.NAS_BACKUP_PATH || '';
  const local = listBackupDir(backupDir).map(b => ({ ...b, source: 'local' }));
  const localNames = new Set(local.map(b => b.name));
  const nas = nasPath ? listBackupDir(nasPath).map(b => ({ ...b, source: 'nas', alreadyImported: localNames.has(b.name) })) : [];
  let logTail = '';
  const logPath = path.join(backupDir, 'backup.log');
  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    logTail = lines.slice(-10).join('\n');
  }
  sendJson(res, 200, { local, nas, nasConfigured: !!nasPath, nasPath, logTail });
};

function fmtBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ดูว่าข้างในชุดสำรองนี้มีไฟล์อะไรบ้าง (ไฟล์แนบ + สรุปจำนวนเอกสาร/ผู้ใช้ในฐานข้อมูล ณ ตอนนั้น)
api['GET /api/admin/backups/:name/contents'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const source = ctx.query.source === 'nas' ? 'nas' : 'local';
  const baseDir = source === 'nas' ? (process.env.NAS_BACKUP_PATH || '') : path.join(__dirname, 'backups');
  const name = ctx.params.name;
  if (!/^backup-[\d_-]+$/.test(name)) return sendJson(res, 400, { error: 'ชื่อชุดสำรองไม่ถูกต้อง' });
  const dir = path.join(baseDir, name);
  if (!baseDir || !fs.existsSync(dir)) return sendJson(res, 404, { error: 'ไม่พบชุดสำรองนี้' });

  const uploadsDir = path.join(dir, 'uploads');
  const dataDir = path.join(dir, 'data');
  const uploads = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir).map(n => {
        const st = fs.statSync(path.join(uploadsDir, n));
        return { name: n, sizeLabel: fmtBytes(st.size), isImage: /\.(png|jpe?g|gif|webp)$/i.test(n), isPdf: /\.pdf$/i.test(n) };
      })
    : [];
  const dataFiles = fs.existsSync(dataDir)
    ? fs.readdirSync(dataDir).map(n => {
        const st = fs.statSync(path.join(dataDir, n));
        return { name: n, sizeLabel: fmtBytes(st.size) };
      })
    : [];

  // ลองเปิดฐานข้อมูลที่สำรองไว้แบบอ่านอย่างเดียว เพื่อสรุปให้เห็นภาพว่าข้างในมีอะไรบ้าง
  // (คนละไฟล์กับฐานข้อมูลที่ใช้งานจริงอยู่ ไม่กระทบระบบที่กำลังรันอยู่)
  let summary = null;
  try {
    const Database = require('better-sqlite3');
    const dbFile = path.join(dataDir, 'database.db');
    if (fs.existsSync(dbFile)) {
      const snap = new Database(dbFile, { readonly: true, fileMustExist: true });
      const count = (table) => { try { return snap.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c; } catch (e) { return null; } };
      summary = { documents: count('documents'), users: count('users'), announcements: count('announcements') };
      snap.close();
    }
  } catch (e) { summary = null; }

  sendJson(res, 200, { name, source, uploads, dataFiles, summary, uploadsBaseUrl: source === 'local' ? `/api/admin/backups/${name}/uploads/` : null });
};

// เปิดดู/พรีวิวไฟล์แนบจริงที่อยู่ในชุดสำรอง (เฉพาะที่เก็บบนเครื่องนี้เท่านั้น — ไฟล์บน NAS เปิดตรงไม่ได้เพราะเป็นคนละดิสก์)
api['GET /api/admin/backups/:name/uploads/:filename'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const name = ctx.params.name;
  const filename = ctx.params.filename;
  if (!/^backup-[\d_-]+$/.test(name) || filename.includes('..') || filename.includes('/')) return sendJson(res, 400, {});
  const filePath = path.join(__dirname, 'backups', name, 'uploads', filename);
  if (!fs.existsSync(filePath)) return sendJson(res, 404, {});
  const ext = path.extname(filename).toLowerCase();
  const mime = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
};

api['POST /api/admin/backups/run'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  try {
    const result = runBackup();
    sendJson(res, 200, { ok: true, dest: result.dest });
  } catch (e) {
    sendJson(res, 500, { error: 'สำรองข้อมูลล้มเหลว: ' + e.message });
  }
};
// นำเข้าชุดสำรองจาก NAS มาไว้ในรายการเครื่อง server (ยังไม่กระทบข้อมูลที่ใช้งานอยู่ปัจจุบัน)
api['POST /api/admin/backups/import'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const body = await readBody(req);
  const nasPath = process.env.NAS_BACKUP_PATH;
  if (!nasPath) return sendJson(res, 400, { error: 'ยังไม่ได้ตั้งค่า NAS_BACKUP_PATH' });
  const src = path.join(nasPath, body.name || '');
  if (!body.name || !fs.existsSync(src)) return sendJson(res, 404, { error: 'ไม่พบชุดสำรองนี้บน NAS' });
  const dest = path.join(__dirname, 'backups', body.name);
  try {
    copyDirRecursive(src, dest);
    logAudit(null, user.id, 'import_backup_from_nas', body.name);
    sendJson(res, 200, { ok: true });
  } catch (e) { sendJson(res, 500, { error: 'นำเข้าล้มเหลว: ' + e.message }); }
};
// กู้คืนข้อมูล — สลับข้อมูลปัจจุบันด้วยชุดสำรองที่เลือก (สำรองของปัจจุบันไว้ก่อนเสมอเพื่อความปลอดภัย)
// หมายเหตุ: เดิมต้องรีสตาร์ทเซิร์ฟเวอร์เองหลังกู้คืน เพราะข้อมูลที่โหลดไว้ในหน่วยความจำยังเป็นชุดเก่า
// ตอนนี้ระบบสั่งรีสตาร์ทให้อัตโนมัติแทน (เหมือนรีสตาร์ทตอนตี 3 ทุกคืน) จึงต้องมี NSSM/PM2 ตั้ง auto-restart ไว้ (ดู README)
api['POST /api/admin/backups/restore'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const body = await readBody(req);
  if (!body.name || !body.confirm) return sendJson(res, 400, { error: 'ต้องยืนยันการกู้คืนข้อมูล (confirm: true) และระบุชื่อชุดสำรอง' });
  let sourceDir;
  if (body.source === 'nas') {
    const nasPath = process.env.NAS_BACKUP_PATH;
    if (!nasPath) return sendJson(res, 400, { error: 'ยังไม่ได้ตั้งค่า NAS_BACKUP_PATH' });
    sourceDir = path.join(nasPath, body.name);
  } else {
    sourceDir = path.join(__dirname, 'backups', body.name);
  }
  if (!fs.existsSync(sourceDir)) return sendJson(res, 404, { error: 'ไม่พบชุดสำรองนี้' });
  let dbClosed = false; // สำคัญ: ต้องรู้ว่าปิด connection ไปแล้วหรือยัง เพื่อตัดสินใจตอน error ว่าต้อง restart บังคับหรือไม่
  try {
    // สำรองข้อมูลปัจจุบันไว้ก่อนเสมอ กันพลาด
    const safetyResult = runBackup();
    // ปิดการเชื่อมต่อฐานข้อมูลก่อนแตะโฟลเดอร์ data/ เสมอ — บน Windows ถ้าไฟล์ database.db ยังถูกโปรเซสนี้เปิดค้างอยู่
    // (better-sqlite3 ถือ handle ไว้ตลอดอายุโปรเซส) การสั่งลบ/ทับโฟลเดอร์จะเจอ EPERM ทันที (เคยเจอปัญหานี้ตอนรันบนเครื่อง server จริง)
    try { db._raw.close(); dbClosed = true; } catch (e) { dbClosed = true; /* เพิกเฉยได้ถ้าปิดไปแล้ว — ถือว่าปิดแล้วเช่นกัน */ }
    // สลับข้อมูล: คัดลอก data/ และ uploads/ จากชุดที่เลือกมาทับของปัจจุบัน
    const dataDir = path.join(__dirname, 'data'), uploadDir = path.join(__dirname, 'uploads');
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    fs.rmSync(uploadDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    copyDirRecursive(path.join(sourceDir, 'data'), dataDir);
    copyDirRecursive(path.join(sourceDir, 'uploads'), uploadDir);
    // สำคัญ: ห้ามเรียก logAudit(...) ตรงนี้เด็ดขาด — db._raw.close() ไปแล้วด้านบน ต่อให้เปิดใหม่ก็ยังผิดอยู่ดี
    // เพราะไฟล์ database.db ที่เพิ่ง copy ทับไปคือฐานข้อมูล "เก่า" ของชุดสำรอง ไม่มีทางมีเหตุการณ์ restore ที่กำลัง
    // เกิดขึ้นตอนนี้บันทึกอยู่ในนั้นได้อยู่แล้ว (เป็นสาเหตุของบั๊ก "database connection is not open" ที่เจอ
    // ทุกครั้งที่กู้คืน — เขียน log ไปหา DB ที่ปิดไปแล้วและกำลังจะถูกแทนที่) เปลี่ยนไปเขียนเป็นไฟล์ text ธรรมดา
    // แยกไว้นอกโฟลเดอร์ data/ แทน เพื่อให้ประวัติการกู้คืนอยู่รอดข้ามการสลับฐานข้อมูลได้จริง
    try {
      const logLine = `${new Date().toISOString()} | restore_backup | user=${user.username || user.id} | source=${body.name} | safetyBackup=${safetyResult.dest}\n`;
      fs.appendFileSync(path.join(__dirname, 'backups', 'restore-history.log'), logLine);
    } catch (e) { /* เขียน log ไม่ได้ก็ไม่ควรทำให้การกู้คืนที่สำเร็จแล้วถือว่าล้มเหลว เพิกเฉยได้ */ }
    sendJson(res, 200, {
      ok: true, safetyBackup: safetyResult.dest,
      message: 'กู้คืนข้อมูลสำเร็จ'
    });
    // เดิมตรงนี้ต้องสั่ง process.exit() ให้ NSSM/PM2 restart เอง (พึ่งพา process manager ภายนอก ไม่มีบนเครื่อง dev)
    // ตอนนี้เปลี่ยนมาเปิด connection ใหม่ในโปรเซสเดียวกันแทน ไม่ต้อง restart ทั้งแอปอีกต่อไป ข้อมูลในหน่วยความจำ
    // ที่โหลดไว้ตอนนี้เป็นชุดเก่าก็ไม่ใช่ปัญหา เพราะทุก route อ่านจาก db.xxx.all()/get() สดใหม่ทุกครั้งอยู่แล้ว
    // ไม่มีการ cache ข้อมูลไว้ใน memory แยกจาก DB
    db.reopen();
  } catch (e) {
    // แก้บั๊กสำคัญ: เดิมถ้าล้มเหลวตรงนี้ *หลังจาก* ปิด db ไปแล้ว (เช่น copy ไฟล์พลาดกลางทาง) โปรเซสจะค้างอยู่ในสภาพ
    // db ปิดถาวรตลอดไป ทุก request หลังจากนี้จะพัง ("database connection is not open" รัวๆ) — ตอนนี้ไม่ต้องรอ
    // restart ทั้งโปรเซสอีกแล้ว แค่เปิด connection ใหม่ทันที (ชี้กลับไปที่ไฟล์ที่มีอยู่ตอนนี้ ไม่ว่าจะเป็นของเดิม
    // หรือของใหม่ที่ copy มาสำเร็จไปครึ่งทาง) ระบบกลับมาใช้งานได้ทันทีโดยไม่ต้องรอใครมา restart เครื่อง
    if (dbClosed) { try { db.reopen(); } catch (e2) { /* ไม่มีทางเลือกอื่นแล้วจริงๆ ถ้ายังพังอีก ต้อง restart เอง */ } }
    sendJson(res, 500, {
      error: 'กู้คืนข้อมูลล้มเหลว: ' + e.message +
        (dbClosed ? ' — ระบบเปิดการเชื่อมต่อฐานข้อมูลใหม่ให้แล้วอัตโนมัติ ลองรีเฟรชหน้าเว็บแล้วตรวจสอบข้อมูลอีกครั้ง (มีสำรองของเดิมไว้ก่อนแตะแล้วที่ ' + (typeof safetyResult !== 'undefined' && safetyResult ? safetyResult.dest : '(ไม่ทราบ)') + ')' : ' — ลองใหม่อีกครั้งได้เลย ยังไม่มีอะไรถูกแก้ไข')
    });
  }
};

// ---- Guard checklist (เวรยามประจำวัน) ----
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

api['GET /api/guard/items'] = async (req, res, ctx, user) => {
  if (!user || !(user.role === 'guard' || perm.hasCapability(user, 'view_guard_oversight') || perm.hasCapability(user, 'guard_duty_access'))) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  sendJson(res, 200, db.guardChecklistItems.find(i => i.active !== false));
};
api['POST /api/guard/items'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'view_guard_oversight')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์จัดการเวรยาม' });
  const body = await readBody(req);
  if (!body.title || !Array.isArray(body.times) || !body.times.length) return sendJson(res, 400, { error: 'ต้องระบุชื่อรายการและเวลาอย่างน้อย 1 ช่วง' });
  const item = db.guardChecklistItems.insert({ title: body.title, description: body.description || '', times: body.times, active: true, createdBy: user.id, createdAt: new Date().toISOString() });
  sendJson(res, 201, item);
};
api['PUT /api/guard/items/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'view_guard_oversight')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์จัดการเวรยาม' });
  const body = await readBody(req);
  const item = db.guardChecklistItems.update(ctx.params.id, body);
  if (!item) return sendJson(res, 404, { error: 'ไม่พบรายการ' });
  sendJson(res, 200, item);
};
api['DELETE /api/guard/items/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'view_guard_oversight')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์จัดการเวรยาม' });
  db.guardChecklistItems.update(ctx.params.id, { active: false });
  sendJson(res, 200, { ok: true });
};

api['GET /api/guard/today'] = async (req, res, ctx, user) => {
  if (!user || !(user.role === 'guard' || perm.hasCapability(user, 'view_guard_oversight') || perm.hasCapability(user, 'guard_duty_access'))) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const isActingGuard = user.role === 'guard' || perm.hasCapability(user, 'guard_duty_access');
  const date = isActingGuard ? todayStr() : (ctx.query.date || todayStr());
  const items = db.guardChecklistItems.find(i => i.active !== false);
  const logs = db.guardLogs.find(l => l.date === date);
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const slots = [];
  items.forEach(item => {
    (item.times || []).forEach(time => {
      const log = logs.filter(l => l.itemId === item.id && l.scheduledTime === time).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))[0] || null;
      slots.push({
        itemId: item.id, title: item.title, description: item.description, scheduledTime: time,
        done: !!log, log: log ? { ...log, guardName: usersById[log.guardUserId] ? usersById[log.guardUserId].fullName : '-' } : null
      });
    });
  });
  slots.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  sendJson(res, 200, { date, slots });
};

api['POST /api/guard/logs'] = async (req, res, ctx, user) => {
  if (!user || !(['guard', 'admin'].includes(user.role) || perm.hasCapability(user, 'guard_duty_access'))) return sendJson(res, 403, { error: 'เฉพาะยาม (หรือผู้ได้รับสิทธิ์ช่วยเวร) เท่านั้น' });
  const body = await readBody(req);
  const item = db.guardChecklistItems.get(body.itemId);
  if (!item) return sendJson(res, 404, { error: 'ไม่พบรายการตรวจ' });
  if (!body.scheduledTime) return sendJson(res, 400, { error: 'ต้องระบุช่วงเวลา' });
  const photos = Array.isArray(body.photos) ? body.photos : [];
  const savedPhotos = photos.map((base64, idx) => {
    const safeName = `guard_${Date.now()}_${idx}.jpg`;
    const filePath = path.join(UPLOAD_DIR, safeName);
    const data = base64.replace(/^data:.*;base64,/, '');
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    return '/uploads/' + safeName;
  });
  const log = db.guardLogs.insert({
    itemId: item.id, scheduledTime: body.scheduledTime, date: todayStr(),
    guardUserId: user.id, note: body.note || '', photoPaths: savedPhotos,
    submittedAt: new Date().toISOString()
  });
  logAudit(null, user.id, 'guard_checklist', `${item.title} (${body.scheduledTime})`);
  db.users.find(u => ['admin', 'director'].includes(u.role) && u.active).forEach(a => {
    notify(a.id, null, `ยามบันทึกการตรวจ: ${item.title} (${body.scheduledTime})`);
  });
  sendJson(res, 201, log);
};

api['GET /api/guard/history'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'view_guard_oversight')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์ดูรายงานเวรยาม' });
  const date = ctx.query.date || todayStr();
  const logs = db.guardLogs.find(l => l.date === date).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const itemsById = {}; db.guardChecklistItems.all().forEach(i => itemsById[i.id] = i);
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  sendJson(res, 200, logs.map(l => ({
    ...l, title: itemsById[l.itemId] ? itemsById[l.itemId].title : '-',
    guardName: usersById[l.guardUserId] ? usersById[l.guardUserId].fullName : '-'
  })));
};

// ---- Settings (ชื่อโรงเรียน ฯลฯ) ----
api['GET /api/settings'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  let s = db.settings.get('main');
  if (!s) s = db.settings.insert({ id: 'main', schoolName: 'โรงเรียน (ยังไม่ได้ตั้งชื่อในระบบ)', guardChecklistEnabled: false });
  if (s.guardChecklistEnabled === undefined) s = db.settings.update('main', { guardChecklistEnabled: false });
  sendJson(res, 200, s);
};
api['PUT /api/settings'] = async (req, res, ctx, user) => {
  if (!user || (user.role !== 'admin' && !perm.hasCapability(user, 'manage_feature_toggles'))) return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const body = await readBody(req);
  const patch = {};
  if (body.schoolName !== undefined) patch.schoolName = body.schoolName;
  if (body.guardChecklistEnabled !== undefined) patch.guardChecklistEnabled = !!body.guardChecklistEnabled;
  // เฟส 9: ธีม/สี/ภาษาเริ่มต้น/สลับเมนูฟังก์ชันได้จากหน้าตั้งค่า
  if (body.theme !== undefined) patch.theme = body.theme; // 'light' | 'dark' | 'custom'
  if (body.customThemeColors !== undefined) patch.customThemeColors = body.customThemeColors; // {primary, accent, ...}
  if (body.defaultLanguage !== undefined) patch.defaultLanguage = body.defaultLanguage; // 'th' | 'en' | 'zh'
  if (body.featureToggles !== undefined) patch.featureToggles = body.featureToggles; // { menuKey: boolean }
  if (body.i18nOverrides !== undefined) patch.i18nOverrides = body.i18nOverrides; // { th: {key:val}, en: {...}, zh: {...} } — คำแปลที่แอดมินแก้ไขเอง ทับค่าเริ่มต้นในโค้ด
  let s = db.settings.get('main');
  if (!s) s = db.settings.insert({ id: 'main', schoolName: '', guardChecklistEnabled: false, theme: 'light', defaultLanguage: 'th', featureToggles: {}, ...patch });
  else s = db.settings.update('main', patch);
  sendJson(res, 200, s);
};

// ---- Announcements (ประกาศระบบจากไอที) ----
api['GET /api/announcements/active'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const now = Date.now();
  const active = db.announcements.find(a => a.active && (!a.endAt || new Date(a.endAt).getTime() > now) && new Date(a.startAt).getTime() <= now);
  sendJson(res, 200, active.sort((a, b) => new Date(b.startAt) - new Date(a.startAt)));
};
api['GET /api/announcements'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  sendJson(res, 200, db.announcements.all().sort((a, b) => new Date(b.startAt) - new Date(a.startAt)));
};
api['POST /api/announcements'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const body = await readBody(req);
  if (!body.message) return sendJson(res, 400, { error: 'ต้องระบุข้อความประกาศ' });
  const item = db.announcements.insert({
    message: body.message, startAt: body.startAt || new Date().toISOString(), endAt: body.endAt || null,
    active: true, createdBy: user.id, createdAt: new Date().toISOString()
  });
  db.users.find(u => u.active).forEach(u => notify(u.id, null, `ประกาศจากไอที: ${body.message}`));
  sendJson(res, 201, item);
};
api['DELETE /api/announcements/:id'] = async (req, res, ctx, user) => {
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  db.announcements.remove(ctx.params.id);
  sendJson(res, 200, { ok: true });
};
api['POST /api/announcements/:id/stop'] = async (req, res, ctx, user) => {
  // ปิดการแสดงผลทันทีโดยไม่ลบประวัติ (ต่างจาก DELETE ซึ่งลบถาวร)
  if (!user || user.role !== 'admin') return sendJson(res, 403, { error: 'ต้องเป็นแอดมิน' });
  const updated = db.announcements.update(ctx.params.id, { active: false, endAt: new Date().toISOString() });
  sendJson(res, 200, updated);
};

// ---- ครูเวร (Teacher Duty) — รายสัปดาห์ตามวันที่กำหนด + ระบบหัวหน้าเวร ----
// dayOfWeek: 1=จันทร์ ... 7=อาทิตย์ (ISO)
function isoDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js;
}
function dutyActiveOnDate(dutyType, dateStr) {
  const days = dutyType.daysOfWeek && dutyType.daysOfWeek.length ? dutyType.daysOfWeek : [1, 2, 3, 4, 5, 6, 7];
  return days.includes(isoDayOfWeek(dateStr));
}
function effectiveDutyOwner(dutyType, dateStr) {
  if (!dutyActiveOnDate(dutyType, dateStr)) return null;
  const coverage = db.dutyCoverage.find(c => c.dutyTypeId === dutyType.id && c.status === 'accepted' && c.fromDate <= dateStr && dateStr <= c.toDate);
  return coverage.length ? coverage[0].substituteUserId : dutyType.primaryUserId;
}
function datesOverlap(aFrom, aTo, bFrom, bTo) { return aFrom <= bTo && bFrom <= aTo; }
function dutyHeadForDay(dayOfWeek) {
  return db.dutyHeads.findOne(h => h.dayOfWeek === dayOfWeek && h.active !== false);
}
function isDutyHeadFor(userId, dutyType) {
  const days = dutyType.daysOfWeek && dutyType.daysOfWeek.length ? dutyType.daysOfWeek : [1, 2, 3, 4, 5, 6, 7];
  return days.some(d => { const h = dutyHeadForDay(d); return h && h.headUserId === userId; });
}
const DAY_NAMES = { 1: 'จันทร์', 2: 'อังคาร', 3: 'พุธ', 4: 'พฤหัสบดี', 5: 'ศุกร์', 6: 'เสาร์', 7: 'อาทิตย์' };

api['GET /api/duty/types'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const today = todayStr();
  const types = db.dutyTypes.find(t => t.active !== false).map(t => {
    const ownerId = effectiveDutyOwner(t, today);
    return {
      ...t, primaryUserName: usersById[t.primaryUserId] ? usersById[t.primaryUserId].fullName : '-',
      dayNames: (t.daysOfWeek || []).map(d => DAY_NAMES[d]).join(', '),
      effectiveTodayUserId: ownerId,
      effectiveTodayName: ownerId ? (usersById[ownerId] ? usersById[ownerId].fullName : '-') : 'ไม่มีเวรวันนี้'
    };
  });
  sendJson(res, 200, types);
};
api['POST /api/duty/types'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  if (!body.title || !Array.isArray(body.times) || !body.times.length || !body.primaryUserId) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบ' });
  if (!Array.isArray(body.daysOfWeek) || !body.daysOfWeek.length) return sendJson(res, 400, { error: 'ต้องเลือกวันในสัปดาห์อย่างน้อย 1 วัน' });
  const item = db.dutyTypes.insert({ title: body.title, times: body.times, daysOfWeek: body.daysOfWeek, primaryUserId: body.primaryUserId, active: true, createdBy: user.id, createdAt: new Date().toISOString() });
  notify(body.primaryUserId, null, `คุณได้รับมอบหมายเวร: ${item.title}`);
  sendJson(res, 201, item);
};
api['PUT /api/duty/types/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  const item = db.dutyTypes.update(ctx.params.id, body);
  if (!item) return sendJson(res, 404, { error: 'ไม่พบเวร' });
  if (body.primaryUserId) notify(body.primaryUserId, null, `คุณได้รับมอบหมายเวร: ${item.title}`);
  sendJson(res, 200, item);
};
api['DELETE /api/duty/types/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  db.dutyTypes.update(ctx.params.id, { active: false });
  sendJson(res, 200, { ok: true });
};

// ---- หัวหน้าเวร (duty heads ประจำแต่ละวันของสัปดาห์) ----
api['GET /api/duty/heads'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const heads = db.dutyHeads.find(h => h.active !== false).map(h => ({ ...h, headName: usersById[h.headUserId] ? usersById[h.headUserId].fullName : '-', dayName: DAY_NAMES[h.dayOfWeek] }));
  sendJson(res, 200, heads);
};
api['POST /api/duty/heads'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const body = await readBody(req);
  if (!body.dayOfWeek || !body.headUserId) return sendJson(res, 400, { error: 'ข้อมูลไม่ครบ' });
  const existing = db.dutyHeads.findOne(h => h.dayOfWeek === body.dayOfWeek && h.active !== false);
  let item;
  if (existing) item = db.dutyHeads.update(existing.id, { headUserId: body.headUserId });
  else item = db.dutyHeads.insert({ dayOfWeek: body.dayOfWeek, headUserId: body.headUserId, active: true });
  notify(body.headUserId, null, `คุณได้รับมอบหมายเป็นหัวหน้าเวรวัน${DAY_NAMES[body.dayOfWeek]}`);
  sendJson(res, 200, item);
};
api['DELETE /api/duty/heads/:id'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'manage_teacher_duty')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  db.dutyHeads.update(ctx.params.id, { active: false });
  sendJson(res, 200, { ok: true });
};

// เวลาที่อนุญาตให้ "ส่งเวรอย่างเป็นทางการ" ได้ (ก่อนเวลานี้บันทึกร่าง/แนบรูปได้ แต่กดส่งจริงไม่ได้)
// ปรับได้ผ่าน env DUTY_SUBMIT_CUTOFF รูปแบบ "HH:MM" (ค่าเริ่มต้น 17:20)
const DUTY_SUBMIT_CUTOFF = process.env.DUTY_SUBMIT_CUTOFF || '17:20';
function isPastDutyCutoff(now = new Date()) {
  const [h, m] = DUTY_SUBMIT_CUTOFF.split(':').map(Number);
  const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  return now.getTime() >= cutoff.getTime();
}
// ดึงบันทึกเวรของ "วันนี้" สำหรับ dutyType หนึ่งๆ (1 dutyType ต่อ 1 วัน มีได้แค่ 1 รายการเท่านั้น ไม่ว่าจะเป็นร่างหรือส่งแล้ว)
function findTodayDutyLog(dutyTypeId, date) {
  return db.dutyLogs.findOne(l => l.dutyTypeId === dutyTypeId && l.date === date);
}

// เวรของฉันวันนี้ + ทีมที่ฉันดูแล (ถ้าเป็นหัวหน้าเวร) + คำขอรอตอบรับ
api['GET /api/duty/mine'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const date = todayStr();
  const allTypes = db.dutyTypes.find(t => t.active !== false);
  const myTypes = allTypes.filter(t => effectiveDutyOwner(t, date) === user.id);
  const logs = db.dutyLogs.find(l => l.date === date);
  // 1 การ์ดต่อ 1 dutyType ต่อวัน (ไม่แยกตามช่วงเวลาอีกต่อไป) — times ยังคงแสดงเป็นข้อมูลอ้างอิงว่าต้องไปยืนช่วงไหนบ้าง
  const slots = myTypes.map(t => {
    const log = findTodayDutyLog(t.id, date);
    const submitted = !!(log && log.status === 'submitted');
    const locked = !!(log && log.reviewedBy);
    return {
      dutyTypeId: t.id, title: t.title, times: t.times || [],
      done: submitted, locked, log
    };
  });
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const typesById = {}; allTypes.forEach(t => typesById[t.id] = t);
  const pendingForMe = db.dutyCoverage.find(c => c.substituteUserId === user.id && c.status === 'pending').map(c => ({
    ...c, dutyTitle: typesById[c.dutyTypeId] ? typesById[c.dutyTypeId].title : '-',
    originalUserName: usersById[c.originalUserId] ? usersById[c.originalUserId].fullName : '-'
  }));
  // ทีมที่ฉันดูแล ถ้าฉันเป็นหัวหน้าเวรของวันใดวันหนึ่ง
  const myHeadDays = db.dutyHeads.find(h => h.active !== false && h.headUserId === user.id).map(h => h.dayOfWeek);
  const teamTypes = myHeadDays.length ? allTypes.filter(t => (t.daysOfWeek || []).some(d => myHeadDays.includes(d))).map(t => {
    const ownerId = effectiveDutyOwner(t, date);
    const activeToday = dutyActiveOnDate(t, date);
    const log = findTodayDutyLog(t.id, date);
    return {
      id: t.id, title: t.title, dayNames: (t.daysOfWeek || []).map(d => DAY_NAMES[d]).join(', '),
      ownerName: ownerId ? (usersById[ownerId] ? usersById[ownerId].fullName : '-') : (usersById[t.primaryUserId] ? usersById[t.primaryUserId].fullName : '-'),
      activeToday, doneToday: activeToday ? !!(log && log.status === 'submitted') : null
    };
  }) : [];
  sendJson(res, 200, {
    date, slots, pendingForMe, teamTypes,
    isAnyDutyHead: myHeadDays.length > 0, hasAnyDuty: myTypes.length > 0 || teamTypes.length > 0,
    submitCutoff: DUTY_SUBMIT_CUTOFF, pastCutoff: isPastDutyCutoff()
  });
};

// เดิม: ต้องบันทึกแยกทุกช่วงเวลาใน 1 วัน (เช้า/เที่ยง/เย็น กด "ส่ง" ทีละครั้ง)
// ใหม่: บันทึกร่างสะสมได้ตลอดวัน (แนบรูป/เขียนโน้ตได้เรื่อยๆ ไม่หาย แม้ logout แล้ว login ใหม่)
// แล้วกด "ส่งเวร" อย่างเป็นทางการได้แค่ครั้งเดียวต่อวันหลังเวลา DUTY_SUBMIT_CUTOFF เท่านั้น
function saveDutyPhotos(photos) {
  return (Array.isArray(photos) ? photos : []).map((base64, idx) => {
    if (typeof base64 !== 'string' || !base64.startsWith('data:')) return base64; // เป็น path เดิมอยู่แล้ว (รูปที่บันทึกไว้ก่อนหน้านี้) ไม่ต้องเขียนซ้ำ
    const safeName = `duty_${Date.now()}_${idx}.jpg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), Buffer.from(base64.replace(/^data:.*;base64,/, ''), 'base64'));
    return '/uploads/' + safeName;
  });
}
function assertCanEditDutyLog(existing, res) {
  if (existing && existing.reviewedBy) { sendJson(res, 403, { error: 'หัวหน้าเวรตรวจแล้ว ไม่สามารถแก้ไขได้อีก' }); return false; }
  return true;
}

// บันทึกร่าง — เรียกซ้ำได้เรื่อยๆ ตลอดวัน ไม่บังคับกรอกครบ ไม่เช็คเวลา
api['PUT /api/duty/logs/draft'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const body = await readBody(req);
  const type = db.dutyTypes.get(body.dutyTypeId);
  if (!type) return sendJson(res, 404, { error: 'ไม่พบเวร' });
  const today = todayStr();
  if (effectiveDutyOwner(type, today) !== user.id) return sendJson(res, 403, { error: 'คุณไม่ใช่ผู้รับผิดชอบเวรนี้ในวันนี้' });
  const existing = findTodayDutyLog(type.id, today);
  if (!assertCanEditDutyLog(existing, res)) return;
  const savedPhotos = saveDutyPhotos(body.photos);
  const patch = {
    dutyTypeId: type.id, date: today, actingUserId: user.id,
    note: (body.note || '').trim(), ok: body.ok !== false, photoPaths: savedPhotos,
    signature: body.signature || null,
    coSignerUserId: body.coSignerUserId || null,
    coSignature: body.coSignerUserId ? (body.coSignature || null) : null,
    status: 'draft', draftUpdatedAt: new Date().toISOString()
  };
  const log = existing ? db.dutyLogs.update(existing.id, patch) : db.dutyLogs.insert(patch);
  sendJson(res, 200, log);
};

// ส่งเวรอย่างเป็นทางการ — กดได้ครั้งเดียวต่อวันต่อเวร และต้องอยู่หลังเวลา DUTY_SUBMIT_CUTOFF เท่านั้น
api['POST /api/duty/logs/submit'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const body = await readBody(req);
  const type = db.dutyTypes.get(body.dutyTypeId);
  if (!type) return sendJson(res, 404, { error: 'ไม่พบเวร' });
  const today = todayStr();
  if (effectiveDutyOwner(type, today) !== user.id) return sendJson(res, 403, { error: 'คุณไม่ใช่ผู้รับผิดชอบเวรนี้ในวันนี้' });
  const existing = findTodayDutyLog(type.id, today);
  if (!assertCanEditDutyLog(existing, res)) return;
  if (existing && existing.status === 'submitted') return sendJson(res, 400, { error: 'ส่งเวรวันนี้ไปแล้ว' });
  if (!isPastDutyCutoff()) return sendJson(res, 400, { error: `ส่งเวรอย่างเป็นทางการได้ตั้งแต่เวลา ${DUTY_SUBMIT_CUTOFF} เป็นต้นไปเท่านั้น (ตอนนี้บันทึกร่างเก็บไว้ก่อนได้)` });
  const note = (body.note ?? existing?.note ?? '').trim();
  if (!note) return sendJson(res, 400, { error: 'กรุณาระบุรายละเอียด (บังคับกรอก)' });
  const savedPhotos = saveDutyPhotos(body.photos ?? existing?.photoPaths ?? []);
  const patch = {
    dutyTypeId: type.id, date: today, actingUserId: user.id,
    note, ok: body.ok !== undefined ? body.ok !== false : (existing ? existing.ok !== false : true),
    photoPaths: savedPhotos,
    signature: body.signature ?? existing?.signature ?? null,
    coSignerUserId: body.coSignerUserId ?? existing?.coSignerUserId ?? null,
    coSignature: (body.coSignerUserId ?? existing?.coSignerUserId) ? (body.coSignature ?? existing?.coSignature ?? null) : null,
    status: 'submitted', submittedAt: new Date().toISOString()
  };
  const log = existing ? db.dutyLogs.update(existing.id, patch) : db.dutyLogs.insert(patch);
  // แจ้งหัวหน้าเวรของวันนี้ให้เข้ามาตรวจ
  const head = dutyHeadForDay(isoDayOfWeek(today));
  if (head) notify(head.headUserId, null, `${user.fullName} ส่งเวร "${type.title}" แล้ว รอตรวจ`);
  sendJson(res, 200, log);
};

// หัวหน้าเวรประจำวันตรวจรายการที่บันทึกไว้ + เขียนความเห็น + ลงชื่อกำกับ
api['POST /api/duty/logs/:id/review'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const log = db.dutyLogs.get(ctx.params.id);
  if (!log) return sendJson(res, 404, { error: 'ไม่พบรายการ' });
  const isHeadToday = db.dutyHeads.findOne(h => h.headUserId === user.id) != null;
  if (!(isHeadToday || perm.hasCapability(user, 'manage_teacher_duty'))) return sendJson(res, 403, { error: 'เฉพาะหัวหน้าเวรประจำวันหรือผู้มีสิทธิ์จัดการเวรเท่านั้น' });
  const body = await readBody(req);
  db.dutyLogs.update(log.id, {
    reviewedBy: user.id, reviewNote: body.note || '', reviewSignature: body.signature || null, reviewedAt: new Date().toISOString()
  });
  const type = db.dutyTypes.get(log.dutyTypeId);
  db.users.find(u => u.role === 'director').forEach(d => notify(d.id, null, `หัวหน้าเวรตรวจแล้ว รอ ผอ. ลงนาม: ${type ? type.title : '-'}`));
  sendJson(res, 200, { ok: true });
};

// ผอ. ลงนามกำกับขั้นสุดท้าย (ไม่บังคับ แต่ทำให้เห็นภาพรวมครบวงจรว่า ผอ. รับทราบแล้ว)
api['POST /api/duty/logs/:id/director-sign'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  if (!['director', 'admin'].includes(user.role)) return sendJson(res, 403, { error: 'เฉพาะผู้อำนวยการเท่านั้น' });
  const log = db.dutyLogs.get(ctx.params.id);
  if (!log) return sendJson(res, 404, { error: 'ไม่พบรายการ' });
  const body = await readBody(req);
  db.dutyLogs.update(log.id, {
    directorNote: body.note || '', directorSignature: body.signature || null, directorSignedAt: new Date().toISOString()
  });
  sendJson(res, 200, { ok: true });
};

// ขอส่งมอบเวรให้คนอื่นชั่วคราว — เฉพาะหัวหน้าเวรของวันนั้น หรือผู้มีสิทธิ์จัดการเวรครู (admin/หัวหน้าสำนักงาน/ผู้ได้รับมอบสิทธิ์)
api['POST /api/duty/coverage'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const body = await readBody(req);
  const type = db.dutyTypes.get(body.dutyTypeId);
  if (!type) return sendJson(res, 404, { error: 'ไม่พบเวร' });
  const authorized = perm.hasCapability(user, 'manage_teacher_duty') || isDutyHeadFor(user.id, type);
  if (!authorized) return sendJson(res, 403, { error: 'เฉพาะหัวหน้าเวรของวันนั้น หรือหัวหน้าสำนักงาน/แอดมิน เท่านั้นที่มอบหมายเวรแทนได้' });
  if (!body.fromDate || !body.toDate || body.fromDate > body.toDate) return sendJson(res, 400, { error: 'ช่วงวันที่ไม่ถูกต้อง' });
  if (!body.substituteUserId || body.substituteUserId === type.primaryUserId) return sendJson(res, 400, { error: 'กรุณาเลือกผู้รับมอบเวร' });
  const cov = db.dutyCoverage.insert({
    dutyTypeId: type.id, fromDate: body.fromDate, toDate: body.toDate,
    originalUserId: type.primaryUserId, requestedBy: user.id, substituteUserId: body.substituteUserId, status: 'pending', createdAt: new Date().toISOString()
  });
  notify(body.substituteUserId, null, `${user.fullName} ขอให้คุณรับเวรแทน: ${type.title} (${body.fromDate} ถึง ${body.toDate})`);
  sendJson(res, 201, cov);
};
api['POST /api/duty/coverage/:id/respond'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const cov = db.dutyCoverage.get(ctx.params.id);
  if (!cov) return sendJson(res, 404, { error: 'ไม่พบคำขอ' });
  if (cov.substituteUserId !== user.id) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์ตอบรับคำขอนี้' });
  if (cov.status !== 'pending') return sendJson(res, 400, { error: 'คำขอนี้ถูกตอบรับ/ปฏิเสธไปแล้ว' });
  const body = await readBody(req);
  const type = db.dutyTypes.get(cov.dutyTypeId);
  if (body.accept) {
    // ตรวจสอบว่า 1 วันรับได้ไม่เกิน 1 เวร (ห้ามซ้อนทับกับเวรอื่นที่ accepted อยู่แล้ว)
    const conflict = db.dutyCoverage.find(c => c.id !== cov.id && c.substituteUserId === user.id && c.status === 'accepted' && datesOverlap(c.fromDate, c.toDate, cov.fromDate, cov.toDate));
    if (conflict.length) return sendJson(res, 400, { error: 'ช่วงวันที่นี้คุณรับเวรอื่นไว้แล้ว ไม่สามารถรับซ้อนได้ (1 วันรับได้ไม่เกิน 1 เวร)' });
    db.dutyCoverage.update(cov.id, { status: 'accepted', respondedAt: new Date().toISOString() });
    notify(cov.originalUserId, null, `${user.fullName} ตอบรับส่งมอบเวรแล้ว: ${type ? type.title : '-'}`);
  } else {
    db.dutyCoverage.update(cov.id, { status: 'declined', respondedAt: new Date().toISOString() });
    notify(cov.originalUserId, null, `${user.fullName} ปฏิเสธการรับมอบเวร: ${type ? type.title : '-'}`);
  }
  sendJson(res, 200, { ok: true });
};

// มุมมองภาพรวมเวรครูสำหรับผู้มีสิทธิ์จัดการ + หัวหน้าเวรประจำวันนั้น (เพื่อเข้ามาตรวจ+ลงชื่อ) + ผอ. (เพื่อลงนามขั้นสุดท้าย)
// เปลี่ยนจากแยกแถวตามช่วงเวลา (เช้า/เที่ยง/เย็น) เป็น 1 แถวต่อ 1 เวรต่อวัน พร้อมสถานะชัดเจนว่า
// "ส่งแล้ว (submitted)" / "บันทึกร่างไว้ยังไม่ส่ง (draft)" / "ยังไม่ทำอะไรเลย (missing)" — เพื่อให้หัวหน้าเวรเห็นได้ทันทีว่าใครยังไม่ส่ง
api['GET /api/duty/oversight'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const date = ctx.query.date || todayStr();
  const isHeadOfThisDay = dutyHeadForDay(isoDayOfWeek(date))?.headUserId === user.id;
  const canView = perm.hasCapability(user, 'manage_teacher_duty') || isHeadOfThisDay || user.role === 'director' || user.role === 'admin';
  if (!canView) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์' });
  const types = db.dutyTypes.find(t => t.active !== false).filter(t => dutyActiveOnDate(t, date));
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const rows = types.map(t => {
    const ownerId = effectiveDutyOwner(t, date);
    const log = findTodayDutyLog(t.id, date);
    const status = log ? log.status || 'submitted' /* ข้อมูลเก่าก่อนอัปเดตระบบ ไม่มี status ให้ถือว่าส่งแล้ว */ : 'missing';
    return {
      id: log ? log.id : null,
      dutyTypeId: t.id, title: t.title, times: t.times || [],
      ownerName: usersById[ownerId] ? usersById[ownerId].fullName : '-',
      status, done: status === 'submitted',
      note: log ? log.note : '', ok: log ? log.ok : null, photoPaths: log ? log.photoPaths : [],
      submittedAt: log ? log.submittedAt : null, draftUpdatedAt: log ? log.draftUpdatedAt : null,
      signature: log ? log.signature : null,
      coSignerName: log && log.coSignerUserId && usersById[log.coSignerUserId] ? usersById[log.coSignerUserId].fullName : null,
      coSignature: log ? log.coSignature : null,
      reviewedBy: log && log.reviewedBy && usersById[log.reviewedBy] ? usersById[log.reviewedBy].fullName : null,
      reviewNote: log ? log.reviewNote : null, reviewSignature: log ? log.reviewSignature : null, reviewedAt: log ? log.reviewedAt : null,
      directorNote: log ? log.directorNote : null, directorSignature: log ? log.directorSignature : null, directorSignedAt: log ? log.directorSignedAt : null
    };
  });
  rows.sort((a, b) => a.title.localeCompare(b.title, 'th'));
  const missingCount = rows.filter(r => r.status === 'missing').length;
  sendJson(res, 200, {
    date, rows, isHeadOfThisDay, isDirector: user.role === 'director' || user.role === 'admin',
    missingCount, submitCutoff: DUTY_SUBMIT_CUTOFF
  });
};

// ---- บันทึกรถเข้า-ออกโรงเรียน (สำหรับยาม) — ถ่ายแล้วบันทึกทันที ไม่ต้องกรอกฟอร์ม ----
function saveBase64Photos(prefix, photos) {
  return (Array.isArray(photos) ? photos : []).map((base64, idx) => {
    const safeName = `${prefix}_${Date.now()}_${idx}.jpg`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), Buffer.from(base64.replace(/^data:.*;base64,/, ''), 'base64'));
    return '/uploads/' + safeName;
  });
}

api['POST /api/vehicles/snap'] = async (req, res, ctx, user) => {
  if (!user || !(['guard', 'admin'].includes(user.role) || perm.hasCapability(user, 'guard_duty_access'))) return sendJson(res, 403, { error: 'เฉพาะยาม (หรือผู้ได้รับสิทธิ์ช่วยเวร) เท่านั้น' });
  const body = await readBody(req); // { direction: 'in'|'out', photos: [base64...] }
  if (!['in', 'out'].includes(body.direction)) return sendJson(res, 400, { error: 'ระบุทิศทางไม่ถูกต้อง' });
  const photos = saveBase64Photos('vehicle_' + body.direction, body.photos);
  const log = db.vehicleLogs.insert({
    direction: body.direction, photos, plateNumber: '', submittedAt: new Date().toISOString(), byUserId: user.id
  });
  sendJson(res, 201, log);
};
api['PUT /api/vehicles/:id/plate'] = async (req, res, ctx, user) => {
  if (!user || !(['guard', 'admin'].includes(user.role) || perm.hasCapability(user, 'guard_duty_access'))) return sendJson(res, 403, { error: 'เฉพาะยาม (หรือผู้ได้รับสิทธิ์ช่วยเวร) เท่านั้น' });
  const v = db.vehicleLogs.get(ctx.params.id);
  if (!v) return sendJson(res, 404, { error: 'ไม่พบรายการ' });
  const body = await readBody(req);
  const updated = db.vehicleLogs.update(v.id, { plateNumber: (body.plateNumber || '').trim() });
  sendJson(res, 200, updated);
};
api['GET /api/vehicles/feed'] = async (req, res, ctx, user) => {
  if (!user || !(['guard', 'admin'].includes(user.role) || perm.hasCapability(user, 'view_guard_oversight') || perm.hasCapability(user, 'guard_duty_access'))) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์ดูรายการนี้' });
  const date = ctx.query.date || todayStr();
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const list = db.vehicleLogs.find(v => v.submittedAt && v.submittedAt.slice(0, 10) === date).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  sendJson(res, 200, { date, list: list.map(v => ({ ...v, byName: usersById[v.byUserId] ? usersById[v.byUserId].fullName : '-' })) });
};
api['GET /api/vehicles/history'] = async (req, res, ctx, user) => {
  if (!user || !perm.hasCapability(user, 'view_guard_oversight')) return sendJson(res, 403, { error: 'ไม่มีสิทธิ์ดูรายงาน' });
  const date = ctx.query.date || todayStr();
  const usersById = {}; db.users.all().forEach(u => usersById[u.id] = sanitizeUser(u));
  const list = db.vehicleLogs.find(v => v.submittedAt && v.submittedAt.slice(0, 10) === date).sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  sendJson(res, 200, list.map(v => ({ ...v, byName: usersById[v.byUserId] ? usersById[v.byUserId].fullName : '-' })));
};

// ---- Notifications ----
api['GET /api/notifications'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const list = db.notifications.find(n => n.userId === user.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
  sendJson(res, 200, list);
};
api['POST /api/notifications/:id/read'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const n = db.notifications.get(ctx.params.id);
  if (n && n.userId === user.id) db.notifications.update(n.id, { isRead: true });
  sendJson(res, 200, { ok: true });
};
api['POST /api/notifications/read-all'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  db.notifications.find(n => n.userId === user.id && !n.isRead).forEach(n => db.notifications.update(n.id, { isRead: true }));
  sendJson(res, 200, { ok: true });
};

// ---- Dashboard ----
api['GET /api/dashboard'] = async (req, res, ctx, user) => {
  if (!user) return sendJson(res, 401, {});
  const allDocs = db.documents.all().filter(d => perm.canView(user, d));
  const now = Date.now();
  const today = todayStr();
  const typesById = {}; db.documentTypes.all().forEach(t => typesById[t.id] = t);
  const overdueCount = allDocs.filter(d => d.dueDate && new Date(d.dueDate).getTime() < now && d.status !== 'completed').length;
  const completedCount = allDocs.filter(d => d.status === 'completed').length;

  const actionItems = [];
  const seen = new Set();
  function addItem(item) { if (!seen.has(item.key)) { seen.add(item.key); actionItems.push(item); } }

  // หัวหน้าสำนักงาน/ผู้ได้รับมอบสิทธิ์: เอกสารรอตรวจกรองก่อนถึง ผอ. (เฟส 9)
  if (perm.hasCapability(user, 'review_documents')) {
    db.documents.find(d => d.status === 'pending_office_review').forEach(d => {
      addItem({ key: 'office_review_' + d.id, docId: d.id, subject: d.subject, typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-', meta: 'รอตรวจกรองก่อนส่งถึง ผอ.', urgent: true, createdAt: d.createdAt });
    });
  }
  // ผู้จัดทำ: เอกสารของตนถูกตีกลับให้แก้ไข
  db.documents.find(d => d.createdBy === user.id && ['returned', 'returned_for_revision'].includes(d.status)).forEach(d => {
    addItem({ key: 'myreturn_' + d.id, docId: d.id, subject: d.subject, typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-', meta: 'เอกสารถูกตีกลับ ต้องแก้ไข', urgent: true, createdAt: d.createdAt });
  });
  // ผอ./แอดมิน: เอกสารรอเกษียน
  if (user.role === 'director' || user.role === 'admin') {
    db.documents.find(d => d.status === 'pending_director').forEach(d => {
      addItem({ key: 'endorse_' + d.id, docId: d.id, subject: d.subject, typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-', meta: 'รอท่านเกษียนหนังสือ', urgent: true, createdAt: d.createdAt });
    });
  }
  // หัวหน้าสำนักงาน/แอดมิน: เอกสารเกษียนแล้วรอส่งต่อ
  if (['office_head', 'admin'].includes(user.role) || perm.hasCapability(user, 'edit_doc_number')) {
    db.documents.find(d => d.status === 'endorsed').forEach(d => {
      addItem({ key: 'forward_' + d.id, docId: d.id, subject: d.subject, typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-', meta: 'ผอ. เกษียนแล้ว รอส่งต่องาน', urgent: true, createdAt: d.createdAt });
    });
  }
  // งานที่ได้รับมอบหมาย (ทุกคน) — งานถึง "แผนก" นับเฉพาะของหัวหน้าแผนกนั้น (ดูเหตุผลที่ canView/inbox)
  db.tasks.find(t => t.status !== 'done' && (t.assignedToUserId === user.id || (t.assignedToDeptId && perm.isDeptHeadOf(user, t.assignedToDeptId)))).forEach(t => {
    const d = db.documents.get(t.documentId);
    if (!d) return;
    addItem({ key: 'task_' + t.id, docId: d.id, subject: d.subject, typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-', meta: t.status === 'pending' ? 'งานใหม่ รอรับทราบ' : 'รอดำเนินการให้แล้วเสร็จ', urgent: t.status === 'pending', createdAt: t.createdAt });
  });
  // เวรครูวันนี้ (ยังไม่บันทึก)
  try {
    const myDutyTypes = db.dutyTypes.find(dt => dt.active !== false && effectiveDutyOwner(dt, today) === user.id);
    myDutyTypes.forEach(dt => {
      const log = findTodayDutyLog(dt.id, today);
      const notDone = !(log && log.status === 'submitted');
      if (notDone) addItem({ key: 'duty_' + dt.id, docId: null, dutyId: dt.id, subject: 'เวร: ' + dt.title, typeName: 'เวรครูวันนี้', meta: 'ยังไม่ได้ส่งเวรวันนี้', urgent: true, createdAt: new Date().toISOString() });
    });
  } catch (e) { /* ระบบเวรครูอาจยังไม่ถูกใช้งาน ข้ามไปเงียบๆ */ }
  // คำขอรับมอบเวรที่รอตอบรับ
  try {
    db.dutyCoverage.find(c => c.substituteUserId === user.id && c.status === 'pending').forEach(c => {
      const dt = db.dutyTypes.get(c.dutyTypeId);
      addItem({ key: 'coverage_' + c.id, docId: null, subject: 'คำขอรับเวรแทน: ' + (dt ? dt.title : '-'), typeName: 'เวรครู', meta: 'รอคุณตอบรับ', urgent: true, createdAt: c.createdAt });
    });
  } catch (e) {}

  actionItems.sort((a, b) => (b.urgent - a.urgent) || (new Date(a.createdAt) - new Date(b.createdAt)));

  // เฟส 9: สรุปจำนวนเอกสารแยกตามขั้นตอน เพื่อให้แดชบอร์ดแสดงรายละเอียดว่าหนังสืออยู่ขั้นตอนไหนบ้าง
  const STATUS_LABELS = {
    pending_office_review: 'รอหัวหน้าสำนักงานตรวจกรอง',
    returned_for_revision: 'ตีกลับจากหัวหน้าสำนักงาน (รอแก้ไข)',
    pending_director: 'รอ ผอ. เกษียน',
    returned: 'ตีกลับจาก ผอ. (รอแก้ไข)',
    endorsed: 'ผอ. เกษียนแล้ว รอส่งต่องาน',
    in_progress: 'กำลังดำเนินการ',
    completed: 'เสร็จสิ้น',
    rejected: 'ไม่อนุมัติ'
  };
  // ผอ. ไม่จำเป็นต้องเห็นขั้นตอนที่ยังมาไม่ถึงตัวเอง (เช่น "รอหัวหน้าสำนักงานตรวจกรอง" เป็นงานภายในของ สนง.
  // ที่ยังไม่ถูกส่งต่อมาให้ ผอ. พิจารณา) แสดงเฉพาะขั้นตอนที่เกี่ยวกับ ผอ. โดยตรงหรือหลังจากนั้น เพื่อลดความสับสน
  // ว่า "ทำไมมีงานค้างเยอะ" ทั้งที่จริงๆ ยังไม่ถึงคิวท่านเลย
  const DIRECTOR_VISIBLE_STATUSES = ['pending_director', 'returned', 'endorsed', 'in_progress', 'completed', 'rejected'];
  const visibleStatuses = user.role === 'director'
    ? Object.keys(STATUS_LABELS).filter(s => DIRECTOR_VISIBLE_STATUSES.includes(s))
    : Object.keys(STATUS_LABELS);
  const statusBreakdown = visibleStatuses.map(status => ({
    status, label: STATUS_LABELS[status],
    count: allDocs.filter(d => d.status === status).length
  }));

  // เอกสารที่ "ค้างอยู่ระหว่างดำเนินการ" นานๆ — ช่วยตอบคำถาม "ทำไมงานนี้ยังไม่เสร็จสักที ติดอะไรอยู่"
  // โดยไม่ต้องไล่เปิดทีละเอกสาร บอกด้วยว่าตอนนี้ค้างรอใคร/แผนกไหนอยู่ กดเข้าไปดู log รายละเอียดต่อได้ทันที
  let stalledItems = [];
  if (['director', 'office_head', 'admin'].includes(user.role) || perm.hasCapability(user, 'review_documents')) {
    const usersById = {}; db.users.all().forEach(u => usersById[u.id] = u);
    const deptsById = {}; db.departments.all().forEach(d => deptsById[d.id] = d);
    stalledItems = allDocs
      .filter(d => d.status === 'in_progress')
      .map(d => {
        const openTasks = db.tasks.find(t => t.documentId === d.id && t.status !== 'done');
        const waitingOn = openTasks.map(t => {
          if (t.assignedToUserId) return (usersById[t.assignedToUserId] || {}).fullName || 'ไม่ทราบชื่อ';
          if (t.assignedToDeptId) return 'แผนก' + ((deptsById[t.assignedToDeptId] || {}).name || '-');
          return null;
        }).filter(Boolean);
        // ไม่มีการเก็บ updatedAt ของเอกสารแยกไว้ต่างหาก ใช้เวลาของ history entry ล่าสุดแทน (แม่นกว่า createdAt
        // เพราะ createdAt คือตอนสร้างเอกสารครั้งแรก ไม่ใช่ตอนล่าสุดที่มีความเคลื่อนไหว)
        const docHistory = db.history.find(h => h.documentId === d.id).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const lastActivityAt = docHistory[0]?.timestamp || d.createdAt;
        return {
          docId: d.id, subject: d.subject,
          typeName: typesById[d.typeId] ? typesById[d.typeId].name : '-',
          waitingOn,
          daysSinceUpdate: Math.floor((now - new Date(lastActivityAt).getTime()) / 86400000)
        };
      })
      .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
      .slice(0, 10);
  }

  sendJson(res, 200, { total: allDocs.length, overdueCount, completedCount, actionItems: actionItems.slice(0, 15), actionCount: actionItems.length, statusBreakdown, stalledItems });
};

require('./routes-extra')(api, { db, auth, perm, sendJson, readBody, logAudit, sanitizeUser, ROOT: __dirname });

// ---------- Router ----------
function matchRoute(method, pathname) {
  for (const key of Object.keys(api)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      else if (patternParts[i] !== pathParts[i]) { ok = false; break; }
    }
    if (ok) return { handler: api[key], params };
  }
  return null;
}

async function requestHandler(req, res) {
  try {
    // อนุญาต CORS สำหรับ dev server ของ Vite (เช่น http://localhost:5173) — ตอน build จริงไฟล์ frontend จะถูกเสิร์ฟจากพอร์ตเดียวกันอยู่แล้ว จึงไม่กระทบ production
    const devOrigin = process.env.DEV_CORS_ORIGIN || 'http://localhost:5173';
    res.setHeader('Access-Control-Allow-Origin', devOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const parsed = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsed.pathname);

    if (pathname.startsWith('/uploads/')) {
      return serveStatic(req, res, pathname);
    }
    if (!pathname.startsWith('/api/')) {
      return serveStatic(req, res, pathname);
    }

    const match = matchRoute(req.method, pathname);
    if (!match) return sendJson(res, 404, { error: 'ไม่พบ endpoint' });
    const user = getCurrentUser(req);
    await match.handler(req, res, { params: match.params, query: parsed.query }, user);
  } catch (err) {
    console.error(err);
    // ตาข่ายนิรภัย: ถ้า error เกิดจาก "การเชื่อมต่อฐานข้อมูลถูกปิด" (ปกติไม่ควรเกิดขึ้นแล้วหลังแก้บั๊กจุดกู้คืนข้อมูล
    // แต่กันไว้เผื่ออนาคตมีจุดอื่นพลาดแบบเดียวกัน) ให้รีสตาร์ทเซิร์ฟเวอร์ทันทีแทนที่จะปล่อยให้ทุก request พังไปเรื่อยๆ
    // จนกว่าจะมีคนสังเกตแล้วรีสตาร์ทเอง — ต้องตั้ง NSSM/PM2 auto-restart ไว้ (ดู README) ไม่งั้นเว็บจะไม่ฟื้นเอง
    if (String(err.message || '').includes('database connection is not open')) {
      console.error('*** ตรวจพบฐานข้อมูลถูกปิดกลางคัน กำลังรีสตาร์ทเซิร์ฟเวอร์อัตโนมัติ... ***');
      sendJson(res, 503, { error: 'เซิร์ฟเวอร์กำลังรีสตาร์ท กรุณารอสักครู่แล้วลองใหม่' });
      setTimeout(() => process.exit(1), 500);
      return;
    }
    sendJson(res, 500, { error: 'เกิดข้อผิดพลาดภายในระบบ', detail: String(err.message || err) });
  }
}

// เฟส 9: รองรับ HTTPS โดยตรง ถ้าตั้งค่าไฟล์ใบรับรองไว้ใน .env (จำเป็นสำหรับ PWA push notification บนโดเมนจริง)
// ถ้าไม่ได้ตั้งค่า จะรันเป็น HTTP ตามปกติเหมือนเดิม (ใช้ reverse proxy ทำ HTTPS แทนก็ได้ เช่น IIS/Nginx/Caddy อยู่หน้าเว็บนี้อีกที)
const https = require('https');
let server;
if (process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH && fs.existsSync(process.env.SSL_CERT_PATH) && fs.existsSync(process.env.SSL_KEY_PATH)) {
  const options = {
    cert: fs.readFileSync(process.env.SSL_CERT_PATH),
    key: fs.readFileSync(process.env.SSL_KEY_PATH),
    ca: process.env.SSL_CA_PATH && fs.existsSync(process.env.SSL_CA_PATH) ? fs.readFileSync(process.env.SSL_CA_PATH) : undefined
  };
  server = https.createServer(options, requestHandler);
  console.log('[https] พบไฟล์ใบรับรอง SSL แล้ว — รันเซิร์ฟเวอร์แบบ HTTPS');
} else {
  server = http.createServer(requestHandler);
}

server.listen(PORT, () => {
  const scheme = server instanceof https.Server ? 'https' : 'http';
  console.log(`ระบบแจ้งหนังสือออนไลน์ กำลังทำงานที่ ${scheme}://localhost:${PORT}`);
});
