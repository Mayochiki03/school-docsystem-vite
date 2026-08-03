// src/components/AttachmentPicker.tsx
// ตัวเลือก/แนบไฟล์ PDF และรูปภาพ แบบมาตรฐานเดียวกันทั้งแอป — ใช้ที่ไหนก็ได้ (สร้างเอกสาร, รายงานผลงาน,
// เวรยาม ฯลฯ) แนบได้หลายไฟล์พร้อมกัน เพิ่มทีละไฟล์ได้ ลบไฟล์ที่แนบผิดออกได้ก่อนกดส่งจริง
import { useRef, useState } from 'react';
import { Paperclip, X, FileText } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export interface PendingFile {
  file: File;
  previewUrl?: string; // สำหรับรูปภาพ ใช้แสดงตัวอย่างเล็กๆ ก่อนส่ง
}

interface Props {
  files: PendingFile[];
  onChange: (files: PendingFile[]) => void;
  label?: string;
  disabled?: boolean;
}

const ACCEPTED = 'application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif';
const MAX_FILE_MB = 20;

export default function AttachmentPicker({ files, onChange, label, disabled }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    setError('');
    const next: PendingFile[] = [...files];
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`ไฟล์ "${file.name}" ใหญ่เกิน ${MAX_FILE_MB}MB — ข้ามไฟล์นี้`);
        continue;
      }
      const isImage = file.type.startsWith('image/');
      next.push({ file, previewUrl: isImage ? URL.createObjectURL(file) : undefined });
    }
    onChange(next);
  }

  function removeAt(idx: number) {
    const target = files[idx];
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(files.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium flex items-center gap-1.5"><Paperclip size={15} />{label}</label>}
      <input
        ref={inputRef} type="file" accept={ACCEPTED} multiple disabled={disabled}
        onChange={e => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = ''; }}
        className="w-full text-sm px-3 py-2.5 rounded-lg border border-dashed border-[var(--color-border)] bg-transparent disabled:opacity-50"
      />
      <p className="text-xs text-slate-400">{t('attachHint')}</p>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5">
              {f.previewUrl ? (
                <img src={f.previewUrl} className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <FileText size={16} className="text-[var(--color-primary)] shrink-0" />
              )}
              <span className="flex-1 truncate">{f.file.name}</span>
              <span className="text-slate-400 shrink-0">{(f.file.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => removeAt(i)} className="text-slate-400 hover:text-rose-600 shrink-0"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- ฟังก์ชันช่วยอัพโหลดไฟล์ที่เลือกไว้ทั้งหมดขึ้นเอกสาร ทีละไฟล์ พร้อมรายงานผลราย ไฟล์ ----
// (ถ้าไฟล์ใดอัพโหลดไม่สำเร็จ จะไม่หยุดไฟล์อื่น และรายงานกลับมาว่าไฟล์ไหนพลาดบ้าง แทนที่จะดูเหมือน "แนบไม่ได้เลย" เฉยๆ)
export async function uploadPendingFiles(
  api: { post: (url: string, body: any) => Promise<any> },
  documentId: string,
  files: PendingFile[],
  taskId?: string
): Promise<{ succeeded: number; failed: { name: string; reason: string }[] }> {
  const failed: { name: string; reason: string }[] = [];
  let succeeded = 0;
  for (const f of files) {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
        reader.readAsDataURL(f.file);
      });
      await api.post(`/api/documents/${documentId}/attachments`, { fileName: f.file.name, base64, taskId });
      succeeded++;
    } catch (err: any) {
      failed.push({ name: f.file.name, reason: err?.message || 'ไม่ทราบสาเหตุ' });
    }
  }
  return { succeeded, failed };
}
