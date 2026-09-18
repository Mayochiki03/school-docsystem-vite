// server/lib/officeConvert.js
// แปลงไฟล์ Word (.doc/.docx/.odt/.rtf) เป็น PDF ด้วย LibreOffice headless ฝั่งเซิร์ฟเวอร์ ใช้กับฟิลด์ชนิด
// "fileContent" (แนบไฟล์ให้แสดงตัวอย่างในระบบ) — เหตุผลที่แปลงเป็น PDF แทนที่จะแสดง .docx ตรงๆ ในเบราว์เซอร์:
//   1. เบราว์เซอร์ไม่มีตัว render .docx ในตัว (ต่างจาก .pdf ที่ render ได้เกือบทุกเบราว์เซอร์/มือถือ)
//   2. ฟอนต์ในเครื่องแต่ละคนไม่เหมือนกัน — ถ้าปล่อยให้เบราว์เซอร์ผู้อ่านเป็นคน render เอกสารจะหน้าตาไม่เหมือนต้นฉบับ
//      (โดยเฉพาะฟอนต์ไทยที่มักไม่มีติดเครื่อง) การแปลงเป็น PDF ที่เซิร์ฟเวอร์ทำให้ "หน้าตาเอกสารคงที่" สำหรับทุกคน
//      ที่เปิดดู ไม่ว่าจะเปิดจากอุปกรณ์ไหนก็ตาม ขอแค่เซิร์ฟเวอร์มีฟอนต์ที่ถูกต้องติดตั้งไว้ตอนแปลง (ดู README หัวข้อ
//      "ฟอนต์สำหรับแปลงเอกสาร" — ต้องติดตั้งฟอนต์ไทยราชการ เช่น TH Sarabun New ไว้ที่เครื่อง/เซิร์ฟเวอร์ที่รันตัวนี้)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// หา path ของ LibreOffice (soffice) ตามระบบปฏิบัติการ — เซิร์ฟเวอร์จริงของโรงเรียนน่าจะเป็น Windows (ดู README
// เรื่อง NSSM) จึงลองตำแหน่งติดตั้งปกติของ Windows ก่อน เผื่อไม่ได้เติม PATH ไว้ ถ้าอยากกำหนดเอง ตั้ง env SOFFICE_PATH
function findSoffice() {
  if (process.env.SOFFICE_PATH && fs.existsSync(process.env.SOFFICE_PATH)) return process.env.SOFFICE_PATH;
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      ]
    : ['/usr/bin/soffice', '/usr/bin/libreoffice', '/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  return candidates.find(p => fs.existsSync(p)) || 'soffice'; // สุดท้ายลองเรียกตรงๆ เผื่ออยู่ใน PATH แล้ว
}

const SOFFICE = findSoffice();

// แปลงไฟล์ -> PDF คืนค่า path เต็มของ PDF ที่ได้ (โยน error ถ้าแปลงไม่สำเร็จ ให้ผู้เรียก catch เอง)
function convertToPdf(inputPath, outDir) {
  // ใช้โฟลเดอร์ user-profile แยกต่างหากทุกครั้งที่แปลง (-env:UserInstallation) — กัน LibreOffice ล็อกโปรไฟล์กลาง
  // ชนกันเวลามีคนแนบไฟล์พร้อมกันหลายคนในเวลาใกล้ๆ กัน (ปัญหาคลาสสิกของการรัน soffice --headless ซ้อนกัน)
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-profile-'));
  try {
    execFileSync(SOFFICE, [
      '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo',
      // file:// ต้องตามด้วย / อีกตัวก่อน path บน Windows (file:///C:/...) ไม่งั้น LibreOffice จะตีความ
      // "C:" เป็นชื่อ host แทนที่จะเป็นไดรฟ์ แล้วหาโฟลเดอร์โปรไฟล์ไม่เจอ (พังไม่ชัดเจน แก้จากการทดสอบจริงบน Windows)
      `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
      '--convert-to', 'pdf', '--outdir', outDir, inputPath,
    // 180 วินาที (ไม่ใช่ 45 วินาทีแบบเดิม) — ไฟล์รวมหลายร้อยหน้า (เช่น รวมคำสั่งทั้งปีไว้ไฟล์เดียว 200-400 หน้า)
    // ใช้เวลาแปลงนานกว่าเอกสารสั้นๆ มาก ค่าเดิม 45 วินาทีตัดจบเร็วเกินไปสำหรับเคสนี้
    ], { timeout: 180000, stdio: 'pipe', windowsHide: true });
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(outDir, base + '.pdf');
  if (!fs.existsSync(outPath)) throw new Error('LibreOffice แปลงไฟล์ไม่สำเร็จ (ไม่พบไฟล์ PDF ผลลัพธ์หลังแปลง)');
  return outPath;
}

// เช็คว่าเซิร์ฟเวอร์นี้มี LibreOffice ใช้งานได้จริงไหม — เรียกตอนสตาร์ทเซิร์ฟเวอร์เพื่อเตือนแอดมินถ้ายังไม่ได้ติดตั้ง
function isConversionAvailable() {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-check-'));
  try {
    execFileSync(SOFFICE, [
      '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo',
      `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
      '--version',
    ], { timeout: 30000, stdio: 'pipe', windowsHide: true });
    return true;
  } catch (e) {
    console.error('[DEBUG] LibreOffice check failed:', e.message, e.code);
    return false;
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

// เช็คคร่าวๆ ว่ามีฟอนต์ไทยราชการ (เช่น Sarabun) ติดตั้งอยู่ในเครื่องหรือยัง — ใช้ fc-list ของ fontconfig
// (มีบน Linux/Mac เป็นปกติ แต่ Windows ไม่มีคำสั่งนี้ จึงข้ามการเช็คไปเลยบน Windows แทน ให้แอดมิน Windows
// ตรวจเองผ่าน Settings > Fonts ตามที่บอกไว้ใน server/fonts/README.md)
function hasThaiFontInstalled() {
  if (process.platform === 'win32') return null; // ไม่ทราบ — ไม่มี fc-list ให้เช็คบน Windows
  try {
    const out = execFileSync('fc-list', [], { timeout: 10000, stdio: 'pipe' }).toString();
    return /sarabun/i.test(out);
  } catch { return null; } // ไม่มี fc-list หรือรันไม่ได้ — ไม่ทราบเช่นกัน ไม่ฟันธงว่าไม่มี
}

module.exports = { convertToPdf, isConversionAvailable, hasThaiFontInstalled, SOFFICE };
