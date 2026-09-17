// src/components/FileContentPicker.tsx
// ใช้กับฟิลด์ชนิด "fileContent" — แนบไฟล์ Word/PDF ให้เป็นเนื้อหาหลักของเอกสาร แทนการพิมพ์ในระบบทั้งฉบับ
// ค่าที่เก็บมี 2 รูปแบบ ขึ้นอยู่กับว่าเพิ่งเลือกไฟล์ใหม่ (ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์) หรือเป็นไฟล์ที่บันทึกไว้แล้ว:
//   - ใหม่ (รอบันทึก): { fileName, base64 }  — เซิร์ฟเวอร์จะแปลง/บันทึกให้ตอนกดบันทึกเอกสาร (ดู server.js:
//     processFileContentFields)
//   - บันทึกแล้ว: { fileName, filePath, pdfPath, convertedOk, convertError, uploadedAt }
import { useRef, useState } from 'react';
import { Upload, FileText, RefreshCw, AlertTriangle } from 'lucide-react';
import InlinePdfPreview from './InlinePdfPreview';

export interface FileContentValue {
  fileName?: string;
  base64?: string;       // มีเมื่อเพิ่งเลือกไฟล์ใหม่ ยังไม่ได้บันทึก
  filePath?: string;     // มีเมื่อบันทึกแล้ว (ไฟล์ต้นฉบับ)
  pdfPath?: string | null; // มีเมื่อบันทึกแล้วและแปลง/เป็น PDF สำเร็จ — ใช้แสดงตัวอย่าง
  convertedOk?: boolean;
  convertError?: string | null;
}

const ACCEPTED = '.doc,.docx,.odt,.rtf,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf';
const MAX_FILE_MB = 25;

export default function FileContentPicker({ value, onChange, required }: {
  value: FileContentValue | undefined;
  onChange: (v: FileContentValue | undefined) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  async function handlePick(file: File) {
    setError('');
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน ${MAX_FILE_MB}MB`);
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
      reader.readAsDataURL(file);
    });
    onChange({ fileName: file.name, base64 });
  }

  const isPending = !!value?.base64;       // เลือกไฟล์ใหม่ไว้ รอกดบันทึกเอกสารจริง
  const isSaved = !!value?.filePath;       // บันทึกลงเซิร์ฟเวอร์แล้ว

  return (
    <div className="space-y-2">
      <input
        ref={inputRef} type="file" accept={ACCEPTED}
        onChange={e => { if (e.target.files?.[0]) handlePick(e.target.files[0]); if (inputRef.current) inputRef.current.value = ''; }}
        className="hidden"
      />
      {!value && (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center gap-1.5 px-4 py-6 rounded-lg border-2 border-dashed border-[var(--color-border)] text-slate-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
          <Upload size={20} />
          <span className="text-sm">แตะเพื่อแนบไฟล์ Word (.doc/.docx) หรือ PDF</span>
          <span className="text-xs text-slate-400">ระบบจะแปลง Word เป็น PDF ให้อัตโนมัติ เพื่อแสดงตัวอย่างในระบบ</span>
        </button>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {value && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
            <FileText size={16} className="text-[var(--color-primary)] shrink-0" />
            <span className="flex-1 truncate">{value.fileName}</span>
            {isPending && <span className="text-xs text-amber-600 shrink-0">ยังไม่บันทึก</span>}
            <button type="button" onClick={() => inputRef.current?.click()}
              className="shrink-0 flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
              <RefreshCw size={12} /> เปลี่ยนไฟล์
            </button>
          </div>

          {isPending && (
            <p className="text-xs text-slate-400">จะแปลง/แสดงตัวอย่างให้หลังกดบันทึกเอกสาร</p>
          )}

          {isSaved && value.convertError && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{value.convertError}</span>
            </div>
          )}

          {isSaved && value.pdfPath && (
            <InlinePdfPreview src={value.pdfPath} fileName={value.fileName} heightClass="h-[45vh]" />
          )}
        </div>
      )}
      {required && !value && <p className="text-xs text-slate-400">ฟิลด์นี้จำเป็นต้องแนบไฟล์</p>}
    </div>
  );
}
