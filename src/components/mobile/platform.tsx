/** Set mobile theme CSS vars from Telegram theme params. */
export function applyTelegramTheme() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  const isDark = tg.colorScheme === 'dark';
  document.documentElement.classList.toggle('dark', isDark);

  const tp = tg.themeParams;
  if (!tp) return;
  const root = document.documentElement.style;
  if (tp.bg_color) root.setProperty('--mobile-bg', tp.bg_color);
  if (tp.text_color) root.setProperty('--mobile-text', tp.text_color);
  if (tp.hint_color) root.setProperty('--mobile-hint', tp.hint_color);
  if (tp.link_color) root.setProperty('--mobile-link', tp.link_color);
  if (tp.button_color) root.setProperty('--mobile-accent', tp.button_color);
  if (tp.secondary_bg_color) root.setProperty('--mobile-bg2', tp.secondary_bg_color);
  // Also set legacy --tg-* vars for existing mini screens that reference them
  if (tp.bg_color) root.setProperty('--tg-bg', tp.bg_color);
  if (tp.text_color) root.setProperty('--tg-text', tp.text_color);
  if (tp.hint_color) root.setProperty('--tg-hint', tp.hint_color);
  if (tp.link_color) root.setProperty('--tg-link', tp.link_color);
  if (tp.button_color) root.setProperty('--tg-button', tp.button_color);
  if (tp.secondary_bg_color) root.setProperty('--tg-bg2', tp.secondary_bg_color);
}

