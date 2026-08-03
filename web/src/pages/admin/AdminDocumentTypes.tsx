// src/pages/admin/AdminDocumentTypes.tsx
import { useEffect, useState } from 'react';
import { api, type DocumentType, type FormField } from '../../api/client';
import { FileStack, Plus, Trash2 } from 'lucide-react';

export default function AdminDocumentTypes() {
  const [list, setList] = useState<DocumentType[]>([]);
  const [editing, setEditing] = useState<DocumentType | null>(null);

  function load() { api.get('/api/documentTypes').then(setList); }
  useEffect(() => { load(); }, []);

  function newType() {
    setEditing({ id: '', name: '', category: 'internal', recipientMode: 'single', active: true, formSchema: [], headerTitle: 'บันทึกข้อความ' } as any);
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
  async function save() {
    if (!editing) return;
    if (editing.id) await api.put(`/api/documentTypes/${editing.id}`, editing);
    else await api.post('/api/documentTypes', editing);
    setEditing(null);
    load();
  }
  async function remove(id: string) {
    if (!confirm('ลบประเภทเอกสารนี้?')) return;
    await api.del(`/api/documentTypes/${id}`);
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
            <label className="text-xs text-slate-500 block mb-1">หัวกระดาษที่จะพิมพ์ (เช่น "บันทึกข้อความ", "หนังสือเข้า", "คำสั่งโรงเรียน", "ประกาศโรงเรียน")</label>
            <input placeholder="บันทึกข้อความ" value={editing.headerTitle || ''} maxLength={40} onChange={e => setEditing({ ...editing, headerTitle: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
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
                    <option value="date">วันที่</option>
                    <option value="select">ตัวเลือก (dropdown)</option>
                  </select>
                  <label className="text-xs flex items-center gap-1 shrink-0"><input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} />บังคับ</label>
                  <button onClick={() => removeField(i)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={14} /></button>
                </div>
                {f.type === 'select' && (
                  <div>
                    <label className="text-xs text-slate-500 block mb-1">ตัวเลือกใน dropdown (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
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
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">บันทึก</button>
            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm">ยกเลิก</button>
          </div>
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {list.map(t => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <span className="text-sm font-medium flex-1 min-w-0 truncate">{t.name}</span>
            <button onClick={() => setEditing(t)} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] shrink-0">แก้ไข</button>
            <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        เอกสารทุกประเภทจะแสดงผล/พิมพ์ด้วยแบบฟอร์มบันทึกข้อความมาตรฐาน (หัวกระดาษ/เรื่อง/เนื้อหา/ลงชื่อ) เหมือนกันทั้งหมด
        ไม่มีการจัดผังหน้ากระดาษแบบลากวางอีกต่อไป เพื่อไม่ให้เอกสารจัดวางเพี้ยน
      </p>
    </div>
  );
}
