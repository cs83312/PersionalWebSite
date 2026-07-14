'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import styles from './page.module.css';

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <section className={styles.hero}>
      <h1 className={styles.brand}>{t.home.brand}</h1>
      <p className={styles.tagline}>{t.home.tagline}</p>
      <p className={styles.intro}>{t.home.intro}</p>
      <div className={styles.links}>
        <Link href="/story">{t.home.cta.story}</Link>
        <Link href="/project">{t.home.cta.project}</Link>
        <Link href="/blog">{t.home.cta.blog}</Link>
      </div>
    </section>
  );
}
