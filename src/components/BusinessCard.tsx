'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { basePath } from '@/lib/basePath';
import styles from './BusinessCard.module.css';

const EMAIL = 'a410121060@gmail.com';
const GITHUB_URL = 'https://github.com/cs83312';

export function BusinessCard() {
  const { t } = useLanguage();
  const [flipped, setFlipped] = useState(false);
  const flip = () => setFlipped((f) => !f);
  const logoSrc = `${basePath}/images/logo/deer.png`;
  const avatarSrc = `${basePath}/images/logo/avatar.webp`;

  return (
    <div className={styles.wrapper}>
      {/* 卡片本身只處理滑鼠點擊；鍵盤使用者用下方的翻面按鈕，避免按鈕內再包一個 mailto 連結 */}
      <div className={styles.scene} onClick={flip}>
        <div className={`${styles.card} ${flipped ? styles.flipped : ''}`}>
          <div className={`${styles.face} ${styles.front}`} aria-hidden={flipped}>
            <div className={styles.logoPanel}>
              <img src={avatarSrc} alt="許展發 KLIF" className={styles.avatar} />
            </div>
            <div className={styles.info}>
              <div className={styles.identity}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>許展發</span>
                  <span className={styles.alias}>KLIF</span>
                </div>
                <span className={styles.title}>AI架構與後端軟體</span>
              </div>
              <div className={styles.contact}>
                <div className={styles.rule} />
                <a
                  href={`mailto:${EMAIL}`}
                  className={styles.contactLink}
                  onClick={(e) => e.stopPropagation()}
                  tabIndex={flipped ? -1 : undefined}
                >
                  {EMAIL}
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.contactLink}
                  onClick={(e) => e.stopPropagation()}
                  tabIndex={flipped ? -1 : undefined}
                >
                  {GITHUB_URL.replace('https://', '')}
                </a>
              </div>
            </div>
          </div>
          <div className={`${styles.face} ${styles.back}`} aria-hidden={!flipped}>
            <img src={logoSrc} alt="" className={styles.backLogo} />
            <span className={styles.slogan}>{t.home.card.slogan}</span>
            <ul className={styles.services}>
              {t.home.card.services.map((service) => (
                <li key={service}>{service}</li>
              ))}
            </ul>
            <span className={styles.brand}>KLIF x SparkNet</span>
          </div>
        </div>
      </div>
      <button type="button" className={styles.flipButton} onClick={flip} aria-pressed={flipped}>
        {t.home.card.flip}
      </button>
    </div>
  );
}
