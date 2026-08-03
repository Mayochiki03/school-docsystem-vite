// src/pages/documents/DocumentList.tsx
import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api, type DocDoc } from '../../api/client';
import { FileText, Clock } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

const STATUS_COLOR: Record<string, string> = {
  pending_office_review: 'bg-amber-100 text-amber-700', returned_for_revision: 'bg-orange-100 text-orange-700',
  pending_director: 'bg-blue-100 text-blue-700', returned: 'bg-orange-100 text-orange-700',
  endorsed: 'bg-indigo-100 text-indigo-700', in_progress: 'bg-sky-100 text-sky-700',
  completed: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700'
};

export default function DocumentList({ box, titleKey }: { box: string; titleKey: string }) {
  const { t } = useI18n();
  const [docs, setDocs] = useState<DocDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [params] = useSearchParams();
  const statusFilter = params.get('status');

  useEffect(() => {
    setLoading(true);
    const boxParam = box === 'all' ? '' : `?box=${box}`;
    api.get(`/api/documents${boxParam}`).then(setDocs).finally(() => setLoading(false));
  }, [box]);

  const filtered = docs
    .filter(d => !statusFilter || d.status === statusFilter)
    .filter(d => !q || d.subject.toLowerCase().includes(q.toLowerCase()) || (d.docNumber || '').includes(q))
    .sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return sortOrder === 'newest' ? diff : -diff;
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={sortOrder} onChange={e => setSortOrder(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]">
            <option value="newest">{t('sortNewestFirst')}</option>
            <option value="oldest">{t('sortOldestFirst')}</option>
          </select>
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder={t('searchDocPlaceholder')}
            className="px-3 py-2 rounded-lg border border-[var(--color-border)] bg-transparent text-sm w-64 max-w-full focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">{t('loading')}</p>}
      {!loading && filtered.length === 0 && (
        <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-10 text-center text-slate-400">
          <FileText className="mx-auto mb-2" size={28} />
          {t('noDocumentsInList')}
        </div>
      )}

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
        {filtered.map(d => (
          <Link key={d.id} to={`/documents/${d.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
              <FileText size={16} className="text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{d.subject}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                {d.docNumber && <span>{d.docNumber}/{d.docYear} · </span>}
                <Clock size={12} /> {new Date(d.createdAt).toLocaleDateString('th-TH')}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLOR[d.status] || 'bg-slate-100 text-slate-600'}`}>
              {t('status_' + d.status) || d.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
