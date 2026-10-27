import type { Metadata } from 'next';
import { LanguageProvider } from '@/context/LanguageContext';
import { NavBar } from '@/components/NavBar';
import { ChatWidget } from '@/components/ChatWidget';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

// 中文用思源黑體、英數用 JetBrains Mono，由瀏覽器直接向 Google Fonts 載入；
// next/font/google 在 GitHub Actions 的 runner 上 build 時抓字型會失敗
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700;900&display=swap';

export const metadata: Metadata = {
  title: 'KLIF x SparkNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 由下方腳本在 React 接手前設定，伺服器 HTML 沒有它，所以關閉此屬性的 hydration 警告
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONTS_URL} />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <LanguageProvider>
          <NavBar />
          <main>{children}</main>
          <ChatWidget />
        </LanguageProvider>
      </body>
    </html>
  );
}
