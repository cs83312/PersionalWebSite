export interface SseEvent {
  event: string;
  data: string;
}

// 後端用 POST 回傳 SSE，瀏覽器的 EventSource 只支援 GET，所以自己解析。
// 回傳的 push 函式會累積收到的文字，每次只回傳已經完整的事件。
export function createSseParser(): (chunk: string) => SseEvent[] {
  let buffer = '';
  let event = '';
  let data: string[] = [];

  function handleLine(line: string, out: SseEvent[]) {
    if (line === '') {
      if (data.length > 0) out.push({ event: event || 'message', data: data.join('\n') });
      event = '';
      data = [];
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  return (chunk) => {
    buffer += chunk;
    const out: SseEvent[] = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch === '\n') {
        handleLine(buffer.slice(start, i), out);
        start = i + 1;
      } else if (ch === '\r') {
        // 結尾的 \r 可能是被切開的 \r\n，等下一段再判斷
        if (i === buffer.length - 1) break;
        handleLine(buffer.slice(start, i), out);
        if (buffer[i + 1] === '\n') i++;
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
    return out;
  };
}
