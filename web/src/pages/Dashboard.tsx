// src/pages/Dashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { FileText, Clock, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';

interface ActionItem { key: string; docId: string | null; subject: string; typeName: string; meta: string; urgent: boolean; createdAt: string }
interface StatusRow { status: string; label: string; count: number }
interface DashboardData { total: number; overdueCount: number; completedCount: number; actionItems: ActionItem[]; actionCount: number; statusBreakdown: StatusRow[] }

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => { api.get('/api/dashboard').then(setData); }, []);

  const cards = data ? [
    { label: t('dashCardTotal'), value: data.total, icon: FileText, color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40' },
    { label: t('dashCardOverdue'), value: data.overdueCount, icon: AlertTriangle, color: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40' },
    { label: t('dashCardCompleted'), value: data.completedCount, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' },
    { label: t('dashCardPending'), value: data.actionCount, icon: Clock, color: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' },
  ] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('welcomeBack')}, {user?.fullName}</h1>
        <p className="text-sm text-slate-500">{user?.position}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
              <c.icon size={18} />
            </div>
            <p className="text-2xl font-semibold">{c.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* สถานะเอกสารแยกตามขั้นตอน */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="font-semibold mb-4 text-sm">{t('dashStatusBreakdownTitle')}</h2>
          <div className="space-y-3">
            {data?.statusBreakdown.filter(s => s.count > 0).map(s => {
              const max = Math.max(...data.statusBreakdown.map(x => x.count), 1);
              return (
                <Link key={s.status} to={`/documents/all?status=${s.status}`} className="block group">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300 group-hover:text-[var(--color-primary)]">{t('status_' + s.status) || s.label}</span>
                    <span className="font-medium">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-[var(--color-primary)] rounded-full" style={{ width: `${(s.count / max) * 100}%` }} />
                  </div>
                </Link>
              );
            })}
            {data && data.statusBreakdown.every(s => s.count === 0) && (
              <p className="text-sm text-slate-400 py-6 text-center">{t('noData')}</p>
            )}
          </div>
        </div>

        {/* งานที่ต้องดำเนินการ */}
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-5">
          <h2 className="font-semibold mb-4 text-sm">{t('dashActionItemsTitle')}</h2>
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {data?.actionItems.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">{t('dashNoActionItems')}</p>}
            {data?.actionItems.map(item => (
              <Link
                key={item.key}
                to={item.docId ? `/documents/${item.docId}` : '/duty'}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 -mx-1"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${item.urgent ? 'bg-rose-500' : 'bg-slate-300'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.subject}</p>
                  <p className="text-xs text-slate-500">{item.typeName} · {item.meta}</p>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
