import { isNativePlatform } from './platform';
import { installKeyboardAvoidance } from './keyboardAvoidance';

const AUTH_CALLBACK_REPLAY_TTL_MS = 10 * 60 * 1000;

function appUrlToRoute(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname || '/';

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    if (parsed.protocol === 'construct:' && parsed.host === 'auth') {
      return `/${parsed.search}${parsed.hash}`;
    }

    if (parsed.protocol === 'capacitor:' && parsed.host === 'localhost') {
      return `${path}${parsed.search}${parsed.hash}`;
    }

    const hostPath = parsed.host ? `/${parsed.host}` : '';
    return `${hostPath}${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
  } catch {
    return null;
  }
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isAuthCallbackRoute(route: string): boolean {
  try {
    const parsed = new URL(route, window.location.origin);
    return parsed.searchParams.has('token') || parsed.searchParams.has('auth_error');
  } catch {
    return false;
  }
}

function wasRecentlyHandled(url: string): boolean {
  try {
    const key = `construct:native-auth-url:${hashString(url)}`;
    const handledAt = Number(sessionStorage.getItem(key) || localStorage.getItem(key) || '0');
    return handledAt > 0 && Date.now() - handledAt < AUTH_CALLBACK_REPLAY_TTL_MS;
  } catch {
    return false;
  }
}

function markRecentlyHandled(url: string): void {
  try {
    const key = `construct:native-auth-url:${hashString(url)}`;
    const value = String(Date.now());
    sessionStorage.setItem(key, value);
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function notifyNativeUrlOpen(url: string, route: string): void {
  window.dispatchEvent(new CustomEvent('construct:native-url-open', {
    detail: { url, route },
  }));
}

export async function installNativeBridge(): Promise<void> {
  if (!isNativePlatform()) return;

  document.documentElement.dataset.capacitor = 'true';

  const [{ App }, { Keyboard, KeyboardResize, KeyboardStyle }, { StatusBar, Style }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/keyboard'),
    import('@capacitor/status-bar'),
  ]);

  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Dark }),
    StatusBar.setBackgroundColor({ color: '#05070b' }),
    StatusBar.setOverlaysWebView({ overlay: false }),
    Keyboard.setStyle({ style: KeyboardStyle.Dark }),
    Keyboard.setResizeMode({ mode: KeyboardResize.Native }),
    Keyboard.setAccessoryBarVisible({ isVisible: false }),
  ]);

  installKeyboardAvoidance(Keyboard);

  const handleAppUrl = (url: string | undefined | null) => {
    if (!url) return;
    const route = appUrlToRoute(url);
    if (!route) return;

    if (isAuthCallbackRoute(route)) {
      if (wasRecentlyHandled(url)) return;
      markRecentlyHandled(url);

      const currentRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentRoute !== route) {
        window.history.replaceState({}, '', route);
      }
      notifyNativeUrlOpen(url, route);
      return;
    }

    window.location.assign(route);
  };

  await App.addListener('appUrlOpen', ({ url }) => {
    handleAppUrl(url);
  });

  const launchUrl = await App.getLaunchUrl();
  handleAppUrl(launchUrl?.url);

  await App.addListener('resume', () => {
    window.dispatchEvent(new CustomEvent('construct:native-resume'));
  });

  await App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new CustomEvent('construct:native-state', { detail: { isActive } }));
  });
}
