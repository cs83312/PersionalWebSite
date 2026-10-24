'use client';

import { useLanguage } from '@/context/LanguageContext';
import styles from './Timeline.module.css';

export function Timeline() {
  const { t } = useLanguage();
  const { title, items } = t.story.experience;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <ol className={styles.list}>
        {items.map((item) => (
          <li key={`${item.company}-${item.period}`} className={styles.item}>
            <p className={styles.period}>
              {item.period}
              <span className={styles.duration}>{item.duration}</span>
            </p>
            <h3 className={styles.role}>
              {item.role}
              <span className={styles.company}>{item.company}</span>
            </h3>
            <p className={styles.location}>{item.location}</p>
            <ul className={styles.points}>
              {item.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <ul className={styles.tags}>
              {item.tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
