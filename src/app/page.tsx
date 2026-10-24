'use client';

import { BusinessCard } from '@/components/BusinessCard';
import { LightningCanvas } from '@/components/LightningCanvas';
import { useLanguage } from '@/context/LanguageContext';
import styles from './page.module.css';

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <section className={styles.hero}>
      <LightningCanvas />
      <h1 className={styles.brand}>{t.home.brand}</h1>
      <p className={styles.tagline}>{t.home.tagline}</p>
      <p className={styles.intro}>{t.home.intro}</p>
      <BusinessCard />
    </section>
  );
}
