// src/components/PdfPageSelector.tsx
// popup ให้เลือกว่าเอกสารนี้ตรงกับ "หน้าไหน" ในไฟล์ PDF ที่แนบมา — ออกแบบมาสำหรับเคสที่โรงเรียนรวมคำสั่ง/หนังสือ
// ทั้งปีไว้ในไฟล์เดียว (200-400 หน้า) แล้วต้องหยิบเฉพาะหน้าที่เกี่ยวกับเอกสารฉบับนี้ออกมาก่อนส่งเข้าระบบจริง
// วิธีเลือกหน้า: คลิกทีละหน้า, shift+คลิกเพื่อเลือกทั้งช่วง, หรือพิมพ์ช่วงหน้าตรงๆ เช่น "12-15, 20, 33"
// (สะดวกกว่ามากเวลาต้องเลือกจาก 200-400 หน้า) กด "ใช้หน้าที่เลือก" แล้วระบบจะตัดเฉพาะหน้าที่เลือกออกมาเป็น PDF
// ใหม่ (ทำที่เบราว์เซอร์ด้วย pdf-lib ไม่ต้องส่งไฟล์เต็มกลับไปกลับมาเซิร์ฟเวอร์หลายรอบ)
import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import { X, Scissors, Loader2 } from 'lucide-react';
import pdfjsLib from '../lib/pdfjsSetup';
import PdfPageThumb from './PdfPageThumb';

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// แปลงข้อความช่วงหน้า เช่น "12-15, 20, 33" -> Set ของเลขหน้า (กรองเลขที่เกินขอบเขตออก)
function parsePageRanges(text: string, maxPage: number): Set<number> {
  const result = new Set<number>();
  text.split(',').forEach(part => {
    const trimmed = part.trim();
    if (!trimmed) return;
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(trimmed);
    if (rangeMatch) {
      let [a, b] = [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
      if (a > b) [a, b] = [b, a];
      for (let p = a; p <= b; p++) if (p >= 1 && p <= maxPage) result.add(p);
    } else if (/^\d+$/.test(trimmed)) {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= maxPage) result.add(p);
    }
  });
  return result;
}

export default function PdfPageSelector({ pdfSrc, fileName, onConfirm, onCancel }: {
  pdfSrc: string;
  fileName?: string;
  onConfirm: (result: { fileName: string; base64: string; pageNumbers: number[] }) => void;
  onCancel: () => void;
}) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeInput, setRangeInput] = useState('');
  const [loadError, setLoadError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const lastClickedRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url: pdfSrc }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch {
        if (!cancelled) setLoadError('เปิดไฟล์ PDF เพื่อดูตัวอย่างไม่สำเร็จ ลองปิดแล้วเปิดใหม่ หรือแนบไฟล์ใหม่อีกครั้ง');
      }
    })();
    return () => { cancelled = true; };
  }, [pdfSrc]);

  function toggle(page: number, isShiftRange: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      if (isShiftRange && lastClickedRef.current !== null) {
        const [a, b] = lastClickedRef.current < page ? [lastClickedRef.current, page] : [page, lastClickedRef.current];
        for (let p = a; p <= b; p++) next.add(p);
      } else if (next.has(page)) {
        next.delete(page);
      } else {
        next.add(page);
      }
      return next;
    });
    lastClickedRef.current = page;
  }

  function applyRangeInput() {
    if (!rangeInput.trim()) return;
    const parsed = parsePageRanges(rangeInput, numPages);
    setSelected(prev => new Set([...prev, ...parsed]));
    setRangeInput('');
  }

  async function handleConfirm() {
    if (selected.size === 0) return;
    setExtracting(true);
    try {
      const res = await fetch(pdfSrc);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const srcDoc = await PDFDocument.load(bytes);
      const newDoc = await PDFDocument.create();
      const sortedPages = Array.from(selected).sort((a, b) => a - b);
      const copied = await newDoc.copyPages(srcDoc, sortedPages.map(p => p - 1));
      copied.forEach(p => newDoc.addPage(p));
      const outBytes = await newDoc.save();
      const base64 = uint8ToBase64(outBytes);
      const baseName = (fileName || 'เอกสาร').replace(/\.[^.]+$/, '');
      onConfirm({
        fileName: `${baseName}_เลือก${sortedPages.length}หน้า.pdf`,
        base64: `data:application/pdf;base64,${base64}`,
        pageNumbers: sortedPages,
      });
    } catch {
      setLoadError('ตัดหน้าที่เลือกไม่สำเร็จ ลองใหม่อีกครั้ง');
      setExtracting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-6">
      <div className="bg-[var(--color-surface)] rounded-xl w-full max-w-4xl h-full sm:h-[85vh] flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)]">
          <div className="min-w-0">
            <h3 className="font-semibold truncate">เลือกหน้าจากไฟล์ที่แนบ</h3>
            <p className="text-xs text-slate-500 truncate">
              {fileName} {numPages > 0 && `· ${numPages} หน้า`} — เลือกเฉพาะหน้าที่เป็นเอกสารฉบับนี้
            </p>
          </div>
          <button onClick={onCancel} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] bg-slate-50 dark:bg-slate-800/50">
          <input
            value={rangeInput}
            onChange={e => setRangeInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyRangeInput(); } }}
            placeholder="พิมพ์เลขหน้า เช่น 12-15, 20, 33 แล้วกด Enter"
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm"
          />
          <button onClick={applyRangeInput} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            เพิ่มหน้า
          </button>
          <button onClick={() => setSelected(new Set(Array.from({ length: numPages }, (_, i) => i + 1)))}
            className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            เลือกทั้งหมด
          </button>
          <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
            ล้างที่เลือก
          </button>
          <span className="text-xs text-slate-500 ml-auto">
            เลือกแล้ว <b className="text-[var(--color-primary)]">{selected.size}</b> จาก {numPages || '...'} หน้า
            {' '}<span className="hidden sm:inline">(shift+คลิก = เลือกทั้งช่วง)</span>
          </span>
        </div>

        {/* grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {loadError && <p className="text-sm text-rose-600 text-center py-8">{loadError}</p>}
          {!loadError && !pdfDoc && (
            <div className="flex items-center justify-center h-full text-slate-400 gap-2">
              <Loader2 size={18} className="animate-spin" /> กำลังโหลดตัวอย่าง...
            </div>
          )}
          {pdfDoc && (
            <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {Array.from({ length: numPages }, (_, i) => i + 1).map(p => (
                <PdfPageThumb key={p} pdfDoc={pdfDoc} pageNumber={p} selected={selected.has(p)} onToggle={toggle} />
              ))}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[var(--color-border)]">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">ยกเลิก</button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0 || extracting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-40"
          >
            {extracting ? <Loader2 size={15} className="animate-spin" /> : <Scissors size={15} />}
            ใช้ {selected.size} หน้าที่เลือก
          </button>
        </div>
      </div>
    </div>
  );
}
