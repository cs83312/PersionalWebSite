'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dictionary, type Language } from '@/lib/dictionary';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: typeof dictionary.zh;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = 'kfxnet-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('zh');

  useEffect(() => {
    const stored = safeGetItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') {
      setLanguageState(stored);
    }
  }, []);

  function setLanguage(next: Language) {
    setLanguageState(next);
    safeSetItem(STORAGE_KEY, next);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: dictionary[language] as typeof dictionary.zh }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
