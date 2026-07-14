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
    },
  },
} as const;
