export function isCachedToolResultPlaceholder(content: string): boolean {
  return /\[Result stored in workspace|\[Output truncated to fit turn budget — full result cached/i.test(content);
}
