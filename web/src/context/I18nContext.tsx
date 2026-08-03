// src/context/I18nContext.tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dictionaries, type Lang } from '../i18n/dictionaries';
import { api } from '../api/client';

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nState | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'th');
  // คำแปลที่แอดมินแก้ไขเองจากหน้า "จัดการคำแปล" — โหลดมาทับพจนานุกรมเริ่มต้นในโค้ด
  const [overrides, setOverrides] = useState<Record<Lang, Record<string, string>>>({ th: {}, en: {}, zh: {} });

  useEffect(() => {
    api.get('/api/settings').then(s => {
      if (s.i18nOverrides) setOverrides({ th: {}, en: {}, zh: {}, ...s.i18nOverrides });
    }).catch(() => {});
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem('lang', l);
  }
  function t(key: string) {
    return overrides[lang]?.[key] || dictionaries[lang][key] || overrides.th?.[key] || dictionaries.th[key] || key;
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n ต้องใช้ภายใน I18nProvider');
  return ctx;
}
