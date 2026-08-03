// scripts/backup.js
// สำรองข้อมูล (โฟลเดอร์ data/ และ uploads/) แบบไม่พึ่งพา library ภายนอก
// ใช้ได้ทั้งเรียกตรงๆ (node scripts/backup.js) และ require มาเรียกจาก server.js เพื่อรันตามกำหนดเวลา

const fs = require('fs');
const path = require('path');
const { syncLatestToNas } = require('./sync-to-nas');
const mailer = require('../lib/mailer');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const BACKUP_ROOT = path.join(ROOT, 'backups');
const KEEP_LAST_N = parseInt(process.env.BACKUP_KEEP || '60', 10); // เก็บย้อนหลังกี่ชุดบนเครื่องนี้ (ค่าเริ่มต้น 60 วัน — นับเฉพาะจำนวนครั้งที่สำรอง ถ้ากด "สำรองตอนนี้" เองบ่อยๆ ในวันเดียวจะหมดอายุเร็วกว่า 60 วันจริง) ตัวเลขนี้ไม่เกี่ยวกับ NAS เลย ฝั่ง NAS เก็บแยกต่างหากไม่ถูกลบตามนี้

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function pruneOldBackups() {
  if (!fs.existsSync(BACKUP_ROOT)) return;
  const entries = fs.readdirSync(BACKUP_ROOT)
    .filter(name => name.startsWith('backup-'))
    .map(name => ({ name, full: path.join(BACKUP_ROOT, name), time: fs.statSync(path.join(BACKUP_ROOT, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  const toRemove = entries.slice(KEEP_LAST_N);
  for (const e of toRemove) {
    fs.rmSync(e.full, { recursive: true, force: true });
  }
  return { kept: entries.length - toRemove.length, removed: toRemove.length };
}

function runBackup() {
  const name = `backup-${timestamp()}`;
  const dest = path.join(BACKUP_ROOT, name);
  fs.mkdirSync(dest, { recursive: true });
  // ทำ WAL checkpoint ก่อนคัดลอกไฟล์ฐานข้อมูล เพื่อให้ database.db มีข้อมูลล่าสุดครบถ้วน (ไม่พึ่งพาไฟล์ .db-wal ที่อาจยังไม่ถูกรวม)
  try {
    const db = require('../db/sqliteStore');
    db._raw.pragma('wal_checkpoint(FULL)');
  } catch (e) { /* ถ้า db ยังไม่ถูกเรียกใช้งาน ก็ข้ามได้ ไม่กระทบ */ }
  copyRecursive(DATA_DIR, path.join(dest, 'data'));
  copyRecursive(UPLOAD_DIR, path.join(dest, 'uploads'));
  const pruneResult = pruneOldBackups();
  let nasNote = '';
  const nasResult = syncLatestToNas(dest);
  if (!nasResult.skipped) {
    nasNote = nasResult.error ? ` | ซิงค์ขึ้น NAS ล้มเหลว: ${nasResult.error}` : ` | ซิงค์ขึ้น NAS สำเร็จ -> ${nasResult.dest}`;
  }
  const log = `[${new Date().toISOString()}] สำรองข้อมูลสำเร็จ -> ${dest} (เก็บไว้ ${pruneResult ? pruneResult.kept : 1} ชุด, ลบของเก่า ${pruneResult ? pruneResult.removed : 0} ชุด)${nasNote}\n`;
  fs.mkdirSync(BACKUP_ROOT, { recursive: true });
  fs.appendFileSync(path.join(BACKUP_ROOT, 'backup.log'), log);
  return { dest, log };
}

// ตั้งเวลาให้รันสำรองข้อมูลอัตโนมัติทุกวันเวลาที่กำหนด (ค่าเริ่มต้น 02:00 น.)
function scheduleDailyBackup(hour) {
  hour = typeof hour === 'number' ? hour : parseInt(process.env.BACKUP_HOUR || '2', 10);
  function msUntilNextRun(h, m) {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m || 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.getTime() - now.getTime();
  }
  function scheduleNext() {
    const wait = msUntilNextRun(hour, 0);
    setTimeout(() => {
      try { runBackup(); } catch (e) { console.error('สำรองข้อมูลล้มเหลว:', e.message); }
      scheduleNext();
    }, wait);
  }
  scheduleNext();

  // เฟส 9: หลังสำรองข้อมูลตอนตี 2 ให้ทำรายงานผลส่งอีเมล + สั่งรีสตาร์ทพอร์ตเว็บ 1 รอบตอนตี 3 (ปรับเวลาได้ด้วย env RESTART_HOUR)
  // การรีสตาร์ทจริงต้องพึ่งพา process manager ภายนอก (เช่น nssm/PM2 ตั้ง auto-restart ไว้) — ดูรายละเอียดใน README
  const restartEnabled = process.env.NIGHTLY_RESTART_ENABLED !== 'false';
  if (restartEnabled) {
    const restartHour = parseInt(process.env.RESTART_HOUR || String(hour + 1), 10);
    function scheduleReportAndRestart() {
      const wait = msUntilNextRun(restartHour, 0);
      setTimeout(async () => {
        try { await sendNightlyReportAndRestart(); } catch (e) { console.error('ส่งรายงาน/รีสตาร์ทล้มเหลว:', e.message); }
        scheduleReportAndRestart();
      }, wait);
    }
    scheduleReportAndRestart();
  }
}

// แกะรายละเอียดจากบรรทัด log ดิบๆ ให้ออกมาเป็นข้อมูลที่จัดเรียงเป็นตารางได้ อ่านง่ายกว่าโยนทั้งบรรทัดลงอีเมลตรงๆ
function parseBackupLogLine(line) {
  const timeMatch = line.match(/^\[(.*?)\]/);
  const destMatch = line.match(/-> (\S+) \(เก็บไว้/);
  const keepMatch = line.match(/เก็บไว้ (\d+) ชุด, ลบของเก่า (\d+) ชุด/);
  const nasOkMatch = line.match(/ซิงค์ขึ้น NAS สำเร็จ -> (\S+)/);
  const nasFailMatch = line.match(/ซิงค์ขึ้น NAS ล้มเหลว: (.+)$/);
  return {
    time: timeMatch ? new Date(timeMatch[1]).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-',
    dest: destMatch ? destMatch[1] : '-',
    kept: keepMatch ? keepMatch[1] : '-',
    removed: keepMatch ? keepMatch[2] : '-',
    nasStatus: nasOkMatch ? { ok: true, path: nasOkMatch[1] } : nasFailMatch ? { ok: false, reason: nasFailMatch[1] } : null
  };
}

function emailLayout({ statusColor, statusText, bodyRowsHtml, footerNote }) {
  return `
<div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f4f6f8; padding: 24px;">
  <div style="background: linear-gradient(135deg, #1e5f8c, #123c5c); border-radius: 12px 12px 0 0; padding: 20px 24px;">
    <p style="margin: 0; color: #fff; font-size: 13px; opacity: 0.85; letter-spacing: 0.5px;">SNKDocSystem</p>
    <h2 style="margin: 4px 0 0; color: #fff; font-size: 18px; font-weight: 600;">รายงานสำรองข้อมูลประจำคืน</h2>
  </div>
  <div style="background: #fff; padding: 4px 24px 20px;">
    <div style="display: inline-block; margin: 16px 0 8px; padding: 4px 12px; border-radius: 999px; background: ${statusColor}20; color: ${statusColor}; font-size: 13px; font-weight: 600;">
      ${statusText}
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
      ${bodyRowsHtml}
    </table>
  </div>
  <div style="background: #eef1f4; border-radius: 0 0 12px 12px; padding: 12px 24px;">
    <p style="margin: 0; font-size: 12px; color: #8a94a0;">${footerNote}</p>
  </div>
</div>`;
}

function row(label, value) {
  return `<tr>
    <td style="padding: 8px 0; font-size: 13px; color: #6b7684; width: 40%; vertical-align: top;">${label}</td>
    <td style="padding: 8px 0; font-size: 13px; color: #1f2937; font-weight: 500; vertical-align: top;">${value}</td>
  </tr>`;
}

async function sendNightlyReportAndRestart() {
  const db = require('../db/sqliteStore');
  const logPath = path.join(BACKUP_ROOT, 'backup.log');
  let lastLine = '';
  if (fs.existsSync(logPath)) {
    const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
    lastLine = lines[lines.length - 1] || '';
  }
  const parsed = lastLine ? parseBackupLogLine(lastLine) : null;
  const docCount = db.documents.all().length;
  const nasConfigured = !!process.env.NAS_BACKUP_PATH;
  const to = process.env.BACKUP_REPORT_EMAIL || 'ahisorn.s@srinakorn.ac.th';

  const backupOk = !!parsed;
  const nasOk = parsed?.nasStatus ? parsed.nasStatus.ok : null;
  const overallOk = backupOk && nasOk !== false;

  let nasRowValue;
  if (!nasConfigured) nasRowValue = '<span style="color:#b45309;">ยังไม่ได้ตั้งค่า NAS_BACKUP_PATH</span>';
  else if (parsed?.nasStatus?.ok) nasRowValue = `<span style="color:#16a34a;">สำเร็จ</span> — ${parsed.nasStatus.path}`;
  else if (parsed?.nasStatus && !parsed.nasStatus.ok) nasRowValue = `<span style="color:#dc2626;">ล้มเหลว</span> — ${parsed.nasStatus.reason}`;
  else nasRowValue = '-';

  const bodyRowsHtml = [
    row('เวลาสำรองข้อมูลล่าสุด', parsed ? parsed.time : 'ไม่พบข้อมูล'),
    row('ตำแหน่งไฟล์สำรอง', parsed ? parsed.dest : '-'),
    row('เก็บไว้ / ลบของเก่า', parsed ? `${parsed.kept} ชุด / ${parsed.removed} ชุด` : '-'),
    row('สถานะซิงค์ขึ้น NAS', nasRowValue),
    row('จำนวนเอกสารในระบบ', `${docCount.toLocaleString('th-TH')} ฉบับ`),
  ].join('');

  const html = emailLayout({
    statusColor: overallOk ? '#16a34a' : '#dc2626',
    statusText: overallOk ? '✓ สำรองข้อมูลสำเร็จ' : '⚠ พบปัญหาในการสำรองข้อมูล',
    bodyRowsHtml,
    footerNote: 'ระบบกำลังจะรีสตาร์ทพอร์ตเว็บ 1 รอบตามกำหนดเวลา (ปกติของระบบ ไม่ใช่ข้อผิดพลาด) — อีเมลนี้ส่งอัตโนมัติทุกคืน ไม่ต้องตอบกลับ'
  });

  const mailResult = await mailer.sendBackupReport({ to, subject: `${overallOk ? '✓' : '⚠'} รายงานสำรองข้อมูลประจำคืน - SNKDocSystem`, html });
  fs.appendFileSync(path.join(BACKUP_ROOT, 'backup.log'),
    `[${new Date().toISOString()}] รายงานอีเมล: ${mailResult.skipped ? 'ข้าม (' + mailResult.reason + ')' : (mailResult.ok ? 'ส่งสำเร็จ' : 'ส่งล้มเหลว: ' + mailResult.error)} | กำลังรีสตาร์ทพอร์ตเว็บ\n`);
  // ให้ process manager (nssm/PM2) เป็นผู้ relaunch โดยตั้ง auto-restart ไว้ — ระบบแค่ออกจากโปรเซสอย่างสุภาพ
  setTimeout(() => process.exit(0), 1000);
}

if (require.main === module) {
  const result = runBackup();
  console.log(result.log.trim());
}

module.exports = { runBackup, scheduleDailyBackup, sendNightlyReportAndRestart, BACKUP_ROOT };
