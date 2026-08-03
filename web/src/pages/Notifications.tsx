// src/pages/Notifications.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Bell, CheckCheck, BellRing, BellOff, Megaphone } from 'lucide-react';
import { fmtDateTime } from '../utils/datetime';
import { getPushStatus, enablePush, disablePush } from '../lib/push';
import { useI18n } from '../context/I18nContext';

export default function Notifications() {
  const { t } = useI18n();
  const [list, setList] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [pushStatus, setPushStatus] = useState<string>('default');

  function load() {
    api.get('/api/notifications').then(setList);
    api.get('/api/announcements/active').then(setAnnouncements).catch(() => {});
  }
  useEffect(() => { load(); getPushStatus().then(setPushStatus); }, []);

  async function togglePush() {
    try {
      if (pushStatus === 'subscribed') { await disablePush(); setPushStatus('granted'); }
      else { await enablePush(); setPushStatus('subscribed'); }
    } catch (e: any) { alert(e.message); }
  }

  async function testPush() {
    try {
      const r = await api.post('/api/push/test');
      alert(t('pushTestSentMsg').replace('{n}', r.deviceCount));
    } catch (e: any) { alert(e.message); }
  }

  async function markRead(n: any) {
    if (!n.isRead) await api.post(`/api/notifications/${n.id}/read`);
    load();
  }
  async function markAll() { await api.post('/api/notifications/read-all'); load(); }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">{t('notifications')}</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {pushStatus !== 'unsupported' && pushStatus !== 'denied' && (
            <button onClick={togglePush} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--color-primary)]">
              {pushStatus === 'subscribed' ? <><BellOff size={15} />{t('disablePushOnDevice')}</> : <><BellRing size={15} />{t('enablePushOnDevice')}</>}
            </button>
          )}
          {pushStatus === 'subscribed' && (
            <button onClick={testPush} className="text-sm text-[var(--color-primary)] underline">{t('testSendNotification')}</button>
          )}
          <button onClick={markAll} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-[var(--color-primary)]">
            <CheckCheck size={15} /> {t('markAllRead')}
          </button>
        </div>
      </div>

      {pushStatus === 'unsupported' && (
        <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2">
          {t('pushUnsupportedHint')}
        </p>
      )}
      {(pushStatus === 'default' || pushStatus === 'granted') && /iPad|iPhone|iPod/.test(navigator.userAgent) && (
        <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-lg px-3 py-2">
          {t('pushIosRetryHint')}
        </p>
      )}
      {pushStatus === 'denied' && (
        <p className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-950/30 rounded-lg px-3 py-2">
          {t('pushDeniedHint')}
        </p>
      )}

      {announcements.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-500">{t('systemAnnouncementsTitle')}</h2>
          {announcements.map(a => (
            <div key={a.id} className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-4 py-3">
              <Megaphone size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm">{a.message}</p>
                <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(a.startAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
        {list.length === 0 && (
          <div className="p-10 text-center text-slate-400"><Bell className="mx-auto mb-2" size={26} />{t('noNotifications')}</div>
        )}
        {list.map(n => (
          <Link key={n.id} to={n.documentId ? `/documents/${n.documentId}` : '#'} onClick={() => markRead(n)}
            className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}>
            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.isRead ? 'bg-[var(--color-primary)]' : 'bg-transparent'}`} />
            <div className="min-w-0">
              <p className="text-sm">{n.message}</p>
              <p className="text-xs text-slate-400 mt-0.5">{fmtDateTime(n.createdAt)}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
