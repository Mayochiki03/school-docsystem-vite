// src/lib/pdfjsSetup.ts
// ตั้งค่า pdf.js ให้ใช้งานได้ใน Vite — ต้องชี้ worker ไปที่ไฟล์จริงใน node_modules ผ่าน `?url` (Vite แปลงให้เป็น
// URL ที่ build เข้าไปใน bundle ให้เอง) ไม่งั้น pdf.js จะพยายามโหลด worker จาก CDN แทน ซึ่งใช้ไม่ได้ตอน deploy
// ในเครือข่ายปิด/ไม่มีอินเทอร์เน็ตของโรงเรียน
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export default pdfjsLib;
