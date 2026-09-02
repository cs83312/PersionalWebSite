'use client';

import { useLanguage } from '@/context/LanguageContext';
import { StoryCard } from '@/components/StoryCard';
import styles from './page.module.css';

export default function StoryPage() {
  const { t } = useLanguage();

  return (
    <section>
      <h1 className={styles.title}>{t.story.title}</h1>
      <StoryCard />
    </section>
  );
}
