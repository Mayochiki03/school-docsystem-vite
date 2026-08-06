// src/pages/admin/AdminDuty.tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import PersonSelect from '../../components/PersonSelect';
import { useI18n } from '../../context/I18nContext';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';

function todayStr() { return new Date().toISOString().slice(0, 10); }

export default function AdminDuty() {
  const { t } = useI18n();
  const DAY_LABELS: Record<number, string> = { 1: t('day_1'), 2: t('day_2'), 3: t('day_3'), 4: t('day_4'), 5: t('day_5'), 6: t('day_6'), 7: t('day_7') };
  const [types, setTypes] = useState<any[]>([]);
  const [heads, setHeads] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [date, setDate] = useState(todayStr());
  const [oversight, setOversight] = useState<{ date: string; rows: any[] } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ title: string; daysOfWeek: number[]; times: string; primaryUserId: string }>({ title: '', daysOfWeek: [1, 2, 3, 4, 5], times: '07:00, 17:00', primaryUserId: '' });

  function load() {
    api.get('/api/duty/types').then(setTypes);
    api.get('/api/duty/heads').then(setHeads);
    api.get('/api/users').then(setUsers);
    api.get('/api/departments').then(setDepts).catch(() => {});
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { api.get(`/api/duty/oversight?date=${date}`).then(setOversight); }, [date]);

  const deptById = Object.fromEntries(depts.map(d => [d.id, d.name]));
  const peopleOptions = users.filter(u => u.active).map(u => ({
    id: u.id, fullName: u.fullName, position: u.position,
    departmentNames: (u.departmentIds || []).map((id: string) => deptById[id]).filter(Boolean)
  }));

  function toggleDay(d: number) {
    setForm(f => ({ ...f, daysOfWeek: f.daysOfWeek.includes(d) ? f.daysOfWeek.filter(x => x !== d) : [...f.daysOfWeek, d].sort() }));
  }

  async function addType() {
    if (!form.title.trim() || !form.primaryUserId) { alert(t('missingTitleOrOwner')); return; }
    const times = form.times.split(',').map(s => s.trim()).filter(Boolean);
    await api.post('/api/duty/types', { title: form.title, daysOfWeek: form.daysOfWeek, times, primaryUserId: form.primaryUserId });
    setForm({ title: '', daysOfWeek: [1, 2, 3, 4, 5], times: '07:00, 17:00', primaryUserId: '' });
    setShowAdd(false);
    load();
  }
  async function disableType(id: string) {
    if (!confirm(t('confirmDisableDuty'))) return;
    await api.del(`/api/duty/types/${id}`);
    load();
  }
  async function setHead(dayOfWeek: number, headUserId: string) {
    if (!headUserId) return;
    await api.post('/api/duty/heads', { dayOfWeek, headUserId });
    load();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2"><ClipboardList size={20} />{t('manageDutyTitle')}</h1>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="font-medium text-sm">{t('dutyTypesTitle')}</h3>
          <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium">
            <Plus size={14} /> {t('addNewDuty')}
          </button>
        </div>

        {showAdd && (
          <div className="p-4 border-b border-[var(--color-border)] space-y-3 bg-slate-50 dark:bg-slate-800/30">
            <input placeholder={t('dutyNamePlaceholder')} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('dutyActiveDaysLabel')}</p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7].map(d => (
                  <label key={d} className={`px-2.5 py-1.5 rounded-lg border text-xs cursor-pointer ${form.daysOfWeek.includes(d) ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10' : 'border-[var(--color-border)]'}`}>
                    <input type="checkbox" checked={form.daysOfWeek.includes(d)} onChange={() => toggleDay(d)} className="hidden" />
                    {DAY_LABELS[d]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('dutyTimeRangeLabel')}</p>
              <input value={form.times} onChange={e => setForm({ ...form, times: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('primaryResponsible')}</p>
              <PersonSelect people={peopleOptions} value={form.primaryUserId} onChange={id => setForm({ ...form, primaryUserId: id })} placeholder={t('docSelectPlaceholder')} />
            </div>
            <button onClick={addType} className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">{t('saveNewDuty')}</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 text-left">
                <th className="px-4 py-2">{t('dutyNameLabel')}</th><th className="px-2 py-2">{t('dutyDayLabel')}</th><th className="px-2 py-2">{t('dutyTimeLabel')}</th>
                <th className="px-2 py-2">{t('dutyOwnerLabel')}</th><th className="px-2 py-2">{t('responsibleToday')}</th><th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {types.map(t2 => (
                <tr key={t2.id} className="border-t border-[var(--color-border)]">
                  <td className="px-4 py-2">{t2.title}</td>
                  <td className="px-2 py-2 text-xs">{t2.dayNames}</td>
                  <td className="px-2 py-2 text-xs">{(t2.times || []).join(', ')}</td>
                  <td className="px-2 py-2 text-xs">{t2.primaryUserName}</td>
                  <td className="px-2 py-2 text-xs">
                    {t2.effectiveTodayUserId && t2.effectiveTodayUserId !== t2.primaryUserId
                      ? <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{t2.effectiveTodayName} {t('coveringLabel')}</span>
                      : t2.effectiveTodayName}
                  </td>
                  <td className="px-2 py-2"><button onClick={() => disableType(t2.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
              {types.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-xs">{t('noDutySetHint')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
        <h3 className="font-medium text-sm mb-1">{t('dailyDutyHeadTitle')}</h3>
        <p className="text-xs text-slate-500 mb-3">{t('dailyDutyHeadHint')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map(d => {
            const h = heads.find(x => x.dayOfWeek === d);
            return (
              <div key={d} className="border border-[var(--color-border)] rounded-lg p-2 text-center">
                <p className="text-xs text-slate-500">{t('dutyDayLabel')}{DAY_LABELS[d]}</p>
                <p className="text-sm font-medium truncate">{h ? h.headName : t('notYetSet')}</p>
                <PersonSelect people={peopleOptions} value="" onChange={id => setHead(d, id)} placeholder={h ? t('changeLabel') : t('setLabel')} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm">{t('dutyLogHistoryTitle')}</h3>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} onClick={e => (e.currentTarget as HTMLInputElement).showPicker?.()} className="px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
        </div>
        <div className="space-y-2">
          {oversight?.rows.map((r, i) => (
            <div key={i} className="border border-[var(--color-border)] rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.title}{r.times?.length > 0 && <span className="text-xs text-slate-400 font-normal"> · {r.times.join(', ')}</span>}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${r.done ? 'bg-emerald-100 text-emerald-700' : r.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                  {r.done ? t('dutyLogged') : r.status === 'draft' ? t('dutySaveDraft') : t('dutyNotLogged')}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{t('responsibleLabel')} {r.ownerName}</p>
              {(r.done || r.status === 'draft') && (
                <>
                  {r.note && <p className="text-xs mt-1">{r.note}{r.ok === false ? ` · ⚠ ${t('dutyAbnormalFound')}` : ''}</p>}
                  {r.photoPaths?.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {r.photoPaths.map((p: string, j: number) => (
                        <a key={j} href={p} target="_blank" rel="noreferrer"><img src={p} className="w-16 h-16 rounded object-cover" /></a>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          {oversight && oversight.rows.length === 0 && <p className="text-xs text-slate-400 text-center py-6">{t('noDutyOnSelectedDate')}</p>}
        </div>
      </div>
    </div>
  );
}
