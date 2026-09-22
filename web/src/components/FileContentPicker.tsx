// src/components/FileContentPicker.tsx
// ใช้กับฟิลด์ชนิด "fileContent" — แนบไฟล์ Word/PDF ให้เป็นเนื้อหาหลักของเอกสาร แทนการพิมพ์ในระบบทั้งฉบับ
//
// ทันทีที่เลือกไฟล์ จะอัปโหลด+แปลงเป็น PDF ที่เซิร์ฟเวอร์ทันที (ไม่รอกดบันทึกฟอร์ม) แล้วเปิด popup ให้เลือกว่า
// เอกสารนี้ตรงกับ "หน้าไหน" ในไฟล์ที่แนบมา — ออกแบบมาสำหรับเคสที่โรงเรียนรวมคำสั่ง/หนังสือทั้งปีไว้ไฟล์เดียว
// (200-400 หน้า) แล้วต้องหยิบเฉพาะหน้าที่เกี่ยวกับเอกสารฉบับนี้ออกมา ไม่ต้องแนบทั้งไฟล์ใหญ่เข้าไปทุกครั้ง
//
// ค่าที่เก็บมี 2 รูปแบบ:
//   - ใหม่ (รอบันทึก): { fileName, base64 }  — เป็น PDF ที่ตัดเฉพาะหน้าที่เลือกแล้ว (จาก PdfPageSelector)
//     เซิร์ฟเวอร์จะบันทึกให้ตอนกดบันทึกเอกสารจริง (ดู server.js: processFileContentFields)
//   - บันทึกแล้ว: { fileName, filePath, pdfPath, convertedOk, convertError, uploadedAt }
import { useRef, useState } from 'react';
import { Upload, FileText, RefreshCw, AlertTriangle, Loader2, Scissors } from 'lucide-react';
import InlinePdfPreview from './InlinePdfPreview';
import PdfPageSelector from './PdfPageSelector';
import { api } from '../api/client';

export interface FileContentValue {
  fileName?: string;
  base64?: string;       // มีเมื่อเพิ่งตัดหน้าที่เลือกไว้ ยังไม่ได้บันทึกฟอร์ม
  filePath?: string;     // มีเมื่อบันทึกฟอร์มแล้ว (ไฟล์ต้นฉบับที่ตัดหน้าแล้ว)
  pdfPath?: string | null; // มีเมื่อบันทึกแล้วและแปลง/เป็น PDF สำเร็จ — ใช้แสดงตัวอย่าง
  convertedOk?: boolean;
  convertError?: string | null;
}

const ACCEPTED = '.doc,.docx,.odt,.rtf,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf';
const MAX_FILE_MB = 60; // ไฟล์รวมทั้งปีอาจใหญ่กว่าเอกสารเดี่ยวมาก ขยายเพดานไว้ให้พอ
// ไฟล์รวมหลายร้อยหน้าแปลงนานได้เป็นนาที — ให้เวลามากกว่า timeout ปกติของ request อื่นๆ ในระบบ (ต้องสอดคล้องกับ
// timeout ฝั่งเซิร์ฟเวอร์ที่ server/lib/officeConvert.js ตั้งไว้ 180 วินาทีเช่นกัน)
const CONVERT_TIMEOUT_MS = 180000;

type Stage = 'idle' | 'converting' | 'selecting' | 'ready' | 'error';

export default function FileContentPicker({ value, onChange, required }: {
  value: FileContentValue | undefined;
  onChange: (v: FileContentValue | undefined) => void;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  // ไฟล์ตัวเต็มที่เพิ่งแปลงเสร็จ (ยังไม่ผ่านการตัดหน้า) — เก็บ descriptor เต็มไว้ (ไม่ใช่แค่ fileName/pdfPath)
  // เผื่อ pdf.js โหลดพรีวิวไม่สำเร็จแล้วผู้ใช้เลือก "ใช้ทั้งไฟล้" แทน จะได้มี filePath/convertError ครบไปตั้งค่าได้เลย
  const [previewFile, setPreviewFile] = useState<FileContentValue | null>(null);

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
    setStage('converting');
    try {
      const descriptor = await api.post('/api/uploads/convert-preview', { fileName: file.name, base64 }, CONVERT_TIMEOUT_MS);
      if (!descriptor.pdfPath) {
        setError(descriptor.convertError || 'เตรียมตัวอย่างไฟล์ไม่สำเร็จ');
        setStage('error');
        return;
      }
      setPreviewFile(descriptor);
      setStage('selecting'); // เปิด popup เลือกหน้าให้อัตโนมัติทันทีที่แปลง/อัปโหลดเสร็จ
    } catch (e: any) {
      setError(e?.message || 'อัปโหลดไฟล์ไม่สำเร็จ');
      setStage('error');
    }
  }

  const isPending = !!value?.base64;       // ตัดหน้าที่เลือกไว้แล้ว รอกดบันทึกเอกสารจริง
  const isSaved = !!value?.filePath;       // บันทึกฟอร์มลงเซิร์ฟเวอร์แล้ว

  return (
    <div className="space-y-2">
      <input
        ref={inputRef} type="file" accept={ACCEPTED}
        onChange={e => { if (e.target.files?.[0]) handlePick(e.target.files[0]); if (inputRef.current) inputRef.current.value = ''; }}
        className="hidden"
      />

      {stage === 'converting' && (
        <div className="flex items-center gap-2 px-4 py-6 rounded-lg border-2 border-dashed border-[var(--color-border)] text-slate-500 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">กำลังเตรียมตัวอย่าง... (ไฟล์ใหญ่/หลายร้อยหน้าอาจใช้เวลาสักครู่)</span>
        </div>
      )}

      {stage !== 'converting' && !value && (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center gap-1.5 px-4 py-6 rounded-lg border-2 border-dashed border-[var(--color-border)] text-slate-500 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
          <Upload size={20} />
          <span className="text-sm">แตะเพื่อแนบไฟล์ Word (.doc/.docx) หรือ PDF</span>
          <span className="text-xs text-slate-400">แนบไฟล์รวมหลายร้อยหน้าได้ — จะให้เลือกหน้าที่ต้องการหลังอัปโหลดเสร็จ</span>
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
              <RefreshCw size={12} /> เปลี่ยนไฟล์ (เลือกหน้าใหม่)
            </button>
          </div>

          {isSaved && value.convertError && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{value.convertError}</span>
            </div>
          )}

          {(isSaved && value.pdfPath) ? (
            <InlinePdfPreview src={value.pdfPath} fileName={value.fileName} heightClass="h-[45vh]" />
          ) : isPending ? (
            <p className="text-xs text-slate-400 flex items-center gap-1"><Scissors size={12} /> ตัดหน้าที่เลือกไว้แล้ว จะบันทึกจริงตอนกดบันทึกเอกสาร</p>
          ) : null}
        </div>
      )}

      {required && !value && stage === 'idle' && <p className="text-xs text-slate-400">ฟิลด์นี้จำเป็นต้องแนบไฟล์</p>}

      {stage === 'selecting' && previewFile?.pdfPath && (
        <PdfPageSelector
          pdfSrc={previewFile.pdfPath}
          fileName={previewFile.fileName}
          onCancel={() => { setStage(value ? 'ready' : 'idle'); setPreviewFile(null); }}
          onUseWholeFileFallback={() => {
            // pdf.js โหลดพรีวิวไม่สำเร็จ — ใช้ descriptor ที่เซิร์ฟเวอร์บันทึก/แปลงไว้แล้วตรงๆ เป็นค่าฟิลด์เลย
            // (ไฟล์ถูกบันทึกลงเซิร์ฟเวอร์จริงแล้วตั้งแต่ตอนเรียก convert-preview ไม่ต้องอัปโหลดซ้ำ)
            onChange(previewFile);
            setStage('ready');
            setPreviewFile(null);
          }}
          onConfirm={result => {
            onChange({ fileName: result.fileName, base64: result.base64 });
            setStage('ready');
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
}
