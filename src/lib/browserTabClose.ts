import type { BrowserTab } from '@/stores/browserTabStore';
import { isStaticBrowserTab, useBrowserTabStore } from '@/stores/browserTabStore';

export type BrowserTabCloseHandler = (tab: BrowserTab) => void;

let closeHandler: BrowserTabCloseHandler | null = null;

/** Registered by BrowserUnifiedShell so global shortcuts use the same close path as tab X. */
export function registerBrowserTabCloseHandler(handler: BrowserTabCloseHandler | null): void {
  closeHandler = handler;
}

export function requestCloseBrowserTab(tab: BrowserTab): void {
  closeHandler?.(tab);
}

export function closeActiveBrowserTab(): boolean {
  const { tabs, activeTabId, closeTab } = useBrowserTabStore.getState();
  if (tabs.length === 0) return false;
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[tabs.length - 1];
  if (!active) return false;
  if (closeHandler) {
    closeHandler(active);
    return true;
  }
  // Shell not mounted — still close static tabs so Mod+W can fall through to the window.
  if (isStaticBrowserTab(active)) {
    closeTab(active.id);
    return true;
  }
  return false;
}

export function cycleBrowserTab(reverse = false): void {
  const { tabs, activeTabId, setActiveTab } = useBrowserTabStore.getState();
  if (tabs.length < 2) return;
  const idx = tabs.findIndex((t) => t.id === activeTabId);
  const current = idx >= 0 ? idx : tabs.length - 1;
  const next = reverse
    ? (current - 1 + tabs.length) % tabs.length
    : (current + 1) % tabs.length;
  setActiveTab(tabs[next].id);
}
