// lib/push.js
// ส่ง Push Notification จริงไปยังเบราว์เซอร์/มือถือของผู้ใช้ (PWA) ผ่านมาตรฐาน Web Push
// ทำงานเฉพาะเมื่อตั้งค่า VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ใน .env แล้วเท่านั้น
// สร้างคีย์ได้ด้วยคำสั่ง: node scripts/generate-vapid-keys.js
const webpush = require('web-push');

let configured = false;

function isConfigured() {
  return configured;
}

// web-push บังคับว่า subject ต้องขึ้นต้นด้วย "mailto:" หรือ "https:" เท่านั้น (เป็น URL ที่ถูกต้อง)
// ถ้าใส่แค่อีเมลเฉยๆ (ไม่มี mailto: นำหน้า) ฟังก์ชัน setVapidDetails จะโยน error ทันที
// จุดนี้เคยเป็นบั๊กร้ายแรง: ถ้า error หลุดออกไปโดยไม่มี try/catch จะทำให้ทั้งเซิร์ฟเวอร์ล่มตั้งแต่ตอนเริ่มต้น
// แก้โดยเติม "mailto:" ให้อัตโนมัติถ้าลืมใส่ และครอบ try/catch กันพังทั้งระบบ
function normalizeSubject(subject) {
  if (!subject) return 'mailto:admin@example.com';
  if (subject.startsWith('mailto:') || subject.startsWith('https:') || subject.startsWith('http:')) return subject;
  return 'mailto:' + subject;
}

try {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      normalizeSubject(process.env.VAPID_SUBJECT),
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    configured = true;
  }
} catch (e) {
  console.error('[push] ตั้งค่า VAPID ไม่สำเร็จ (Push Notification จะใช้งานไม่ได้ แต่ระบบส่วนอื่นทำงานปกติ):', e.message);
  configured = false;
}

// ส่ง push ให้ผู้ใช้ 1 คน (ทุกอุปกรณ์ที่เคยกด "เปิดการแจ้งเตือน" ไว้) — ล้มเหลวเงียบๆ ถ้ายังไม่ตั้งค่า
async function sendPushToUser(db, userId, payload) {
  if (!isConfigured()) return;
  const subs = db.pushSubscriptions.find(s => s.userId === userId);
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
    } catch (e) {
      // subscription หมดอายุ/ถูกเพิกถอน -> ลบทิ้ง
      if (e.statusCode === 404 || e.statusCode === 410) db.pushSubscriptions.remove(sub.id);
    }
  }
}

module.exports = { isConfigured, sendPushToUser, getPublicKey: () => process.env.VAPID_PUBLIC_KEY || '' };
