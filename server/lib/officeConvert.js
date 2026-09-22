// server/lib/officeConvert.js
// แปลงไฟล์ Word (.doc/.docx/.odt/.rtf) เป็น PDF ด้วย LibreOffice headless ฝั่งเซิร์ฟเวอร์ ใช้กับฟิลด์ชนิด
// "fileContent" (แนบไฟล์ให้แสดงตัวอย่างในระบบ) — เหตุผลที่แปลงเป็น PDF แทนที่จะแสดง .docx ตรงๆ ในเบราว์เซอร์:
//   1. เบราว์เซอร์ไม่มีตัว render .docx ในตัว (ต่างจาก .pdf ที่ render ได้เกือบทุกเบราว์เซอร์/มือถือ)
//   2. ฟอนต์ในเครื่องแต่ละคนไม่เหมือนกัน — ถ้าปล่อยให้เบราว์เซอร์ผู้อ่านเป็นคน render เอกสารจะหน้าตาไม่เหมือนต้นฉบับ
//      (โดยเฉพาะฟอนต์ไทยที่มักไม่มีติดเครื่อง) การแปลงเป็น PDF ที่เซิร์ฟเวอร์ทำให้ "หน้าตาเอกสารคงที่" สำหรับทุกคน
//      ที่เปิดดู ไม่ว่าจะเปิดจากอุปกรณ์ไหนก็ตาม ขอแค่เซิร์ฟเวอร์มีฟอนต์ที่ถูกต้องติดตั้งไว้ตอนแปลง (ดู README หัวข้อ
//      "ฟอนต์สำหรับแปลงเอกสาร" — ต้องติดตั้งฟอนต์ไทยราชการ เช่น TH Sarabun New ไว้ที่เครื่อง/เซิร์ฟเวอร์ที่รันตัวนี้)
//
// หมายเหตุประวัติ (v2.6.2 -> v2.6.3): เคยลองยัด HOME/USERPROFILE/TEMP/TMP ให้ชี้ไปที่โฟลเดอร์ที่ควบคุมเอง
// (server/.lo-home) เพื่อแก้ปัญหา LibreOffice ค้างตอนรันเป็น Windows Service — แต่กลับทำให้กรณีที่เคยใช้ได้ปกติ
// (รันตรงจาก terminal ทั้งบนเครื่อง dev และบางเครื่อง) พังไปด้วย น่าจะเป็นเพราะ TEMP ที่ถูกบังคับให้ชี้ไปที่
// เดียวกับโฟลเดอร์โปรไฟล์ (UserInstallation) ทำให้ไฟล์ชั่วคราวของ LibreOffice ชนกับไฟล์โปรไฟล์เอง — ย้อนกลับมาใช้
// วิธีเดิมที่พิสูจน์แล้วว่าใช้ได้ (ปล่อย TEMP/TMP/HOME ตามค่าเดิมของระบบ ไม่ไปยุ่ง) คงไว้แค่ส่วนที่ไม่มีความเสี่ยง
// (windowsHide, ข้อความ error ที่อธิบายเหตุผลชัดเจนขึ้น) ถ้าเจอปัญหาค้างตอนรันเป็น Windows Service อีก ให้แก้ที่
// ตัว Windows Service โดยตรงตามขั้นตอนใน README หัวข้อ Troubleshooting แทนการแก้ที่โค้ด เพราะเป็นปัญหาระดับ
// การตั้งค่า service ไม่ใช่โค้ด — ยิ่งพยายาม "เดา" วิธีแก้ในโค้ดเพิ่ม ยิ่งเสี่ยงทำเคสที่ใช้ได้อยู่แล้วพังไปด้วย
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

// แปลง path ธรรมดาให้เป็น file:// URI ที่ถูกต้องตามมาตรฐาน — สำคัญมาก: ค่า -env:UserInstallation=file://...
// ถูก LibreOffice แปลความเป็น "URI" จริงๆ ไม่ใช่แค่ข้อความ path เฉยๆ และ URI ตามมาตรฐานห้ามมีช่องว่างดิบๆ
// (ต้องเข้ารหัสเป็น %20) ถ้าพาธมีช่องว่าง (เช่น ชื่อโฟลเดอร์โปรเจกต์ที่ลงท้ายด้วย "(2)" แบบที่เบราว์เซอร์ตั้งให้
// อัตโนมัติตอนดาวน์โหลดไฟล์ซ้ำชื่อ, หรือ Windows user profile ที่มีช่องว่างในชื่อ เช่น "C:\Users\School Admin\...")
// LibreOffice จะแปลง URI ไม่ผ่านแล้วหาโฟลเดอร์โปรไฟล์ไม่เจอ พังแบบไม่มี error ที่ชี้สาเหตุชัดเจน (เจอจริงจาก
// รายงานของผู้ใช้ที่ path โปรเจกต์มีช่องว่างอยู่พอดี)
function pathToFileUri(p) {
  const encoded = p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  // encodeURIComponent เผลอเข้ารหัส ':' ของชื่อไดรฟ์ (เช่น "D:" -> "D%3A") ไปด้วย ต้องคืนกลับเป็น ':' ปกติ
  // (ปลอดภัยที่จะแทนที่ทั้งหมดแบบ global เพราะ ':' เป็นอักขระต้องห้ามในชื่อไฟล์/โฟลเดอร์ของ Windows อยู่แล้ว
  // จึงไม่มีทางเจอ ':' จริงๆ จากชื่อโฟลเดอร์มาปนกับของชื่อไดรฟ์)
  return 'file:///' + encoded.replace(/%3A/gi, ':');
}

function runSoffice(args, profileDir, timeoutMs) {
  return execFileSync(SOFFICE, [
    '--headless', '--norestore', '--nolockcheck', '--nodefault', '--nologo',
    // file:// ต้องเป็น URI ที่เข้ารหัสถูกต้อง (ดู pathToFileUri ด้านบน) — ช่องว่างดิบๆ ในพาธทำให้ LibreOffice
    // แปลง URI ไม่ผ่านแล้วหาโฟลเดอร์โปรไฟล์ไม่เจอ (พังไม่ชัดเจน แก้จากการทดสอบจริงบน Windows)
    `-env:UserInstallation=${pathToFileUri(profileDir)}`,
    ...args,
  ], {
    timeout: timeoutMs,
    stdio: 'pipe',
    windowsHide: true, // กันหน้าต่าง console ผุดขึ้นมาตอนรันเป็น service/บน Windows — ไม่มีผลต่อการแปลงไฟล์
  });
}

// แปลงไฟล์ -> PDF คืนค่า path เต็มของ PDF ที่ได้ (โยน error ถ้าแปลงไม่สำเร็จ ให้ผู้เรียก catch เอง)
function convertToPdf(inputPath, outDir) {
  // ใช้โฟลเดอร์ user-profile แยกต่างหากทุกครั้งที่แปลง (-env:UserInstallation) — กัน LibreOffice ล็อกโปรไฟล์กลาง
  // ชนกันเวลามีคนแนบไฟล์พร้อมกันหลายคนในเวลาใกล้ๆ กัน (ปัญหาคลาสสิกของการรัน soffice --headless ซ้อนกัน)
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-profile-'));
  try {
    runSoffice(
      ['--convert-to', 'pdf', '--outdir', outDir, inputPath],
      profileDir,
      // 180 วินาที (ไม่ใช่ 45 วินาทีแบบเดิม) — ไฟล์รวมหลายร้อยหน้า (เช่น รวมคำสั่งทั้งปีไว้ไฟล์เดียว 200-400 หน้า)
      // ใช้เวลาแปลงนานกว่าเอกสารสั้นๆ มาก ค่าเดิม 45 วินาทีตัดจบเร็วเกินไปสำหรับเคสนี้
      180000
    );
  } catch (e) {
    throw enrichTimeoutError(e);
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  const base = path.basename(inputPath, path.extname(inputPath));
  const outPath = path.join(outDir, base + '.pdf');
  if (!fs.existsSync(outPath)) throw new Error('LibreOffice แปลงไฟล์ไม่สำเร็จ (ไม่พบไฟล์ PDF ผลลัพธ์หลังแปลง)');
  return outPath;
}

// เติมคำอธิบายที่ช่วยวินิจฉัยได้จริง เวลาเจอ ETIMEDOUT (อาการเฉพาะของ "รันเป็น Windows Service แล้ว soffice ค้าง")
function enrichTimeoutError(e) {
  if (e && e.code === 'ETIMEDOUT') {
    e.message += ' — ถ้าใช้งานได้ปกติตอนรัน node server.js ตรงๆ จาก terminal แต่พังหลัง deploy เป็น ' +
      'Windows Service (NSSM) ดูวิธีแก้ที่ README หัวข้อ Troubleshooting > LibreOffice ค้างตอนรันเป็น Windows Service ' +
      '(เป็นปัญหาที่ต้องแก้ที่การตั้งค่า service โดยตรง ไม่ใช่แก้ที่โค้ด)';
  }
  return e;
}

// เช็คว่าเซิร์ฟเวอร์นี้มี LibreOffice ใช้งานได้จริงไหม — เรียกตอนสตาร์ทเซิร์ฟเวอร์เพื่อเตือนแอดมินถ้ายังไม่ได้ติดตั้ง
function isConversionAvailable() {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-check-'));
  try {
    runSoffice(['--version'], profileDir, 15000);
    return true;
  } catch (e) {
    console.error('[officeConvert] เช็ค LibreOffice ไม่ผ่าน:', e.code || '', e.message);
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
