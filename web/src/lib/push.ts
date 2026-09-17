// src/lib/push.ts
import { api } from '../api/client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// เช็คสภาพแวดล้อมแบบ sync ล้วนๆ (ไม่มี await เลย) เพื่อไม่ให้กินเวลาก่อนเรียก requestPermission()
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getPushStatus(): Promise<'unsupported' | 'default' | 'granted' | 'denied' | 'subscribed'> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'default';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'subscribed' : 'granted';
}

const PUSH_ENABLED_KEY = 'snk_push_enabled';

export async function enablePush() {
  if (!isPushSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Push Notification (ต้องใช้งานผ่าน HTTPS)');

  // สำคัญมากสำหรับ iOS Safari: ต้องเรียก Notification.requestPermission() เป็นคำสั่ง async แรกสุด
  // ทันทีที่ผู้ใช้กดปุ่ม ห้ามมี await ใดๆ (โดยเฉพาะการดึงข้อมูลจากเซิร์ฟเวอร์) ก่อนหน้านี้เด็ดขาด
  // เพราะ WebKit จะถือว่าหมด "user activation" ทันทีที่มี network round-trip คั่นกลาง แล้วจะปฏิเสธ/ไม่โชว์
  // popup ขออนุญาตเลยแบบเงียบๆ (ไม่มี error ให้เห็นด้วย) ซึ่งเป็นสาเหตุที่แอปไม่เคยไปโผล่ใน
  // ตั้งค่า iOS > การแจ้งเตือน เพราะไม่เคยขอสิทธิ์สำเร็จตั้งแต่แรก —ของเดิมดึง public key ก่อนแล้วค่อยขอ
  // permission ทีหลัง ทำให้พังบน iOS โดยเฉพาะ (เบราว์เซอร์อื่นที่ไม่เข้มงวดเท่าอาจใช้ได้ปกติ เลยดูเหมือน
  // ใช้ได้บนพีซีแต่ไม่ได้บน iPad)
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('คุณไม่ได้อนุญาตการแจ้งเตือน (หรืออุปกรณ์นี้ปฏิเสธอัตโนมัติ ลองกดปุ่มนี้ใหม่อีกครั้ง)');

  const { publicKey, configured } = await api.get('/api/push/public-key');
  if (!configured) throw new Error('ผู้ดูแลระบบยังไม่ได้ตั้งค่า Push Notification ฝั่งเซิร์ฟเวอร์');

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
  // จดจำไว้ว่าผู้ใช้ "ตั้งใจเปิด" การแจ้งเตือนแล้ว — ใช้เป็นสัญญาณให้ syncPushSubscription() พยายาม
  // subscribe ใหม่ให้อัตโนมัติในอนาคตถ้า subscription หลุดไปเฉยๆ โดยไม่ต้องรอผู้ใช้มากดปุ่มนี้ซ้ำอีก
  localStorage.setItem(PUSH_ENABLED_KEY, '1');
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
  localStorage.removeItem(PUSH_ENABLED_KEY);
}

// เดิมถ้า subscription หลุดไปเฉยๆ (เบราว์เซอร์หมุน endpoint ใหม่เองตามรอบ, service worker ถูกอัปเดต/ล้าง,
// หรือฝั่งเซิร์ฟเวอร์เคยลบสำเนาทิ้งเพราะส่งไม่สำเร็จติดกันหลายครั้ง) แอปจะไม่มีทางรู้เลยจนกว่าผู้ใช้จะสังเกตว่า
// "ไม่เด้งแจ้งเตือนนานแล้ว" แล้วเข้ามากดปุ่มเปิดใหม่เอง — ฟังก์ชันนี้ไว้เรียกตอนแอปเปิด/กลับมาที่หน้าจอ (foreground)
// เพื่อตรวจสุขภาพ subscription แล้วซ่อมให้อัตโนมัติแบบเงียบๆ โดยไม่ต้องให้ผู้ใช้ทำอะไรเลย
export async function syncPushSubscription() {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem(PUSH_ENABLED_KEY) !== '1') return; // ไม่เคยกดเปิดไว้ ไม่ต้องยุ่ง
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey, configured } = await api.get('/api/push/public-key');
      if (!configured) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
    }
    // ส่งซ้ำทุกครั้งที่ sync ได้อย่างปลอดภัย (เซิร์ฟเวอร์ upsert ตาม endpoint อยู่แล้ว ไม่สร้างข้อมูลซ้ำ)
    // กันกรณีฝั่งเซิร์ฟเวอร์มีสำเนาเก่า/ไม่ตรงกับของจริงที่เบราว์เซอร์ถืออยู่ตอนนี้
    await api.post('/api/push/subscribe', { subscription: sub.toJSON() });
  } catch {
    // ทำเงียบๆ เบื้องหลัง — ถ้าพังจริง ผู้ใช้ยังกดเปิดเองใหม่ได้ตามปกติที่หน้าตั้งค่า ไม่ต้องรบกวนด้วย error
  }
}
