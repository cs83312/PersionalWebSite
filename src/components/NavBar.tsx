'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import styles from './NavBar.module.css';

export function NavBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const showLanguageSwitcher = pathname === '/' || pathname === '/story';

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        KFxNet
      </Link>
      <nav className={styles.nav}>
        <Link href="/">{t.nav.home}</Link>
        <Link href="/story">{t.nav.story}</Link>
        <Link href="/project">{t.nav.project}</Link>
        <Link href="/blog">{t.nav.blog}</Link>
      </nav>
      <div className={styles.actions}>
        <ThemeToggle />
        {showLanguageSwitcher && <LanguageSwitcher />}
      </div>
    </header>
  );
}
