// src/components/InlinePdfPreview.tsx
// แสดงตัวอย่าง PDF แบบฝังในหน้า (ไม่ใช่แค่ลิงก์ดาวน์โหลด) ใช้กับฟิลด์ "แนบไฟล์เอกสาร" (fileContent) โดยเฉพาะ
// ใช้ <iframe> ของเบราว์เซอร์เอง (ทุกเบราว์เซอร์หลักมี PDF viewer ในตัวอยู่แล้ว รวมถึง iOS Safari ตั้งแต่เวอร์ชัน
// ใหม่ๆ) แทนการดึงไลบรารีอย่าง pdf.js มาทำ canvas renderer เอง — เบากว่ามาก และได้ปุ่มซูม/เลื่อนหน้า/ค้นหา
// ของเบราว์เซอร์เจ้าของเครื่องมาฟรี ซึ่งผู้ใช้บนมือถือ/iPad คุ้นเคยอยู่แล้ว
// มีปุ่ม "เปิดแบบเต็มจอ" เป็นทางสำรองเสมอ เผื่อกรณีเบราว์เซอร์/แอปในเครือข่ายบางตัว (เช่น webview ในแอปแชท)
// ไม่รองรับการแสดง PDF ในเฟรมเล็กๆ ให้เปิดแท็บเต็มแทนได้
import { forwardRef } from 'react';
import { ExternalLink } from 'lucide-react';

interface Props {
  src: string;
  fileName?: string;
  heightClass?: string; // เผื่อบางหน้าอยากได้ความสูงต่างจากค่าเริ่มต้น
}

const InlinePdfPreview = forwardRef<HTMLIFrameElement, Props>(function InlinePdfPreview(
  { src, fileName, heightClass }, ref
) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--color-border)] bg-white dark:bg-slate-800 text-xs">
        <span className="truncate text-slate-500">{fileName || 'ตัวอย่างเอกสาร'}</span>
        <a href={src} target="_blank" rel="noopener noreferrer"
          className="shrink-0 flex items-center gap-1 text-[var(--color-primary)] hover:underline">
          <ExternalLink size={13} /> เปิดแบบเต็มจอ
        </a>
      </div>
      {/* w-full + ความสูงคงที่ (ไม่ใช่ aspect-ratio) เพราะ PDF อาจมีหลายหน้าต่อกันยาว — ให้เลื่อนดูภายในกรอบนี้ได้
          ทั้งบนจอเล็ก (มือถือ/iPad) และจอใหญ่ (PC) โดยไม่ต้องพึ่ง JS คำนวณความสูงเอง */}
      <iframe
        ref={ref}
        src={src}
        title={fileName || 'ตัวอย่างเอกสาร'}
        className={`w-full ${heightClass || 'h-[60vh] sm:h-[70vh]'} bg-white`}
      />
    </div>
  );
});

export default InlinePdfPreview;
