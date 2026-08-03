// src/pages/admin/AdminDepartments.tsx
import { useEffect, useState } from 'react';
import { api, type Department, type User } from '../../api/client';
import { Building2, Plus, Trash2 } from 'lucide-react';

export default function AdminDepartments() {
  const [list, setList] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');

  function load() {
    api.get('/api/departments').then(setList);
    api.get('/api/users').then(setUsers).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!name.trim()) return;
    await api.post('/api/departments', { name });
    setName('');
    load();
  }
  async function setHead(id: string, headUserId: string) {
    await api.put(`/api/departments/${id}`, { headUserId: headUserId || null });
    load();
  }
  async function remove(id: string) {
    if (!confirm('ลบแผนกนี้?')) return;
    await api.del(`/api/departments/${id}`);
    load();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><Building2 size={20} />จัดการแผนก</h1>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="ชื่อแผนกใหม่"
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
        <button onClick={create} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium"><Plus size={15} />เพิ่ม</button>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
        {list.map(d => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="text-sm font-medium flex-1 min-w-[100px] truncate">{d.name}</span>
            <select value={d.headUserId || ''} onChange={e => setHead(d.id, e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm max-w-full w-full sm:w-auto">
              <option value="">-- หัวหน้าแผนก --</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
            <button onClick={() => remove(d.id)} className="text-slate-400 hover:text-rose-600 shrink-0"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
