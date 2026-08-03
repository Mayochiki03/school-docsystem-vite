// src/pages/documents/DocumentCreate.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type DocumentType } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';
import AttachmentPicker, { type PendingFile, uploadPendingFiles } from '../../components/AttachmentPicker';
import { FileText, Send } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

const SUBJECT_MAX = 200;
const DEFAULT_TEXTAREA_MAX = 2000;
const DEFAULT_TEXT_MAX = 200;

export default function DocumentCreate() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [subject, setSubject] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [confidential, setConfidential] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [attachFiles, setAttachFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/api/documentTypes').then(list => setTypes(list.filter((t: DocumentType) => t.active))); }, []);

  const activeType = types.find(t => t.id === typeId);

  function updateField(key: string, value: string) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId || !subject) { setError(t('docMissingTypeOrSubject')); return; }
    setBusy(true); setError('');
    try {
      const doc = await api.post('/api/documents', { typeId, subject, fields, confidential, dueDate: dueDate || null, signature });
      if (attachFiles.length > 0) {
        const { failed } = await uploadPendingFiles(api, doc.id, attachFiles);
        if (failed.length > 0) {
          // เอกสารสร้างสำเร็จแล้ว แค่ไฟล์แนบบางไฟล์พลาด — แจ้งให้ชัดว่าไฟล์ไหนบ้าง ไม่ใช่ปล่อยให้ดูเหมือนทุกอย่างพัง
          alert(`สร้างเอกสารสำเร็จ แต่แนบไฟล์ไม่สำเร็จ ${failed.length} ไฟล์: ${failed.map(f => f.name).join(', ')}\nสามารถแนบใหม่ได้จากหน้าเอกสารนี้`);
        }
      }
      navigate(`/documents/${doc.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">{t('docCreateTitle')}</h1>
      <p className="text-sm text-slate-500 mb-6">{t('docCreateSubtitle')}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('docTypeLabel')}</label>
          <div className="grid sm:grid-cols-2 gap-2">
            {types.map(t => (
              <button
                type="button" key={t.id} onClick={() => setTypeId(t.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${
                  typeId === t.id ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 bg-[var(--color-primary)]/5' : 'border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <FileText size={18} className="text-[var(--color-primary)] shrink-0" />
                <span className="text-sm font-medium">{t.name}</span>
              </button>
            ))}
          </div>
        </div>

        {typeId && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('docSubjectLabel')}</label>
              <input
                value={subject} onChange={e => setSubject(e.target.value.slice(0, SUBJECT_MAX))} required maxLength={SUBJECT_MAX}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{subject.length}/{SUBJECT_MAX}</p>
            </div>

            {activeType?.formSchema?.map(f => {
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
                      <p className="text-xs text-slate-400 mt-1 text-right">
                        {len}/{max} ตัวอักษร{max && len >= max * 0.9 ? ' — ใกล้เต็มแล้ว ถ้ามีรายละเอียดมากกว่านี้ แนะนำแนบเป็นไฟล์ PDF เพิ่มด้านล่างแทน' : ''}
                      </p>
                    </>
                  ) : f.type === 'select' ? (
                    <select
                      value={fields[f.key] || ''} onChange={e => updateField(f.key, e.target.value)} required={f.required}
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    >
                      <option value="">{t('docSelectPlaceholder')}</option>
                      {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      {(!f.options || f.options.length === 0) && <option value="" disabled>(ยังไม่ได้ตั้งค่าตัวเลือก — แจ้งแอดมิน/หัวหน้าสำนักงาน)</option>}
                    </select>
                  ) : (
                    <>
                      <input
                        type={f.type === 'date' ? 'date' : 'text'} maxLength={f.type === 'date' ? undefined : max}
                        value={fields[f.key] || ''} onChange={e => updateField(f.key, f.type === 'date' ? e.target.value : e.target.value.slice(0, max))} required={f.required}
                        onClick={f.type === 'date' ? (e => (e.currentTarget as HTMLInputElement).showPicker?.()) : undefined}
                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      />
                      {f.type !== 'date' && <p className="text-xs text-slate-400 mt-1 text-right">{len}/{max}</p>}
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

            <div>
              <AttachmentPicker files={attachFiles} onChange={setAttachFiles} label={t('docAttachOptional')} />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg px-3 py-2">{error}</p>}

            <button type="submit" disabled={busy}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-60">
              <Send size={16} /> {busy ? t('docSubmitting') : t('docSubmit')}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
