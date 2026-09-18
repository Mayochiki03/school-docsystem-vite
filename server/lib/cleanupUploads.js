// server/lib/cleanupUploads.js
// ลบไฟล์กำพร้าในโฟลเดอร์ uploads/ — เกิดจากฟิลด์ "แนบไฟล์เอกสาร" ที่เรียก /api/uploads/convert-preview
// อัปโหลด+แปลงไฟล์ทันทีตอนเลือกไฟล์ (ก่อนกดบันทึกฟอร์มจริง — ดูเหตุผลใน server.js) ถ้าผู้ใช้เลือกไฟล์แล้ว
// ปิดหน้าทิ้ง/ไม่กดบันทึกต่อ ไฟล์ที่อัปโหลด+แปลงไปแล้ว (อาจใหญ่หลาย MB ถ้าเป็นไฟล์รวมหลายร้อยหน้า) จะค้างอยู่
// ในดิสก์ตลอดไปโดยไม่มีอะไรอ้างอิงถึง ฟังก์ชันนี้ไล่ลบไฟล์ที่ไม่มีการอ้างอิงจริงและเก่าเกินเกณฑ์เวลาที่กำหนด
const fs = require('fs');
const path = require('path');

const ORPHAN_AGE_MS = 6 * 60 * 60 * 1000; // ลบเฉพาะไฟล์ที่แก่กว่า 6 ชั่วโมง กันลบไฟล์ที่กำลังอยู่ระหว่างใช้งานอยู่พอดี

function cleanupOrphanUploads(db, UPLOAD_DIR) {
  let files;
  try { files = fs.readdirSync(UPLOAD_DIR); } catch { return; } // ยังไม่มีโฟลเดอร์ (เพิ่งติดตั้งใหม่) ข้ามไป

  // รวบรวมชื่อไฟล์ทั้งหมดที่ "มีการอ้างอิงจริง" จากไฟล์แนบทั่วไป และจากฟิลด์ "แนบไฟล์เอกสาร" ในทุกเอกสาร
  const referenced = new Set();
  const addRef = (p) => { if (typeof p === 'string' && p.startsWith('/uploads/')) referenced.add(path.basename(p)); };

  (db.attachments.all() || []).forEach(a => addRef(a.filePath));
  (db.documents.all() || []).forEach(doc => {
    Object.values(doc.fields || {}).forEach(val => {
      if (val && typeof val === 'object') { addRef(val.filePath); addRef(val.pdfPath); }
    });
  });

  const now = Date.now();
  let removed = 0;
  files.forEach(name => {
    if (referenced.has(name)) return;
    const fullPath = path.join(UPLOAD_DIR, name);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return;
      if (now - stat.mtimeMs < ORPHAN_AGE_MS) return; // ยังใหม่อยู่ เผื่อกำลังอยู่ระหว่างขั้นตอนบันทึกฟอร์ม
      fs.unlinkSync(fullPath);
      removed++;
    } catch { /* ไฟล์ถูกลบไปแล้วระหว่างทาง หรือเข้าถึงไม่ได้ — ข้ามไปเฉยๆ */ }
  });
  if (removed > 0) console.log(`[cleanupUploads] ลบไฟล์กำพร้าที่ไม่มีการอ้างอิงแล้ว ${removed} ไฟล์`);
}

function scheduleUploadCleanup(db, UPLOAD_DIR) {
  // รันครั้งแรกหลังสตาร์ท 2 นาที (เผื่อให้ระบบอื่นพร้อมก่อน) แล้วรันซ้ำทุก 6 ชั่วโมง
  setTimeout(() => cleanupOrphanUploads(db, UPLOAD_DIR), 2 * 60 * 1000).unref();
  setInterval(() => cleanupOrphanUploads(db, UPLOAD_DIR), 6 * 60 * 60 * 1000).unref();
}

module.exports = { cleanupOrphanUploads, scheduleUploadCleanup };
