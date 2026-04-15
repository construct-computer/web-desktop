import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, Package } from 'lucide-react';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore, installedAppsToDefinitions, localAppsToDefinitions, composioToolkitsToDefinitions } from '@/stores/appStore';
import { useDevAppStore } from '@/stores/devAppStore';
import { useSound } from '@/hooks/useSound';
import { SYSTEM_APPS, type AppDefinition } from '@/lib/appRegistry';
import iconGeneric from '@/icons/generic.png';
import { cn } from '@/lib/utils';

// ── App icon component ────────────────────────────────────────────

function AppIcon({
  app,
  index,
  animIn,
  onClick,
}: {
  app: AppDefinition;
  index: number;
  animIn: boolean;
  onClick: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      className={cn(
        'flex flex-col items-center gap-1.5 p-2 rounded-2xl',
        'transition-all duration-200 ease-out',
        'hover:bg-white/10 active:scale-90',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30',
        pressed && 'scale-90',
      )}
      style={{
        opacity: animIn ? 1 : 0,
        transform: animIn
          ? 'translateY(0) scale(1)'
          : 'translateY(20px) scale(0.8)',
        transition: `opacity 300ms ease-out ${index * 30}ms, transform 300ms ease-out ${index * 30}ms`,
      }}
      onClick={() => {
        setPressed(true);
        setTimeout(() => setPressed(false), 200);
        onClick();
      }}
    >
      {/* Icon container */}
      <div className="w-[72px] h-[72px] flex items-center justify-center rounded-[16px] overflow-hidden
                      transition-transform duration-200 hover:scale-110">
        {app.icon ? (
          <img
            src={app.icon}
            alt={app.label}
            className={cn(
              "w-full h-full object-cover",
              app.category === 'installed' && "p-2"
            )}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center
                          bg-gradient-to-br from-white/20 to-white/5
                          border border-white/15 rounded-[16px]">
            <Package className="w-8 h-8 text-white/60" />
          </div>
        )}
      </div>

      {/* Label — up to 2 lines */}
      <span className="text-[11px] text-white/90 font-medium leading-tight text-center
                       max-w-[80px] line-clamp-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
        {app.label}
      </span>
    </button>
  );
}

// ── Main Launchpad component ──────────────────────────────────────

export function Launchpad() {
  const launchpadOpen = useWindowStore((s) => s.launchpadOpen);
  const closeLaunchpad = useWindowStore((s) => s.closeLaunchpad);
  const openWindow = useWindowStore((s) => s.openWindow);
  const { play } = useSound();
  const { installedApps: storeInstalledApps, localApps, connectedToolkits, fetchApps, fetched } = useAppStore();

  const [shouldRender, setShouldRender] = useState(false);
  const [animIn, setAnimIn] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dismountTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Fetch installed apps every time the Launchpad opens ──
  useEffect(() => {
    if (launchpadOpen) {
      fetchApps();
    }
  }, [launchpadOpen, fetchApps]);

  // ── Dev app from developer mode ──
  const devAppInfo = useDevAppStore((s) => s.appInfo);
  const devAppStatus = useDevAppStore((s) => s.status);

  // ── Merge system + installed + Composio + dev apps ──
  const allApps = useMemo(() => {
    const installedDefs = installedAppsToDefinitions(storeInstalledApps);
    const localDefs = localAppsToDefinitions(localApps);
    const composioDefs = composioToolkitsToDefinitions(connectedToolkits);

    // Dev app (connected from localhost)
    const devDefs: AppDefinition[] = [];
    if (devAppStatus === 'connected' && devAppInfo?.has_ui) {
      devDefs.push({
        id: 'dev-app',
        label: devAppInfo.name,
        windowType: 'app',
        icon: devAppInfo.iconUrl || iconGeneric,
        category: 'installed',
        appMetadata: { appId: 'dev-app', ui: { type: 'static' as const, entry: 'index.html', width: 560, height: 620 } },
      });
    }

    // Deduplicate: if an installed/composio/local app has the same id as a system app, skip it
    const systemIds = new Set(SYSTEM_APPS.map((a) => a.id));
    const uniqueInstalled = [...devDefs, ...installedDefs, ...localDefs, ...composioDefs].filter((a) => !systemIds.has(a.id));
    return [...SYSTEM_APPS, ...uniqueInstalled];
  }, [storeInstalledApps, localApps, connectedToolkits, devAppInfo, devAppStatus]);

  // ── Mount/unmount with animation ──
  useEffect(() => {
    if (launchpadOpen) {
      setQuery('');
      setShouldRender(true);
      clearTimeout(dismountTimer.current);
      // Double-rAF for smooth enter animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimIn(true);
          inputRef.current?.focus();
        });
      });
    } else {
      setAnimIn(false);
      dismountTimer.current = setTimeout(() => {
        setShouldRender(false);
      }, 300);
    }
    return () => clearTimeout(dismountTimer.current);
  }, [launchpadOpen]);

  // ── Escape to close ──
  useEffect(() => {
    if (!shouldRender) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeLaunchpad();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [shouldRender, closeLaunchpad]);

  // ── Handle app click ──
  const handleAppClick = useCallback(
    (app: AppDefinition) => {
      play('click');

      // Installed / Composio app — open in an app window
      if (app.category === 'installed' && app.appMetadata) {
        const { appId, ui, composioSlug } = app.appMetadata;
        openWindow('app', {
          title: app.label,
          icon: app.icon,
          metadata: { appId, ...(composioSlug && { composioSlug }) },
          ...(ui?.width && { width: ui.width }),
          ...(ui?.height && { height: ui.height }),
          ...(ui?.minWidth && { minWidth: ui.minWidth }),
          ...(ui?.minHeight && { minHeight: ui.minHeight }),
        } as Partial<import('@/types').WindowConfig>);
        closeLaunchpad();
        return;
      }

      if (app.windowType === 'browser') {
        useComputerStore.getState().openBrowserWindow();
      } else {
        openWindow(app.windowType);
      }
      closeLaunchpad();
    },
    [play, openWindow, closeLaunchpad],
  );

  if (!shouldRender) return null;

  // ── Filter apps by search query ──
  const lowerQuery = query.toLowerCase().trim();
  const filteredApps = lowerQuery
    ? allApps.filter(
        (app) =>
          app.label.toLowerCase().includes(lowerQuery) ||
          app.keywords?.some((kw) => kw.includes(lowerQuery)),
      )
    : allApps;

  // Group into sections
  const systemApps = filteredApps.filter((a) => a.category === 'system');
  const installedApps = filteredApps.filter((a) => a.category === 'installed');

  return createPortal(
    <div
      className="fixed inset-0"
      style={{ zIndex: 1100 }}
    >
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 transition-all duration-300',
          animIn
            ? 'bg-black/50 backdrop-blur-2xl'
            : 'bg-black/0 backdrop-blur-0',
        )}
        onClick={closeLaunchpad}
      />

      {/* Content */}
      <div
        className={cn(
          'relative h-full flex flex-col items-center pt-24 pb-16 px-8',
          'transition-all duration-300 ease-out',
          animIn ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]',
        )}
        onClick={(e) => {
          // Close on clicking empty space (not an app or search)
          if (e.target === e.currentTarget) closeLaunchpad();
        }}
      >
        {/* Search bar */}
        <div className="w-full max-w-[280px] mb-10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm text-white placeholder-white/40
                        bg-white/10 border border-white/15 rounded-lg
                        backdrop-blur-md
                        outline-none focus:bg-white/15 focus:border-white/25
                        transition-colors duration-200"
            />
          </div>
        </div>

        {/* App grid */}
        <div data-tour="launchpad-apps" className="w-full max-w-4xl overflow-y-auto flex-1" onClick={(e) => { if (e.target === e.currentTarget) closeLaunchpad(); }}>
          {/* System apps */}
          {systemApps.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <div className="grid grid-cols-7 gap-x-2 gap-y-4 justify-items-center">
                {systemApps.map((app, i) => (
                  <AppIcon
                    key={app.id}
                    app={app}
                    index={i}
                    animIn={animIn}
                    onClick={() => handleAppClick(app)}
                  />
                ))}
              </div>

            </div>
          )}

          {/* Installed apps — with divider */}
          {installedApps.length > 0 && (
            <div onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 my-6 px-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-[11px] text-white/30 font-medium uppercase tracking-wider">
                  Installed Apps
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="grid grid-cols-7 gap-x-2 gap-y-4 justify-items-center">
                {installedApps.map((app, i) => (
                  <AppIcon
                    key={app.id}
                    app={app}
                    index={systemApps.length + i}
                    animIn={animIn}
                    onClick={() => handleAppClick(app)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {filteredApps.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-white/40 text-sm">No apps found</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
