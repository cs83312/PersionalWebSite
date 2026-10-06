export type Language = 'zh' | 'en';

export const dictionary = {
  zh: {
    nav: { home: 'Home', story: 'My Story', project: 'Project', blog: 'Blog' },
    theme: { toDark: '切換為深色模式', toLight: '切換為淺色模式' },
    home: {
      brand: 'KFxNet',
      tagline: '許展發（KLIF）的個人技術網站',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      cta: { story: '看看我的故事', project: '查看專案作品', blog: '閱讀部落格' },
      card: { slogan: '資料庫網站開發與企業AI轉型', flip: '點卡片翻面' },
    },
    story: {
      title: 'My Story',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      body: '從 2023 年開始踏入 AI 領域，這段旅程的完整故事，我正在慢慢寫下來，敬請期待更新。',
      selfIntro: {
        title: '執行長自述',
        groups: [
          [ //自我介紹
            '參與軟體開發從半導體自動化到物聯網伺服器開發，',
            '再到 AI 系統架構與應用，累積**1067 小時**的 AI 相關經驗',
            '我相信 Empower，無論是 Empower 的主體或客體，',
            '也相信好奇心、理解力與進步之間的緊密關聯',
          ],
          [ //哲學
            '職業生涯（Career）與**後端開發X人工智慧（AI）**密不可分',
            '我**喜歡 X 這個符號**，也樂見**巧遇「連結」**的瞬間',
            '哲學性地將**「連結起數個 X 的組成」**稱為：**XNet**',
          ],
          [ //定位 XNet
            '我扮演 AI 系統架構與後端開發',
            '提供趨勢分析、軟體建置、系統導入等經驗分享',
            '讓我們搭載AI浪潮，將所學落實於實務，持續成長',
          ],
        ],
      },
    },
  },
  en: {
    nav: { home: 'Home', story: 'My Story', project: 'Project', blog: 'Blog' },
    theme: { toDark: 'Switch to dark mode', toLight: 'Switch to light mode' },
    home: {
      brand: 'KFxNet',
      tagline: 'Personal tech site of Chang-Fa Hsu (KLIF)',
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      cta: { story: 'Read my story', project: 'View projects', blog: 'Read the blog' },
      card: { slogan: 'Database web development & enterprise AI transformation', flip: 'Flip the card' },
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
