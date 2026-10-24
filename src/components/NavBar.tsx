'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { basePath } from '@/lib/basePath';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';
import styles from './NavBar.module.css';

const NAV_ITEMS = [
  { href: '/', key: 'home' },
  { href: '/story', key: 'story' },
  { href: '/project', key: 'project' },
  { href: '/blog', key: 'blog' },
] as const;

/** 首頁只比對完全相同；其他頁面連同子頁（如 /blog/xxx）都算在該分頁 */
function isActive(pathname: string, href: string) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
}

export function NavBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const showLanguageSwitcher = pathname === '/' || pathname === '/story';

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        <img src={`${basePath}/images/logo/deer-small.png`} alt="" className={styles.logoMark} />
        KLIF x SparkNet
      </Link>
      <nav className={styles.nav}>
        {NAV_ITEMS.map(({ href, key }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={active ? styles.active : undefined}
              aria-current={active ? 'page' : undefined}
            >
              {t.nav[key]}
            </Link>
          );
        })}
      </nav>
      <div className={styles.actions}>
        <ThemeToggle />
        {showLanguageSwitcher && <LanguageSwitcher />}
      </div>
    </header>
  );
}
