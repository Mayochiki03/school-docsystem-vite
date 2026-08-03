// lib/mailer.js
// ส่งอีเมลรายงานผลการสำรองข้อมูล — ทำงานเฉพาะเมื่อตั้งค่า SMTP ไว้ใน .env เท่านั้น
// ถ้ายังไม่ได้ตั้งค่า จะข้ามไปเงียบๆ (ไม่ทำให้ระบบพัง) แล้วบันทึกลง log แทน
const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransport() {
  if (!isConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendBackupReport({ to, subject, html }) {
  const transport = getTransport();
  if (!transport) {
    return { skipped: true, reason: 'ยังไม่ได้ตั้งค่า SMTP_HOST/SMTP_USER/SMTP_PASS ใน .env จึงข้ามการส่งอีเมล' };
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    await transport.sendMail({ from, to: to || process.env.BACKUP_REPORT_EMAIL, subject, html });
    return { skipped: false, ok: true };
  } catch (e) {
    return { skipped: false, ok: false, error: e.message };
  }
}

module.exports = { sendBackupReport, isConfigured };
