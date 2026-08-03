// src/utils/datetime.ts
// คนไทยใช้เวลาแบบ 24 ชั่วโมงเป็นหลัก ไม่ใช้ AM/PM — ฟังก์ชันกลางนี้บังคับ hour12:false
// ทุกจุดที่แสดงเวลาในระบบ ให้เรียกจากที่นี่แทนการเรียก toLocaleString ตรงๆ กระจายไปทั่วโค้ด

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}
