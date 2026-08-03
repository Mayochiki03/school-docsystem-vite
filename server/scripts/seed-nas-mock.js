// scripts/seed-nas-mock.js
// สร้างโฟลเดอร์สำรองข้อมูลปลอม (มีแค่ไฟล์ marker ข้างใน ไม่ใช่ข้อมูลจริง) ไว้ทดสอบฟีเจอร์
// "ลบชุดสำรองที่เก่ากว่า 1 ปี" บน NAS โดยเฉพาะ — ใช้สำหรับทดสอบเท่านั้น ไม่ควรรันบนระบบจริงที่ใช้งานอยู่
//
// วิธีใช้:
//   set NAS_BACKUP_PATH=Z:\school-docsystem-backups   (หรือ path ทดสอบใดๆ)
//   node scripts/seed-nas-mock.js
//
// จะสร้างชุดสำรองปลอมทั้งที่ "เก่ากว่า 1 ปี" (ต้องลบได้) และ "ใหม่กว่า 1 ปี" (ต้องลบไม่ได้)
// อย่างละ 3 ชุด กระจายกันคนละเดือน เพื่อให้เห็นการจัดกลุ่มรายเดือน/รายปีในหน้า "สำรองข้อมูล" ชัดเจน

const fs = require('fs');
const path = require('path');

const nasPath = process.env.NAS_BACKUP_PATH;
if (!nasPath) {
  console.error('กรุณาตั้งค่า NAS_BACKUP_PATH ก่อนรันสคริปต์นี้ เช่น: set NAS_BACKUP_PATH=Z:\\test-nas');
  process.exit(1);
}
fs.mkdirSync(nasPath, { recursive: true });

function pad(n) { return String(n).padStart(2, '0'); }
function nameFor(date) {
  return `backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function makeFakeBackup(date) {
  const name = nameFor(date);
  const dir = path.join(nasPath, name);
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'MOCK_DATA.txt'), `ชุดสำรองปลอมสำหรับทดสอบ สร้างเมื่อ ${date.toISOString()}\n`);
  return name;
}

const now = new Date();
const created = [];

// 3 ชุด เก่ากว่า 1 ปี (ลบได้) — กระจายคนละเดือน ย้อนหลัง 13, 15, 20 เดือน
[13, 15, 20].forEach(monthsAgo => {
  const d = new Date(now); d.setMonth(d.getMonth() - monthsAgo);
  created.push({ name: makeFakeBackup(d), age: `${monthsAgo} เดือนที่แล้ว (ควรลบได้)` });
});

// 3 ชุด ใหม่กว่า 1 ปี (ลบไม่ได้) — ย้อนหลัง 1, 3, 6 เดือน
[1, 3, 6].forEach(monthsAgo => {
  const d = new Date(now); d.setMonth(d.getMonth() - monthsAgo);
  created.push({ name: makeFakeBackup(d), age: `${monthsAgo} เดือนที่แล้ว (ลบไม่ได้)` });
});

console.log(`สร้างชุดสำรองปลอมสำเร็จที่ ${nasPath}:`);
created.forEach(c => console.log(`  - ${c.name}  [${c.age}]`));
console.log('\nเข้าไปดูผลได้ที่หน้า "สำรองข้อมูล" ในระบบ (ต้องล็อกอินเป็นแอดมิน/หัวหน้าสำนักงาน)');
