'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { basePath } from '@/lib/basePath';
import styles from './BusinessCard.module.css';

const EMAIL = 'a410121060@gmail.com';

export function BusinessCard() {
  const { t } = useLanguage();
  const [flipped, setFlipped] = useState(false);
  const flip = () => setFlipped((f) => !f);
  const logoSrc = `${basePath}/images/logo/deer.png`;

  return (
    <div className={styles.wrapper}>
      {/* 卡片本身只處理滑鼠點擊；鍵盤使用者用下方的翻面按鈕，避免按鈕內再包一個 mailto 連結 */}
      <div className={styles.scene} onClick={flip}>
        <div className={`${styles.card} ${flipped ? styles.flipped : ''}`}>
          <div className={`${styles.face} ${styles.front}`} aria-hidden={flipped}>
            <div className={styles.logoPanel}>
              <img src={logoSrc} alt="KFxNet deer" className={styles.logo} />
            </div>
            <div className={styles.info}>
              <div className={styles.identity}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>許展發</span>
                  <span className={styles.alias}>KLIF</span>
                </div>
                <span className={styles.title}>AIxBackend</span>
              </div>
              <div className={styles.contact}>
                <div className={styles.rule} />
                <a
                  href={`mailto:${EMAIL}`}
                  className={styles.email}
                  onClick={(e) => e.stopPropagation()}
                  tabIndex={flipped ? -1 : undefined}
                >
                  {EMAIL}
                </a>
              </div>
            </div>
          </div>
          <div className={`${styles.face} ${styles.back}`} aria-hidden={!flipped}>
            <img src={logoSrc} alt="" className={styles.backLogo} />
            <span className={styles.slogan}>{t.home.card.slogan}</span>
            <span className={styles.brand}>KFxNet</span>
          </div>
        </div>
      </div>
      <button type="button" className={styles.flipButton} onClick={flip} aria-pressed={flipped}>
        {t.home.card.flip}
      </button>
    </div>
  );
}
