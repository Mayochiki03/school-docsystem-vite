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
  const url = docId ? `/documents/${docId}` : '/dashboard';
  event.waitUntil(clients.openWindow(url));
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
