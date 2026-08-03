// src/components/SignaturePad.tsx
// ลงลายมือชื่อ 3 แบบ: วาดด้วยเมาส์/นิ้ว, พิมพ์ชื่อ (แปะเป็นข้อความตรงๆ ไม่แปลงเป็นรูปให้วุ่นวาย), อัปโหลดรูป
//
// แก้บั๊กสำคัญจากรอบก่อน: เดิม event handler ของแคนวาสวาดลายเซ็นถูกสร้างครั้งเดียวใน
// useEffect(() => {...}, []) แล้วอ่านค่า state `hasDrawing` ผ่าน closure — เพราะ effect
// รันครั้งเดียวตอน mount ค่าที่อ่านได้จึงค้างอยู่ที่ค่าตอน mount (false) ตลอดไป ทำให้
// onChange(...) ส่ง null กลับไปเสมอแม้จะวาดลายเซ็นแล้วเห็นภาพบนจอ ผลคือกดส่งฟอร์ม/อนุมัติ
// แล้วลายเซ็นหายไปจริง (ไม่ได้ถูกบันทึก) ตอนนี้เรียก onChange ตรงจาก event handler ทันที
// โดยไม่พึ่ง React state เลย จึงไม่มีปัญหา stale closure อีก
import { useEffect, useRef, useState } from 'react';
import { PenLine, Type, Upload } from 'lucide-react';

type Tab = 'draw' | 'type' | 'upload';

// ลายเซ็นแบบพิมพ์ชื่อ เก็บเป็นข้อความธรรมดา มี prefix นี้กำกับไว้ เพื่อให้ตอนแสดงผล/พิมพ์
// รู้ว่าต้องแสดงเป็น "ข้อความ" ตรงๆ (ฟอนต์เอียงขีดเส้นใต้) ไม่ใช่รูปภาพ
export const TEXT_SIGNATURE_PREFIX = 'TEXTSIG::';

export default function SignaturePad({ onChange }: { onChange: (value: string | null) => void }) {
  const [tab, setTab] = useState<Tab>('draw');
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [uploaded, setUploaded] = useState(false);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // ---------- วาดลายเซ็น ----------
  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#16324f';

    function pos(e: MouseEvent | TouchEvent) {
      const r = canvas!.getBoundingClientRect();
      const p = 'touches' in e ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * (canvas!.width / r.width), y: (p.clientY - r.top) * (canvas!.height / r.height) };
    }
    function start(e: any) { drawing.current = true; last.current = pos(e); e.preventDefault(); }
    function move(e: any) {
      if (!drawing.current) return;
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last.current = p;
      setHasDrawing(true);
      // ส่งค่ากลับทันทีจาก event handler ตรงๆ ไม่พึ่ง React state ที่อาจ stale
      onChange(canvas!.toDataURL('image/png'));
      e.preventDefault();
    }
    function end() { drawing.current = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);
    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearDraw() {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    onChange(null);
  }

  // ---------- พิมพ์ชื่อ ----------
  // ไม่แปลงเป็นรูปภาพให้วุ่นวายอีกต่อไป (ของเดิมเรนเดอร์เป็นฟอนต์ลายมือในแคนวาสซึ่งพึ่งฟอนต์
  // เฉพาะระบบปฏิบัติการ บางเครื่องไม่มีฟอนต์นั้นจึงเพี้ยน/ว่างเปล่า) — ตอนนี้เก็บเป็นข้อความ
  // ตรงๆ แล้วไปจัดสไตล์ตอนแสดงผล/พิมพ์แทน เรียบง่ายและตรงไปตรงมากว่ามาก
  function onTypedNameChange(v: string) {
    setTypedName(v);
    onChange(v.trim() ? TEXT_SIGNATURE_PREFIX + v.trim() : null);
  }

  // ---------- อัปโหลดรูป ----------
  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = uploadCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        setUploaded(true);
        onChange(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function switchTab(t: Tab) {
    setTab(t);
    if (t === 'draw') onChange(hasDrawing ? drawCanvasRef.current!.toDataURL('image/png') : null);
    else if (t === 'type') onChange(typedName.trim() ? TEXT_SIGNATURE_PREFIX + typedName.trim() : null);
    else onChange(uploaded ? uploadCanvasRef.current!.toDataURL('image/png') : null);
  }

  const tabBtn = (key: Tab, label: string, Icon: any) => (
    <button
      type="button"
      onClick={() => switchTab(key)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
        tab === key
          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
          : 'border-[var(--color-border)] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        {tabBtn('draw', 'วาดลายเซ็น', PenLine)}
        {tabBtn('type', 'พิมพ์ชื่อ', Type)}
        {tabBtn('upload', 'อัปโหลดรูป', Upload)}
      </div>

      <div className="relative border border-dashed border-[var(--color-border)] rounded-lg bg-white" style={{ display: tab === 'draw' ? 'block' : 'none' }}>
        <canvas ref={drawCanvasRef} width={360} height={130} className="w-full touch-none" style={{ height: 130 }} />
        {!hasDrawing && <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 pointer-events-none">ลงลายมือชื่อในกรอบนี้</span>}
        <div className="px-2 pb-1.5">
          <button type="button" onClick={clearDraw} className="text-xs text-[var(--color-primary)] underline">ล้างลายเซ็น</button>
        </div>
      </div>

      {tab === 'type' && (
        <div className="space-y-2">
          <input value={typedName} onChange={e => onTypedNameChange(e.target.value)} placeholder="พิมพ์ชื่อ-นามสกุล"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          {typedName.trim() && (
            <div className="border border-dashed border-[var(--color-border)] rounded-lg bg-white px-4 py-3 text-center">
              <span className="italic underline text-[#16324f]" style={{ fontSize: 18 }}>{typedName.trim()}</span>
            </div>
          )}
        </div>
      )}

      {tab === 'upload' && (
        <div className="space-y-2">
          <input type="file" accept="image/*" onChange={onFile} className="text-xs" />
          <canvas ref={uploadCanvasRef} width={360} height={130} className="border border-dashed border-[var(--color-border)] rounded-lg bg-white w-full" style={{ height: 130, display: uploaded ? 'block' : 'none' }} />
        </div>
      )}
    </div>
  );
}
