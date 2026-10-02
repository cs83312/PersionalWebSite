import type { Metadata } from 'next';
import { LanguageProvider } from '@/context/LanguageContext';
import { NavBar } from '@/components/NavBar';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'KFxNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 由下方腳本在 React 接手前設定，伺服器 HTML 沒有它，所以關閉此屬性的 hydration 警告
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <LanguageProvider>
          <NavBar />
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
