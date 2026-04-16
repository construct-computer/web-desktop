/**
 * MobileShell — shared mobile UI shell used by both Telegram and browser.
 *
 * Provides: stack-based navigation, slide animations, back button handling,
 * toast system, screen routing. Platform-specific concerns (auth, theme,
 * native integration) are handled by the parent wrapper (MiniApp or BrowserShell).
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePlatform } from './platform';
import { ToastProvider, BackHandlerProvider, bg, textColor } from '../mini/ui';
import { HomeScreen, type NavigableScreen } from '../mini/screens/HomeScreen';
import { FilesScreen } from '../mini/screens/FilesScreen';
import { CalendarScreen } from '../mini/screens/CalendarScreen';
import { SettingsScreen } from '../mini/screens/SettingsScreen';
import { EmailScreen } from '../mini/screens/EmailScreen';
import { MemoryScreen } from '../mini/screens/MemoryScreen';
import { AppStoreScreen } from '../mini/screens/AppStoreScreen';
import { AccessControlScreen } from '../mini/screens/AccessControlScreen';
import { AuditLogsScreen } from '../mini/screens/AuditLogsScreen';
import { ChatScreen } from './ChatScreen';
import { ChevronLeft } from 'lucide-react';

export type MobileScreen = NavigableScreen;

export function MobileShell() {
  const platform = usePlatform();
  const [screenStack, setScreenStack] = useState<MobileScreen[]>(['home']);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);

  const currentScreen = screenStack[screenStack.length - 1];

  // ── Navigation helpers with slide animations ──
  const pushScreen = useCallback((screen: MobileScreen) => {
    setSlideDir('left');
    setScreenStack(prev => [...prev, screen]);
    setTimeout(() => setSlideDir(null), 220);
  }, []);

  const popScreen = useCallback(() => {
    if (screenStack.length <= 1) return;
    setSlideDir('right');
    setScreenStack(prev => prev.slice(0, -1));
    setTimeout(() => setSlideDir(null), 220);
  }, [screenStack.length]);

  // ── Custom back handler from child screens ──
  const [customBackHandler, setCustomBackHandler] = useState<(() => void) | null>(null);
  const setBackHandler = useCallback((handler: (() => void) | null) => {
    setCustomBackHandler(() => handler);
  }, []);

  // Combined back action: custom handler takes priority, then popScreen
  const handleBack = useCallback(() => {
    if (customBackHandler) {
      customBackHandler();
    } else {
      popScreen();
    }
  }, [popScreen, customBackHandler]);

  // ── Platform back button integration ──
  useEffect(() => {
    const showBack = screenStack.length > 1 || !!customBackHandler;
    platform.setBackButtonVisible(showBack);

    if (showBack) {
      return platform.onBackButton(handleBack);
    }
  }, [screenStack, handleBack, customBackHandler, platform]);

  // ── Browser hardware back button (popstate) ──
  useEffect(() => {
    if (platform.type !== 'browser') return;

    // Push a dummy history entry for each screen so hardware back works
    const onPop = () => {
      if (screenStack.length > 1) {
        handleBack();
      }
    };

    // Only push state when navigating forward
    if (screenStack.length > 1) {
      window.history.pushState({ mobileScreen: currentScreen }, '');
    }

    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [platform.type, screenStack.length, currentScreen, handleBack]);

  const bgColor = bg();
  const txtColor = textColor();
  const showBackArrow = platform.type === 'browser' && (screenStack.length > 1 || !!customBackHandler);

  return (
    <ToastProvider>
      <BackHandlerProvider value={{ setBackHandler }}>
        <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ backgroundColor: bgColor, color: txtColor }}>
          {/* Browser back button bar */}
          {showBackArrow && (
            <div className="flex items-center shrink-0 px-2 pt-1 pb-0.5">
              <button
                onClick={handleBack}
                className="flex items-center gap-0.5 px-1.5 py-1.5 -ml-1 rounded-lg active:bg-white/5 transition-colors"
                style={{ color: txtColor }}
              >
                <ChevronLeft size={20} className="opacity-60" />
                <span className="text-[14px] font-medium opacity-60">Back</span>
              </button>
            </div>
          )}

          {/* Screen content */}
          <div
            ref={screenRef}
            className="flex-1 flex flex-col overflow-hidden"
            style={slideDir ? { animation: `mini-slide-${slideDir} 200ms ease-out` } : undefined}
            key={currentScreen}
          >
            {currentScreen === 'home' && <HomeScreen onNavigate={pushScreen} />}
            {currentScreen === 'files' && <FilesScreen />}
            {currentScreen === 'calendar' && <CalendarScreen />}
            {currentScreen === 'settings' && <SettingsScreen />}
            {currentScreen === 'email' && <EmailScreen />}
            {currentScreen === 'app-registry' && <AppStoreScreen />}
            {currentScreen === 'memory' && <MemoryScreen />}
            {currentScreen === 'access-control' && <AccessControlScreen />}
            {currentScreen === 'audit-logs' && <AuditLogsScreen />}
            {currentScreen === 'chat' && <ChatScreen />}
          </div>
        </div>
      </BackHandlerProvider>
    </ToastProvider>
  );
}
