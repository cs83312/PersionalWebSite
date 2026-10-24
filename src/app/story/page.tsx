'use client';

import { StoryCard } from '@/components/StoryCard';
import styles from './page.module.css';

export default function StoryPage() {
  return (
    <section className={styles.page}>
      <StoryCard />
    </section>
  );
}
