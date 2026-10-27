import type { Metadata } from 'next';
import { JetBrains_Mono, Noto_Sans_TC } from 'next/font/google';
import { LanguageProvider } from '@/context/LanguageContext';
import { NavBar } from '@/components/NavBar';
import { ChatWidget } from '@/components/ChatWidget';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

// 中文用思源黑體、英數用 JetBrains Mono；CJK 字型檔很大，不預載
const notoSansTC = Noto_Sans_TC({
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  preload: false,
  variable: '--font-tc',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'KLIF x SparkNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 由下方腳本在 React 接手前設定，伺服器 HTML 沒有它，所以關閉此屬性的 hydration 警告
    <html lang="zh-Hant" className={`${notoSansTC.variable} ${jetBrainsMono.variable}`} suppressHydrationWarning>
      <head>
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
