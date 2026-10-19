'use client';

import { useEffect, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import styles from '@/app/article.module.css';

// 渲染 Markdown 轉出的 HTML，並在每個程式碼區塊右上角加上「複製」按鈕
export function ArticleContent({ html }: { html: string }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const buttons: HTMLButtonElement[] = [];
    const timers: number[] = [];

    root.querySelectorAll('pre').forEach((pre) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = styles.copyButton;
      button.textContent = t.article.copy;
      button.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.innerText ?? pre.innerText;
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          return;
        }
        button.textContent = t.article.copied;
        timers.push(window.setTimeout(() => { button.textContent = t.article.copy; }, 1500));
      });
      pre.appendChild(button);
      buttons.push(button);
    });

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      buttons.forEach((button) => button.remove());
    };
  }, [html, t]);

  return <div ref={ref} className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />;
}
