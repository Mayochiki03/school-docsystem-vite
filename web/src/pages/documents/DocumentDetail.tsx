// src/pages/documents/DocumentDetail.tsx
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Attachment } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import SignaturePad, { TEXT_SIGNATURE_PREFIX } from '../../components/SignaturePad';
import AttachmentPicker, { type PendingFile, uploadPendingFiles } from '../../components/AttachmentPicker';
import PersonMultiSelect from '../../components/PersonMultiSelect';
import PersonSelect from '../../components/PersonSelect';
import { fmtDateTime } from '../../utils/datetime';
import {
  Printer, CheckCircle, XCircle, RotateCcw, Send, UserCheck, X,
  Paperclip, FileUp, FileText, Users
} from 'lucide-react';

function fmtDateThai(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ลายเซ็นเก็บได้ 2 แบบ: รูปภาพ (data:image/... จากวาด/อัปโหลด) หรือข้อความล้วน (พิมพ์ชื่อ)
// ฟังก์ชันนี้ render ให้ถูกแบบ ไม่ยัดทุกอย่างเป็น <img> เหมือนเดิม
function SignatureMark({ value }: { value?: string | null }) {
  if (!value) return null;
  if (value.startsWith(TEXT_SIGNATURE_PREFIX)) {
    const name = value.slice(TEXT_SIGNATURE_PREFIX.length);
    return <span className="italic underline" style={{ fontSize: 18 }}>{name}</span>;
  }
  return <img src={value} />;
}

// แบบฟอร์มบันทึกข้อความมาตรฐาน — ใช้กับเอกสารทุกประเภทเหมือนกันหมด (เอาระบบจัดหน้ากระดาษแบบลากวางออกแล้ว
// เพื่อไม่ให้เอกสารจัดวางเพี้ยน) อ้างอิงหน้าตาจากระบบเดิม: หัวกระดาษ/เรื่อง/เรียน/เนื้อหา + บล็อกลงชื่อผู้จัดทำและผู้เกษียนหนังสือ
function ClassicMemoSheet({ doc, type, history, schoolName }: { doc: any; type: any; history: any[]; schoolName: string }) {
  const fieldsByKey: Record<string, any> = doc.fields || {};
  const knownKeys = ['to', 'content', 'signerName', 'signerPosition'];
  const extraFields = (type?.formSchema || []).filter((f: any) => !knownKeys.includes(f.key));
  const endorseEntry = history.find((h: any) => h.action === 'endorsed' && h.signatureImage);

  return (
    <div className="a4-page">
      <div className="a4-title">{type?.headerTitle || 'บันทึกข้อความ'}</div>
      <div className="a4-school">{schoolName}</div>
      <div className="a4-topline">
        <span>ที่ {doc.docNumber || '-'} / {doc.docYear || '-'}</span>
        <span>วันที่ {fmtDateThai(doc.createdAt)}</span>
      </div>
      <div className="a4-row"><b>เรื่อง</b> {doc.subject}</div>
      {fieldsByKey.to && <div className="a4-row"><b>เรียน</b> {fieldsByKey.to}</div>}
      {extraFields.map((f: any) => (
        <div className="a4-row" key={f.key}><b>{f.label}</b> {fieldsByKey[f.key] || '-'}</div>
      ))}
      {fieldsByKey.content && <div className="a4-content">{fieldsByKey.content}</div>}

      <div className="a4-signblock-right">
        <div className="a4-sigline"><SignatureMark value={doc.creatorSignature} /></div>
        <div>({fieldsByKey.signerName || doc.createdByName || '-'})</div>
        <div>ตำแหน่ง {fieldsByKey.signerPosition || doc.createdByPosition || '-'}</div>
      </div>
      {endorseEntry && (
        <div className="a4-signblock-left">
          {endorseEntry.note ? <div className="a4-note-lines">{endorseEntry.note}</div> : <div className="a4-note-lines">&nbsp;</div>}
          <div className="a4-sigline"><SignatureMark value={endorseEntry.signatureImage} /></div>
          <div>({endorseEntry.actorName})</div>
          <div>{fmtDateThai(endorseEntry.timestamp)}</div>
        </div>
      )}
    </div>
  );
}

function isPdf(fileName: string) { return /\.pdf$/i.test(fileName); }
function isImage(fileName: string) { return /\.(png|jpe?g|gif|webp)$/i.test(fileName); }

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
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90" title="พิมพ์ (A4)">
            <Printer size={16} /> {t('docPrint')}
          </button>
        </div>
      </div>

      {/* กระดาษที่ใช้พิมพ์จริง — ไม่แสดงบนหน้าจอปกติ (#printArea ถูกซ่อนไว้ด้วย CSS) มีผลเฉพาะตอนสั่งพิมพ์เท่านั้น */}
      {createPortal(
        <ClassicMemoSheet doc={doc} type={type} history={history} schoolName={schoolName} />,
        document.getElementById('printArea')!
      )}

      {/* สรุปข้อมูลแบบย่อบนหน้าจอ */}
      <div className="no-print bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6">
        <div className="space-y-3">
          {(type?.formSchema || []).map((f: any) => (
            <div key={f.key} className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
              <span className="text-slate-500">{f.label}</span>
              <span className="sm:col-span-2 font-medium whitespace-pre-wrap break-words">{doc.fields?.[f.key] || '-'}</span>
            </div>
          ))}
          {doc.dueDate && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 text-sm">
              <span className="text-slate-500">{t('docDueDate')}</span>
              <span className="sm:col-span-2 font-medium">{new Date(doc.dueDate).toLocaleDateString('th-TH')}</span>
            </div>
          )}
        </div>
      </div>

      {/* ไฟล์แนบ (PDF/รูป) — แนบเพิ่มได้ทุกช่วง ไม่บังคับ ดูตัวอย่างและสั่งพิมพ์ได้เลยโดยไม่ต้องดาวน์โหลด */}
      <div className="no-print bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm flex items-center gap-2"><Paperclip size={15} />{t('docAttachments')}</h3>
          {canAttach && (
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-[var(--color-border)] text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <FileUp size={13} /> {attachBusy ? 'กำลังอัปโหลด...' : 'แนบไฟล์ (ไม่บังคับ แนบได้หลายไฟล์)'}
              <input type="file" accept="application/pdf,image/*" multiple className="hidden" disabled={attachBusy}
                onChange={e => { if (e.target.files && e.target.files.length) uploadAttachments(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
        {(!attachments || attachments.length === 0) && <p className="text-xs text-slate-400">{t('docNoAttachments')}</p>}
        <div className="space-y-2">
          {attachments?.map(a => (
            <div key={a.id} className="flex items-center gap-3 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm">
              <FileText size={16} className="text-[var(--color-primary)] shrink-0" />
              <span className="flex-1 truncate">{a.fileName}</span>
              <button onClick={() => setPreviewAttachment(a)} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)]">{t('docPreview')}</button>
            </div>
          ))}
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
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('note') || 'หมายเหตุ (ถ้ามี)'}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} />
            <button disabled={busy} onClick={() => act('resubmit')} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90">
              <Send size={15} /> {t('docResubmit')}
            </button>
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
            {tasks.filter((t: any) => (t.assignedToUserId === user?.id || (t.assignedToDeptId && isHeadOfDept(t.assignedToDeptId))) && t.status !== 'done').map((t: any) => {
              const dept = t.assignedToDeptId ? departments.find(d => d.id === t.assignedToDeptId) : null;
              const isHeadOfDept = dept && (dept as any).headUserId === user?.id;
              const hasBroadRights = ['office_head', 'admin', 'director'].includes(user?.role || '');
              const canDelegate = hasBroadRights || t.assignedToUserId === user?.id || isHeadOfDept;
              const delegateCandidates = hasBroadRights || !t.assignedToDeptId
                ? allUsers.filter(u => u.active && u.id !== user?.id)
                : allUsers.filter(u => u.active && u.id !== user?.id && (u.departmentIds || []).includes(t.assignedToDeptId));
              const isCompleting = completingTaskId === t.id;
              const isDelegating = delegatingTaskId === t.id;
              return (
                <div key={t.id} className="border border-[var(--color-border)] rounded-lg px-3 py-2.5 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                    <span>{t.instructions || 'ไม่มีคำสั่งเพิ่มเติม'} <span className="text-slate-400">({t.status})</span></span>
                    <div className="flex gap-2 shrink-0 flex-wrap">
                      {t.status === 'pending' && (
                        <button onClick={() => act('acknowledge', { taskId: t.id })} className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-amber-500 text-white hover:opacity-90 shadow-sm">
                          <UserCheck size={15} />รับทราบแล้ว
                        </button>
                      )}
                      {canDelegate && (
                        <button onClick={() => { setDelegatingTaskId(isDelegating ? null : t.id); setCompletingTaskId(null); }} className="flex items-center gap-1.5 text-sm font-medium px-3.5 py-2 rounded-lg border border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-slate-800">
                          <Users size={15} />{t('docDelegateWithinDept')}
                        </button>
                      )}
                      <button onClick={() => { setCompletingTaskId(isCompleting ? null : t.id); setCompleteFiles([]); setCompleteNote(''); setDelegatingTaskId(null); }} className="flex items-center gap-1.5 text-sm font-semibold px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-90 shadow-sm">
                        <CheckCircle size={15} />{t('docComplete')}
                      </button>
                    </div>
                  </div>

                  {isDelegating && (
                    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-lg p-3 space-y-2">
                      <p className="text-xs text-slate-500">{t('docChooseDelegateTarget')} {!hasBroadRights && t.assignedToDeptId && '(เฉพาะบุคลากรในสังกัดเดียวกัน)'}</p>
                      <PersonSelect people={delegateCandidates.map((u: any) => ({ id: u.id, fullName: u.fullName, position: u.position }))}
                        value={delegateTargetId} onChange={setDelegateTargetId} placeholder="-- เลือกผู้รับมอบหมาย --" />
                      <textarea value={delegateNote} onChange={e => setDelegateNote(e.target.value)} placeholder={t('instructionsOptional') || 'คำสั่ง/หมายเหตุ (ถ้ามี)'}
                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" rows={2} />
                      <button disabled={!delegateTargetId} onClick={async () => {
                        await act('delegate', { taskId: t.id, targetUserId: delegateTargetId, note: delegateNote });
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
                          await act('complete', { taskId: t.id, note: completeNote });
                          if (completeFiles.length) {
                            const { failed } = await uploadPendingFiles(api, id!, completeFiles, t.id);
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

      {/* ประวัติ */}
      <div className="no-print">
        <h3 className="font-medium text-sm mb-3">{t('docHistoryTitle')}</h3>
        <div className="space-y-0">
          {history.map((h: any, i: number) => (
            <div key={i} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)] mt-1.5" />
                {i < history.length - 1 && <span className="w-px flex-1 bg-[var(--color-border)]" />}
              </div>
              <div className="pb-1">
                <p className="text-sm"><span className="font-medium">{h.actorName}</span> — {h.action}</p>
                {h.note && <p className="text-xs text-slate-500 mt-0.5">{h.note}</p>}
                <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(h.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
