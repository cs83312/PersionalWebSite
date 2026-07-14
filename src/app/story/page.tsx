'use client';

import { useLanguage } from '@/context/LanguageContext';
import styles from './page.module.css';

export default function StoryPage() {
  const { t } = useLanguage();

  return (
    <article className={styles.article}>
      <h1>{t.story.title}</h1>
      <p>{t.story.intro}</p>
      <p>{t.story.body}</p>
    </article>
  );
}
