'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { checkHealth, streamChat } from '@/lib/chatApi';
import { CHAT_API_URL, CHAT_GREETING_DISMISSED_KEY, CHAT_SESSION_KEY } from '@/lib/chatConfig';
import { chatReducer, initialChatState } from '@/lib/chatState';
import { isImeKey, toggleAction, type Health } from '@/lib/chatWidget';
import { safeGetItem, safeSetItem } from '@/lib/safeStorage';
import { ChatPanel } from './ChatPanel';
import styles from './ChatWidget.module.css';

const PANEL_ID = 'chat-panel';
const RETRY_MS = 60_000;
const GREETING_DELAY_MS = 3000;
const GREETING_VISIBLE_MS = 8000;
const OFFLINE_BUBBLE_MS = 5000;

// 對話只保留到關閉分頁，所以 session id 存在 sessionStorage
const sessionStore = (): Storage => window.sessionStorage;

export function ChatWidget() {
  const { t } = useLanguage();
  const [health, setHealth] = useState<Health>('checking');
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [chat, dispatch] = useReducer(chatReducer, initialChatState);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout>>();
  // reducer 的 pending 要到下一次 render 才會更新，連點兩下時靠這個擋住第二個請求
  const sending = useRef(false);

  const runHealthCheck = useCallback(async () => {
    setHealth((await checkHealth(CHAT_API_URL)) ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  useEffect(() => {
    if (health !== 'offline') return;
    const id = setInterval(runHealthCheck, RETRY_MS);
    return () => clearInterval(id);
  }, [health, runHealthCheck]);

  const showBubble = useCallback((ms: number) => {
    clearTimeout(bubbleTimer.current);
    setBubble(true);
    bubbleTimer.current = setTimeout(() => setBubble(false), ms);
  }, []);

  useEffect(() => {
    if (safeGetItem(CHAT_GREETING_DISMISSED_KEY, sessionStore)) return;
    const id = setTimeout(() => showBubble(GREETING_VISIBLE_MS), GREETING_DELAY_MS);
    return () => {
      clearTimeout(id);
      clearTimeout(bubbleTimer.current);
    };
  }, [showBubble]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape' || isImeKey(e)) return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // 輸入框在連線確認前是 disabled，所以等 online 之後再移焦點
  useEffect(() => {
    if (open && health === 'online') inputRef.current?.focus();
  }, [open, health]);

  function toggle() {
    const action = toggleAction(open, health);
    if (action === 'offline-bubble') {
      showBubble(OFFLINE_BUBBLE_MS);
      return;
    }
    if (action === 'open') {
      setBubble(false);
      if (!sending.current) runHealthCheck();
    }
    setOpen(action === 'open');
  }

  function dismissBubble() {
    clearTimeout(bubbleTimer.current);
    setBubble(false);
    safeSetItem(CHAT_GREETING_DISMISSED_KEY, '1', sessionStore);
  }

  async function send(raw: string) {
    const message = raw.trim();
    if (!message || sending.current || health !== 'online') return;
    sending.current = true;
    dispatch({ type: 'send', text: message });

    const stored = safeGetItem(CHAT_SESSION_KEY, sessionStore);
    const outcome = await streamChat(
      { baseUrl: CHAT_API_URL, sessionId: stored && stored.length <= 64 ? stored : null, message },
      {
        onSession: (id) => safeSetItem(CHAT_SESSION_KEY, id, sessionStore),
        onToken: (text) => dispatch({ type: 'token', text }),
        onSources: (sources) => dispatch({ type: 'sources', sources }),
      },
    );
    sending.current = false;
    if (outcome.ok) {
      dispatch({ type: 'finish' });
    } else {
      dispatch({ type: 'fail', reason: outcome.reason });
      if (outcome.reason === 'unavailable') setHealth('offline');
    }
  }

  const offline = health === 'offline';

  return (
    <>
      {open && (
        <ChatPanel
          id={PANEL_ID}
          messages={chat.messages}
          pending={chat.pending}
          online={health === 'online'}
          connecting={health === 'checking'}
          onSend={send}
          inputRef={inputRef}
        />
      )}
      {bubble && !open && (
        <div className={styles.bubble} role="status">
          <span>{offline ? t.chat.offline : t.chat.greeting}</span>
          <button type="button" className={styles.dismiss} onClick={dismissBubble} aria-label={t.chat.dismiss}>
            ×
          </button>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={`${styles.button} ${offline ? styles.offline : ''}`}
        onClick={toggle}
        aria-label={open ? t.chat.close : t.chat.open}
        aria-expanded={open}
        aria-controls={PANEL_ID}
      >
        {open ? '×' : 'K'}
      </button>
    </>
  );
}
