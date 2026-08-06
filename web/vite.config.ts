import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
      '/static-forms': 'http://localhost:3000'
    }
  },
  build: {
    // สำคัญมาก: ต้องชี้มาที่ server/public ตรงนี้เท่านั้น เพราะนี่คือโฟลเดอร์ที่ server.js
    // เสิร์ฟไฟล์หน้าเว็บจริงตอนใช้งานจริง (ดู serveStatic() ใน server/server.js)
    // ก่อนหน้านี้เคยตั้งเป็น '../final/server/public' ผิดพลาด ทำให้ build ใหม่ไม่ถูกใช้งานจริง
    // (เซิร์ฟเวอร์ยังเสิร์ฟไฟล์ที่ build ค้างไว้อันเก่าอยู่ตลอด แก้โค้ดแล้วไม่เห็นผลสักที)
    outDir: '../server/public',
    emptyOutDir: true
  }
})
