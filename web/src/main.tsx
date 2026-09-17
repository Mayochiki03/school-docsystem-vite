import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { syncPushSubscription } from './lib/push'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// เช็คสุขภาพ push subscription ตอนเปิดแอปครั้งแรก และทุกครั้งที่กลับมา foreground (สลับแท็บ/เปิดแอปจาก background)
// เพื่อซ่อม subscription ที่หลุดไปเฉยๆ ให้อัตโนมัติแบบเงียบๆ — ดูรายละเอียดเหตุผลใน src/lib/push.ts
syncPushSubscription();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncPushSubscription();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
