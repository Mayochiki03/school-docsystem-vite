// src/pages/admin/AdminTranslations.tsx
// หน้าแก้ไขคำแปลทั้งระบบ — แอดมินแก้คำแปลของทุกจุดในเว็บได้เอง (ไทย/อังกฤษ/จีน) โดยไม่ต้องแก้โค้ด
// ค่าที่แก้ที่นี่จะถูกบันทึกไว้ในระบบ (ไม่ใช่แค่ localStorage เครื่องเดียว) มีผลกับผู้ใช้ทุกคนทันที
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { dictionaries, type Lang } from '../../i18n/dictionaries';
import { Languages, Search, Save, RotateCcw } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';

const LANG_LABEL: Record<Lang, string> = { th: 'ไทย', en: 'English', zh: '中文' };

export default function AdminTranslations() {
  const { t } = useI18n();
  const [overrides, setOverrides] = useState<Record<Lang, Record<string, string>>>({ th: {}, en: {}, zh: {} });
  const [draft, setDraft] = useState<Record<Lang, Record<string, string>>>({ th: {}, en: {}, zh: {} });
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function load() {
    api.get('/api/settings').then(s => {
      const o = { th: {}, en: {}, zh: {}, ...(s.i18nOverrides || {}) };
      setOverrides(o);
      setDraft(o);
    });
  }
  useEffect(() => { load(); }, []);

  // ทุกคีย์ที่มีในระบบ (รวมจากทั้ง 3 ภาษา เผื่อบางคีย์มีแค่บางภาษา)
  const allKeys = useMemo(() => {
    const keys = new Set<string>();
    (['th', 'en', 'zh'] as Lang[]).forEach(l => Object.keys(dictionaries[l]).forEach(k => keys.add(k)));
    return Array.from(keys).sort();
  }, []);

  const filteredKeys = search.trim()
    ? allKeys.filter(k =>
        k.toLowerCase().includes(search.toLowerCase()) ||
        (['th', 'en', 'zh'] as Lang[]).some(l => (draft[l]?.[k] || dictionaries[l][k] || '').toLowerCase().includes(search.toLowerCase()))
      )
    : allKeys;

  function setValue(lang: Lang, key: string, value: string) {
    setDraft(prev => ({ ...prev, [lang]: { ...prev[lang], [key]: value } }));
  }
  function resetKey(key: string) {
    setDraft(prev => ({
      th: { ...prev.th, [key]: undefined as any },
      en: { ...prev.en, [key]: undefined as any },
      zh: { ...prev.zh, [key]: undefined as any }
    }));
  }

  async function saveAll() {
    setSaving(true);
    try {
      // ตัดค่าที่ว่างเปล่า/undefined ออกก่อนบันทึก (แปลว่าใช้ค่าเริ่มต้นในโค้ดตามปกติ)
      const clean: Record<Lang, Record<string, string>> = { th: {}, en: {}, zh: {} };
      (['th', 'en', 'zh'] as Lang[]).forEach(l => {
        Object.entries(draft[l] || {}).forEach(([k, v]) => { if (v) clean[l][k] = v; });
      });
      await api.put('/api/settings', { i18nOverrides: clean });
      setOverrides(clean);
      setSavedAt(Date.now());
    } finally { setSaving(false); }
  }

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(overrides);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold flex items-center gap-2"><Languages size={20} />{t('translationsPageTitle')}</h1>
        <button onClick={saveAll} disabled={!hasChanges || saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium disabled:opacity-50">
          <Save size={15} /> {saving ? t('saving') : t('saveAll')}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        {t('translationsPageHint')}
        {savedAt && <span className="text-emerald-600 ml-2">✓ {t('lastSavedAt')} {new Date(savedAt).toLocaleTimeString('th-TH', { hour12: false })}</span>}
      </p>

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('searchWordOrKey')}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-transparent text-sm" />
      </div>

      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 text-left border-b border-[var(--color-border)]">
                <th className="px-3 py-2 w-40">{t('keyColumnLabel')}</th>
                {(['th', 'en', 'zh'] as Lang[]).map(l => <th key={l} className="px-3 py-2">{LANG_LABEL[l]}</th>)}
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredKeys.map(key => {
                const isOverridden = (['th', 'en', 'zh'] as Lang[]).some(l => draft[l]?.[key]);
                return (
                  <tr key={key} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-2 align-top">
                      <code className="text-xs text-slate-400">{key}</code>
                      {isOverridden && <p className="text-[10px] text-amber-600 mt-0.5">{t('edited')}</p>}
                    </td>
                    {(['th', 'en', 'zh'] as Lang[]).map(l => (
                      <td key={l} className="px-3 py-2 align-top">
                        <input
                          value={draft[l]?.[key] ?? ''}
                          placeholder={dictionaries[l][key] || '(ไม่มีค่าเริ่มต้น)'}
                          onChange={e => setValue(l, key, e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-transparent text-xs min-w-[140px]"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 align-top">
                      {isOverridden && (
                        <button onClick={() => resetKey(key)} title={t('useDefault')} className="text-slate-400 hover:text-rose-600"><RotateCcw size={13} /></button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredKeys.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400 text-xs">{t('noWordsMatch')} "{search}"</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
