// src/pages/documents/DocumentDetail.tsx
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Attachment } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import SignaturePad from '../../components/SignaturePad';
import MemoSheet from '../../components/MemoSheet';
import AttachmentPicker, { type PendingFile, uploadPendingFiles } from '../../components/AttachmentPicker';
import PersonMultiSelect from '../../components/PersonMultiSelect';
import PersonSelect from '../../components/PersonSelect';
import { fmtDateTime } from '../../utils/datetime';
import {
  Printer, CheckCircle, XCircle, RotateCcw, Send, UserCheck, X,
  Paperclip, FileUp, FileText, Users, Pencil, Undo2, Clock
} from 'lucide-react';

function isPdf(fileName: string) { return /\.pdf$/i.test(fileName); }
function isImage(fileName: string) { return /\.(png|jpe?g|gif|webp)$/i.test(fileName); }

// ---- ประวัติดำเนินการ: จับคู่ action code (ภาษาอังกฤษ ใช้ภายในระบบ) กับคำแปลไทย/ไอคอน/สี ให้อ่านง่ายขึ้น ----
// แต่ละ action มีไอคอน+สีของตัวเอง เพื่อให้กวาดสายตาดูรูปแบบเหตุการณ์ได้เร็ว ไม่ต้องอ่านทีละบรรทัด
const HISTORY_ACTION_META: Record<string, { icon: any; key: string; tone: string }> = {
  created: { icon: FileText, key: 'histActCreated', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  returned_for_revision: { icon: Undo2, key: 'histActReturnedForRevision', tone: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40' },
  resubmitted: { icon: RotateCcw, key: 'histActResubmitted', tone: 'text-sky-600 bg-sky-100 dark:bg-sky-950/40' },
  office_reviewed: { icon: CheckCircle, key: 'histActOfficeReviewed', tone: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40' },
  endorsed: { icon: Pencil, key: 'histActEndorsed', tone: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/40' },
  forwarded: { icon: Send, key: 'histActForwarded', tone: 'text-sky-600 bg-sky-100 dark:bg-sky-950/40' },
  acknowledged: { icon: UserCheck, key: 'histActAcknowledged', tone: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40' },
  completed: { icon: CheckCircle, key: 'histActCompleted', tone: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40' },
  rejected: { icon: XCircle, key: 'histActRejected', tone: 'text-rose-600 bg-rose-100 dark:bg-rose-950/40' },
  returned: { icon: Undo2, key: 'histActReturned', tone: 'text-rose-600 bg-rose-100 dark:bg-rose-950/40' },
  edited: { icon: Pencil, key: 'histActEdited', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  delegated: { icon: Users, key: 'histActDelegated', tone: 'text-sky-600 bg-sky-100 dark:bg-sky-950/40' },
  restored: { icon: RotateCcw, key: 'histActRestored', tone: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40' },
  numbered: { icon: FileText, key: 'histActNumbered', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
};

export default function DocumentDetail() {
  const { id } = useParams();
  const { user, departments } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [endorseSignature, setEndorseSignature] = useState<string | null>(null);

  // ---- เลขที่/ปีของหนังสือ — หัวหน้าสำนักงาน/แอดมิน (หรือผู้ได้รับมอบสิทธิ์) แก้ไขได้ตลอดเวลา
  // ไม่ผูกกับสถานะเอกสาร เพราะเรื่องด่วนมักส่งให้ ผอ. เซ็นก่อนแล้วค่อยย้อนกลับมาลงเลขทีหลัง
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberDraft, setNumberDraft] = useState({ docNumber: '', docYear: '' });

  // ---- ส่งต่องานต่อในสังกัด (delegate) + รายงานผลเสร็จสิ้น (ต้องพิมพ์ข้อความ แนบไฟล์ได้ไม่บังคับ) ----
  const [delegatingTaskId, setDelegatingTaskId] = useState<string | null>(null);
  const [delegateTargetId, setDelegateTargetId] = useState('');
  const [delegateNote, setDelegateNote] = useState('');
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const [completeNote, setCompleteNote] = useState('');
  const [completeFiles, setCompleteFiles] = useState<PendingFile[]>([]);
  const [completeBusy, setCompleteBusy] = useState(false);

  // ---- ส่งต่องาน: เลือกได้หลายแผนก/หลายคนพร้อมกัน (อ้างอิงจากระบบเดิมที่รองรับ targets หลายรายการ) ----
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [forwardDeptIds, setForwardDeptIds] = useState<string[]>([]);
  const [forwardUserIds, setForwardUserIds] = useState<string[]>([]);
  const [forwardInstructions, setForwardInstructions] = useState('');

  // ---- แนบไฟล์ PDF/รูป เพิ่มเติมได้ทุกช่วง (ไม่บังคับ) ----
  const [attachBusy, setAttachBusy] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);


  function load() {
    api.get(`/api/documents/${id}`).then(setData).catch(e => setError(e.message));
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api.get('/api/settings').then(s => setSchoolName(s.schoolName || '')).catch(() => {}); }, []);
  useEffect(() => { api.get('/api/users').then(setAllUsers).catch(() => {}); }, []);

  async function saveDocNumber() {
    try {
      await api.put(`/api/documents/${id}/number`, numberDraft);
      setEditingNumber(false);
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function act(action: string, extra: Record<string, any> = {}) {
    setBusy(true); setError('');
    try {
      await api.post(`/api/documents/${id}/actions`, { action, note, ...extra });
      setNote('');
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // เช็คก่อนพิมพ์ว่าเนื้อหายาวเกิน 1 หน้า A4 หรือไม่ — เพราะ CSS พิมพ์ตอนนี้ล็อกความสูงพอดี 1 หน้า
  // (กันปัญหาเดิมที่หน้า 2 โผล่มาเปล่าๆ พร้อมบล็อกลงชื่อ) ถ้าเนื้อหายาวเกินจริง ส่วนที่เกินจะถูกตัดไป
  // ไม่แสดงตอนพิมพ์ จึงต้องเตือนก่อน ไม่ให้ข้อมูลหายไปเงียบๆ โดยไม่มีใครรู้
  function handlePrint() {
    const printArea = document.getElementById('printArea');
    const sheet = printArea?.querySelector('.a4-page') as HTMLElement | null;
    if (sheet) {
      const prevCssText = printArea!.style.cssText;
      printArea!.style.cssText = 'display:block !important; position:fixed; left:-99999px; top:0; visibility:hidden;';
      const naturalHeightPx = sheet.scrollHeight;
      printArea!.style.cssText = prevCssText;
      const onePageHeightPx = 297 * (96 / 25.4); // ~1122.6px ที่ 96dpi (ค่ามาตรฐานของหน่วย mm ใน CSS)
      if (naturalHeightPx > onePageHeightPx + 20) {
        if (!confirm(t('docPrintOverflowWarning'))) return;
      }
    }
    window.print();
  }

  async function uploadAttachments(fileList: FileList) {
    setAttachBusy(true);
    const failed: string[] = [];
    for (const file of Array.from(fileList)) {
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await api.post(`/api/documents/${id}/attachments`, { fileName: file.name, base64 });
      } catch (err: any) {
        failed.push(file.name);
      }
    }
    if (failed.length) setError(`แนบไฟล์ไม่สำเร็จ: ${failed.join(', ')}`); else setError('');
    setAttachBusy(false);
    load();
  }

  function toggleForwardDept(deptId: string) {
    setForwardDeptIds(v => v.includes(deptId) ? v.filter(x => x !== deptId) : [...v, deptId]);
  }
  async function submitForward() {
    const targets = [
      ...forwardDeptIds.map(deptId => ({ deptId, instructions: forwardInstructions })),
      ...forwardUserIds.map(userId => ({ userId, instructions: forwardInstructions }))
    ];
    if (!targets.length) return;
    await act('forward', { targets });
    setForwardDeptIds([]); setForwardUserIds([]); setForwardInstructions('');
  }

  if (error && !data) return (
    <div className="max-w-md mx-auto text-center py-16">
      <p className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-950/40 rounded-lg px-4 py-3 inline-block">{error}</p>
      <p className="mt-4"><button onClick={() => navigate(-1)} className="text-sm text-[var(--color-primary)] underline">&larr; กลับ</button></p>
    </div>
  );
  if (!data) return <p className="text-sm text-slate-400">กำลังโหลด...</p>;
  const { document: doc, type, history, tasks, attachments } = data as { document: any; type: any; history: any[]; tasks: any[]; attachments: Attachment[] };
  const isReviewer = user?.role === 'office_head' || user?.role === 'admin' || (user as any)?.extraPermissions?.includes('review_documents');
  const canEditDocNumber = user?.role === 'office_head' || user?.role === 'admin' || (user as any)?.extraPermissions?.includes('edit_doc_number');
  const isDirector = user?.role === 'director' || user?.role === 'admin';
  const isCreator = doc.createdBy === user?.id;
  const canForward = (['office_head', 'admin', 'director'].includes(user?.role || '') || (user as any)?.extraPermissions?.includes('review_documents')) && doc.status === 'endorsed';
  const isHeadOfDept = (deptId: string) => departments.find(d => d.id === deptId)?.headUserId === user?.id;
  const canAttach = isCreator || isReviewer || isDirector || (tasks || []).some((t: any) => t.assignedToUserId === user?.id || (t.assignedToDeptId && isHeadOfDept(t.assignedToDeptId)));

  // ---- บันทึก/ไฟล์แนบตามขั้นตอน: จับคู่ "ใครพิมพ์อะไร" (ประวัติที่มีข้อความ เช่น รายงานผล, เกษียนหนังสือ)
  // กับ "ใครแนบไฟล์อะไร" (ผ่าน taskId เดียวกัน) ให้ขึ้นเป็นการ์ดแยกของแต่ละคน/แต่ละขั้นตอน แทนที่จะรวมไฟล์
  // แนบทั้งหมดเป็นก้อนเดียว — ไฟล์แนบที่ไม่ได้ผูกกับขั้นตอนใด (แนบทั่วไปผ่านปุ่ม "แนบไฟล์") จะถูกจัดกลุ่มตาม
  // ผู้แนบแยกต่างหากด้านล่างแทน
  const usedAttachmentIds = new Set<string>();
  const stepRecordCards = (history || [])
    .filter((h: any) => (h.note && h.note.trim()) || h.action === 'endorsed')
    .map((h: any, idx: number) => {
      const files = h.taskId ? (attachments || []).filter(a => a.taskId === h.taskId) : [];
      files.forEach(f => usedAttachmentIds.add(f.id));
      const meta = HISTORY_ACTION_META[h.action] || { icon: FileText, key: '', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800' };
      return {
        key: `step-${h.action}-${idx}-${h.timestamp}`,
        icon: meta.icon,
        tone: meta.tone,
        actionLabel: (meta.key && t(meta.key)) || h.action,
        actorName: h.actorName,
        timestamp: h.timestamp,
        note: h.note && h.note.trim() ? h.note : '',
        files,
      };
    });

  const looseAttachmentsByUploader = new Map<string, { name: string; files: Attachment[] }>();
  (attachments || []).filter(a => !usedAttachmentIds.has(a.id)).forEach(a => {
    const k = a.uploadedBy;
    if (!looseAttachmentsByUploader.has(k)) looseAttachmentsByUploader.set(k, { name: a.uploadedByName || '-', files: [] });
    looseAttachmentsByUploader.get(k)!.files.push(a);
  });
  const looseRecordCards = Array.from(looseAttachmentsByUploader.entries()).map(([uploaderId, group]) => ({
    key: `loose-${uploaderId}`,
    icon: Paperclip,
    tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
    actionLabel: t('docGeneralAttachments'),
    actorName: group.name,
    timestamp: group.files.reduce((max, f) => f.uploadedAt > max ? f.uploadedAt : max, group.files[0]?.uploadedAt || ''),
    note: '',
    files: group.files,
  }));
  const recordCards = [...stepRecordCards, ...looseRecordCards];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3 no-print">
        <div className="min-w-0">
          <button onClick={() => navigate(-1)} className="text-sm text-slate-400 hover:text-slate-600 mb-2">&larr; กลับ</button>
          <h1 className="text-xl font-semibold break-words">{doc.subject}</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
            <span>{type?.name}</span>
            {!editingNumber ? (
              <span className="flex items-center gap-1.5">
                · เลขที่ {doc.docNumber || '-'} / {doc.docYear || '-'}
                {canEditDocNumber && (
                  <button onClick={() => { setNumberDraft({ docNumber: doc.docNumber || '', docYear: doc.docYear || '' }); setEditingNumber(true); }}
                    className="text-xs text-[var(--color-primary)] underline">แก้ไข</button>
                )}
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                · เลขที่
                <input value={numberDraft.docNumber} onChange={e => setNumberDraft(v => ({ ...v, docNumber: e.target.value }))} placeholder="เลขที่"
                  className="w-20 px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-transparent text-xs" />
                /
                <input value={numberDraft.docYear} onChange={e => setNumberDraft(v => ({ ...v, docYear: e.target.value }))} placeholder="ปี"
                  className="w-16 px-1.5 py-0.5 rounded border border-[var(--color-border)] bg-transparent text-xs" />
                <button onClick={saveDocNumber} className="text-xs text-emerald-600 font-medium">บันทึก</button>
                <button onClick={() => setEditingNumber(false)} className="text-xs text-slate-400">ยกเลิก</button>
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-slate-100 dark:bg-slate-800">{t('status_' + doc.status) || doc.status}</span>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90" title="พิมพ์ (A4)">
            <Printer size={16} /> {t('docPrint')}
          </button>
        </div>
      </div>

      {/* กระดาษที่ใช้พิมพ์จริง — ไม่แสดงบนหน้าจอปกติ (#printArea ถูกซ่อนไว้ด้วย CSS) มีผลเฉพาะตอนสั่งพิมพ์เท่านั้น */}
      {createPortal(
        <MemoSheet doc={doc} type={type} history={history} schoolName={schoolName} />,
        document.getElementById('printArea')!
      )}

      {/* สรุปข้อมูลแบบย่อบนหน้าจอ */}
      <div className="no-print bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="space-y-3">
          {(type?.formSchema || []).map((f: any) => {
            const raw = doc.fields?.[f.key];
            let display: React.ReactNode = raw || '-';
            if (f.type === 'checkbox') display = raw === 'true' ? `☑ ${t('docCheckboxYes')}` : '☐';
            else if (f.type === 'table') {
              const rows: Record<string, string>[] = Array.isArray(raw) ? raw : [];
              display = rows.length === 0 ? '-' : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--color-border)]">
                        {(f.columns || []).map((c: any) => <th key={c.key} className="text-left px-1 py-1 text-slate-500 font-medium">{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-[var(--color-border)]/60">
                          {(f.columns || []).map((c: any) => <td key={c.key} className="px-1 py-1">{row[c.key] || '-'}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            return (
              <div key={f.key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
                <span className="text-slate-500">{f.label}</span>
                <span className="sm:col-span-2 font-medium whitespace-pre-wrap break-words">{display}</span>
              </div>
            );
          })}
          {doc.dueDate && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
              <span className="text-slate-500">{t('docDueDate')}</span>
              <span className="sm:col-span-2 font-medium">{new Date(doc.dueDate).toLocaleDateString('th-TH')}</span>
            </div>
          )}
        </div>
      </div>

      {/* บันทึกและไฟล์แนบตามขั้นตอน — แยกเป็นการ์ดของแต่ละคน/แต่ละขั้นตอน (รายงานผล, เกษียนหนังสือ, ตรวจกรอง ฯลฯ)
          พร้อมไฟล์ที่แนบมาพร้อมกัน จะได้รู้ว่าใครพิมพ์อะไร/แนบอะไรมาในขั้นตอนไหน ไม่ปนกันเป็นก้อนเดียว
          จัดวางแบบ grid ที่ย่อ/ขยายตามขนาดจอ (มือถือ 1 คอลัมน์ จอกว้างขึ้นแบ่งครึ่ง 2 คอลัมน์) */}
      <div className="no-print bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-medium text-sm flex items-center gap-2"><Paperclip size={15} />{t('docStepRecordsTitle')}</h3>
          {canAttach && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--color-border)] text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <FileUp size={13} /> {attachBusy ? 'กำลังอัปโหลด...' : 'แนบไฟล์ (ไม่บังคับ แนบได้หลายไฟล์)'}
              <input type="file" accept="application/pdf,image/*" multiple className="hidden" disabled={attachBusy}
                onChange={e => { if (e.target.files && e.target.files.length) uploadAttachments(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {recordCards.length === 0 && <p className="text-xs text-slate-400">{t('docStepRecordsEmpty')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {recordCards.map(rec => {
            const Icon = rec.icon;
            return (
              <div key={rec.key} className="border border-[var(--color-border)] rounded-lg p-3 space-y-2 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${rec.tone}`}>
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{rec.actorName}</p>
                      <p className="text-xs text-slate-400 truncate">{rec.actionLabel}</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{fmtDateTime(rec.timestamp)}</span>
                </div>

                {rec.note && (
                  <p className="text-sm bg-slate-50 dark:bg-slate-800/40 rounded-lg px-2.5 py-2 whitespace-pre-wrap break-words">{rec.note}</p>
                )}

                {rec.files.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-400">{t('docAttachedFilesLabel')}</p>
                    {rec.files.map(a => (
                      <div key={a.id} className="flex items-center gap-2 border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 text-xs">
                        <FileText size={14} className="text-[var(--color-primary)] shrink-0" />
                        <span className="flex-1 truncate">{a.fileName}</span>
                        <button onClick={() => setPreviewAttachment(a)} className="px-2 py-1 rounded-md border border-[var(--color-border)] shrink-0">{t('docPreview')}</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4 no-print" onMouseDown={e => { if (e.target === e.currentTarget) setPreviewAttachment(null); }}>
          <div className="bg-[var(--color-surface)] rounded-xl w-full max-w-3xl h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="font-medium text-sm truncate">{previewAttachment.fileName}</h3>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    if (isPdf(previewAttachment.fileName)) {
                      printFrameRef.current?.contentWindow?.print();
                    } else if (isImage(previewAttachment.fileName)) {
                      const w = window.open('', '_blank');
                      if (w) {
                        w.document.write(`<html><head><title>${previewAttachment.fileName}</title></head><body style="margin:0"><img src="${previewAttachment.filePath}" style="max-width:100%" onload="window.print()" /></body></html>`);
                        w.document.close();
                      }
                    } else {
                      window.open(previewAttachment.filePath, '_blank');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium"
                >
                  <Printer size={14} /> {t('docPrint')}
                </button>
                <button onClick={() => setPreviewAttachment(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900">
              {isPdf(previewAttachment.fileName) ? (
                <iframe ref={printFrameRef} src={previewAttachment.filePath} className="w-full h-full sm:h-[75vh]" title={previewAttachment.fileName} />
              ) : isImage(previewAttachment.fileName) ? (
                <img src={previewAttachment.filePath} className="max-w-full max-h-full mx-auto object-contain" />
              ) : (
                <p className="p-6 text-sm text-slate-500">{t('docPreviewUnsupported')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2 no-print">{error}</p>}

      {/* แผงปุ่มดำเนินการตามบทบาทและสถานะ */}
      <div className="no-print space-y-3">
        {isReviewer && doc.status === 'pending_office_review' && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
            <h3 className="font-medium text-sm">{t('docReviewBeforeDirectorTitle')}</h3>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('docReviewBeforeDirectorTitle')}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => act('office_review', { decision: 'approve' })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90">
                <CheckCircle size={15} /> {t('docApprove')}
              </button>
              <button disabled={busy} onClick={() => act('office_review', { decision: 'return' })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:opacity-90">
                <RotateCcw size={15} /> {t('docReturnForRevision')}
              </button>
              <button disabled={busy} onClick={() => act('office_review', { decision: 'reject' })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:opacity-90">
                <XCircle size={15} /> {t('docReject')}
              </button>
            </div>
          </div>
        )}

        {isCreator && ['returned', 'returned_for_revision'].includes(doc.status) && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
            <h3 className="font-medium text-sm">{t('docReturnedTitle')}</h3>
            {doc.officeComment && <p className="text-sm bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">{doc.officeComment}</p>}
            <p className="text-xs text-slate-500">{t('docResubmitHint')}</p>
            <button onClick={() => navigate(`/documents/${doc.id}/edit`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90">
              <Pencil size={15} /> {t('docEditTitle')}
            </button>
          </div>
        )}

        {isCreator && doc.status === 'pending_office_review' && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
            <p className="text-xs text-slate-500">{t('docPendingEditHint')}</p>
            <button onClick={() => navigate(`/documents/${doc.id}/edit`)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
              <Pencil size={15} /> {t('docEditWhilePendingTitle')}
            </button>
          </div>
        )}

        {doc.status === 'rejected' && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
            <h3 className="font-medium text-sm">{t('trash')}</h3>
            {doc.officeComment && <p className="text-sm bg-rose-50 dark:bg-rose-950/40 rounded-lg px-3 py-2">{doc.officeComment}</p>}
            {(() => {
              const rejecter = history.find((h: any) => (h.action === 'rejected' || (h.action === 'endorsed')) && doc.rejectedAt && h.timestamp === doc.rejectedAt);
              const rejecterName = rejecter?.actorName;
              const daysLeft = doc.rejectedAt ? Math.max(0, 30 - Math.floor((Date.now() - new Date(doc.rejectedAt).getTime()) / 86400000)) : 0;
              const canRestore = doc.rejectedBy && (doc.rejectedBy === user?.id || user?.role === 'admin') && daysLeft > 0;
              return (
                <>
                  {rejecterName && <p className="text-xs text-slate-500">{t('docTrashedInfo')} {rejecterName}</p>}
                  <p className="text-xs text-slate-500">{t('docRestoreHint')}</p>
                  {doc.rejectedBy && daysLeft === 0 && <p className="text-xs text-rose-600">{t('docRestoreExpired')}</p>}
                  {doc.rejectedBy && daysLeft > 0 && <p className="text-xs text-slate-500">{t('docRestoreDaysLeft')} {daysLeft}</p>}
                  {canRestore && (
                    <button disabled={busy} onClick={() => act('restore')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90">
                      <Undo2 size={15} /> {t('docRestoreButton')}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {isDirector && doc.status === 'pending_director' && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
            <h3 className="font-medium text-sm">{t('docEndorseTitle')}</h3>
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('docEndorseTitle')}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} />
            <div>
              <p className="text-xs text-slate-500 mb-1.5">{t('docSignatureLabel')}</p>
              <SignaturePad onChange={setEndorseSignature} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => act('endorse', { decision: 'approve', signature: endorseSignature })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90">
                <CheckCircle size={15} /> {t('approve') || 'อนุมัติ'}
              </button>
              <button disabled={busy} onClick={() => act('endorse', { decision: 'reject', signature: endorseSignature })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:opacity-90">
                <XCircle size={15} /> ไม่อนุมัติ
              </button>
            </div>
          </div>
        )}

        {canForward && (
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
            <h3 className="font-medium text-sm">{t('docForwardTitle')}</h3>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">แผนก</p>
              <div className="flex flex-wrap gap-2">
                {departments.map(d => (
                  <label key={d.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${forwardDeptIds.includes(d.id) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}>
                    <input type="checkbox" checked={forwardDeptIds.includes(d.id)} onChange={() => toggleForwardDept(d.id)} className="hidden" />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1.5">{t('docOrChoosePerson')}</p>
              <PersonMultiSelect
                people={allUsers.filter(u => u.active).map(u => ({ id: u.id, fullName: u.fullName, position: u.position, departmentNames: (u.departmentIds || []).map((id: string) => departments.find(d => d.id === id)?.name).filter(Boolean) }))}
                values={forwardUserIds} onChange={setForwardUserIds}
              />
            </div>
            <textarea value={forwardInstructions} onChange={e => setForwardInstructions(e.target.value)} placeholder={t('instructions') || 'คำสั่ง/รายละเอียดงาน'}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} />
            <button disabled={busy || (!forwardDeptIds.length && !forwardUserIds.length)} onClick={submitForward}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
              <Send size={15} /> {t('forward') || 'ส่งต่องาน'}
            </button>
          </div>
        )}

        {tasks?.some((t: any) => (t.assignedToUserId === user?.id || (t.assignedToDeptId && isHeadOfDept(t.assignedToDeptId))) && t.status !== 'done') && (
          <div className="bg-[var(--color-surface)] rounded-xl border-2 border-[var(--color-primary)]/40 p-5 space-y-3">
            <h3 className="font-medium text-sm">{t('docTasksAssignedTitle')}</h3>
            {tasks.filter((task: any) => (task.assignedToUserId === user?.id || (task.assignedToDeptId && isHeadOfDept(task.assignedToDeptId))) && task.status !== 'done').map((task: any) => {
              const dept = task.assignedToDeptId ? departments.find(d => d.id === task.assignedToDeptId) : null;
              const isHeadOfDept = dept && (dept as any).headUserId === user?.id;
              const hasBroadRights = ['office_head', 'admin', 'director'].includes(user?.role || '');
              const canDelegate = hasBroadRights || task.assignedToUserId === user?.id || isHeadOfDept;
              const delegateCandidates = hasBroadRights || !task.assignedToDeptId
                ? allUsers.filter(u => u.active && u.id !== user?.id)
                : allUsers.filter(u => u.active && u.id !== user?.id && (u.departmentIds || []).includes(task.assignedToDeptId));
              const isCompleting = completingTaskId === task.id;
              const isDelegating = delegatingTaskId === task.id;
              return (
                <div key={task.id} className="border border-[var(--color-border)] rounded-lg px-3 py-2.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                    <span>{task.instructions || 'ไม่มีคำสั่งเพิ่มเติม'} <span className="text-slate-400">({task.status})</span></span>
                    <div className="flex gap-2 shrink-0 flex-wrap">
                      {task.status === 'pending' && (
                        <button onClick={() => act('acknowledge', { taskId: task.id })} className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-amber-500 text-white hover:opacity-90 shadow-sm">
                          <UserCheck size={15} />รับทราบแล้ว
                        </button>
                      )}
                      {canDelegate && (
                        <button onClick={() => { setDelegatingTaskId(isDelegating ? null : task.id); setCompletingTaskId(null); }} className="flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-slate-800">
                          <Users size={15} />{t('docDelegateWithinDept')}
                        </button>
                      )}
                      <button onClick={() => { setCompletingTaskId(isCompleting ? null : task.id); setCompleteFiles([]); setCompleteNote(''); setDelegatingTaskId(null); }} className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-90 shadow-sm">
                        <CheckCircle size={15} />{t('docComplete')}
                      </button>
                    </div>
                  </div>

                  {isDelegating && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-slate-500">{t('docChooseDelegateTarget')} {!hasBroadRights && task.assignedToDeptId && '(เฉพาะบุคลากรในสังกัดเดียวกัน)'}</p>
                      <PersonSelect people={delegateCandidates.map((u: any) => ({ id: u.id, fullName: u.fullName, position: u.position }))}
                        value={delegateTargetId} onChange={setDelegateTargetId} placeholder="-- เลือกผู้รับมอบหมาย --" />
                      <textarea value={delegateNote} onChange={e => setDelegateNote(e.target.value)} placeholder={t('instructionsOptional') || 'คำสั่ง/หมายเหตุ (ถ้ามี)'}
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} />
                      <button disabled={!delegateTargetId} onClick={async () => {
                        await act('delegate', { taskId: task.id, targetUserId: delegateTargetId, note: delegateNote });
                        setDelegatingTaskId(null); setDelegateTargetId(''); setDelegateNote('');
                      }} className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium disabled:opacity-50">{t('docConfirmForward')}</button>
                    </div>
                  )}

                  {isCompleting && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-slate-500">{t('docCompletionReportLabel')}</p>
                      <textarea value={completeNote} onChange={e => setCompleteNote(e.target.value)} placeholder="เช่น ดำเนินการเรียบร้อยแล้ว..." required
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={3} />
                      <AttachmentPicker files={completeFiles} onChange={setCompleteFiles} disabled={completeBusy} />
                      <button disabled={!completeNote.trim() || completeBusy} onClick={async () => {
                        setCompleteBusy(true);
                        try {
                          await act('complete', { taskId: task.id, note: completeNote });
                          if (completeFiles.length) {
                            const { failed } = await uploadPendingFiles(api, id!, completeFiles, task.id);
                            if (failed.length) alert(`บันทึกเสร็จสิ้นแล้ว แต่แนบไฟล์ไม่สำเร็จ ${failed.length} ไฟล์: ${failed.map(f => f.name).join(', ')}`);
                          }
                          setCompletingTaskId(null); setCompleteNote(''); setCompleteFiles([]);
                          load();
                        } finally { setCompleteBusy(false); }
                      }} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium disabled:opacity-50">
                        {completeBusy ? (t('saving') || 'กำลังบันทึก...') : t('docConfirmComplete')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* สถานะงานที่มอบหมาย — สรุปภาพรวมสั้นๆ ว่างานส่งถึงใคร/แผนกไหนบ้าง ใครรับทราบแล้ว ใครยังไม่รับทราบ
          ใครทำเสร็จแล้ว ดูรวดเดียวจบโดยไม่ต้องไล่อ่านประวัติทั้งหมดทีละบรรทัด */}
      {tasks && tasks.length > 0 && (
        <div className="no-print bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h3 className="font-medium text-sm mb-3">{t('histTaskOverviewTitle') || 'สถานะงานที่มอบหมาย'}</h3>
          <div className="space-y-2">
            {tasks.map((task: any) => {
              const statusMeta = task.status === 'done'
                ? { icon: CheckCircle, tone: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40', label: t('docComplete') || 'เสร็จสิ้น' }
                : task.status === 'acknowledged'
                ? { icon: Clock, tone: 'text-sky-600 bg-sky-100 dark:bg-sky-950/40', label: t('histPendingComplete') || 'รับทราบแล้ว รอดำเนินการ' }
                : { icon: UserCheck, tone: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40', label: t('histPendingAck') || 'ยังไม่รับทราบ' };
              const StatusIcon = statusMeta.icon;
              return (
                <div key={task.id} className="flex items-start gap-3 border border-[var(--color-border)] rounded-lg px-3 py-2.5">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${statusMeta.tone}`}>
                    <StatusIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-medium">{task.assignedToName || '-'}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusMeta.tone}`}>{statusMeta.label}</span>
                    </div>
                    {task.instructions && <p className="text-xs text-slate-500 mt-0.5">{task.instructions}</p>}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t('histAssignedBy') || 'มอบหมายโดย'} {task.assignedByName || '-'} · {fmtDateTime(task.completedAt || task.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ประวัติ */}
      <div className="no-print">
        <h3 className="font-medium text-sm mb-3">{t('docHistoryTitle')}</h3>
        <div className="space-y-0">
          {history.map((h: any, i: number) => {
            const meta = HISTORY_ACTION_META[h.action] || { icon: FileText, key: '', tone: 'text-slate-500 bg-slate-100 dark:bg-slate-800' };
            const Icon = meta.icon;
            const label = (meta.key && t(meta.key)) || h.action;
            return (
              <div key={i} className="flex gap-3 pb-4 last:pb-0">
                <div className="flex flex-col items-center">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${meta.tone}`}>
                    <Icon size={14} />
                  </span>
                  {i < history.length - 1 && <span className="w-px flex-1 bg-[var(--color-border)] mt-1" />}
                </div>
                <div className="pb-1 pt-0.5">
                  <p className="text-sm"><span className="font-medium">{h.actorName}</span> — {label}</p>
                  {h.note && <p className="text-xs text-slate-500 mt-0.5">{h.note}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(h.timestamp)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
