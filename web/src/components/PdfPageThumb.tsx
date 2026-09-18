// src/components/PdfPageThumb.tsx
// รูปย่อ 1 หน้าในตัวเลือกหน้า PDF (PdfPageSelector) — render แบบ lazy ด้วย IntersectionObserver เพราะไฟล์รวม
// อาจมี 200-400 หน้า ถ้า render ทุกหน้าเป็น canvas พร้อมกันหมดตั้งแต่เปิด popup เบราว์เซอร์จะค้าง/หน่วงมาก
// เรียก page.render() แค่ตอนหน้านั้นเลื่อนเข้ามาใกล้จอ (rootMargin กันไว้ล่วงหน้านิดหน่อยให้ดูลื่นตอนเลื่อน)
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Check } from 'lucide-react';

export default function PdfPageThumb({ pdfDoc, pageNumber, selected, onToggle }: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  selected: boolean;
  onToggle: (page: number, isShiftRange: boolean) => void;
}) {
  const containerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0]?.isIntersecting) setVisible(true);
    }, { rootMargin: '300px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || renderedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        const targetWidth = 140; // ความกว้างรูปย่อ (px) — พอมองเห็นเค้าโครงหน้า ไม่ต้องคมชัดมากเพราะแค่ไว้เลือกหน้า
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
        if (!cancelled) renderedRef.current = true;
      } catch {
        // เงียบไว้ — ถ้าหน้าไหน render พลาด (ไฟล์เพี้ยน/หน่วยความจำ) ยังเลือกหน้านั้นได้ปกติจากเลขหน้า แค่ไม่มีรูปให้ดู
      }
    })();
    return () => { cancelled = true; };
  }, [visible, pdfDoc, pageNumber]);

  return (
    <button
      type="button"
      ref={containerRef}
      onClick={e => onToggle(pageNumber, e.shiftKey)}
      className={`relative flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition-colors ${
        selected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-transparent hover:border-[var(--color-border)]'
      }`}
      title={`หน้า ${pageNumber}`}
    >
      <div className="w-full aspect-[3/4] bg-slate-100 dark:bg-slate-800 rounded flex items-center justify-center overflow-hidden">
        {visible ? <canvas ref={canvasRef} className="max-w-full max-h-full" /> : null}
      </div>
      <span className="text-[11px] text-slate-500">{pageNumber}</span>
      {selected && (
        <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center">
          <Check size={11} />
        </span>
      )}
    </button>
  );
}
