export type Language = 'zh' | 'en';

export const dictionary = {
  zh: {
    nav: { home: '首頁', story: '我的故事', project: '專案作品', blog: '部落格' },
    theme: { toDark: '切換為深色模式', toLight: '切換為淺色模式' },
    article: { copy: '複製', copied: '已複製' },
    home: {
      brand: 'KLIF x SparkNet',
      tagline: '許展發（KLIF）的個人技術網站',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      card: {
        slogan: '資料庫網站開發與企業AI轉型',
        services: ['網站建置與架設', '全端軟體開發', '系統AI應用導入'],
        flip: '點卡片翻面',
      },
    },
    story: {
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      body: '從 2023 年開始踏入 AI 領域，這段旅程的完整故事，我正在慢慢寫下來，敬請期待更新。',
      experience: {
        title: '經歷',
        items: [
          {
            role: '軟體工程師',
            company: '盛翔科技',
            location: '高雄市',
            period: '2020/07 – 2025/11',
            duration: '5 年 5 個月',
            points: [
              '開發 WPF 桌面軟體控制影音設備（燈光、音訊），並串接 StreamDeck 快捷鍵',
              '開發 Android 無線投影與廣告播放 App，自行實作 Miracast 接收端',
              '建置 IoT 設備管理後台，透過 MQTT 即時監控設備與派送內容',
            ],
            tags: ['C#', 'WPF', 'Android', 'Java', 'MQTT'],
          },
          {
            role: '軟體工程師',
            company: '竹陞科技',
            location: '新竹縣竹北市',
            period: '2019/07 – 2020/06',
            duration: '1 年',
            points: [
              '開發半導體自動化系統功能與 UI，整合 SECS 設備通訊',
              '以 EmguCV 影像辨識與機器學習處理工業圖形',
            ],
            tags: ['C#', 'C++', 'EmguCV', '機器學習'],
          },
          {
            role: '研習生',
            company: '資訊工業策進會',
            location: '台北市',
            period: '2017/07 – 2017/12',
            duration: '6 個月',
            points: ['以 Unity 設計 VR 划船連線系統'],
            tags: ['Unity', 'VR'],
          },
        ],
      },
      selfIntro: {
        title: '關於我',
        groups: [
          [ //自我介紹
            '參與軟體開發從半導體自動化到物聯網伺服器開發，',
            '再到 AI 系統架構與開發應用，累積**120 小時**的 AI 相關經驗',
            '我相信 Evolve together，始於好奇心引導的理解，成於彼此的催化與成全。無論身處引導或協同的位置，我致力於搭建讓思考自由生長的環境，與夥伴在拆解問題的過程中共同進化。'
          ],
          [ //哲學
            '職業生涯（Career）與**後端開發X人工智慧（AI）**密不可分',
            '「我喜歡 Spark（火花）這個意象，它象徵好奇心點燃的原點，也象徵巧遇『連結』的瞬間。我將由數個靈感火花交織共振而成的網絡，稱為 SparkNet。」',
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
    article: { copy: 'Copy', copied: 'Copied' },
    home: {
      brand: 'KLIF x SparkNet',
      tagline: 'Personal tech site of Chang-Fa Hsu (KLIF)',
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      card: {
        slogan: 'Database web development & enterprise AI transformation',
        services: ['Website building & hosting', 'Full-stack development', 'AI integration for systems'],
        flip: 'Flip the card',
      },
    },
    story: {
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      body: 'I started my journey into AI in 2023. The full story is still being written — more to come soon.',
      // TODO: 英文版由中文原文直譯，請自行潤稿。
      experience: {
        title: 'Experience',
        items: [
          {
            role: 'Software Engineer',
            company: 'Sheng Xiang Technology',
            location: 'Kaohsiung',
            period: '2020/07 – 2025/11',
            duration: '5 yrs 5 mos',
            points: [
              'Built WPF desktop software to control AV devices (lighting, audio), with StreamDeck integration',
              'Developed Android screen-casting and ad-player apps, including a Miracast receiver built from scratch',
              'Built an IoT device-management backend with real-time monitoring and content delivery over MQTT',
            ],
            tags: ['C#', 'WPF', 'Android', 'Java', 'MQTT'],
          },
          {
            role: 'Software Engineer',
            company: 'Zhu Sheng Technology',
            location: 'Zhubei, Hsinchu',
            period: '2019/07 – 2020/06',
            duration: '1 yr',
            points: [
              'Developed features and UI for semiconductor automation systems, integrating SECS communication',
              'Applied EmguCV image recognition and machine learning to industrial imagery',
            ],
            tags: ['C#', 'C++', 'EmguCV', 'Machine Learning'],
          },
          {
            role: 'Trainee',
            company: 'Institute for Information Industry (III)',
            location: 'Taipei',
            period: '2017/07 – 2017/12',
            duration: '6 mos',
            points: ['Designed a networked VR rowing system in Unity'],
            tags: ['Unity', 'VR'],
          },
        ],
      },
      selfIntro: {
        title: 'About Me',
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
