// src/pages/admin/AdminSystemLog.tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Activity, Cpu, HardDrive, Clock, RefreshCcw, Pause, Play, Database } from 'lucide-react';
import { fmtDateTime } from '../../utils/datetime';
import { useI18n } from '../../context/I18nContext';

function fmtUptime(seconds: number, t: (k: string) => string) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}${t('dayUnitShort')}`);
  if (h > 0) parts.push(`${h}${t('hourUnitShort')}`);
  parts.push(`${m}${t('minuteUnitShort')}`);
  return parts.join(' ');
}

const ACTION_LABEL_KEYS: Record<string, string> = {
  created: 'sysLogAction_created', office_review: 'sysLogAction_office_review', endorse: 'sysLogAction_endorse',
  forward: 'sysLogAction_forward', delegate: 'sysLogAction_delegate', acknowledge: 'sysLogAction_acknowledge',
  complete: 'sysLogAction_complete', resubmit: 'sysLogAction_resubmit', grant_permissions: 'sysLogAction_grant_permissions',
  import_users: 'sysLogAction_import_users', delete_old_nas_backup: 'sysLogAction_delete_old_nas_backup', backup: 'sysLogAction_backup'
};

export default function AdminSystemLog() {
  const { t } = useI18n();
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [live, setLive] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  function load() {
    api.get('/api/admin/system-status').then(setStatus).catch(() => {});
    api.get('/api/admin/system-log?limit=150').then(l => { setLogs(l); setLastRefresh(new Date()); }).catch(() => {});
  }

  useEffect(() => {
    load();
    if (!live) return;
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const memPct = status ? Math.round(((status.systemMemory.totalMB - status.systemMemory.freeMB) / status.systemMemory.totalMB) * 100) : 0;
  const isWindows = status?.platform?.toLowerCase().includes('win32');
  const disk = status?.localDisk;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Activity size={20} />{t('sysLogTitle')}
          {status?.appVersion && <span className="text-xs font-normal text-slate-400">v{status.appVersion}</span>}
        </h1>
        <div className="flex items-center gap-2">
          {lastRefresh && <span className="text-xs text-slate-400">{t('sysLogLastUpdated')} {lastRefresh.toLocaleTimeString('th-TH', { hour12: false })}</span>}
          <button onClick={() => setLive(v => !v)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)]">
            {live ? <><Pause size={12} />{t('sysLogPauseRefresh')}</> : <><Play size={12} />{t('sysLogStartRefresh')}</>}
          </button>
          <button onClick={load} className="p-1.5 rounded-lg border border-[var(--color-border)]"><RefreshCcw size={13} /></button>
        </div>
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11} />{t('sysLogUptime')}</p>
            <p className="text-sm font-semibold mt-1">{fmtUptime(status.uptimeSeconds, t)}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400 flex items-center gap-1"><Cpu size={11} />{t('sysLogMemory')}</p>
            <p className="text-sm font-semibold mt-1">{memPct}{t('sysLogMemoryUsedSuffix')}</p>
            <p className="text-[10px] text-slate-400">{status.systemMemory.totalMB - status.systemMemory.freeMB}MB / {status.systemMemory.totalMB}MB</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400 flex items-center gap-1"><HardDrive size={11} />{t('sysLogBackupSets')}</p>
            <p className="text-sm font-semibold mt-1">{status.diskInfo?.backupSetCount ?? '-'} {t('sysLogBackupUnit')}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400">{t('sysLogDocsUsers')}</p>
            <p className="text-sm font-semibold mt-1">{status.docCount} / {status.userCount}</p>
          </div>
        </div>
      )}

      {status && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <p className="text-xs text-slate-400 flex items-center gap-1 mb-2"><Database size={12} />{t('sysLogDiskTitle')}</p>
          {disk?.available ? (
            <>
              <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${disk.usedPct >= 90 ? 'bg-rose-500' : disk.usedPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(100, disk.usedPct ?? 0)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
                <span>{t('sysLogDiskUsed')}: {(disk.usedMB / 1024).toFixed(1)}GB ({disk.usedPct}%)</span>
                <span>{t('sysLogDiskFree')}: {(disk.freeMB / 1024).toFixed(1)}GB</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1 break-all">{t('sysLogDiskPath')}: {disk.path}</p>
              {disk.usedPct >= 85 && <p className="text-xs text-rose-600 mt-2">{t('sysLogDiskLow')}</p>}
            </>
          ) : (
            <p className="text-xs text-slate-400">{t('sysLogDiskUnavailable')}{disk?.reason ? ` (${disk.reason})` : ''}</p>
          )}
        </div>
      )}

      {status && (
        <p className="text-xs text-slate-400">
          Node {status.nodeVersion} · {status.platform} · {t('sysLogProcessMemory')} {status.processMemoryMB}MB
          {!isWindows && ` · ${t('sysLogLoadAvgLinux')}: ${status.loadAverage.map((n: number) => n.toFixed(2)).join(', ')}`}
          {isWindows && ` · ${t('sysLogLoadAvgWindowsNote')}`}
        </p>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-medium">{t('sysLogActivityTitle')}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{t('sysLogActivityDesc')}</p>
        </div>
        <div className="max-h-[500px] overflow-y-auto divide-y divide-[var(--color-border)]">
          {logs.map((l, i) => (
            <div key={i} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ACTION_LABEL_KEYS[l.action] ? t(ACTION_LABEL_KEYS[l.action]) : l.action}</span>
                <span className="text-xs text-slate-400 shrink-0">{fmtDateTime(l.timestamp)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {l.actorName}
                {l.documentSubject && <> · {l.documentSubject}</>}
                {l.detail && <> · {l.detail}</>}
              </p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-slate-400 text-center py-8">{t('sysLogNoActivity')}</p>}
        </div>
      </div>
    </div>
  );
}
