// src/pages/admin/AdminDocumentTypes.tsx
import { useEffect, useRef, useState } from 'react';
import { api, type DocumentType, type FormField, type TableColumn } from '../../api/client';
import { FileStack, Plus, Trash2, Upload, FileText } from 'lucide-react';

interface StaticFormFile { fileName: string; sizeKb: number; uploadedAt: string; }

export default function AdminDocumentTypes() {
  const [list, setList] = useState<DocumentType[]>([]);
  const [editing, setEditing] = useState<DocumentType | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [departments, setDepartments] = useState<{ id: string; name: string; headUserId?: string | null }[]>([]);

  // ---- รายชื่อไฟล์ PDF คงที่ที่มีอยู่แล้ว + ตัวอัปโหลดไฟล์ใหม่ผ่านหน้าเว็บ (แทนพิมพ์ชื่อไฟล์เอง) ----
  const [staticForms, setStaticForms] = useState<StaticFormFile[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadStaticForms() { api.get('/api/static-forms').then(setStaticForms).catch(() => {}); }

  function load() { api.get('/api/documentTypes').then(setList); }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get('/api/departments').then(setDepartments).catch(() => {}); }, []);
  useEffect(() => { loadStaticForms(); }, []);

  async function uploadStaticForm(file: File, overwrite = false) {
    setUploadBusy(true); setUploadError('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await api.post('/api/static-forms', { fileName: file.name, base64, overwrite });
      loadStaticForms();
      if (editing) setEditing({ ...editing, staticPdfFileName: res.fileName });
    } catch (err: any) {
      // ถ้าชื่อซ้ำ ระบบจะถามว่าจะเขียนทับไหม แทนที่จะปฏิเสธเงียบๆ
      if (err.status === 409 && confirm(`${err.message} — เขียนทับไฟล์เดิมเลยไหม?`)) {
        return uploadStaticForm(file, true);
      }
      setUploadError(err.message || 'อัปโหลดไม่สำเร็จ');
    } finally {
      setUploadBusy(false);
    }
  }

  function newType() {
    setEditing({ id: '', name: '', category: 'internal', recipientMode: 'single', active: true, formSchema: [], headerTitle: 'บันทึกข้อความ', formKind: 'digital' } as any);
  }
  function addField() {
    if (!editing) return;
    setEditing({ ...editing, formSchema: [...editing.formSchema, { key: 'field' + (editing.formSchema.length + 1), label: '', type: 'text', required: false }] });
  }
  function updateField(i: number, patch: Partial<FormField>) {
    if (!editing) return;
    const formSchema = editing.formSchema.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    setEditing({ ...editing, formSchema });
  }
  function removeField(i: number) {
    if (!editing) return;
    setEditing({ ...editing, formSchema: editing.formSchema.filter((_, idx) => idx !== i) });
  }
  // ---- คอลัมน์ของฟิลด์ตาราง (type: 'table') ----
  function addColumn(i: number) {
    if (!editing) return;
    const f = editing.formSchema[i];
    const cols = f.columns || [];
    updateField(i, { columns: [...cols, { key: 'col' + (cols.length + 1), label: '', type: 'text' }] });
  }
  function updateColumn(i: number, ci: number, patch: Partial<TableColumn>) {
    if (!editing) return;
    const f = editing.formSchema[i];
    const cols = (f.columns || []).map((c, idx) => (idx === ci ? { ...c, ...patch } : c));
    updateField(i, { columns: cols });
  }
  function removeColumn(i: number, ci: number) {
    if (!editing) return;
    const f = editing.formSchema[i];
    updateField(i, { columns: (f.columns || []).filter((_, idx) => idx !== ci) });
  }
  async function save() {
    if (!editing) return;
    if (editing.id) await api.put(`/api/documentTypes/${editing.id}`, editing);
    else await api.post('/api/documentTypes', editing);
    setEditing(null);
    load();
  }
  async function remove(id: string) {
    if (!confirm('ปิดใช้งานประเภทเอกสารนี้? (จะไม่แสดงในรายการให้เลือกสร้างเอกสารใหม่อีก แต่เอกสารเก่าที่เคยสร้างไว้แล้วยังเปิดดูได้ปกติ — กู้คืนได้ภายหลังผ่านตัวกรอง "แสดงที่ปิดใช้งานแล้ว")')) return;
    await api.del(`/api/documentTypes/${id}`);
    load();
  }
  async function restore(t: DocumentType) {
    await api.put(`/api/documentTypes/${t.id}`, { ...t, active: true });
    load();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2"><FileStack size={20} />ประเภทเอกสาร</h1>
        <button onClick={newType} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium"><Plus size={15} />เพิ่มประเภท</button>
      </div>

      {editing && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-3">
          <input placeholder="ชื่อประเภทเอกสาร" value={editing.name} maxLength={100} onChange={e => setEditing({ ...editing, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          <div>
            <label className="text-xs text-slate-500 block mb-1">ชนิดฟอร์ม</label>
            <select value={editing.formKind || 'digital'} onChange={e => setEditing({ ...editing, formKind: e.target.value as any })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
              <option value="digital">กรอกในระบบ (ปกติ)</option>
              <option value="static_pdf">ไฟล์ PDF คงที่ — ยังไม่รองรับกรอกดิจิทัล ให้ดาวน์โหลด/พิมพ์แทน</option>
            </select>
          </div>
          {editing.formKind === 'static_pdf' ? (
            <div className="border border-[var(--color-border)] rounded-lg p-3 space-y-3 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <label className="text-xs text-slate-500 block mb-1">เลือกไฟล์ PDF ที่จะใช้เป็นฟอร์มนี้</label>
                <select value={editing.staticPdfFileName || ''} onChange={e => setEditing({ ...editing, staticPdfFileName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
                  <option value="">-- ยังไม่ได้เลือกไฟล์ --</option>
                  {staticForms.map(f => (
                    <option key={f.fileName} value={f.fileName}>{f.fileName} ({f.sizeKb} KB)</option>
                  ))}
                </select>
                {editing.staticPdfFileName && !staticForms.some(f => f.fileName === editing.staticPdfFileName) && (
                  <p className="text-xs text-amber-600 mt-1">⚠ ไฟล์ "{editing.staticPdfFileName}" ไม่พบในระบบแล้ว (อาจถูกลบ/ยังไม่ได้อัปโหลด) กรุณาอัปโหลดใหม่หรือเลือกไฟล์อื่น</p>
                )}
                {editing.staticPdfFileName && staticForms.some(f => f.fileName === editing.staticPdfFileName) && (
                  <a href={`/static-forms/${encodeURIComponent(editing.staticPdfFileName)}`} target="_blank" rel="noreferrer"
                    className="text-xs text-[var(--color-primary)] underline">เปิดดูไฟล์นี้เพื่อทดสอบ →</a>
                )}
              </div>
              <div className="border-t border-[var(--color-border)] pt-3">
                <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[var(--color-border)] text-xs font-medium cursor-pointer hover:bg-white dark:hover:bg-slate-800 w-fit">
                  <Upload size={13} /> {uploadBusy ? 'กำลังอัปโหลด...' : 'อัปโหลดไฟล์ PDF ใหม่จากเครื่องนี้'}
                  <input ref={fileInputRef} type="file" accept="application/pdf" disabled={uploadBusy} className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadStaticForm(f); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
                </label>
                <p className="text-xs text-slate-500 mt-1">ไม่ต้องเข้าไปวางไฟล์ในเครื่อง server เองอีกต่อไป — เลือกไฟล์จากเครื่องนี้แล้วอัปโหลดได้เลย ระบบจะตั้งชื่อไฟล์ให้ถูกต้องอัตโนมัติ (ถ้าชื่อมีภาษาไทย/ช่องว่าง ให้เปลี่ยนชื่อไฟล์เป็นอังกฤษ/ตัวเลข/ขีดกลางก่อนอัปโหลด)</p>
                {uploadError && <p className="text-xs text-rose-600 mt-1">{uploadError}</p>}
                {staticForms.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {staticForms.map(f => (
                      <div key={f.fileName} className="flex items-center gap-2 text-xs text-slate-500">
                        <FileText size={12} className="shrink-0" /><span className="truncate flex-1">{f.fileName}</span><span className="shrink-0">{f.sizeKb} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (<>
          <div>
            <label className="text-xs text-slate-500 block mb-1">หัวกระดาษที่จะพิมพ์ (เช่น "บันทึกข้อความ", "หนังสือเข้า", "คำสั่งโรงเรียน", "ประกาศโรงเรียน")</label>
            <input placeholder="บันทึกข้อความ" value={editing.headerTitle || ''} maxLength={40} onChange={e => setEditing({ ...editing, headerTitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={!!(editing as any).hideMemoHeader}
              onChange={e => setEditing({ ...editing, hideMemoHeader: e.target.checked } as any)}
              className="mt-0.5" />
            <span>
              ซ่อนหัวเอกสารมาตรฐาน (ชื่อโรงเรียน / ที่-วันที่ / เรื่อง / เรียน) ตอนพิมพ์
              <span className="block text-xs text-slate-500">ใช้เมื่อฟิลด์ "ข้อความอิสระ" พิมพ์หัวจดหมายเองครบอยู่แล้ว (เช่น พิมพ์ "ที่ ๐๐/๒๕๖๘" และ "เรื่อง ..." เองในเนื้อหา) จะได้ไม่ขึ้นซ้ำสองที่</span>
            </span>
          </label>
          <div className="border border-[var(--color-border)] rounded-lg p-3 space-y-2 bg-slate-50 dark:bg-slate-800/40">
            <label className="text-xs text-slate-500 block">เส้นทางอนุมัติ</label>
            <select value={editing.workflowMode || 'standard'}
              onChange={e => setEditing({ ...editing, workflowMode: e.target.value as any, fixedDeptId: e.target.value === 'standard' ? null : editing.fixedDeptId })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
              <option value="standard">ปกติ — ผ่านหัวหน้าสำนักงานตรวจกรอง แล้วส่งต่อ ผอ. เกษียน</option>
              <option value="direct_to_dept">ส่งตรงถึงหัวหน้าแผนก — ข้ามหัวหน้าสำนักงานและ ผอ. ไปเลย</option>
            </select>
            {editing.workflowMode === 'direct_to_dept' && (
              <div>
                <label className="text-xs text-slate-500 block mb-1">แผนกปลายทาง (ถ้าไม่เลือก ผู้จัดทำเอกสารจะเลือกเองตอนสร้างเอกสาร)</label>
                <select value={editing.fixedDeptId || ''} onChange={e => setEditing({ ...editing, fixedDeptId: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
                  <option value="">-- ให้ผู้จัดทำเอกสารเลือกแผนกเอง --</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}{!d.headUserId ? ' (ยังไม่มีหัวหน้าแผนก)' : ''}</option>
                  ))}
                </select>
                <p className="text-xs text-amber-600 mt-1">⚠ แผนกปลายทางต้องมีการกำหนด "หัวหน้าแผนก" ไว้แล้วที่หน้าจัดการผู้ใช้งาน ไม่งั้นจะไม่มีใครเห็นเอกสารนี้เลย</p>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">ฟิลด์ในฟอร์ม</p>
              <button onClick={addField} className="text-xs text-[var(--color-primary)]">+ เพิ่มฟิลด์</button>
            </div>
            {editing.formSchema.map((f, i) => (
              <div key={i} className="border border-[var(--color-border)] rounded-lg p-2 mb-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input placeholder="ป้ายชื่อ" value={f.label} onChange={e => updateField(i, { label: e.target.value })}
                    className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
                  <select value={f.type} onChange={e => updateField(i, { type: e.target.value as any })}
                    className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
                    <option value="text">ข้อความ</option>
                    <option value="textarea">ข้อความยาว</option>
                    <option value="richtext">ข้อความอิสระ (พิมพ์แบบ Word — ตัวหนา/ลิสต์/เยื้อง/จัดหน้าได้อิสระ)</option>
                    <option value="fileContent">แนบไฟล์เอกสาร (Word/PDF — ระบบแปลงเป็น PDF แสดงตัวอย่างในหน้าเว็บให้เอง)</option>
                    <option value="number">ตัวเลข</option>
                    <option value="date">วันที่</option>
                    <option value="time">เวลา</option>
                    <option value="select">ตัวเลือก (dropdown)</option>
                    <option value="radio">ตัวเลือก (เลือกได้ 1 ข้อ แบบปุ่มกลม)</option>
                    <option value="checkbox">กาถูก/ไม่ถูก (checkbox เดี่ยว)</option>
                    <option value="table">ตารางรายการ (เพิ่ม/ลบแถวได้เอง)</option>
                  </select>
                  <label className="text-xs flex items-center gap-1 shrink-0"><input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} />บังคับ</label>
                  <button onClick={() => removeField(i)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={14} /></button>
                </div>
                {(f.type === 'select' || f.type === 'radio') && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">ตัวเลือก{f.type === 'radio' ? ' (ปุ่มกลม)' : 'ใน dropdown'} (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
                    <input
                      placeholder="เช่น ครูผู้สอน, ธุรการ, การเงิน"
                      value={(f.options || []).join(', ')}
                      onChange={e => updateField(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                      className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm"
                    />
                    {(!f.options || f.options.length === 0) && (
                      <p className="text-xs text-amber-600 mt-1">⚠ ยังไม่ได้กำหนดตัวเลือก — ฟิลด์นี้จะไม่มีอะไรให้เลือกตอนสร้างเอกสารจริง กรุณาใส่ตัวเลือกก่อนบันทึก</p>
                    )}
                  </div>
                )}
                {(f.type === 'text' || f.type === 'textarea') && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">
                      ความยาวสูงสุด (ตัวอักษร) — ป้องกันฟอร์ม A4 ล้นหน้า {f.type === 'textarea' ? '(แนะนำไม่เกิน 2,000 สำหรับเนื้อหา)' : '(แนะนำไม่เกิน 200)'}
                    </label>
                    <input
                      type="number" min={1} placeholder={f.type === 'textarea' ? '2000' : '200'}
                      value={f.maxLength || ''}
                      onChange={e => updateField(i, { maxLength: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-32 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm"
                    />
                  </div>
                )}
                {f.type === 'richtext' && (
                  <p className="text-xs text-slate-500">
                    ผู้กรอกจะเห็นแถบเครื่องมือจัดรูปแบบข้อความ (ตัวหนา ลิสต์ เยื้อง จัดหน้า ฯลฯ) แทนช่องข้อความธรรมดา
                    เหมาะกับฟิลด์ "เนื้อหา" ของเอกสารที่รูปแบบไม่ตายตัว เช่น คำสั่งโรงเรียน
                    {f.key === 'content' && ' — เดิมถ้าใช้ key ชื่อ "content" ระบบจะแสดงเป็นเนื้อหาหลักของเอกสาร (ไม่มีป้ายชื่อกำกับ) เหมือนฟิลด์ข้อความยาวแบบเดิมทุกประการ'}
                  </p>
                )}
                {f.type === 'fileContent' && (
                  <p className="text-xs text-slate-500">
                    ผู้กรอกจะแนบไฟล์ Word (.doc/.docx/.odt/.rtf) หรือ PDF แทนการพิมพ์เนื้อหาในระบบ — ถ้าแนบ Word มา
                    ระบบจะแปลงเป็น PDF ให้อัตโนมัติแล้วแสดงตัวอย่างในหน้าเว็บเลย ควรใช้เพียง 1 ฟิลด์ต่อประเภทเอกสาร
                    และแนะนำให้เปิด "ซ่อนหัวเอกสารมาตรฐาน" ด้านบนคู่กัน เพราะไฟล์ที่แนบมามักมีหัวจดหมายอยู่ในตัวเองแล้ว
                  </p>
                )}
                {f.type === 'table' && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-500 block">คอลัมน์ในตาราง (ผู้กรอกจะกดเพิ่ม/ลบแถวได้เองตอนกรอกจริง)</label>
                    {(f.columns || []).map((c, ci) => (
                      <div key={ci} className="flex items-center gap-2">
                        <input placeholder="ชื่อคอลัมน์ เช่น รายการ, จำนวน" value={c.label}
                          onChange={e => updateColumn(i, ci, { label: e.target.value })}
                          className="flex-1 px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
                        <select value={c.type} onChange={e => updateColumn(i, ci, { type: e.target.value as any })}
                          className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
                          <option value="text">ข้อความ</option>
                          <option value="number">ตัวเลข</option>
                        </select>
                        <button onClick={() => removeColumn(i, ci)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={13} /></button>
                      </div>
                    ))}
                    <button onClick={() => addColumn(i)} className="text-xs text-[var(--color-primary)]">+ เพิ่มคอลัมน์</button>
                    {(!f.columns || f.columns.length === 0) && (
                      <p className="text-xs text-amber-600">⚠ ยังไม่ได้กำหนดคอลัมน์ — ตารางจะว่างเปล่าตอนสร้างเอกสารจริง</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          </>)}
          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">บันทึก</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
        แสดงประเภทที่ปิดใช้งานแล้วด้วย
      </label>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {list.filter(t => t.active || showInactive).map(t => (
          <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${!t.active ? 'opacity-50' : ''}`}>
            <span className="text-sm font-medium flex-1 min-w-0 truncate">
              {t.name}
              {!t.active && <span className="ml-2 text-xs font-normal text-slate-400">(ปิดใช้งานอยู่)</span>}
            </span>
            <button onClick={() => setEditing(t)} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] shrink-0">แก้ไข</button>
            {t.active ? (
              <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-rose-600 shrink-0" title="ปิดใช้งาน"><Trash2 size={15} /></button>
            ) : (
              <button onClick={() => restore(t)} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] text-emerald-600 shrink-0">กู้คืน</button>
            )}
          </div>
        ))}
        {list.filter(t => t.active || showInactive).length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-400">ยังไม่มีประเภทเอกสาร</p>
        )}
      </div>
      <p className="text-xs text-slate-400">
        เอกสารทุกประเภทจะแสดงผล/พิมพ์ด้วยแบบฟอร์มบันทึกข้อความมาตรฐาน (หัวกระดาษ/เรื่อง/เนื้อหา/ลงชื่อ) เหมือนกันทั้งหมด
        ไม่มีการจัดผังหน้ากระดาษแบบลากวางอีกต่อไป เพื่อไม่ให้เอกสารจัดวางเพี้ยน
      </p>
    </div>
  );
}
