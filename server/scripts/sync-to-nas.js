// scripts/sync-to-nas.js
// สำเนาโฟลเดอร์ backups/ ไปยัง NAS เพิ่มอีกชุด (เป็นสำเนาที่ 3 นอกเหนือจากเครื่อง server + Google Drive)
// เป็นฟีเจอร์ทางเลือก (opt-in) — ทำงานเฉพาะเมื่อตั้งค่า environment variable NAS_BACKUP_PATH ไว้เท่านั้น
// ถ้าไม่ได้ตั้งค่าไว้ สคริปต์นี้จะไม่ทำอะไรเลย ปลอดภัยต่อระบบเดิม 100%
//
// วิธีใช้งาน:
//   1. Map NAS เป็น network drive บน Windows (เช่น Z:) หรือใช้ UNC path ตรงๆ (เช่น \\192.168.3.12\backups)
//   2. ตั้งค่า NAS_BACKUP_PATH ก่อนรันเซิร์ฟเวอร์ เช่น:
//      set NAS_BACKUP_PATH=Z:\school-docsystem-backups
//      node server.js
//   3. ระบบจะคัดลอกโฟลเดอร์ backups/ ล่าสุดไปไว้ที่ NAS ให้อัตโนมัติหลังสำรองข้อมูลทุกครั้ง

const fs = require('fs');
const path = require('path');

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

// ซิงค์โฟลเดอร์ backup ล่าสุด (โฟลเดอร์เดียว ที่เพิ่งสร้างจาก scripts/backup.js) ไปยัง NAS
function syncLatestToNas(latestBackupDir) {
  const nasPath = process.env.NAS_BACKUP_PATH;
  if (!nasPath) return { skipped: true, reason: 'ไม่ได้ตั้งค่า NAS_BACKUP_PATH จึงข้ามการซิงค์ขึ้น NAS' };
  try {
    const destName = path.basename(latestBackupDir);
    const dest = path.join(nasPath, destName);
    copyRecursive(latestBackupDir, dest);
    return { skipped: false, dest };
  } catch (e) {
    return { skipped: false, error: e.message };
  }
}

module.exports = { syncLatestToNas };
