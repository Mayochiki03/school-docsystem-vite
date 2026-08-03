// src/pages/Announcements.tsx
import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Megaphone, Trash2, Clock } from 'lucide-react';
import { fmtDateTime } from '../utils/datetime';
import { useI18n } from '../context/I18nContext';

export default function Announcements() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [list, setList] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');

  function load() {
    api.get(isAdmin ? '/api/announcements' : '/api/announcements/active').then(setList);
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!message.trim()) return;
    await api.post('/api/announcements', {
      message,
      startAt: startAt ? new Date(startAt).toISOString() : undefined,
      endAt: endAt ? new Date(endAt).toISOString() : undefined
    });
    setMessage(''); setStartAt(''); setEndAt('');
    load();
  }
  async function stopNow(id: string) { await api.post(`/api/announcements/${id}/stop`); load(); }
  async function remove(id: string) {
    if (!confirm(t('confirmDeletePermanent'))) return;
    await api.del(`/api/announcements/${id}`);
    load();
  }

  function scheduleLabel(a: any) {
    const now = Date.now();
    const start = new Date(a.startAt).getTime();
    const end = a.endAt ? new Date(a.endAt).getTime() : null;
    if (start > now) return `${t('announceNotShownYet')} ${fmtDateTime(a.startAt)}`;
    if (end && end <= now) return `${t('announceStoppedAt')} ${fmtDateTime(a.endAt)}`;
    if (end) return `${t('announceShowingWillStop')} ${fmtDateTime(a.endAt)}`;
    return t('announceShowingNoStop');
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{t('announcements')}</h1>

      {isAdmin && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 space-y-3">
          <input value={message} onChange={e => setMessage(e.target.value)} placeholder={t('announcementMessagePlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock size={12} />{t('announceStartAtLabel')}</label>
              <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock size={12} />{t('announceEndAtLabel')}</label>
              <input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
            </div>
          </div>
          <button onClick={create} className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium">{t('announceButton')}</button>
        </div>
      )}

      <div className="space-y-2">
        {list.length === 0 && <p className="text-sm text-slate-400 text-center py-10">{t('noAnnouncements')}</p>}
        {list.map(a => (
          <div key={a.id} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4 flex items-start gap-3">
            <Megaphone size={16} className="text-[var(--color-primary)] mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm">{a.message}</p>
              {isAdmin ? (
                <p className="text-xs text-slate-400 mt-1">{scheduleLabel(a)}</p>
              ) : (
                <p className="text-xs text-slate-400 mt-1">{fmtDateTime(a.startAt)}</p>
              )}
            </div>
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                {a.active && (
                  <button onClick={() => stopNow(a.id)} title={t('stopDisplayNowTitle')} className="text-xs px-2 py-1 rounded-lg border border-[var(--color-border)] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">{t('stopNow')}</button>
                )}
                <button onClick={() => remove(a.id)} title={t('deletePermanently')} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
