// src/components/PersonSelect.tsx
// เลือกบุคคล 1 คนจากรายชื่อทั้งโรงเรียน (หลักร้อยคน) แบบพิมพ์ค้นหาได้ — แทน <select> ธรรมดา
// ที่ต้องเลื่อนหาทีละคนซึ่งใช้งานลำบากมากเมื่อมีคนเยอะ ใช้ตัวเดียวกันนี้ทุกจุดที่ต้องเลือกคน
// (มอบหมายงาน, ตั้งหัวหน้าเวร, ตั้งเจ้าของเวร ฯลฯ) เพื่อความสม่ำเสมอของ UX ทั้งแอป
//
// สำคัญ: กล่องรายชื่อ render ผ่าน createPortal ไปที่ document.body โดยตรง (ไม่ได้อยู่ในตำแหน่งเดิม
// ของ DOM) เพราะถ้าปุ่มนี้ถูกวางอยู่ในกล่อง/การ์ดที่มี overflow-hidden (พบได้บ่อยมากในแอปนี้ เช่น
// การ์ดที่ปัดมุมโค้งให้ตาราง) กล่องรายชื่อแบบ position:absolute เดิมจะถูกตัดขาดจนเห็นแค่นิดเดียว
// การยิงออกไปที่ body ทำให้ไม่มีทางโดน overflow ของ parent ตัดอีกเลย ไม่ว่าจะเอาไปวางตรงไหนในแอป
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, X, UserCircle2 } from 'lucide-react';

export interface PersonOption {
  id: string;
  fullName: string;
  position?: string;
  departmentNames?: string[];
}

interface Props {
  people: PersonOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
}

export default function PersonSelect({ people, value, onChange, placeholder = '-- เลือกบุคคล --', allowClear, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = people.find(p => p.id === value);
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
    const panelHeight = 320; // ประมาณความสูงสูงสุดของกล่อง เผื่อคำนวณว่าจะเปิดขึ้นหรือลง
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

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button" disabled={disabled} onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm text-left disabled:opacity-50"
      >
        <UserCircle2 size={15} className="text-slate-400 shrink-0" />
        <span className={`flex-1 truncate ${!selected ? 'text-slate-400' : ''}`}>{selected ? selected.fullName : placeholder}</span>
        {allowClear && selected && (
          <span onClick={e => { e.stopPropagation(); pick(''); }} className="text-slate-400 hover:text-rose-600 shrink-0"><X size={13} /></span>
        )}
        <ChevronDown size={14} className="text-slate-400 shrink-0" />
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'absolute', top: pos.top, left: pos.left, width: Math.max(pos.width, 260) }}
          className="z-[999] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden"
        >
          <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--color-border)]">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อ/ตำแหน่ง/แผนกเพื่อค้นหา..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 && <p className="text-xs text-slate-400 text-center py-4">ไม่พบชื่อที่ตรงกับ "{query}"</p>}
            {filtered.slice(0, 200).map(p => (
              <button
                key={p.id} type="button" onClick={() => pick(p.id)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${p.id === value ? 'bg-[var(--color-primary)]/10 font-medium' : ''}`}
              >
                <p className="truncate">{p.fullName}</p>
                {(p.position || (p.departmentNames && p.departmentNames.length > 0)) && (
                  <p className="text-xs text-slate-400 truncate">
                    {p.position}{p.position && p.departmentNames?.length ? ' · ' : ''}{p.departmentNames?.join(', ')}
                  </p>
                )}
              </button>
            ))}
            {filtered.length > 200 && <p className="text-xs text-slate-400 text-center py-2">พิมพ์ค้นหาเพิ่มเพื่อจำกัดผลลัพธ์ (พบ {filtered.length} รายชื่อ)</p>}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
