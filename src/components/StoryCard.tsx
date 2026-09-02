'use client';

import { useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import styles from './StoryCard.module.css';

const basePath = process.env.NODE_ENV === 'production' ? '/PersionalWebSite' : '';

/** Put these files in public/images/. Add or remove entries freely. */
const IMAGES = [
  { src: '/images/story-1.jpg', alt: '演講現場' },
  { src: '/images/story-2.jpg', alt: '演講現場' },
  { src: '/images/story-3.jpg', alt: '演講現場' },
  { src: '/images/story-4.jpg', alt: '演講現場' },
];

const GROUP_CLASS = [styles.groupA, styles.groupB, styles.groupC];

/** Renders **bold** segments inside a line. */
function Line({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
      )}
    </>
  );
}

export function StoryCard() {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);

  const count = IMAGES.length;
  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);

  return (
    <div className={styles.card}>
      <div className={styles.gallery}>
        <div className={styles.frame}>
          {IMAGES.map((image, i) => (
            <img
              key={image.src}
              src={`${basePath}${image.src}`}
              alt={image.alt}
              className={i === index ? styles.imageActive : styles.image}
            />
          ))}
        </div>

        <button type="button" className={styles.prev} onClick={prev} aria-label="上一張">
          &lsaquo;
        </button>
        <button type="button" className={styles.next} onClick={next} aria-label="下一張">
          &rsaquo;
        </button>

        <div className={styles.dots}>
          {IMAGES.map((image, i) => (
            <button
              key={image.src}
              type="button"
              className={i === index ? styles.dotActive : styles.dot}
              onClick={() => setIndex(i)}
              aria-label={`切換到第 ${i + 1} 張圖片`}
            />
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <h2 className={styles.heading}>{t.story.selfIntro.title}</h2>
        {t.story.selfIntro.groups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <p className={styles.divider}>·</p>}
            {group.map((line, li) => (
              <p key={li} className={`${styles.line} ${GROUP_CLASS[gi % GROUP_CLASS.length]}`}>
                <Line text={line} />
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
