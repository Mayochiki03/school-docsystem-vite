// src/pages/admin/AdminUsers.tsx
// รวมหน้า "ผู้ใช้งาน" และ "แผนก" เข้าด้วยกัน — 1 บัญชีอยู่ได้หลายแผนกพร้อมกัน (เช่น ครูที่ช่วยงานการเงินด้วย)
// มีช่องค้นหาชื่อ (จำเป็นมากเมื่อบุคลากรมีหลักร้อยคน) + กดดูรายชื่อทีละแผนกได้
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, type User, type Capability, type Department } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import PersonSelect from '../../components/PersonSelect';
import {
  Users, Plus, KeyRound, FileSpreadsheet, ShieldCheck, Download, ChevronDown, ChevronUp,
  Building2, Trash2, Search, X, Crown
} from 'lucide-react';

const ROLE_KEYS: Record<string, string> = { admin: 'role_admin', director: 'role_director', office_head: 'role_office_head', staff: 'role_staff', guard: 'role_guard' };

const TEMPLATE_ROWS = [
  ['username', 'password', 'fullName', 'position', 'role', 'department'],
  ['somchai.k', '', 'สมชาย ใจดี', 'ครู', 'staff', 'วิชาการ'],
  ['somsri.p', '1234', 'สมศรี พูนสุข', 'เจ้าหน้าที่ธุรการ', 'staff', 'ธุรการ']
];

function downloadTemplate() {
  const csv = TEMPLATE_ROWS.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'แบบฟอร์มนำเข้าผู้ใช้งาน.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const [list, setList] = useState<User[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const isFullAdmin = me?.role === 'admin' || me?.role === 'office_head';
  const canGrantPermissions = isFullAdmin;
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showDeptManage, setShowDeptManage] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', fullName: '', position: '', role: 'staff', departmentIds: [] as string[] });
  const fileRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importFile, setImportFile] = useState<{ name: string; base64: string } | null>(null);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [permDraft, setPermDraft] = useState<string[]>([]);
  const [deptDraft, setDeptDraft] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState('');

  function load() {
    api.get('/api/users').then(setList);
    api.get('/api/departments').then(setDepts);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (canGrantPermissions) api.get('/api/permissions/list').then(setCapabilities).catch(() => {}); }, [canGrantPermissions]);

  const deptById = useMemo(() => Object.fromEntries(depts.map(d => [d.id, d])), [depts]);
  const memberCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    list.forEach(u => (u.departmentIds || []).forEach(id => { counts[id] = (counts[id] || 0) + 1; }));
    return counts;
  }, [list]);

  const filtered = list.filter(u => {
    if (deptFilter && !(u.departmentIds || []).includes(deptFilter)) return false;
    if (search && !u.fullName.toLowerCase().includes(search.toLowerCase()) && !u.username.toLowerCase().includes(search.toLowerCase()) && !u.position.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function createUser() {
    try {
      await api.post('/api/users', form);
      setForm({ username: '', password: '', fullName: '', position: '', role: 'staff', departmentIds: [] });
      setShowCreate(false);
      load();
    } catch (e: any) { alert(e.message); }
  }
  async function resetPassword(id: string) {
    const pw = prompt('ตั้งรหัสผ่านใหม่ให้ผู้ใช้นี้ (จะดูรหัสเดิมไม่ได้ เปลี่ยนได้เท่านั้น)');
    if (!pw) return;
    await api.put(`/api/users/${id}`, { password: pw });
    alert('เปลี่ยนรหัสผ่านแล้ว');
  }
  async function toggleActive(u: User) {
    await api.put(`/api/users/${u.id}`, { active: !u.active });
    load();
  }

  function openEditor(u: User) {
    if (editingId === u.id) { setEditingId(null); return; }
    setEditingId(u.id);
    setPermDraft(u.extraPermissions || []);
    setDeptDraft(u.departmentIds || []);
  }
  function togglePermDraft(key: string) { setPermDraft(v => v.includes(key) ? v.filter(x => x !== key) : [...v, key]); }
  function toggleDeptDraft(id: string) { setDeptDraft(v => v.includes(id) ? v.filter(x => x !== id) : [...v, id]); }
  async function saveEditor(userId: string) {
    await api.put(`/api/users/${userId}`, { departmentIds: deptDraft });
    if (canGrantPermissions) await api.put(`/api/users/${userId}/permissions`, { extraPermissions: permDraft });
    setEditingId(null);
    load();
  }

  async function createDept() {
    if (!newDeptName.trim()) return;
    await api.post('/api/departments', { name: newDeptName.trim() });
    setNewDeptName('');
    load();
  }
  async function setDeptHead(id: string, headUserId: string) {
    await api.put(`/api/departments/${id}`, { headUserId: headUserId || null });
    load();
  }
  async function removeDept(id: string) {
    if (!confirm('ลบแผนกนี้? สมาชิกในแผนกจะไม่ได้ถูกลบบัญชี แค่เอาออกจากแผนกนี้')) return;
    await api.del(`/api/departments/${id}`);
    if (deptFilter === id) setDeptFilter(null);
    load();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setImportFile({ name: file.name, base64 });
      const preview = await api.post('/api/admin/users/import', { fileName: file.name, base64, preview: true });
      setImportPreview(preview);
    };
    reader.readAsDataURL(file);
  }
  async function confirmImport() {
    if (!importFile) return;
    const result = await api.post('/api/admin/users/import', { fileName: importFile.name, base64: importFile.base64, preview: false });
    alert(`นำเข้าสำเร็จ ${result.created.length} คน (ข้าม ${result.skipped.length} แถว)`);
    setImportPreview(null); setImportFile(null);
    load();
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Users size={20} />{t('usersPageTitle')}</h1>
        <div className="flex gap-2 flex-wrap">
          {isFullAdmin && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" onChange={onFileChosen} />
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm">
                <FileSpreadsheet size={15} /> {t('importFromExcel')}
              </button>
            </>
          )}
          <button onClick={() => setShowCreate(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">
            <Plus size={15} /> {t('addUser')}
          </button>
        </div>
      </div>

      {/* แผนก — เลือกดูสมาชิกทีละแผนก + จัดการแผนกได้ในที่เดียว */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5"><Building2 size={15} />{t('departmentLabel')}</h2>
          {isFullAdmin && (
            <button onClick={() => setShowDeptManage(v => !v)} className="text-xs text-[var(--color-primary)]">
              {showDeptManage ? t('closeLabel') : t('manageDepartments')}
            </button>
          )}
        </div>
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          <button onClick={() => setDeptFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${!deptFilter ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
            ทั้งหมด ({list.length})
          </button>
          {depts.map(d => (
            <button key={d.id} onClick={() => setDeptFilter(d.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${deptFilter === d.id ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]' : 'border-[var(--color-border)]'}`}>
              {d.name} ({memberCounts[d.id] || 0})
            </button>
          ))}
        </div>
        {showDeptManage && isFullAdmin && (
          <div className="px-4 pb-4 space-y-3 bg-slate-50 dark:bg-slate-800/30 border-t border-[var(--color-border)] pt-3">
            <div className="flex gap-2">
              <input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder={t('newDeptNamePlaceholder')}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
              <button onClick={createDept} className="px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm">{t('addDepartment')}</button>
            </div>
            <div className="space-y-2">
              {depts.map(d => (
                <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1 min-w-[100px]">{d.name}</span>
                  <div className="w-full sm:w-56">
                    <PersonSelect
                      people={list.filter(u => (u.departmentIds || []).includes(d.id)).map(u => ({ id: u.id, fullName: u.fullName, position: u.position }))}
                      value={d.headUserId || ''} onChange={id => setDeptHead(d.id, id)} placeholder="-- หัวหน้าแผนก --" allowClear
                    />
                  </div>
                  <button onClick={() => removeDept(d.id)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">{t('deptHeadHint')}</p>
          </div>
        )}
      </div>

      {isFullAdmin && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
          <button onClick={() => setShowTemplate(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium">
            <span className="flex items-center gap-1.5"><FileSpreadsheet size={15} />{t('importTemplateTitle')}</span>
            {showTemplate ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showTemplate && (
            <div className="px-4 pb-4 space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>{TEMPLATE_ROWS[0].map(h => <th key={h} className="border border-[var(--color-border)] px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-left">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {TEMPLATE_ROWS.slice(1).map((row, i) => (
                      <tr key={i}>{row.map((c, j) => <td key={j} className="border border-[var(--color-border)] px-2 py-1.5">{c || <span className="text-slate-400">(เว้นว่าง=สุ่มให้)</span>}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs font-medium">
                <Download size={13} /> {t('downloadCsvTemplate')}
              </button>
              <p className="text-xs text-slate-500">{t('importTemplateHint')}</p>
            </div>
          )}
        </div>
      )}

      {importPreview && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium">{t('importPreviewSummary')} {importPreview.created.length} คน, ข้าม {importPreview.skipped.length} แถว</p>
          <div className="max-h-40 overflow-y-auto text-xs space-y-1">
            {importPreview.created.map((c: any, i: number) => <p key={i}>✓ {c.username} — {c.fullName} ({t(ROLE_KEYS[c.role]) || c.role})</p>)}
            {importPreview.skipped.map((s: any, i: number) => <p key={i} className="text-rose-600">✗ {JSON.stringify(s.row)} — {s.reason}</p>)}
          </div>
          <div className="flex gap-2">
            <button onClick={confirmImport} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm">{t('confirmImport')}</button>
            <button onClick={() => { setImportPreview(null); setImportFile(null); }} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-sm">{t('cancel')}</button>
          </div>
          <p className="text-xs text-slate-500">{t('importColumnsSupported')}</p>
        </div>
      )}

      {showCreate && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 grid sm:grid-cols-2 gap-3">
          <input placeholder={t('usernameLabel')} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          <input placeholder={t('initialPasswordLabel')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          <input placeholder={t('fullNameLabel')} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          <input placeholder={t('positionLabel')} value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          {isFullAdmin && (
            <div>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm">
                {Object.entries(ROLE_KEYS).map(([k, tk]) => <option key={k} value={k}>{t(tk)}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">{t('roleFieldHint')}</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500 mb-1">{t('departmentsMultiHintShort')}</p>
            <p className="text-[11px] text-slate-400 mb-1.5">{t('departmentFieldHint')}</p>
            <div className="flex flex-wrap gap-2">
              {depts.map(d => (
                <label key={d.id} className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${form.departmentIds.includes(d.id) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}>
                  <input type="checkbox" checked={form.departmentIds.includes(d.id)} className="hidden"
                    onChange={() => setForm(f => ({ ...f, departmentIds: f.departmentIds.includes(d.id) ? f.departmentIds.filter(x => x !== d.id) : [...f.departmentIds, d.id] }))} />
                  {d.name}
                </label>
              ))}
            </div>
          </div>
          <button onClick={createUser} className="sm:col-span-2 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">{t('saveNewUser')}</button>
        </div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('usersSearchPlaceholder')}
          className="w-full pl-9 pr-8 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
        {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X size={14} /></button>}
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {filtered.map(u => (
          <div key={u.id}>
            <button onClick={() => openEditor(u)} className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  {u.fullName} <span className="text-xs text-slate-400 font-normal">@{u.username}</span>
                  {(u.role === 'admin' || u.role === 'director') && <Crown size={12} className="text-amber-500" />}
                </p>
                <p className="text-xs text-slate-500">{u.position} · {t(ROLE_KEYS[u.role]) || u.role}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(u.departmentIds || []).map(id => deptById[id] && (
                    <span key={id} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{deptById[id].name}</span>
                  ))}
                  {(u.departmentIds || []).length === 0 && <span className="text-[10px] text-amber-600">{t('noDepartmentYet')}</span>}
                </div>
                {(u.extraPermissions || []).length > 0 && (
                  <p className="text-xs text-[var(--color-primary)] mt-1">{t('extraPermissionsLabel')} {u.extraPermissions!.map(k => capabilities.find(c => c.key === k)?.label || k).join(', ')}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!u.active && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 mr-1">ปิดใช้งาน</span>}
                <span onClick={e => { e.stopPropagation(); resetPassword(u.id); }} title={t('resetPasswordTitle')} className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"><KeyRound size={15} /></span>
                {isFullAdmin && (
                  <span onClick={e => { e.stopPropagation(); toggleActive(u); }} className="text-xs px-2.5 py-1 rounded-lg border border-[var(--color-border)] whitespace-nowrap">
                    {u.active ? t('deactivate') : t('activate')}
                  </span>
                )}
              </div>
            </button>
            {editingId === u.id && (
              <div className="px-4 pb-4 space-y-3 bg-slate-50 dark:bg-slate-800/40">
                <div>
                  <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><Building2 size={12} />{t('departmentsMultiHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    {depts.map(d => (
                      <label key={d.id} className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${deptDraft.includes(d.id) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}>
                        <input type="checkbox" checked={deptDraft.includes(d.id)} onChange={() => toggleDeptDraft(d.id)} className="hidden" />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </div>
                {canGrantPermissions && u.id !== me?.id && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1"><ShieldCheck size={12} />{t('extraPermissionsHint')}</p>
                    <div className="flex flex-wrap gap-2">
                      {capabilities.map(c => (
                        <label key={c.key} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${permDraft.includes(c.key) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}>
                          <input type="checkbox" checked={permDraft.includes(c.key)} onChange={() => togglePermDraft(c.key)} className="hidden" />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => saveEditor(u.id)} className="px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium">บันทึก</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs">{t('cancel')}</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-400 text-center py-8">{t('noUsersMatchFilter')}</p>}
      </div>
    </div>
  );
}
