'use client';

import { useLanguage } from '@/context/LanguageContext';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={styles.switcher}>
      <button
        type="button"
        className={language === 'zh' ? styles.active : styles.inactive}
        onClick={() => setLanguage('zh')}
      >
        中
      </button>
      <button
        type="button"
        className={language === 'en' ? styles.active : styles.inactive}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
    </div>
  );
}
