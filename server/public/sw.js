// public/sw.js
// Service worker: รับ push notification และแสดงผลเป็น notification ของระบบปฏิบัติการ
self.addEventListener('push', event => {
  let data = { title: 'SNKDocSystem', body: 'มีการแจ้งเตือนใหม่' };
  try { data = event.data.json(); } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { documentId: data.documentId }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const docId = event.notification.data?.documentId;
  const path = docId ? `/documents/${docId}` : '/dashboard';
  event.waitUntil((async () => {
    // ถ้าแอพเปิดอยู่แล้ว (แท็บ/หน้าต่างเดิม) ให้พาไปหน้านั้นแล้วโฟกัสแท็บเดิม
    // แทนที่จะเปิดหน้าต่างใหม่ทุกครั้ง — ตัวนี้คือสาเหตุที่กดแจ้งเตือนบนมือถือแล้วรู้สึกค้าง/โหลดช้า
    // เพราะระบบต้องบูตแอพทั้งชุดใหม่ซ้ำในหน้าต่างที่สองทุกครั้ง
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const targetUrl = new URL(path, self.registration.scope).href;
    for (const client of allClients) {
      if (client.url.startsWith(self.registration.scope)) {
        if ('navigate' in client) {
          try { await client.navigate(targetUrl); } catch (e) { /* บาง browser ไม่รองรับ navigate() ข้าม origin/route ก็ปล่อยผ่าน */ }
        }
        if ('focus' in client) return client.focus();
      }
    }
    return clients.openWindow(targetUrl);
  })());
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// บาง browser (หลักๆ คือ Chrome/Edge) จะยิง event นี้เองเวลา push subscription ใกล้หมดอายุ/ถูกหมุน endpoint
// ใหม่โดยอัตโนมัติ (ผู้ใช้ไม่ได้ทำอะไรเลย) — ถ้าไม่ดักไว้ subscription เดิมจะใช้ไม่ได้อีกต่อไปเงียบๆ โดยที่ทั้ง
// ฝั่งเบราว์เซอร์และเซิร์ฟเวอร์ไม่มีใครรู้ตัว จนกว่าผู้ใช้จะสังเกตว่าไม่มีแจ้งเตือนเข้ามานานแล้ว
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const keyRes = await fetch('/api/push/public-key', { credentials: 'include' });
      const { publicKey, configured } = await keyRes.json();
      if (!configured) return;
      const applicationServerKey = Uint8Array.from(
        atob((publicKey + '='.repeat((4 - (publicKey.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')),
        c => c.charCodeAt(0)
      );
      const sub = event.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await fetch('/api/push/subscribe', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
    } catch (e) {
      // เงียบไว้ — ถ้าพังจริง หน้าแอปยัง sync ซ้ำให้เองอีกทีตอนผู้ใช้เปิดแอป (ดู src/lib/push.ts: syncPushSubscription)
    }
  })());
});
