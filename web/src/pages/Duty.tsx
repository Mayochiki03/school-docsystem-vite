// src/pages/Duty.tsx
// เปลี่ยนจากเดิม "ต้องบันทึกแยกทุกช่วงเวลาในวันเดียว (เช้า/เที่ยง/เย็น)" เป็น:
//   - กรอกรายละเอียด/แนบรูปสะสมได้ตลอดวัน ระบบบันทึกร่างให้อัตโนมัติ (autosave แบบ debounce) ไม่หายแม้ logout แล้ว login ใหม่
//   - กด "ส่งเวร" อย่างเป็นทางการได้แค่ครั้งเดียวต่อวัน และต้องอยู่หลังเวลาที่กำหนด (ค่าเริ่มต้น 17:20 ปรับได้ที่ server .env)
//   - หัวหน้าเวรเห็นรายการ "ยังไม่ได้บันทึกเวรวันนี้" แยกชัดเจน ไม่ใช่แค่รายการที่ทำแล้ว
//   - หลังหัวหน้าเวรตรวจแล้ว (เซ็นรับทราบ) แก้ไขไม่ได้อีก แต่ยังเปิดดูรายละเอียดย้อนหลังได้เสมอ
import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import SignaturePad from '../components/SignaturePad';
import PersonSelect from '../components/PersonSelect';
import { ClipboardList, Check, X, Camera, ChevronDown, ChevronUp, Lock, Clock } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// ประทับวันที่-เวลาแบบ 24 ชม. ลงในรูปจริง (มาตรฐานเดียวกับหน้าบันทึกรถเข้า-ออก)
function stampPhoto(base64: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const stamp = new Date().toLocaleString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const fontSize = Math.max(16, Math.round(img.width * 0.028));
      ctx.font = `600 ${fontSize}px sans-serif`;
      const padding = Math.round(fontSize * 0.6);
      const textWidth = ctx.measureText(stamp).width;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, img.height - fontSize - padding * 2, textWidth + padding * 2, fontSize + padding * 2);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.fillText(stamp, padding, img.height - padding - fontSize / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = reject;
    img.src = base64;
  });
}

export default function Duty() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [noteByType, setNoteByType] = useState<Record<string, string>>({});
  const [photosByType, setPhotosByType] = useState<Record<string, string[]>>({});
  const [sigByType, setSigByType] = useState<Record<string, string | null>>({});
  const [coSignerByType, setCoSignerByType] = useState<Record<string, string>>({});
  const [coSigByType, setCoSigByType] = useState<Record<string, string | null>>({});
  const [showCoSign, setShowCoSign] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [draftSavedAtByType, setDraftSavedAtByType] = useState<Record<string, Date>>({});
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const prefilledRef = useRef<Set<string>>(new Set());
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ---- ตรวจ+ลงชื่อของหัวหน้าเวรวันนี้ / ผอ. ----
  const [oversight, setOversight] = useState<any>(null);
  const [showOversight, setShowOversight] = useState(false);
  const [reviewNoteById, setReviewNoteById] = useState<Record<string, string>>({});
  const [reviewSigById, setReviewSigById] = useState<Record<string, string | null>>({});
  const [dirNoteById, setDirNoteById] = useState<Record<string, string>>({});
  const [dirSigById, setDirSigById] = useState<Record<string, string | null>>({});

  function load() { return api.get('/api/duty/mine').then(setData); }
  useEffect(() => { load(); api.get('/api/users').then(setAllUsers).catch(() => {}); }, []);

  const today = new Date().toISOString().slice(0, 10);
  function loadOversight() {
    api.get(`/api/duty/oversight?date=${today}`).then(setOversight).catch(() => setOversight(null));
  }
  useEffect(() => { loadOversight(); }, []);

  // เติมข้อมูลร่างที่เคยบันทึกไว้ (ถ้ามี) กลับเข้าฟอร์ม ครั้งแรกที่โหลดข้อมูลของแต่ละเวรเท่านั้น
  // เพื่อไม่ให้ทับสิ่งที่ผู้ใช้กำลังพิมพ์อยู่ทุกครั้งที่ระบบ refresh ข้อมูลพื้นหลัง
  useEffect(() => {
    if (!data) return;
    data.slots.forEach((s: any) => {
      const key = s.dutyTypeId;
      if (prefilledRef.current.has(key)) return;
      prefilledRef.current.add(key);
      if (s.log) {
        setNoteByType(prev => ({ ...prev, [key]: s.log.note || '' }));
        setPhotosByType(prev => ({ ...prev, [key]: s.log.photoPaths || [] }));
        setSigByType(prev => ({ ...prev, [key]: s.log.signature || null }));
        if (s.log.coSignerUserId) {
          setShowCoSign(prev => ({ ...prev, [key]: true }));
          setCoSignerByType(prev => ({ ...prev, [key]: s.log.coSignerUserId }));
          setCoSigByType(prev => ({ ...prev, [key]: s.log.coSignature || null }));
        }
        if (s.log.draftUpdatedAt) setDraftSavedAtByType(prev => ({ ...prev, [key]: new Date(s.log.draftUpdatedAt) }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function buildPayload(key: string) {
    return {
      dutyTypeId: key,
      note: noteByType[key] || '',
      photos: photosByType[key] || [],
      signature: sigByType[key] || null,
      coSignerUserId: showCoSign[key] ? (coSignerByType[key] || null) : null,
      coSignature: showCoSign[key] ? (coSigByType[key] || null) : null
    };
  }

  // บันทึกร่างแบบ debounce — พิมพ์/แนบรูปแล้วรอสักครู่ระบบจะบันทึกให้อัตโนมัติ ไม่ต้องกดปุ่มเองทุกครั้งก็ได้
  function scheduleDraftSave(key: string) {
    if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
    debounceTimers.current[key] = setTimeout(() => saveDraft(key), 1200);
  }
  async function saveDraft(key: string) {
    try {
      const log = await api.put('/api/duty/logs/draft', buildPayload(key));
      setDraftSavedAtByType(prev => ({ ...prev, [key]: new Date() }));
      setData((prev: any) => prev ? { ...prev, slots: prev.slots.map((s: any) => s.dutyTypeId === key ? { ...s, log } : s) } : prev);
    } catch (e) { /* เพิกเฉยได้ — ลองใหม่รอบถัดไปที่ผู้ใช้แก้ไขต่อ หรือกดบันทึกร่างเองซ้ำได้ */ }
  }

  async function addPhotos(key: string, files: FileList | null) {
    if (!files || !files.length) return;
    const raw = await Promise.all(Array.from(files).map(fileToBase64));
    const stamped = await Promise.all(raw.map(stampPhoto));
    setPhotosByType(prev => ({ ...prev, [key]: [...(prev[key] || []), ...stamped] }));
    scheduleDraftSave(key);
  }
  function removePhoto(key: string, idx: number) {
    setPhotosByType(prev => ({ ...prev, [key]: (prev[key] || []).filter((_, i) => i !== idx) }));
    scheduleDraftSave(key);
  }

  async function submitFinal(slot: any) {
    const key = slot.dutyTypeId;
    const note = noteByType[key];
    if (!note?.trim()) { alert(t('dutyNotePlaceholder')); return; }
    setBusy(prev => ({ ...prev, [key]: true }));
    try {
      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
      await api.post('/api/duty/logs/submit', buildPayload(key));
      load(); loadOversight();
    } catch (e: any) { alert(e.message); } finally { setBusy(prev => ({ ...prev, [key]: false })); }
  }
  async function respond(covId: string, accept: boolean) {
    await api.post(`/api/duty/coverage/${covId}/respond`, { accept });
    load();
  }
  async function submitReview(logId: string) {
    await api.post(`/api/duty/logs/${logId}/review`, { note: reviewNoteById[logId] || '', signature: reviewSigById[logId] || null });
    loadOversight();
  }
  async function submitDirectorSign(logId: string) {
    await api.post(`/api/duty/logs/${logId}/director-sign`, { note: dirNoteById[logId] || '', signature: dirSigById[logId] || null });
    loadOversight();
  }

  if (!data) return <p className="text-sm text-slate-400">กำลังโหลด...</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2"><ClipboardList size={20} />{t('dutyTodayTitle')} ({data.date})</h1>

      {!data.pastCutoff && (
        <div className="flex items-start gap-2 text-xs bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-900 rounded-lg px-3 py-2">
          <Clock size={14} className="shrink-0 mt-0.5" />
          <span>{t('dutyCutoffNotice').replace('{time}', data.submitCutoff)}</span>
        </div>
      )}

      {data.pendingForMe.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900 p-4 space-y-2">
          <h3 className="text-sm font-medium">{t('dutyCoverageRequestsTitle')}</h3>
          {data.pendingForMe.map((c: any) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-[var(--color-surface)] rounded-lg px-3 py-2">
              <span className="min-w-0 break-words">{c.dutyTitle} — {c.originalUserName} ({c.fromDate} ถึง {c.toDate})</span>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => respond(c.id, true)} title={t('dutyAccept')} className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700"><Check size={14} /></button>
                <button onClick={() => respond(c.id, false)} title={t('dutyDecline')} className="p-1.5 rounded-lg bg-rose-100 text-rose-700"><X size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!data.hasAnyDuty && <p className="text-sm text-slate-400 py-6 text-center">{t('dutyNoDutyToday')}</p>}

      {data.slots.map((s: any) => {
        const key = s.dutyTypeId;
        const readOnly = s.done || s.locked; // ส่งแล้ว หรือหัวหน้าเวรตรวจแล้ว (ล็อกแก้ไข)
        return (
          <div key={key} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-2">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <p className="text-sm font-medium">{s.title}{s.times?.length > 0 && <span className="text-xs text-slate-400 font-normal"> — {s.times.join(', ')}</span>}</p>
              <div className="flex items-center gap-1.5">
                {s.locked && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center gap-1"><Lock size={10} />{t('dutyLockedNotice')}</span>}
                {s.done ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t('dutyDone')}</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{t('dutyNotDone')}</span>}
              </div>
            </div>
            {readOnly ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">{s.log?.note}</p>
                {(s.log?.photoPaths?.length > 0) && (
                  <div className="flex gap-2 flex-wrap">
                    {s.log.photoPaths.map((p: string, i: number) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} className="w-14 h-14 rounded object-cover" /></a>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-sky-600 dark:text-sky-400">{t('dutyDraftHint')}</p>
                <input
                  value={noteByType[key] || ''}
                  onChange={e => { setNoteByType(prev => ({ ...prev, [key]: e.target.value })); scheduleDraftSave(key); }}
                  placeholder={t('dutyNotePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm"
                />
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer w-fit px-2.5 py-1.5 rounded-lg border border-dashed border-[var(--color-border)]">
                    <Camera size={13} /> {t('dutyAttachPhoto')}
                    <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={e => addPhotos(key, e.target.files)} />
                  </label>
                  {(photosByType[key] || []).length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {photosByType[key].map((p, i) => (
                        <div key={i} className="relative">
                          <img src={p} className="w-14 h-14 rounded object-cover" />
                          <button onClick={() => removePhoto(key, i)} className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5"><X size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('dutySignatureLabel')}</p>
                  <SignaturePad onChange={v => { setSigByType(prev => ({ ...prev, [key]: v })); scheduleDraftSave(key); }} />
                </div>
                {!showCoSign[key] ? (
                  <button onClick={() => setShowCoSign(prev => ({ ...prev, [key]: true }))} className="text-xs text-[var(--color-primary)]">{t('dutyCoSignToggle')}</button>
                ) : (
                  <div className="border border-dashed border-[var(--color-border)] rounded-lg p-2 space-y-2">
                    <PersonSelect people={allUsers.filter(u => u.active).map(u => ({ id: u.id, fullName: u.fullName, position: u.position }))}
                      value={coSignerByType[key] || ''} onChange={id => { setCoSignerByType(prev => ({ ...prev, [key]: id })); scheduleDraftSave(key); }} placeholder="-- เลือกครูเวรร่วม --" />
                    {coSignerByType[key] && <SignaturePad onChange={v => { setCoSigByType(prev => ({ ...prev, [key]: v })); scheduleDraftSave(key); }} />}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <button onClick={() => saveDraft(key)} className="px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm">{t('dutySaveDraft')}</button>
                  <button
                    disabled={busy[key] || !data.pastCutoff}
                    title={!data.pastCutoff ? t('dutySubmitLocked') : ''}
                    onClick={() => submitFinal(s)}
                    className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                  >{t('dutySubmit')}</button>
                  {draftSavedAtByType[key] && (
                    <span className="text-xs text-slate-400">{t('dutyDraftSavedAt')} {draftSavedAtByType[key].toLocaleTimeString('th-TH', { hour12: false })}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {data.isAnyDutyHead && data.teamTypes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">{t('dutyTeamSectionTitle')}</h3>
          <div className="space-y-2">
            {data.teamTypes.map((tt: any) => (
              <div key={tt.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] px-3 py-2">
                <span className="min-w-0 break-words">{tt.title} — {tt.ownerName} ({tt.dayNames})</span>
                {tt.activeToday && (tt.doneToday ? <Check size={15} className="text-emerald-600" /> : <span className="text-xs text-rose-600">{t('dutyNotDone')}</span>)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* หัวหน้าเวรวันนี้ตรวจ+ลงชื่อ / ผอ. ลงนามขั้นสุดท้าย */}
      {oversight && (oversight.isHeadOfThisDay || oversight.isDirector) && (
        <div className="bg-[var(--color-surface)] rounded-xl border-2 border-[var(--color-primary)]/40 overflow-hidden">
          <button onClick={() => setShowOversight(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
            <span className="flex items-center gap-2">
              {oversight.isHeadOfThisDay ? t('dutyHeadReviewTitle') : t('dutyDirectorSignTitle')}
              {oversight.missingCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{oversight.missingCount}</span>}
            </span>
            {showOversight ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showOversight && (
            <div className="px-4 pb-4 space-y-4">
              {/* รายชื่อที่ "ยังไม่ได้ส่งเวรวันนี้" ให้หัวหน้าเวรเห็นชัดเจน — จุดที่หัวหน้าเวรขอเพิ่มมาโดยตรง */}
              <div>
                <p className="text-xs font-medium text-rose-600 mb-1.5">{t('dutyMissingSectionTitle')}</p>
                <div className="space-y-1.5">
                  {oversight.rows.filter((r: any) => r.status === 'missing').map((r: any) => (
                    <div key={r.dutyTypeId} className="flex items-center justify-between text-sm bg-rose-50 dark:bg-rose-950/20 rounded-lg px-3 py-2">
                      <span>{r.title} — {r.ownerName}</span>
                      <span className="text-xs text-rose-500">{t('dutyNotDone')}</span>
                    </div>
                  ))}
                  {oversight.rows.filter((r: any) => r.status === 'draft').map((r: any) => (
                    <div key={r.dutyTypeId} className="flex items-center justify-between text-sm bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2">
                      <span>{r.title} — {r.ownerName}</span>
                      <span className="text-xs text-amber-600">{t('dutySaveDraft')} ({t('dutySubmitLocked')})</span>
                    </div>
                  ))}
                  {oversight.missingCount === 0 && oversight.rows.every((r: any) => r.status !== 'draft') && (
                    <p className="text-xs text-emerald-600">{t('dutyAllSubmittedToday')}</p>
                  )}
                </div>
              </div>

              {oversight.rows.filter((r: any) => r.status === 'submitted').map((r: any) => (
                <div key={r.dutyTypeId} className="border border-[var(--color-border)] rounded-lg p-3 text-sm space-y-2">
                  <p className="font-medium">{r.title}{r.times?.length > 0 && ` · ${r.times.join(', ')}`} — {r.ownerName}</p>
                  <p className="text-xs text-slate-500">{r.note}</p>
                  {r.photoPaths?.length > 0 && (
                    <div className="flex gap-2 flex-wrap">{r.photoPaths.map((p: string, i: number) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} className="w-14 h-14 rounded object-cover" /></a>)}</div>
                  )}

                  {oversight.isHeadOfThisDay && !r.reviewedBy && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 space-y-2">
                      <p className="text-xs text-slate-500">ความเห็นหัวหน้าเวร</p>
                      <textarea value={reviewNoteById[r.id] || ''} onChange={e => setReviewNoteById(prev => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} placeholder={t('dutyReviewNotePlaceholder')} />
                      <SignaturePad onChange={v => setReviewSigById(prev => ({ ...prev, [r.id]: v }))} />
                      <button onClick={() => submitReview(r.id)} className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium">{t('dutyReviewConfirm')}</button>
                    </div>
                  )}
                  {r.reviewedBy && <p className="text-xs text-emerald-600">✓ หัวหน้าเวรตรวจแล้ว: {r.reviewedBy} {r.reviewNote && `— "${r.reviewNote}"`}</p>}

                  {oversight.isDirector && r.reviewedBy && !r.directorSignedAt && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-2 space-y-2">
                      <p className="text-xs text-slate-500">ความเห็น ผอ.</p>
                      <textarea value={dirNoteById[r.id] || ''} onChange={e => setDirNoteById(prev => ({ ...prev, [r.id]: e.target.value }))}
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} placeholder={t('dutyDirectorNotePlaceholder')} />
                      <SignaturePad onChange={v => setDirSigById(prev => ({ ...prev, [r.id]: v }))} />
                      <button onClick={() => submitDirectorSign(r.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium">{t('dutyDirectorConfirm')}</button>
                    </div>
                  )}
                  {r.directorSignedAt && <p className="text-xs text-emerald-600">✓ ผอ. ลงนามแล้ว {r.directorNote && `— "${r.directorNote}"`}</p>}
                </div>
              ))}
              {oversight.rows.filter((r: any) => r.status === 'submitted').length === 0 && <p className="text-xs text-slate-400 text-center py-4">{t('dutyNoLogsToday')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
