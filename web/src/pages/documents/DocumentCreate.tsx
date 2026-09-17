// src/pages/documents/DocumentCreate.tsx
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type DocumentType } from '../../api/client';
import SignaturePad from '../../components/SignaturePad';
import AttachmentPicker, { type PendingFile, uploadPendingFiles } from '../../components/AttachmentPicker';
import TableFieldInput, { type TableRow } from '../../components/TableFieldInput';
import RichTextEditor from '../../components/RichTextEditor';
import FileContentPicker, { type FileContentValue } from '../../components/FileContentPicker';
import { plainTextLength } from '../../utils/richText';
import MemoSheet from '../../components/MemoSheet';
import ScaledMemoPreview from '../../components/ScaledMemoPreview';
import { FileText, Send, ChevronDown, X, Eye } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';

const SUBJECT_MAX = 200;
const DEFAULT_TEXTAREA_MAX = 2000;
const DEFAULT_TEXT_MAX = 200;

export default function DocumentCreate() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [subject, setSubject] = useState('');
  const [fields, setFields] = useState<Record<string, any>>({});
  const [confidential, setConfidential] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [attachFiles, setAttachFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [departments, setDepartments] = useState<{ id: string; name: string; headUserId?: string | null }[]>([]);
  const [targetDeptId, setTargetDeptId] = useState('');
  const formSectionRef = useRef<HTMLDivElement>(null);
  // พรีวิวเอกสาร — เดิม render เป็นคอลัมน์ข้างฟอร์มตลอดเวลา แม้จะย่อขนาดอัตโนมัติแล้ว บนจอมือถือที่แคบ/สั้น
  // ก็ยังกินพื้นที่แนวตั้งเยอะจนต้องเลื่อนหาฟอร์มจริงไกลมาก เปลี่ยนเป็นปุ่มกดแล้วค่อยเปิดดูเป็น modal popup แทน
  // (modal คำนวณขนาดพอดีจอเสมอ ไม่ว่าจะเป็นจอมือถือหรือจอกว้าง เพราะ ScaledMemoPreview ปรับ scale ตามความกว้าง
  // จริงของกล่องที่มันอยู่ ณ ตอนนั้นอยู่แล้ว)
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => { api.get('/api/documentTypes').then(list => setTypes(list.filter((t: DocumentType) => t.active))); }, []);
  useEffect(() => { api.get('/api/settings').then(s => setSchoolName(s.schoolName || '')).catch(() => {}); }, []);
  useEffect(() => { api.get('/api/departments').then(setDepartments).catch(() => {}); }, []);

  const activeType = types.find(t => t.id === typeId);
  const needsDeptPicker = activeType?.workflowMode === 'direct_to_dept' && !activeType.fixedDeptId;

  function updateField(key: string, value: any) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  // เอกสารตัวอย่างสำหรับพรีวิวเรียลไทม์ — ใช้ MemoSheet ตัวเดียวกับที่พิมพ์จริง เพื่อให้ตรงกันเป๊ะๆ
  const previewDoc = {
    subject: subject || t('docSubjectLabel'),
    docNumber: null, docYear: null, createdAt: new Date().toISOString(),
    fields, creatorSignature: signature,
    createdByName: user?.fullName, createdByPosition: user?.position
  };

  // เดิมพอกดเลือกประเภทเอกสาร ฟอร์มด้านล่างจะโผล่ขึ้นมาโดยที่หน้าจอไม่เลื่อนตาม — บนมือถือจอสั้น
  // ผู้ใช้ใหม่จะไม่เห็นว่าฟอร์มโผล่ที่ไหนแล้ว ต้องเลื่อนหาเอง ตอนนี้แก้ 2 จุด:
  //   1. เลือกแล้วเลื่อนจอไปที่ฟอร์มให้อัตโนมัติ (เห็นชัดว่าเลือกแล้วต้องกรอกต่อตรงไหน)
  //   2. ยุบรายการปุ่มเลือกประเภทให้เหลือแค่ "ชิป" ตัวที่เลือกไว้ + ปุ่ม "เปลี่ยน" (ไม่ต้องเลื่อนผ่านปุ่มอื่นๆ อีก)
  function selectType(id: string) {
    setTypeId(id);
    setTimeout(() => formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!typeId || !subject) { setError(t('docMissingTypeOrSubject')); return; }
    if (needsDeptPicker && !targetDeptId) { setError(t('docMissingTargetDept')); return; }
    // ฟิลด์ richtext เป็น contentEditable ไม่ใช่ input/textarea จริง เบราว์เซอร์จึงเช็ค required ให้อัตโนมัติไม่ได้
    const missingRich = activeType?.formSchema?.find(f => f.type === 'richtext' && f.required && plainTextLength(fields[f.key]) === 0);
    if (missingRich) { setError(`กรุณากรอก "${missingRich.label}"`); return; }
    const missingFile = activeType?.formSchema?.find(f => f.type === 'fileContent' && f.required && !fields[f.key]);
    if (missingFile) { setError(`กรุณาแนบไฟล์ "${missingFile.label}"`); return; }
    setBusy(true); setError('');
    try {
      const doc = await api.post('/api/documents', { typeId, subject, fields, confidential, dueDate: dueDate || null, signature, targetDeptId: targetDeptId || undefined });
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

      <div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium mb-1.5">{t('docTypeLabel')}</label>
          {!typeId ? (
            <div className="grid sm:grid-cols-2 gap-2">
              {types.map(t => (
                <button
                  type="button" key={t.id} onClick={() => selectType(t.id)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition border-[var(--color-border)] hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <FileText size={18} className="text-[var(--color-primary)] shrink-0" />
                  <span className="text-sm font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          ) : (
            // ยุบเหลือแค่ชิปตัวที่เลือก — กินพื้นที่จอน้อยลงมาก ฟอร์มด้านล่างจึงอยู่ใกล้ตากว่าเดิม โดยเฉพาะบนมือถือ
            <button
              type="button" onClick={() => setTypeId('')}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 text-left"
            >
              <span className="flex items-center gap-3 min-w-0">
                <FileText size={18} className="text-[var(--color-primary)] shrink-0" />
                <span className="text-sm font-medium truncate">{activeType?.name}</span>
              </span>
              <span className="text-xs text-[var(--color-primary)] shrink-0 flex items-center gap-1">{t('docChangeType')}<ChevronDown size={13} /></span>
            </button>
          )}
        </div>

        {typeId && activeType?.formKind === 'static_pdf' && (
          <div className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3 text-sm">
              {t('docStaticPdfNotice')}
            </div>
            {activeType.staticPdfFileName ? (
              <>
                <div className="border border-[var(--color-border)] rounded-xl overflow-hidden" style={{ height: 500 }}>
                  <iframe src={`/static-forms/${encodeURIComponent(activeType.staticPdfFileName)}`} title={activeType.name} className="w-full h-full" />
                </div>
                <div className="flex gap-2">
                  <a href={`/static-forms/${encodeURIComponent(activeType.staticPdfFileName)}`} download
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90">
                    <FileText size={16} /> {t('docDownloadPdf')}
                  </a>
                  <button type="button" onClick={() => window.open(`/static-forms/${encodeURIComponent(activeType.staticPdfFileName!)}`, '_blank')}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                    {t('docPrintPdf')}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-rose-600">{t('docStaticPdfMissing')}</p>
            )}
          </div>
        )}

        {typeId && activeType?.formKind !== 'static_pdf' && (
          <div ref={formSectionRef} className="space-y-5 scroll-mt-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('docSubjectLabel')}</label>
              <input
                value={subject} onChange={e => setSubject(e.target.value.slice(0, SUBJECT_MAX))} required maxLength={SUBJECT_MAX}
                className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              <p className="text-xs text-slate-400 mt-1 text-right">{subject.length}/{SUBJECT_MAX}</p>
            </div>

            {activeType?.workflowMode === 'direct_to_dept' && (
              <div className="border border-[var(--color-border)] rounded-lg p-3 bg-slate-50 dark:bg-slate-800/40">
                {activeType.fixedDeptId ? (
                  <p className="text-sm">{t('docDirectToDeptFixedLabel')} <span className="font-medium">{departments.find(d => d.id === activeType.fixedDeptId)?.name || '-'}</span></p>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1.5">{t('docTargetDeptLabel')}</label>
                    <select value={targetDeptId} onChange={e => setTargetDeptId(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
                      <option value="">{t('docSelectPlaceholder')}</option>
                      {departments.filter(d => d.headUserId).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1.5">{t('docDirectToDeptHint')}</p>
              </div>
            )}

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
                  ) : f.type === 'radio' ? (
                    <div className="flex flex-wrap gap-3">
                      {(f.options || []).map(o => (
                        <label key={o} className="flex items-center gap-1.5 text-sm">
                          <input type="radio" name={f.key} value={o} checked={fields[f.key] === o} required={f.required} onChange={() => updateField(f.key, o)} />
                          {o}
                        </label>
                      ))}
                      {(!f.options || f.options.length === 0) && <p className="text-xs text-amber-600">(ยังไม่ได้ตั้งค่าตัวเลือก — แจ้งแอดมิน/หัวหน้าสำนักงาน)</p>}
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
                      {(f.type !== 'date' && f.type !== 'time' && f.type !== 'number') && <p className="text-xs text-slate-400 mt-1 text-right">{len}/{max}</p>}
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

            <div className="flex items-center gap-2 flex-wrap">
              <button type="submit" disabled={busy}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-60">
                <Send size={16} /> {busy ? t('docSubmitting') : t('docSubmit')}
              </button>
              <button type="button" onClick={() => setPreviewOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[var(--color-border)] text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                <Eye size={16} /> {t('docLivePreviewTitle')}
              </button>
            </div>
          </div>
        )}
      </form>
      </div>

      {previewOpen && typeId && activeType?.formKind !== 'static_pdf' && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4 no-print"
          onMouseDown={e => { if (e.target === e.currentTarget) setPreviewOpen(false); }}>
          <div className="bg-[var(--color-surface)] rounded-xl w-full max-w-lg h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="font-medium text-sm flex items-center gap-1.5"><FileText size={14} /> {t('docLivePreviewTitle')}</h3>
              <button onClick={() => setPreviewOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 p-3">
              <ScaledMemoPreview maxHeight={640}>
                <MemoSheet doc={previewDoc} type={activeType} schoolName={schoolName} />
              </ScaledMemoPreview>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
