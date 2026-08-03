// src/pages/admin/AdminBackups.tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Database, RefreshCcw, Mail, HardDrive, Server, CheckCircle2, AlertTriangle, Clock, Eye, X, FileText, Image as ImageIcon } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

// แกะรายละเอียดจากบรรทัด log ดิบๆ ให้อ่านง่ายขึ้น แทนที่จะโชว์ข้อความยาวเป็นพรืดแบบเดิม
function parseLogLine(line: string) {
  const timeMatch = line.match(/^\[(.*?)\]/);
  const time = timeMatch ? new Date(timeMatch[1]).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'medium' }) : null;
  const isBackupLine = line.includes('สำรองข้อมูลสำเร็จ');
  const isEmailLine = line.includes('รายงานอีเมล');
  const destMatch = line.match(/-> (\S+) \(เก็บไว้/);
  const keepMatch = line.match(/เก็บไว้ (\d+) ชุด, ลบของเก่า (\d+) ชุด/);
  const nasOk = line.includes('ซิงค์ขึ้น NAS สำเร็จ');
  const nasFailMatch = line.match(/ซิงค์ขึ้น NAS ล้มเหลว: (.+?)(\||$)/);
  const emailOk = line.includes('รายงานอีเมล: ส่งสำเร็จ');
  const emailSkipMatch = line.match(/รายงานอีเมล: ข้าม \((.+?)\)/);
  return {
    time, isBackupLine, isEmailLine,
    dest: destMatch?.[1],
    kept: keepMatch?.[1], removed: keepMatch?.[2],
    nasOk, nasFailReason: nasFailMatch?.[1],
    emailOk, emailSkipReason: emailSkipMatch?.[1],
    raw: line
  };
}

function LogLineCard({ line }: { line: string }) {
  const { t } = useI18n();
  const p = parseLogLine(line);
  const ok = p.isEmailLine ? (p.emailOk || !!p.emailSkipReason) : (p.isBackupLine && p.nasOk !== false);
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-[var(--color-border)] last:border-0">
      {ok ? <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1 text-xs">
        <p className="flex items-center gap-1.5 text-slate-400"><Clock size={11} />{p.time || '-'}</p>
        {p.isBackupLine ? (
          <div className="mt-0.5 text-slate-600 dark:text-slate-300">
            <p>{t('backupSuccessKept')} {p.kept} ({p.removed})</p>
            {p.nasOk && <p className="text-emerald-600">✓ {t('nasConnected')} NAS</p>}
            {p.nasFailReason && <p className="text-rose-600">✗ {p.nasFailReason}</p>}
          </div>
        ) : p.isEmailLine ? (
          <div className="mt-0.5 text-slate-600 dark:text-slate-300">
            {p.emailOk && <p className="text-emerald-600">✓ {t('testEmailSuccess')}</p>}
            {p.emailSkipReason && <p className="text-amber-600">{t('emailSkipped')} {p.emailSkipReason}</p>}
            {!p.emailOk && !p.emailSkipReason && <p className="text-rose-600">{t('emailSendFailed')}</p>}
          </div>
        ) : (
          <p className="mt-0.5 text-slate-500">{p.raw.replace(/^\[.*?\]\s*/, '')}</p>
        )}
      </div>
    </div>
  );
}

export default function AdminBackups() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [backups, setBackups] = useState<any>(null);
  const [nasStatus, setNasStatus] = useState<any>(null);
  const [monthly, setMonthly] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [viewingUpload, setViewingUpload] = useState<{ name: string; url: string; isImage: boolean; isPdf: boolean } | null>(null);

  function load() {
    if (isAdmin) api.get('/api/admin/backups').then(setBackups);
    api.get('/api/admin/nas-status').then(setNasStatus).catch(() => {});
    api.get('/api/admin/nas-backups/monthly').then(setMonthly).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  async function runNow() {
    setBusy(true);
    try { await api.post('/api/admin/backups/run'); alert(t('backupSuccess')); load(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  async function restore(name: string, source: string) {
    if (!confirm(`${t('confirmRestore')} "${name}"? ${t('confirmRestoreHint')}`)) return;
    try {
      const res = await api.post('/api/admin/backups/restore', { name, source, confirm: true });
      alert(res.message);
    } catch (e: any) { alert(e.message); }
  }
  async function openPreview(name: string, source: 'local' | 'nas') {
    setPreviewLoading(true);
    setPreview({ name, source });
    try {
      const data = await api.get(`/api/admin/backups/${name}/contents?source=${source}`);
      setPreview(data);
    } catch (e: any) {
      setPreview({ name, source, error: e.message });
    } finally {
      setPreviewLoading(false);
    }
  }
  async function testEmail() {
    try { const r = await api.post('/api/admin/backups/test-email'); alert(r.skipped ? r.reason : (r.ok ? t('testEmailSuccess') : t('testEmailFailed') + ' ' + r.error)); }
    catch (e: any) { alert(e.message); }
  }
  async function deleteOldNasBackup(name: string) {
    if (!confirm(`${t('confirmDeleteOldBackup')} "${name}" ${t('confirmDeleteOldBackupHint')}`)) return;
    try { await api.del(`/api/admin/nas-backups/${name}`); load(); }
    catch (e: any) { alert(e.message); }
  }

  const freeGB = nasStatus?.freeBytes ? (nasStatus.freeBytes / 1e9).toFixed(1) : null;
  const totalGB = nasStatus?.totalBytes ? (nasStatus.totalBytes / 1e9).toFixed(1) : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Database size={20} />{t('backupsPageTitle')}</h1>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={testEmail} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--color-border)] text-sm"><Mail size={14} />{t('testEmail')}</button>
            <button disabled={busy} onClick={runNow} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium"><RefreshCcw size={14} />{t('backupNow')}</button>
          </div>
        )}
      </div>

      {/* สถานะ NAS */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><Server size={15} />{t('nasConnectionStatusTitle')}</h3>
        {!nasStatus?.configured && <p className="text-sm text-amber-600">{t('nasNotConfigured')}</p>}
        {nasStatus?.configured && (
          <div className="text-sm space-y-1">
            <p>{t('nasStatusLabel')} {nasStatus.reachable ? <span className="text-emerald-600 font-medium">{t('nasConnected')}</span> : <span className="text-rose-600 font-medium">{t('nasDisconnected')}</span>}</p>
            <p className="text-slate-500">{t('nasAddressLabel')} {nasStatus.path}</p>
            {freeGB && <p className="text-slate-500">{t('nasFreeSpaceLabel')} {freeGB} GB / {totalGB} GB</p>}
          </div>
        )}
      </div>

      {/* สำรองข้อมูลบนเครื่องนี้ */}
      {isAdmin && backups && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
          <h3 className="text-sm font-medium mb-2 flex items-center gap-2"><HardDrive size={15} />{t('localBackupsTitle')}</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {backups.local.slice(0, 10).map((b: any) => (
              <div key={b.name} className="flex items-center justify-between gap-2 text-sm py-1">
                <span className="min-w-0 truncate">{b.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openPreview(b.name, 'local')} title={t('docPreview')} className="text-slate-400 hover:text-[var(--color-primary)]"><Eye size={14} /></button>
                  <button onClick={() => restore(b.name, 'local')} className="text-xs text-[var(--color-primary)]">{t('restoreFromThisSet')}</button>
                </div>
              </div>
            ))}
          </div>
          {backups.logTail && (
            <div className="mt-3 border-t border-[var(--color-border)] pt-2 max-h-64 overflow-y-auto">
              {backups.logTail.trim().split('\n').filter(Boolean).reverse().map((line: string, i: number) => (
                <LogLineCard key={i} line={line} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* NAS รายเดือน */}
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
        <h3 className="text-sm font-medium mb-2">{t('nasMonthlyHistoryTitle')}</h3>
        {(!monthly?.months || monthly.months.length === 0) && <p className="text-sm text-slate-400 py-4 text-center">{t('nasNoDataYet')}</p>}
        <div className="space-y-2">
          {monthly?.months.map((g: any) => {
            const isOld = g.key.includes('เก่ากว่า 1 ปี');
            return (
              <details key={g.key} className={`border rounded-lg ${isOld ? 'border-amber-300 dark:border-amber-800' : 'border-[var(--color-border)]'}`}>
                <summary className="px-3 py-2 text-sm cursor-pointer flex justify-between items-center">
                  <span>{g.key}{isOld && <span className="text-amber-600 text-xs ml-1.5">(ลบได้)</span>}</span><span className="text-slate-400">{g.count} ชุด</span>
                </summary>
                <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
                  {g.items.map((it: any) => (
                    <div key={it.name} className="flex items-center justify-between gap-2 text-xs py-1">
                      <span className="min-w-0 truncate">{it.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => openPreview(it.name, 'nas')} title={t('docPreview')} className="text-slate-400 hover:text-[var(--color-primary)]"><Eye size={13} /></button>
                        {isAdmin && <button onClick={() => restore(it.name, 'nas')} className="text-[var(--color-primary)]">{t('restore')}</button>}
                        {isAdmin && isOld && <button onClick={() => deleteOldNasBackup(it.name)} className="text-rose-600">{t('deletePermanently')}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="bg-[var(--color-surface)] rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="font-medium text-sm truncate">{preview.name}</h3>
              <button onClick={() => setPreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {previewLoading && <p className="text-sm text-slate-400 text-center py-8">{t('loadingBackupContents')}</p>}
              {preview.error && <p className="text-sm text-rose-600">{preview.error}</p>}
              {!previewLoading && !preview.error && (
                <>
                  {preview.summary && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1.5">{t('backupContentsSummary')}</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold">{preview.summary.documents ?? '-'}</p>
                          <p className="text-[11px] text-slate-400">{t('documentsCountLabel')}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold">{preview.summary.users ?? '-'}</p>
                          <p className="text-[11px] text-slate-400">{t('usersCountLabel')}</p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg py-2">
                          <p className="text-lg font-semibold">{preview.summary.announcements ?? '-'}</p>
                          <p className="text-[11px] text-slate-400">{t('announcementsCountLabel')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">{t('attachedFilesTitle')} ({preview.uploads?.length || 0})</p>
                    {preview.source === 'nas' && <p className="text-[11px] text-amber-600 mb-2">{t('nasPreviewNotAvailable')}</p>}
                    {(!preview.uploads || preview.uploads.length === 0) && <p className="text-xs text-slate-400">{t('noAttachedFilesInBackup')}</p>}
                    <div className="space-y-1">
                      {preview.uploads?.map((f: any) => (
                        <div key={f.name} className="flex items-center gap-2 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                          {f.isImage ? <ImageIcon size={14} className="text-[var(--color-primary)] shrink-0" /> : <FileText size={14} className="text-[var(--color-primary)] shrink-0" />}
                          <span className="flex-1 truncate">{f.name}</span>
                          <span className="text-slate-400 shrink-0">{f.sizeLabel}</span>
                          {preview.source === 'local' && (f.isImage || f.isPdf) && (
                            <button
                              onClick={() => setViewingUpload({ name: f.name, url: `/api/admin/backups/${preview.name}/uploads/${encodeURIComponent(f.name)}`, isImage: f.isImage, isPdf: f.isPdf })}
                              className="text-[var(--color-primary)] shrink-0"
                            ><Eye size={13} /></button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingUpload && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-2 sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setViewingUpload(null); }}>
          <div className="bg-[var(--color-surface)] rounded-xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h3 className="font-medium text-sm truncate">{viewingUpload.name}</h3>
              <button onClick={() => setViewingUpload(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900">
              {viewingUpload.isPdf ? (
                <iframe src={viewingUpload.url} className="w-full h-full" title={viewingUpload.name} />
              ) : (
                <img src={viewingUpload.url} className="max-w-full max-h-full mx-auto object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
