export type Health = 'checking' | 'online' | 'offline';

// 打開的面板一律可以關掉（手機上面板是全螢幕，關不掉就卡住了）；只有「要打開」時才看後端狀態
export function toggleAction(open: boolean, health: Health): 'open' | 'close' | 'offline-bubble' {
  if (open) return 'close';
  return health === 'offline' ? 'offline-bubble' : 'open';
}

// 中文輸入法選字中的按鍵（Enter 選字、Esc 取消選字）不能當成送出或關閉；
// Safari 選字時 isComposing 可能是 false，要再看 keyCode 229
export function isImeKey(e: { isComposing: boolean; keyCode: number }): boolean {
  return e.isComposing || e.keyCode === 229;
}
