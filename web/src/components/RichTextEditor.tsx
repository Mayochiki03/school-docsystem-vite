// src/components/RichTextEditor.tsx
// ตัวแก้ไขข้อความอิสระ (WYSIWYG) แบบเบา ไม่พึ่งไลบรารีภายนอก — ใช้กับฟิลด์ชนิด "ข้อความอิสระ" (richtext)
// เหมาะกับเอกสารที่เนื้อหาไม่ตายตัวเป็นย่อหน้า เช่น คำสั่งโรงเรียน ที่แต่เดิมต้องพิมพ์เองในโปรแกรม Word ทั้งฉบับ
// พิมพ์ย่อหน้า ตัวหนา/เอียง/ขีดเส้นใต้ ทำลิสต์ลำดับ/ไม่มีลำดับ เยื้อง จัดกึ่งกลาง/ชิดขวาได้อิสระเหมือน Word
//
// ค่าที่ onChange ส่งออกไปคือ HTML string ที่แซนิไทซ์แล้วเสมอ (กันโค้ด/สไตล์แปลกๆ หลุดเข้ามาตอนวางจาก
// Word/Google Docs/เว็บอื่น) — ดู src/utils/richText.ts
import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, AlignJustify, Indent, Outdent, Eraser, UserCheck,
} from 'lucide-react';
import { sanitizeRichHtml } from '../utils/richText';

// เลขไทย ๑๒๓... ใช้กับบล็อก "เซ็นรับทราบ" ให้ตรงกับรูปแบบเอกสารราชการที่ใช้กันทั่วไป
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
function toThaiNumber(n: number): string {
  return String(n).split('').map(d => THAI_DIGITS[Number(d)] ?? d).join('');
}
function escapeForInsert(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ToolbarButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      // กัน mousedown แย่งโฟกัสออกจากพื้นที่พิมพ์ก่อนคำสั่ง format จะทำงาน (ไม่งั้น execCommand จะไม่มีผล)
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange }: {
  value: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef(value);
  // แผงแทรก "เซ็นรับทราบ" — พิมพ์รายชื่อทีละบรรทัดแล้วแทรกเป็นลิสต์เลขไทย + เส้นประสำหรับเซ็นชื่อ
  // ต่อท้ายเนื้อหา ตรงกับรูปแบบที่คำสั่งโรงเรียนใช้กันทั่วไป (ดูตัวอย่างที่ผู้ใช้แนบมา) โดยไม่ต้องพิมพ์เอง
  const [showAckPanel, setShowAckPanel] = useState(false);
  const [ackHeading, setAckHeading] = useState('เซ็นรับทราบ');
  const [ackNames, setAckNames] = useState('');

  // เติมค่าเริ่มต้น/ค่าที่เปลี่ยนจากภายนอก (เช่นตอนโหลดเอกสารเดิมมาแก้ไข) โดยไม่ทับเคอร์เซอร์ระหว่างพิมพ์อยู่
  useEffect(() => {
    if (ref.current && value !== lastEmitted.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || '';
      lastEmitted.current = value;
    }
  }, [value]);

  function emit() {
    if (!ref.current) return;
    const html = sanitizeRichHtml(ref.current.innerHTML);
    lastEmitted.current = html;
    onChange(html);
  }

  function cmd(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, sanitizeRichHtml(html));
    } else {
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    }
    emit();
  }

  // แทรกบล็อก "เซ็นรับทราบ" ต่อท้ายเนื้อหาที่มีอยู่ (ไม่พึ่งตำแหน่งเคอร์เซอร์ เพราะโฟกัสย้ายไปที่แผงกรอกชื่อแล้ว)
  // ใช้จุดไข่ปลาเป็นเส้นให้เซ็นชื่อ แทนเส้นบรรทัด/ตาราง เพื่อให้เป็นข้อความล้วนที่พิมพ์/แสดงผลได้แน่นอนทุกที่
  function insertAckList() {
    const names = ackNames.split('\n').map(s => s.trim()).filter(Boolean);
    if (names.length === 0 || !ref.current) return;
    const dots = '.'.repeat(38);
    const lines = names
      .map((n, i) => `<p>${toThaiNumber(i + 1)}. ${escapeForInsert(n)} ${dots}</p>`)
      .join('');
    const heading = ackHeading.trim() || 'เซ็นรับทราบ';
    const html = `<p><b>${escapeForInsert(heading)}</b></p>${lines}`;
    ref.current.innerHTML += sanitizeRichHtml(html);
    setShowAckPanel(false);
    setAckNames('');
    emit();
  }

  return (
    <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 border-b border-[var(--color-border)] bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-10">
        <ToolbarButton title="ตัวหนา" onClick={() => cmd('bold')}><Bold size={15} /></ToolbarButton>
        <ToolbarButton title="ตัวเอียง" onClick={() => cmd('italic')}><Italic size={15} /></ToolbarButton>
        <ToolbarButton title="ขีดเส้นใต้" onClick={() => cmd('underline')}><Underline size={15} /></ToolbarButton>
        <span className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton title="ลิสต์แบบจุด" onClick={() => cmd('insertUnorderedList')}><List size={15} /></ToolbarButton>
        <ToolbarButton title="ลิสต์แบบลำดับเลข" onClick={() => cmd('insertOrderedList')}><ListOrdered size={15} /></ToolbarButton>
        <ToolbarButton title="เยื้องออก" onClick={() => cmd('outdent')}><Outdent size={15} /></ToolbarButton>
        <ToolbarButton title="เยื้องเข้า" onClick={() => cmd('indent')}><Indent size={15} /></ToolbarButton>
        <span className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton title="ชิดซ้าย" onClick={() => cmd('justifyLeft')}><AlignLeft size={15} /></ToolbarButton>
        <ToolbarButton title="กึ่งกลาง" onClick={() => cmd('justifyCenter')}><AlignCenter size={15} /></ToolbarButton>
        <ToolbarButton title="ชิดขวา" onClick={() => cmd('justifyRight')}><AlignRight size={15} /></ToolbarButton>
        <ToolbarButton title="กระจายเต็มบรรทัด" onClick={() => cmd('justifyFull')}><AlignJustify size={15} /></ToolbarButton>
        <span className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton title="ล้างรูปแบบ" onClick={() => cmd('removeFormat')}><Eraser size={15} /></ToolbarButton>
        <span className="w-px h-4 bg-[var(--color-border)] mx-1" />
        <ToolbarButton title="แทรกรายชื่อ + ช่องเซ็นรับทราบ" onClick={() => setShowAckPanel(v => !v)}><UserCheck size={15} /></ToolbarButton>
      </div>
      {showAckPanel && (
        <div className="px-3 py-2.5 border-b border-[var(--color-border)] bg-slate-50 dark:bg-slate-800/40 space-y-2">
          <div>
            <label className="text-xs text-slate-500 block mb-1">หัวข้อ</label>
            <input
              value={ackHeading} onChange={e => setAckHeading(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">รายชื่อ (พิมพ์ทีละบรรทัด)</label>
            <textarea
              value={ackNames} onChange={e => setAckNames(e.target.value)} rows={4}
              placeholder={'นางสาวอำมร ซ้ายขวัญ\nนางสาวชนกนันท์ สุวรรณกูล'}
              className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={insertAckList}
              className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium">แทรกต่อท้ายเนื้อหา</button>
            <button type="button" onClick={() => setShowAckPanel(false)}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs">ยกเลิก</button>
          </div>
        </div>
      )}
      {/* พื้นที่พิมพ์ — พื้นขาวตายตัว (ไม่ตามธีมมืด/สว่างของแอป) จำลองความรู้สึก "กระดาษ" แบบ Word/หน้าที่จะพิมพ์จริง
          พร้อมขนาดตัวอักษร/ระยะบรรทัดเท่ากับตอนพิมพ์จริง (a4-page) ทำให้สิ่งที่เห็นตอนพิมพ์ตรงกับผลลัพธ์จริงที่สุด */}
      <div className="bg-slate-200 dark:bg-slate-900 p-3 sm:p-5">
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          onPaste={handlePaste}
          data-placeholder="เริ่มพิมพ์เนื้อหาที่นี่..."
          className="a4-richtext richtext-editable min-h-[260px] max-h-[640px] overflow-y-auto px-8 py-7 focus:outline-none bg-white text-[#1a1a1a] shadow-sm mx-auto max-w-[760px] rounded-sm"
          style={{ fontSize: '15.5px', lineHeight: 1.9 }}
        />
      </div>
    </div>
  );
}
