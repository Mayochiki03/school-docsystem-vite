// scripts/generate-vapid-keys.js
// รันครั้งเดียวตอนติดตั้งระบบ: node scripts/generate-vapid-keys.js
// แล้วคัดลอกค่าที่ได้ไปใส่ในไฟล์ .env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('เพิ่มบรรทัดต่อไปนี้ลงในไฟล์ .env ของเซิร์ฟเวอร์:\n');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:admin@yourschool.ac.th`);
