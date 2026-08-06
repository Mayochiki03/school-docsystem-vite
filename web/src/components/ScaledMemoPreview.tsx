// src/components/ScaledMemoPreview.tsx
// กล่องพรีวิว A4 แบบย่อขนาดอัตโนมัติให้พอดีกับพื้นที่จริงบนจอเสมอ — ไม่ว่าจะเป็นคอลัมน์ข้างฟอร์มบนจอกว้าง
// หรือเต็มความกว้างจอมือถือ ก็คำนวณ scale ให้พอดีเป๊ะทุกครั้ง (เดิม hardcode scale(0.5) ไว้ตายตัว พอความกว้าง
// จริงของกล่องไม่ตรงกับที่คาดไว้ เนื้อหาที่ย่อแล้วจะล้นออกไปเสี้ยวหนึ่ง ทำให้มุมโค้งฝั่งขวาโดนเนื้อหาทับจนดูเหมือน
// ไม่มนไปข้าง — และบนมือถือจะทำให้ทั้งหน้าล้นแนวนอนต้องซูมออกถึงจะเห็นครบ)
import { useEffect, useRef, useState } from 'react';

const A4_WIDTH_PX = 794; // ~210mm ที่ 96dpi

export default function ScaledMemoPreview({ children, maxHeight = 460 }: { children: React.ReactNode; maxHeight?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    function update() {
      const w = el!.clientWidth;
      if (w > 0) setScale(w / A4_WIDTH_PX);
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="memo-preview-scale-wrap border border-[var(--color-border)] bg-slate-100 dark:bg-slate-900" style={{ maxHeight, height: maxHeight }}>
      <div className="memo-preview-scale-inner" style={{ width: A4_WIDTH_PX, transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}
