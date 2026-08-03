# เริ่มต้นใช้งาน — ระบบแจ้งหนังสือราชการออนไลน์ (เฟส 9)

โฟลเดอร์นี้มี 2 ส่วน:

- **`server/`** — backend (Express-style + SQLite) และเว็บที่ build แล้ว (`server/public/`) พร้อมรันได้เลย
- **`web/`** — ซอร์สโค้ด frontend (Vite + React + TypeScript + Tailwind) ใช้แก้ไข UI/เพิ่มฟีเจอร์ในอนาคต

## วิธีใช้งานเร็วที่สุด (ไม่ต้องแตะ web/ เลยก็ได้ เพราะ build ไว้ให้แล้ว)

```bash
cd server
npm install
cp .env.example .env
# แก้ไข .env ตามจริง (NAS, อีเมล, ฯลฯ) — ดูรายละเอียดใน server/README.md
npm start
```
เปิดเบราว์เซอร์ที่ `http://localhost:3000` ได้เลย

## ถ้าต้องการแก้ไขหน้าตาเว็บ/เพิ่มฟีเจอร์

```bash
cd web
npm install
npm run dev        # พัฒนา แก้แล้วเห็นผลทันทีที่ http://localhost:5173
npm run build       # เมื่อพร้อมใช้งานจริง — จะ build ไปทับที่ server/public/ ให้อัตโนมัติ
```

รายละเอียดทั้งหมด (สิ่งที่เปลี่ยนในเฟสนี้, สิ่งที่ยังไม่สมบูรณ์, การตั้งค่า, การ deploy) อยู่ที่ **`server/README.md`**
