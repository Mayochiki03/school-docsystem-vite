// src/pages/admin/AdminSystemLog.tsx
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Activity, Cpu, HardDrive, Clock, RefreshCcw, Pause, Play } from 'lucide-react';
import { fmtDateTime } from '../../utils/datetime';

function fmtUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d} วัน`);
  if (h > 0) parts.push(`${h} ชม.`);
  parts.push(`${m} นาที`);
  return parts.join(' ');
}

const ACTION_LABEL: Record<string, string> = {
  created: 'สร้างเอกสาร', office_review: 'ตรวจกรอง', endorse: 'เกษียนหนังสือ', forward: 'ส่งต่องาน',
  delegate: 'มอบหมายต่อ', acknowledge: 'รับทราบงาน', complete: 'รายงานผลเสร็จสิ้น', resubmit: 'ส่งใหม่หลังตีกลับ',
  grant_permissions: 'มอบสิทธิ์เพิ่มเติม', import_users: 'นำเข้าผู้ใช้งาน', delete_old_nas_backup: 'ลบสำรองข้อมูลเก่า',
  backup: 'สำรองข้อมูล'
};

export default function AdminSystemLog() {
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

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Activity size={20} />สถานะระบบ &amp; Log ภาพรวม</h1>
        <div className="flex items-center gap-2">
          {lastRefresh && <span className="text-xs text-slate-400">อัพเดตล่าสุด {lastRefresh.toLocaleTimeString('th-TH', { hour12: false })}</span>}
          <button onClick={() => setLive(v => !v)} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-[var(--color-border)]">
            {live ? <><Pause size={12} />หยุดรีเฟรชอัตโนมัติ</> : <><Play size={12} />เริ่มรีเฟรชอัตโนมัติ</>}
          </button>
          <button onClick={load} className="p-1.5 rounded-lg border border-[var(--color-border)]"><RefreshCcw size={13} /></button>
        </div>
      </div>

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400 flex items-center gap-1"><Clock size={11} />ทำงานมาแล้ว</p>
            <p className="text-sm font-semibold mt-1">{fmtUptime(status.uptimeSeconds)}</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400 flex items-center gap-1"><Cpu size={11} />หน่วยความจำระบบ</p>
            <p className="text-sm font-semibold mt-1">{memPct}% ใช้งาน</p>
            <p className="text-[10px] text-slate-400">{status.systemMemory.totalMB - status.systemMemory.freeMB}MB / {status.systemMemory.totalMB}MB</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400 flex items-center gap-1"><HardDrive size={11} />ชุดสำรองข้อมูล</p>
            <p className="text-sm font-semibold mt-1">{status.diskInfo?.backupSetCount ?? '-'} ชุด</p>
          </div>
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-3">
            <p className="text-xs text-slate-400">เอกสาร / ผู้ใช้งาน</p>
            <p className="text-sm font-semibold mt-1">{status.docCount} / {status.userCount}</p>
          </div>
        </div>
      )}

      {status && (
        <p className="text-xs text-slate-400">
          Node {status.nodeVersion} · {status.platform} · หน่วยความจำโปรเซสนี้ {status.processMemoryMB}MB
          {!isWindows && ` · Load average: ${status.loadAverage.map((n: number) => n.toFixed(2)).join(', ')}`}
          {isWindows && ' · (Load average ไม่มีค่าจริงบน Windows — เป็นข้อจำกัดของ Node.js เอง ไม่ใช่บั๊ก ใช้ % หน่วยความจำด้านบนแทนได้)'}
        </p>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-medium">กิจกรรมล่าสุดในระบบ (เรียลไทม์)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            หน้านี้แสดงเฉพาะกิจกรรมที่เกิดขึ้น "ในเว็บแอป" เท่านั้น ถ้าเว็บล่มจนเปิดไม่ได้เลย (server process หยุดทำงาน)
            หน้านี้จะใช้ไม่ได้เช่นกัน — กรณีนั้นต้องดูจากไฟล์ log ที่ NSSM ตั้งให้ redirect ไว้ (ดูวิธีตั้งค่าใน README)
          </p>
        </div>
        <div className="max-h-[500px] overflow-y-auto divide-y divide-[var(--color-border)]">
          {logs.map((l, i) => (
            <div key={i} className="px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{ACTION_LABEL[l.action] || l.action}</span>
                <span className="text-xs text-slate-400 shrink-0">{fmtDateTime(l.timestamp)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {l.actorName}
                {l.documentSubject && <> · เอกสาร: {l.documentSubject}</>}
                {l.detail && <> · {l.detail}</>}
              </p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-slate-400 text-center py-8">ยังไม่มีกิจกรรม</p>}
        </div>
      </div>
    </div>
  );
}
