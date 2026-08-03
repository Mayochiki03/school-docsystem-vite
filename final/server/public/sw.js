// public/sw.js
// Service worker: รับ push notification และแสดงผลเป็น notification ของระบบปฏิบัติการ
self.addEventListener('push', event => {
  let data = { title: 'ระบบแจ้งหนังสือราชการ', body: 'มีการแจ้งเตือนใหม่' };
  try { data = event.data.json(); } catch (e) { /* ใช้ค่าเริ่มต้น */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons.svg',
      badge: '/icons.svg',
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
