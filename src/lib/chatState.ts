import type { ChatFailure, ChatSource } from './chatApi';

export interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text: string;
  sources: ChatSource[];
  // 存原因而不是文字，切換語言時錯誤訊息才會跟著換
  failure?: ChatFailure;
}

export interface ChatState {
  messages: ChatMessage[];
  pending: boolean;
  nextId: number;
}

export type ChatAction =
  | { type: 'send'; text: string }
  | { type: 'token'; text: string }
  | { type: 'sources'; sources: ChatSource[] }
  | { type: 'finish' }
  | { type: 'fail'; reason: ChatFailure };

export const initialChatState: ChatState = { messages: [], pending: false, nextId: 1 };

// 同一份文件的多個片段可能各回傳一次，畫面上只列一次
function uniqueSources(sources: ChatSource[]): ChatSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.filename}\u0000${s.page}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function updateLastBot(state: ChatState, update: (m: ChatMessage) => ChatMessage): ChatState {
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== 'bot') return state;
  return { ...state, messages: [...state.messages.slice(0, -1), update(last)] };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'send': {
      if (state.pending) return state;
      const id = state.nextId;
      return {
        messages: [
          ...state.messages,
          { id, role: 'user', text: action.text, sources: [] },
          { id: id + 1, role: 'bot', text: '', sources: [] },
        ],
        pending: true,
        nextId: id + 2,
      };
    }
    case 'token':
      return updateLastBot(state, (m) => ({ ...m, text: m.text + action.text }));
    case 'sources':
      return updateLastBot(state, (m) => ({ ...m, sources: uniqueSources(action.sources) }));
    case 'finish':
      return { ...state, pending: false };
    case 'fail': {
      const last = state.messages[state.messages.length - 1];
      if (last?.role === 'bot' && last.text === '') {
        return { ...updateLastBot(state, (m) => ({ ...m, failure: action.reason })), pending: false };
      }
      return {
        messages: [...state.messages, { id: state.nextId, role: 'bot', text: '', sources: [], failure: action.reason }],
        pending: false,
        nextId: state.nextId + 1,
      };
    }
  }
}
