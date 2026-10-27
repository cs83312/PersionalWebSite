// 正式站（GitHub Pages）呼叫的聊天後端網址，也就是 ngrok 對外網址。
// ngrok 免費版每次重開網址都會變（除非用 ngrok 給的固定網域），網址變了要改這裡並重新部署。
// 留空時網站上的聊天按鈕會一直顯示休息中。
export const CHAT_PROD_API_URL = '';

const DEV_API_URL = 'http://localhost:8000';

export function resolveChatApiUrl(nodeEnv: string | undefined, override: string | undefined): string {
  const url = override || (nodeEnv === 'production' ? CHAT_PROD_API_URL : DEV_API_URL);
  return url.replace(/\/+$/, '');
}

// 必須直接寫 process.env.NEXT_PUBLIC_CHAT_API_URL，Next 才會在建置時把值寫進程式碼
export const CHAT_API_URL = resolveChatApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_CHAT_API_URL);

export const CHAT_SESSION_KEY = 'kfxnet-chat-session';
export const CHAT_GREETING_DISMISSED_KEY = 'kfxnet-chat-greeting-dismissed';
