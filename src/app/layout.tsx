import type { Metadata } from 'next';
import { LanguageProvider } from '@/context/LanguageContext';
import { NavBar } from '@/components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'KFxNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <LanguageProvider>
          <NavBar />
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
