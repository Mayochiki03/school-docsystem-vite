// src/pages/Guard.tsx
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { ShieldAlert } from 'lucide-react';
import { useI18n } from '../context/I18nContext';

export default function Guard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isGuard = user?.role === 'guard';
  const [data, setData] = useState<any>(null);
  const [noteBySlot, setNoteBySlot] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function load() { api.get('/api/guard/today').then(setData).catch(() => {}); }
  useEffect(() => { load(); }, []);

  async function submit(slot: any) {
    const note = noteBySlot[slot.itemId + slot.scheduledTime] || '';
    setBusy(true);
    try {
      await api.post('/api/guard/logs', { itemId: slot.itemId, scheduledTime: slot.scheduledTime, note, photos: [] });
      load();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  if (!data) return <p className="text-sm text-slate-400">{t('guardLoadingHint')}</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold flex items-center gap-2"><ShieldAlert size={20} />{t('guardChecklistTitle')} ({data.date})</h1>
      {data.slots.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">{t('guardNoItemsConfigured')}</p>}
      {data.slots.map((s: any) => (
        <div key={s.itemId + s.scheduledTime} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium">{s.title} — {s.scheduledTime}</p>
            {s.done ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{t('guardChecked')}</span> : <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">{t('guardNotChecked')}</span>}
          </div>
          {s.description && <p className="text-xs text-slate-500 mb-2">{s.description}</p>}
          {s.done ? (
            <p className="text-sm text-slate-500">{s.log.note || t('guardNoAdditionalNote')} — {s.log.guardName}</p>
          ) : isGuard ? (
            <div className="flex gap-2">
              <input value={noteBySlot[s.itemId + s.scheduledTime] || ''} onChange={e => setNoteBySlot(prev => ({ ...prev, [s.itemId + s.scheduledTime]: e.target.value }))}
                placeholder={t('guardNotePlaceholder')} className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
              <button disabled={busy} onClick={() => submit(s)} className="px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm">{t('guardSaveCheck')}</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
