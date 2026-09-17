// src/pages/documents/DocumentEdit.tsx
// หน้าแก้ไขเอกสารที่ถูกตีกลับแบบเต็มรูปแบบ — ใช้ชุดฟิลด์เดียวกับหน้าสร้างเอกสาร (DocumentCreate.tsx)
// ดึงข้อมูลเดิมมาเติมให้ครบ แก้ไขได้ทุกช่อง ลบ/แนบไฟล์ PDF ใหม่ได้ แล้วส่งกลับเข้าคิวตรวจกรองอีกครั้ง
// (ประเภทเอกสารเปลี่ยนไม่ได้ เพราะผูกกับ formSchema ที่กรอกไว้แล้ว)
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type DocumentType, type Attachment } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';
import AttachmentPicker, { type PendingFile, uploadPendingFiles } from '../../components/AttachmentPicker';
import TableFieldInput, { type TableRow } from '../../components/TableFieldInput';
import RichTextEditor from '../../components/RichTextEditor';
import FileContentPicker, { type FileContentValue } from '../../components/FileContentPicker';
import { plainTextLength } from '../../utils/richText';
import MemoSheet from '../../components/MemoSheet';
import ScaledMemoPreview from '../../components/ScaledMemoPreview';
import { FileText, Send, Trash2, X, Eye } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';

const SUBJECT_MAX = 200;
const DEFAULT_TEXTAREA_MAX = 2000;
const DEFAULT_TEXT_MAX = 200;

export default function DocumentEdit() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [type, setType] = useState<DocumentType | null>(null);
  const [subject, setSubject] = useState('');
  const [fields, setFields] = useState<Record<string, any>>({});
  const [confidential, setConfidential] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>([]);
  const [newFiles, setNewFiles] = useState<PendingFile[]>([]);
  const [note, setNote] = useState('');
  const [officeComment, setOfficeComment] = useState('');
  const [docStatus, setDocStatus] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [schoolName, setSchoolName] = useState('');
  // พรีวิวเอกสาร — ใช้ปุ่มกดเปิดเป็น modal popup แทนคอลัมน์ข้างฟอร์มที่ตายตัว (เหมือนหน้าสร้างเอกสาร)
  // เพื่อไม่ให้ล้นแนวนอน/กินพื้นที่แนวตั้งเยอะเกินไปบนจอมือถือ
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => { api.get('/api/settings').then(s => setSchoolName(s.schoolName || '')).catch(() => {}); }, []);

  useEffect(() => {
    if (!id) return;
    api.get(`/api/documents/${id}`).then(data => {
      const doc = data.document;
      if (!['returned', 'returned_for_revision', 'pending_office_review'].includes(doc.status)) {
        // เอกสารไม่ได้อยู่ในสถานะที่แก้ไขได้แล้ว (อาจถูกส่งใหม่ไปจากอีกแท็บ) — พากลับไปหน้ารายละเอียดแทน
        navigate(`/documents/${id}`, { replace: true });
        return;
      }
      setType(data.type);
      setDocStatus(doc.status);
      setSubject(doc.subject || '');
      setFields(doc.fields || {});
      setConfidential(!!doc.confidential);
      setDueDate(doc.dueDate ? doc.dueDate.slice(0, 10) : '');
      setSignature(doc.creatorSignature || null);
      setOfficeComment(doc.officeComment || '');
      setExistingAttachments(data.attachments || []);
      setLoading(false);
    }).catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  function updateField(key: string, value: any) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  async function removeExistingAttachment(attId: string) {
    if (!id) return;
    if (!confirm(t('docEditRemoveAttachment') + '?')) return;
    try {
      await api.del(`/api/documents/${id}/attachments/${attId}`);
      setExistingAttachments(prev => prev.filter(a => a.id !== attId));
    } catch (err: any) {
      alert(err.message);
    }
  }

  const previewDoc = {
    subject: subject || t('docSubjectLabel'),
    docNumber: null, docYear: null, createdAt: new Date().toISOString(),
    fields, creatorSignature: signature,
    createdByName: user?.fullName, createdByPosition: user?.position
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !subject) return;
    const missingRich = type?.formSchema?.find(f => f.type === 'richtext' && f.required && plainTextLength(fields[f.key]) === 0);
    if (missingRich) { setError(`กรุณากรอก "${missingRich.label}"`); return; }
    const missingFile = type?.formSchema?.find(f => f.type === 'fileContent' && f.required && !fields[f.key]);
    if (missingFile) { setError(`กรุณาแนบไฟล์ "${missingFile.label}"`); return; }
    setBusy(true); setError('');
    try {
      if (newFiles.length > 0) {
        const { failed } = await uploadPendingFiles(api, id, newFiles);
        if (failed.length > 0) {
          setBusy(false);
          setError(`แนบไฟล์ไม่สำเร็จ ${failed.length} ไฟล์: ${failed.map(f => f.name).join(', ')} — กรุณาลองแนบใหม่อีกครั้ง`);
          return;
        }
      }
      const isPendingReview = docStatus === 'pending_office_review';
      await api.post(`/api/documents/${id}/actions`, {
        action: isPendingReview ? 'update' : 'resubmit', subject, fields, confidential, dueDate: dueDate || null, signature, note
      });
      navigate(`/documents/${id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">{t('loading')}</p>;
  if (!type) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">{docStatus === 'pending_office_review' ? t('docEditWhilePendingTitle') : t('docEditTitle')}</h1>
      <p className="text-sm text-slate-500 mb-1">{type.name}</p>
      <p className="text-sm text-slate-500 mb-6">{t('docEditSubtitle')}</p>

      {officeComment && (
        <div className="mb-5 text-sm bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-2">{officeComment}</div>
      )}

      <div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('docSubjectLabel')}</label>
            <input
              value={subject} onChange={e => setSubject(e.target.value.slice(0, SUBJECT_MAX))} required maxLength={SUBJECT_MAX}
              className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{subject.length}/{SUBJECT_MAX}</p>
          </div>

          {type.formSchema?.map(f => {
            const max = f.maxLength || (f.type === 'textarea' ? DEFAULT_TEXTAREA_MAX : f.type === 'text' ? DEFAULT_TEXT_MAX : undefined);
            const len = (fields[f.key] || '').length;
            return (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1.5">{f.label}{f.required && <span className="text-rose-500"> *</span>}</label>
                {f.type === 'textarea' ? (
                  <>
                    <textarea
                      value={fields[f.key] || ''} onChange={e => updateField(f.key, e.target.value.slice(0, max))} required={f.required} rows={4} maxLength={max}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                    <p className="text-xs text-slate-400 mt-1 text-right">{len}/{max} ตัวอักษร</p>
                  </>
                ) : f.type === 'select' ? (
                  <select
                    value={fields[f.key] || ''} onChange={e => updateField(f.key, e.target.value)} required={f.required}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  >
                    <option value="">{t('docSelectPlaceholder')}</option>
                    {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.type === 'radio' ? (
                  <div className="flex flex-wrap gap-3">
                    {(f.options || []).map(o => (
                      <label key={o} className="flex items-center gap-1.5 text-sm">
                        <input type="radio" name={f.key} value={o} checked={fields[f.key] === o} required={f.required} onChange={() => updateField(f.key, o)} />
                        {o}
                      </label>
                    ))}
                  </div>
                ) : f.type === 'checkbox' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={fields[f.key] === 'true'} onChange={e => updateField(f.key, e.target.checked ? 'true' : 'false')} />
                    {t('docCheckboxYes')}
                  </label>
                ) : f.type === 'table' ? (
                  <TableFieldInput
                    columns={f.columns || []}
                    value={(fields[f.key] as TableRow[]) || []}
                    onChange={rows => updateField(f.key, rows)}
                  />
                ) : f.type === 'richtext' ? (
                  <RichTextEditor
                    value={fields[f.key] || ''}
                    onChange={html => updateField(f.key, html)}
                  />
                ) : f.type === 'fileContent' ? (
                  <FileContentPicker
                    value={fields[f.key] as FileContentValue | undefined}
                    onChange={v => updateField(f.key, v)}
                    required={f.required}
                  />
                ) : (
                  <>
                    <input
                      type={f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : f.type === 'number' ? 'number' : 'text'}
                      maxLength={(f.type === 'date' || f.type === 'time' || f.type === 'number') ? undefined : max}
                      value={fields[f.key] || ''} onChange={e => updateField(f.key, (f.type === 'date' || f.type === 'time' || f.type === 'number') ? e.target.value : e.target.value.slice(0, max))} required={f.required}
                      onClick={(f.type === 'date' || f.type === 'time') ? (e => (e.currentTarget as HTMLInputElement).showPicker?.()) : undefined}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    />
                  </>
                )}
              </div>
            );
          })}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('docDueDateOptional')}</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} onClick={e => (e.currentTarget as HTMLInputElement).showPicker?.()}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]" />
            </div>
            <label className="flex items-center gap-2 mt-6 text-sm">
              <input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} />
              {t('docConfidential')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('docCreatorSignatureLabel')}</label>
            <SignaturePad onChange={setSignature} />
          </div>

          {existingAttachments.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('docAttachOptional')}</label>
              <div className="space-y-2">
                {existingAttachments.map(a => (
                  <div key={a.id} className="flex items-center gap-3 border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm">
                    <FileText size={16} className="text-[var(--color-primary)] shrink-0" />
                    <span className="flex-1 truncate">{a.fileName}</span>
                    <button type="button" onClick={() => removeExistingAttachment(a.id)}
                      className="text-slate-400 hover:text-rose-600 shrink-0" title={t('docEditRemoveAttachment')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <AttachmentPicker files={newFiles} onChange={setNewFiles} label={t('docEditAddNewAttachment')} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('note')}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex items-center gap-2 flex-wrap">
            <button type="submit" disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-60">
              <Send size={16} /> {busy ? t('docSubmitting') : (docStatus === 'pending_office_review' ? t('docSaveButton') : t('docEditSaveButton'))}
            </button>
            <button type="button" onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
              <Eye size={16} /> {t('docLivePreviewTitle')}
            </button>
          </div>
        </form>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4 no-print"
          onMouseDown={e => { if (e.target === e.currentTarget) setPreviewOpen(false); }}>
          <div className="bg-[var(--color-surface)] rounded-xl w-full max-w-lg h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="font-medium text-sm flex items-center gap-1.5"><FileText size={14} /> {t('docLivePreviewTitle')}</h3>
              <button onClick={() => setPreviewOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-3">
              <ScaledMemoPreview maxHeight={640}>
                <MemoSheet doc={previewDoc} type={type} schoolName={schoolName} />
              </ScaledMemoPreview>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
