// src/components/PersonMultiSelect.tsx
// เหมือน PersonSelect แต่เลือกได้หลายคนพร้อมกัน (เช่น ส่งต่องาน/มอบหมายงานให้หลายคนพร้อมกัน)
// ใช้ createPortal เหมือนกับ PersonSelect เพื่อไม่ให้กล่องรายชื่อโดน overflow-hidden ของ parent ตัด
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X } from 'lucide-react';
import type { PersonOption } from './PersonSelect';

interface Props {
  people: PersonOption[];
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export default function PersonMultiSelect({ people, values, onChange, placeholder = '-- เลือกบุคคล (เลือกได้หลายคน) --' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPeople = people.filter(p => values.includes(p.id));
  const filtered = query.trim()
    ? people.filter(p =>
        p.fullName.toLowerCase().includes(query.toLowerCase()) ||
        (p.position || '').toLowerCase().includes(query.toLowerCase()) ||
        (p.departmentNames || []).some(d => d.toLowerCase().includes(query.toLowerCase()))
      )
    : people;

  function updatePosition() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const panelHeight = 320;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUpward = spaceBelow < panelHeight && r.top > spaceBelow;
    setPos({
      top: openUpward ? r.top + window.scrollY - Math.min(panelHeight, r.top - 8) : r.bottom + window.scrollY + 4,
      left: r.left + window.scrollX,
      width: r.width
    });
  }

  useLayoutEffect(() => { if (open) updatePosition(); }, [open]);
  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 30);
    function onScrollOrResize() { updatePosition(); }
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter(v => v !== id) : [...values, id]);
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm text-left">
        <span className={`flex-1 truncate ${selectedPeople.length === 0 ? 'text-slate-400' : ''}`}>
          {selectedPeople.length === 0 ? placeholder : selectedPeople.map(p => p.fullName).join(', ')}
        </span>
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {selectedPeople.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {selectedPeople.map(p => (
            <span key={p.id} className="flex items-center gap-1 text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-2 py-1 rounded-full">
              {p.fullName}
              <button type="button" onClick={() => toggle(p.id)}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, width: Math.max(pos.width, 260) }}
          className="z-[999] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--color-border)]">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="พิมพ์ชื่อ/ตำแหน่ง/แผนกเพื่อค้นหา..."
              className="flex-1 bg-transparent text-sm focus:outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-4">ไม่พบชื่อที่ตรงกับ "{query}"</p>}
            {filtered.slice(0, 200).map(p => (
              <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                <input type="checkbox" checked={values.includes(p.id)} onChange={() => toggle(p.id)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate">{p.fullName}</p>
                  {(p.position || (p.departmentNames && p.departmentNames.length > 0)) && (
                    <p className="text-xs text-slate-400 truncate">
                      {p.position}{p.position && p.departmentNames?.length ? ' · ' : ''}{p.departmentNames?.join(', ')}
                    </p>
                  )}
                </div>
              </label>
            ))}
            {filtered.length > 200 && <p className="text-xs text-slate-400 text-center py-2">พิมพ์ค้นหาเพิ่มเพื่อจำกัดผลลัพธ์ (พบ {filtered.length} รายชื่อ)</p>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
