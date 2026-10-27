'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import type { ChatMessage } from '@/lib/chatState';
import styles from './ChatPanel.module.css';

interface ChatPanelProps {
  id: string;
  messages: ChatMessage[];
  pending: boolean;
  online: boolean;
  connecting: boolean;
  onSend(text: string): void;
  inputRef: RefObject<HTMLTextAreaElement>;
}

export function ChatPanel({ id, messages, pending, online, connecting, onSend, inputRef }: ChatPanelProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const canSend = online && !pending;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function submit() {
    if (!canSend || draft.trim() === '') return;
    onSend(draft);
    setDraft('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 中文輸入法選字時的 Enter 不能送出；Safari 選字時 isComposing 可能是 false，要再看 keyCode 229
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    submit();
  }

  const placeholder = connecting ? t.chat.connecting : online ? t.chat.placeholder : t.chat.offline;

  return (
    <div id={id} className={styles.panel} role="dialog" aria-label={t.chat.title}>
      <div className={styles.header}>
        <span className={styles.avatar} aria-hidden="true">K</span>
        <span className={styles.title}>{t.chat.title}</span>
      </div>

      <div ref={listRef} className={styles.messages} aria-live="polite">
        <p className={`${styles.bubble} ${styles.bot}`}>{t.chat.welcome}</p>
        {messages.length === 0 && (
          <div className={styles.suggestions}>
            {t.chat.suggestions.map((question) => (
              <button key={question} type="button" className={styles.suggestion} disabled={!canSend} onClick={() => onSend(question)}>
                {question}
              </button>
            ))}
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? styles.userRow : styles.botRow}>
            {message.failure ? (
              <p className={`${styles.bubble} ${styles.bot} ${styles.failure}`}>{t.chat.errors[message.failure]}</p>
            ) : message.role === 'bot' && message.text === '' ? (
              <p className={`${styles.bubble} ${styles.bot} ${styles.typing}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </p>
            ) : (
              <p className={`${styles.bubble} ${message.role === 'user' ? styles.user : styles.bot}`}>{message.text}</p>
            )}
            {message.sources.length > 0 && (
              <div className={styles.sources}>
                <span className={styles.sourcesLabel}>{t.chat.sources}</span>
                {message.sources.map((s) => (
                  <span key={`${s.filename}-${s.page}`}>
                    {s.filename}
                    {s.page !== null && ` · ${t.chat.page.replace('{page}', String(s.page))}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        className={styles.inputRow}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          className={styles.input}
          rows={1}
          maxLength={1000}
          value={draft}
          placeholder={placeholder}
          aria-label={t.chat.placeholder}
          disabled={!online}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className={styles.send} disabled={!canSend || draft.trim() === ''}>
          {t.chat.send}
        </button>
      </form>
      <p className={styles.notice}>{t.chat.logNotice}</p>
    </div>
  );
}
