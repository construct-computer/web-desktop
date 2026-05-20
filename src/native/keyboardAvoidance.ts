import type { KeyboardInfo, KeyboardPlugin } from '@capacitor/keyboard';

const FOCUSABLE_INPUT_SELECTOR = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
].join(',');

let installed = false;
let keyboardHeight = 0;
let settleTimer: number | undefined;

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && target.matches(FOCUSABLE_INPUT_SELECTOR);
}

function isScrollable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY;
  return /(auto|scroll|overlay)/.test(overflowY) && element.scrollHeight > element.clientHeight + 1;
}

function findScrollableAncestor(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement;
  while (current && current !== document.body && current !== document.documentElement) {
    if (isScrollable(current)) return current;
    current = current.parentElement;
  }
  return null;
}

function setKeyboardHeight(height: number): void {
  keyboardHeight = Math.max(0, Math.round(height || 0));
  document.documentElement.style.setProperty('--construct-keyboard-height', `${keyboardHeight}px`);
  document.documentElement.dataset.keyboardOpen = keyboardHeight > 0 ? 'true' : 'false';
}

function viewportBounds(): { top: number; bottom: number } {
  const vv = window.visualViewport;
  if (!vv) return { top: 0, bottom: window.innerHeight - Math.max(0, keyboardHeight) };
  return {
    top: vv.offsetTop,
    bottom: vv.offsetTop + vv.height,
  };
}

function keepFocusedElementVisible(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !active.matches(FOCUSABLE_INPUT_SELECTOR)) return;

  const rect = active.getBoundingClientRect();
  const viewport = viewportBounds();
  const safeTop = viewport.top + 16;
  const safeBottom = viewport.bottom - 18;

  if (rect.bottom <= safeBottom && rect.top >= safeTop) return;

  const scrollParent = findScrollableAncestor(active);
  const delta = rect.bottom > safeBottom
    ? rect.bottom - safeBottom
    : rect.top - safeTop;

  if (scrollParent) {
    scrollParent.scrollBy({ top: delta, behavior: 'smooth' });
    return;
  }

  active.scrollIntoView({
    block: 'center',
    inline: 'nearest',
    behavior: 'smooth',
  });
}

function scheduleKeepFocusedElementVisible(): void {
  window.requestAnimationFrame(() => {
    keepFocusedElementVisible();
    if (settleTimer) window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(keepFocusedElementVisible, 260);
  });
}

export function installKeyboardAvoidance(Keyboard: KeyboardPlugin): void {
  if (installed) return;
  installed = true;

  document.documentElement.style.setProperty('--construct-keyboard-height', '0px');

  const onShow = (info: KeyboardInfo) => {
    setKeyboardHeight(info.keyboardHeight);
    scheduleKeepFocusedElementVisible();
  };

  const onHide = () => {
    setKeyboardHeight(0);
  };

  void Keyboard.addListener('keyboardWillShow', onShow);
  void Keyboard.addListener('keyboardDidShow', onShow);
  void Keyboard.addListener('keyboardWillHide', onHide);
  void Keyboard.addListener('keyboardDidHide', onHide);

  document.addEventListener('focusin', (event) => {
    if (!isEditableElement(event.target)) return;
    scheduleKeepFocusedElementVisible();
  });

  document.addEventListener('input', (event) => {
    if (!isEditableElement(event.target)) return;
    scheduleKeepFocusedElementVisible();
  });

  window.visualViewport?.addEventListener('resize', scheduleKeepFocusedElementVisible);
  window.visualViewport?.addEventListener('scroll', scheduleKeepFocusedElementVisible);
}
