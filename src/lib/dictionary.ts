export type Language = 'zh' | 'en';

export const dictionary = {
  zh: {
    nav: { home: 'Home', story: 'My Story', project: 'Project', blog: 'Blog' },
    home: {
      brand: 'KFxNet',
      tagline: '許展發（KLIF）的個人技術網站',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      cta: { story: '看看我的故事', project: '查看專案作品', blog: '閱讀部落格' },
    },
    story: {
      title: 'My Story',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      body: '從 2023 年開始踏入 AI 領域，這段旅程的完整故事，我正在慢慢寫下來，敬請期待更新。',
      selfIntro: {
        title: '執行長自述',
        groups: [
          [
            '從 2017 年進入 AI 領域，已累計投入 **5522 小時**',
            '相信 Empower 的美好，無論扮演其主詞或受詞',
            '也明白「好奇、理解、進步」三元素的高度相關',
          ],
          [
            '職業生涯（Career）與**人工智慧（AI）**密不可分',
            '我**喜歡 X 這個符號**，也樂見**巧遇「連結」**的瞬間',
            '哲學性地將**「連結起數個 X 的組成」**稱為：**XNet**',
          ],
          [
            '我扮演 AI 系統架構師、AI 講師與 AI 技術顧問',
            '提供趨勢分析、應用教學、系統導入等經驗分享',
            '祝福我們都能在 AI 領域，學以致用、積極成長',
          ],
        ],
      },
    },
  },
  en: {
    nav: { home: 'Home', story: 'My Story', project: 'Project', blog: 'Blog' },
    home: {
      brand: 'KFxNet',
      tagline: 'Personal tech site of Chang-Fa Hsu (KLIF)',
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      cta: { story: 'Read my story', project: 'View projects', blog: 'Read the blog' },
    },
    story: {
      title: 'My Story',
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      body: 'I started my journey into AI in 2023. The full story is still being written — more to come soon.',
      // TODO: 英文版由中文原文直譯，請自行潤稿。
      selfIntro: {
        title: 'A Note From Me',
        groups: [
          [
            'Working in AI since 2017, **5,522 hours** and counting',
            'I believe in Empower, as either its subject or its object',
            'And in how closely curiosity, understanding and progress are tied',
          ],
          [
            'My career is inseparable from **artificial intelligence (AI)**',
            'I **like the symbol X**, and I welcome the moment a **connection** happens',
            'Philosophically I call **a composition of several X connected** this: **XNet**',
          ],
          [
            'I work as an AI systems architect, AI instructor and AI technical advisor',
            'Sharing trend analysis, applied teaching and system adoption experience',
            'May we all put what we learn to use, and keep growing, in AI',
          ],
        ],
      },
    },
  },
} as const;
