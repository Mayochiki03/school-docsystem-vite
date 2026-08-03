// src/pages/Vehicles.tsx
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Car, Camera, Upload, X } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ประทับวันที่-เวลา (แบบ 24 ชม.) ลงบนรูปจริงมุมซ้ายล่าง ตอนถ่าย/อัพโหลด — ฝังไปกับรูปเลย
// ไม่ใช่แค่ตัวหนังสือแยกอยู่นอกรูปแบบเดิม
function stampPhoto(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const stamp = new Date().toLocaleString('th-TH', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      });
      const fontSize = Math.max(16, Math.round(img.width * 0.028));
      ctx.font = `600 ${fontSize}px sans-serif`;
      const padding = Math.round(fontSize * 0.6);
      const textWidth = ctx.measureText(stamp).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, img.height - fontSize - padding * 2, textWidth + padding * 2, fontSize + padding * 2);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(stamp, padding, img.height - padding - fontSize / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = base64;
  });
}

export default function Vehicles() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isGuard = user?.role === 'guard' || user?.role === 'admin';
  const canOversee = user?.role === 'office_head' || user?.role === 'admin' || (user as any)?.extraPermissions?.includes('view_guard_oversight');
  const [feed, setFeed] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pendingDirection, setPendingDirection] = useState<'in' | 'out'>('in');
  const [viewing, setViewing] = useState<{ photo: string; v: any } | null>(null);

  const [viewDate, setViewDate] = useState(() => new Date().toISOString().slice(0, 10));

  function load() { api.get(`/api/vehicles/feed?date=${viewDate}`).then(d => setFeed(d.list)).catch(() => {}); }
  useEffect(() => { load(); }, [viewDate]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const raw = await Promise.all(Array.from(files).map(fileToBase64));
      const photos = await Promise.all(raw.map(stampPhoto));
      await api.post('/api/vehicles/snap', { direction: pendingDirection, photos });
      load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  async function savePlate(id: string, plateNumber: string) {
    await api.put(`/api/vehicles/${id}/plate`, { plateNumber });
    load();
  }

  if (!isGuard && !canOversee) {
    return <p className="text-sm text-slate-400">{t('vehicleNoAccess')}</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Car size={20} />{t('vehicleLogTitle')}</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewDate(new Date().toISOString().slice(0, 10))}
            className={`text-xs px-2.5 py-1.5 rounded-lg border ${viewDate === new Date().toISOString().slice(0, 10) ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
            {t('today')}
          </button>
          <input type="date" value={viewDate} onChange={e => setViewDate(e.target.value)} onClick={e => (e.currentTarget as HTMLInputElement).showPicker?.()}
            className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
        </div>
      </div>

      {isGuard && (
        
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-3">
          <div className="flex gap-2">
            <button onClick={() => setPendingDirection('in')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${pendingDirection === 'in' ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{t('directionIn')}</button>
            <button onClick={() => setPendingDirection('out')} className={`flex-1 py-2 rounded-lg text-sm font-medium ${pendingDirection === 'out' ? 'bg-[var(--color-primary)] text-white' : 'bg-slate-100 dark:bg-slate-800'}`}>{t('directionOut')}</button>
          </div>
          {/* ถ่ายภาพ (กล้อง) เป็นปุ่มหลัก + ปุ่มอัพโหลดรูปที่บางกว่า วางไว้ใต้ปุ่มถ่าย ความยาวเท่ากัน */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { handleFiles(e.target.files); e.target.value = ''; }} />
          <button disabled={busy} onClick={() => cameraRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">
            <Camera size={16} /> {busy ? t('vehicleTakingPhoto') : t('vehicleTakePhoto')}
          </button>
          <button disabled={busy} onClick={() => uploadRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-[var(--color-border)] text-sm text-slate-600 dark:text-slate-300">
            <Upload size={14} /> {t('vehicleUploadFromDevice')}
          </button>
          <p className="text-xs text-slate-400">{t('vehiclePhotoStampHint')}</p>
        </div>
      )}

      {canOversee && !isGuard && <p className="text-xs text-slate-400">{t('vehicleOversightHint')}</p>}

      <div className="space-y-2">
        {feed.map(v => (
          <div key={v.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3 flex items-center gap-3">
            {v.photos?.[0] && (
              <button onClick={() => setViewing({ photo: v.photos[0], v })} className="shrink-0">
                <img src={v.photos[0]} className="w-16 h-16 rounded-lg object-cover" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400">
                {v.direction === 'in' ? t('directionInShort') : t('directionOutShort')} · {new Date(v.submittedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false })}
                {v.byName && ` · ${t('recordedByLabel')} ${v.byName}`}
              </p>
              {isGuard ? (
                <input
                  defaultValue={v.plateNumber} placeholder={t('enterPlateNumber')}
                  onBlur={e => savePlate(v.id, e.target.value)}
                  className="mt-1 w-full px-2 py-1 rounded border border-[var(--color-border)] bg-transparent text-sm"
                />
              ) : (
                <p className="text-sm font-medium mt-0.5">{v.plateNumber || t('plateNotSet')}</p>
              )}
            </div>
          </div>
        ))}
        {feed.length === 0 && <p className="text-sm text-slate-400 text-center py-8">{t('vehicleNoRecordsToday')}</p>}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setViewing(null); }}>
          <div className="max-w-2xl w-full flex flex-col items-center max-h-[95vh]">
            <div className="flex justify-end w-full mb-2">
              <button onClick={() => setViewing(null)} className="p-2 rounded-lg bg-white/10 text-white"><X size={18} /></button>
            </div>
            <img src={viewing.photo} className="max-w-full max-h-[75vh] w-auto h-auto rounded-lg object-contain" />
            <p className="text-white text-sm mt-2 text-center">
              {viewing.v.direction === 'in' ? t('directionIn') : t('directionOut')} · {viewing.v.plateNumber || t('plateNotSetShort')}
              {viewing.v.byName && ` · บันทึกโดย ${viewing.v.byName}`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
