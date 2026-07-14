import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.wrapper}>
      <h1>404</h1>
      <p>找不到這個頁面。</p>
      <Link href="/" className={styles.link}>
        回到首頁
      </Link>
    </div>
  );
}
