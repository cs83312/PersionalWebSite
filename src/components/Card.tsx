import Link from 'next/link';
import styles from './Card.module.css';

export interface CardProps {
  href: string;
  title: string;
  description?: string;
  meta?: string;
  // Ready-to-use src (basePath already applied). Omit for a text-only card.
  imageSrc?: string;
}

export function Card({ href, title, description, meta, imageSrc }: CardProps) {
  return (
    <Link href={href} className={styles.card}>
      {imageSrc && <img src={imageSrc} alt="" className={styles.image} />}
      <h3 className={styles.title}>{title}</h3>
      {meta && <p className={styles.meta}>{meta}</p>}
      {description && <p className={styles.description}>{description}</p>}
    </Link>
  );
}
