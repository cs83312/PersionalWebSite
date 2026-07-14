import Link from 'next/link';
import styles from './Card.module.css';

export interface CardProps {
  href: string;
  title: string;
  description?: string;
  meta?: string;
}

export function Card({ href, title, description, meta }: CardProps) {
  return (
    <Link href={href} className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {meta && <p className={styles.meta}>{meta}</p>}
      {description && <p className={styles.description}>{description}</p>}
    </Link>
  );
}
