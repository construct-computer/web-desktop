import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Code2, CreditCard, Monitor, Paintbrush, Search, User, Bot, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSound } from '@/hooks/useSound';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useWindowStore } from '@/stores/windowStore';
import { useComputerStore } from '@/stores/agentStore';
import { openSettingsToSection, type BillingSubsection, type SettingsSection } from '@/lib/settingsNav';
import { SYSTEM_APPS, type AppDefinition } from '@/lib/appRegistry';
import { WINDOW_TRANSITION_EASING, WINDOW_TRANSITION_MS, Z_INDEX } from '@/lib/constants';
import { buildTransformOpacityTransition } from '@/lib/panelAnimation';

type SpotlightTarget = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: string | ComponentType<{ className?: string }>;
  kind: 'app' | 'settings';
  onOpen: () => void;
};

type SettingsTarget = {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: ComponentType<{ className?: string }>;
  section: SettingsSection;
  subsection?: BillingSubsection;
};

const APP_DESCRIPTIONS: Partial<Record<string, string>> = {
  'app-registry': 'Open the app store and installed integrations',
  'app-builder': 'Build and edit custom UI apps',
  settings: 'Open desktop preferences',
  auditlogs: 'Review activity and audit logs',
  'access-control': 'Review approvals and permissions',
  memory: 'Open saved knowledge and reminders',
  terminal: 'Open a shell session',
  files: 'Browse files and folders',
  browser: 'Open the web browser',
  calendar: 'Open calendar',
  email: 'Open inbox and mail',
  editor: 'Open documents and text',
};

const SETTINGS_TARGETS: SettingsTarget[] = [
  {
    id: 'settings-account',
    label: 'Account',
    description: 'Profile, login, and email',
    keywords: ['account', 'profile', 'password', 'email', 'login'],
    icon: User,
    section: 'account',
  },
  {
    id: 'settings-construct',
    label: 'Construct',
    description: 'Desktop behavior and agent settings',
    keywords: ['construct', 'desktop', 'agent', 'voice', 'assistant'],
    icon: Bot,
    section: 'construct',
  },
  {
    id: 'settings-billing',
    label: 'Billing',
    description: 'Plan, payments, and usage',
    keywords: ['billing', 'plan', 'payment', 'usage', 'limits'],
    icon: CreditCard,
    section: 'billing',
  },
  {
    id: 'settings-billing-usage',
    label: 'Billing / Usage',
    description: 'Usage, limits, and spend',
    keywords: ['usage', 'limits', 'spend', 'billing'],
    icon: CreditCard,
    section: 'billing',
    subsection: 'usage',
  },
  {
    id: 'settings-billing-ai',
    label: 'Billing / AI Provider',
    description: 'Model provider and API keys',
    keywords: ['ai provider', 'provider', 'model', 'llm', 'api key', 'billing'],
    icon: CreditCard,
    section: 'billing',
    subsection: 'ai-provider',
  },
  {
    id: 'settings-appearance',
    label: 'Appearance',
    description: 'Theme, wallpaper, and voice input',
    keywords: ['appearance', 'theme', 'wallpaper', 'voice', 'sound'],
    icon: Paintbrush,
    section: 'appearance',
  },
  {
    id: 'settings-devices',
    label: 'Devices',
    description: 'Linked devices and sessions',
    keywords: ['devices', 'sessions', 'devices'],
    icon: Monitor,
    section: 'devices',
  },
  {
    id: 'settings-developer',
    label: 'Developer',
    description: 'Advanced tools and debugging',
    keywords: ['developer', 'debug', 'logs', 'tools'],
    icon: Code2,
    section: 'developer',
  },
];

function matchesQuery(target: Pick<SpotlightTarget, 'label' | 'description' | 'keywords'>, query: string) {
  if (!query) return true;
  return [target.label, target.description, ...target.keywords].some((value) => value.toLowerCase().includes(query));
}

function listFocusableInPanel(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([type="hidden"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    if (el.closest('[aria-hidden="true"]') || el.closest('[inert]') || el.hasAttribute('data-focus-guard')) return false;
    const position = getComputedStyle(el).position;
    if (position !== 'fixed' && el.offsetParent === null) return false;
    return !el.hasAttribute('disabled') && (el as HTMLInputElement).type !== 'hidden';
  });
}

function SpotlightIcon({ target }: { target: SpotlightTarget }) {
  if (typeof target.icon === 'string') {
    return (
      <img
        src={target.icon}
        alt=""
        draggable={false}
        className="h-8 w-8 rounded-xl object-cover"
      />
    );
  }

  const Icon = target.icon;
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
      <Icon className="h-4 w-4" />
    </div>
  );
}

export function Spotlight() {
  const open = useWindowStore((s) => s.spotlightOpen);
  const closeSpotlight = useWindowStore((s) => s.closeSpotlight);
  const openWindow = useWindowStore((s) => s.openWindow);
  const openBrowserWindow = useComputerStore((s) => s.openBrowserWindow);
  const { play } = useSound();
  const isMobile = useIsMobile();

  const [show, setShow] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [fadedOut, setFadedOut] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  const pushedHistoryRef = useRef(false);

  const panelTransition = buildTransformOpacityTransition(
    WINDOW_TRANSITION_MS,
    WINDOW_TRANSITION_EASING,
    prefersReducedMotion,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPrefersReducedMotion(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setShow(true);
      setFadedOut(false);
      if (prefersReducedMotion) {
        setAnimating(true);
      } else {
        setAnimating(false);
        requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)));
      }
      return;
    }

    setAnimating(false);
    setFadedOut(true);
    const unmountMs = prefersReducedMotion ? 0 : WINDOW_TRANSITION_MS;
    const timer = window.setTimeout(() => setShow(false), unmountMs);
    return () => window.clearTimeout(timer);
  }, [open, prefersReducedMotion]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!isMobile || !open) return;
    if ((window.history.state as { __constructSpotlight?: number } | null)?.__constructSpotlight) {
      pushedHistoryRef.current = false;
      return;
    }
    window.history.pushState({ __constructSpotlight: 1 }, '', window.location.href);
    pushedHistoryRef.current = true;
    const onPop = () => {
      pushedHistoryRef.current = false;
      closeSpotlight();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isMobile, open, closeSpotlight]);

  useLayoutEffect(() => {
    if (!open) {
      const el = focusReturnRef.current;
      focusReturnRef.current = null;
      if (el && document.body.contains(el)) {
        queueMicrotask(() => { el.focus(); });
      }
      return;
    }
    focusReturnRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  const requestClose = useCallback(() => {
    if (isMobile && (window.history.state as { __constructSpotlight?: number } | null)?.__constructSpotlight) {
      window.history.back();
      return;
    }
    closeSpotlight();
  }, [closeSpotlight, isMobile]);

  const targets = useMemo<SpotlightTarget[]>(() => {
    const appTargets = SYSTEM_APPS.map((app: AppDefinition) => ({
      id: `app:${app.id}`,
      label: app.label,
      description: APP_DESCRIPTIONS[app.id] ?? `Open ${app.label.toLowerCase()}`,
      keywords: app.keywords ?? [],
      icon: app.icon,
      kind: 'app' as const,
      onOpen: () => {
        if (app.windowType === 'browser') {
          openBrowserWindow();
          return;
        }
        openWindow(app.windowType);
      },
    }));

    const settingsTargetsMapped = SETTINGS_TARGETS.map((target) => ({
      id: target.id,
      label: target.label,
      description: target.description,
      keywords: target.keywords,
      icon: target.icon,
      kind: 'settings' as const,
      onOpen: () => openSettingsToSection(target.section, target.subsection ? { subsection: target.subsection } : undefined),
    }));

    return [...appTargets, ...settingsTargetsMapped];
  }, [openBrowserWindow, openWindow]);

  const filteredTargets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? targets.filter((target) => matchesQuery(target, q)) : targets;
  }, [query, targets]);

  const runTarget = useCallback((target: SpotlightTarget) => {
    play('click');
    requestClose();
    if (isMobile) {
      window.setTimeout(() => target.onOpen(), prefersReducedMotion ? 0 : WINDOW_TRANSITION_MS);
      return;
    }
    queueMicrotask(() => target.onOpen());
  }, [isMobile, play, prefersReducedMotion, requestClose]);

  const onInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(filteredTargets.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const target = filteredTargets[activeIndex];
      if (target) runTarget(target);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      requestClose();
    }
  }, [activeIndex, filteredTargets, requestClose, runTarget]);

  const onPanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return;
    const focusables = listFocusableInPanel(panelRef.current);
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: Z_INDEX.modal }}>
      <div
        className={cn('absolute inset-0 spotlight-scrim spotlight-scrim-sync', animating && 'is-open')}
        style={{ ['--spotlight-scrim-transition' as string]: `${WINDOW_TRANSITION_MS}ms ${WINDOW_TRANSITION_EASING}`, pointerEvents: open ? 'auto' : 'none' }}
        onClick={requestClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-6 pointer-events-none">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Apps and settings search"
          onKeyDown={onPanelKeyDown}
          className={cn(
            'flex flex-col overflow-hidden rounded-2xl glass-window spotlight-glass-window spotlight-glass-window-sync ring-1 ring-black/5 dark:ring-white/8 shadow-[0_24px_80px_rgba(0,0,0,0.22),0_12px_24px_rgba(0,0,0,0.12)] dark:border-white/[0.1]',
            animating && 'is-open',
            animating ? 'pointer-events-auto' : 'pointer-events-none',
          )}
          style={{
            width: 'min(720px, calc(100vw - 24px))',
            height: 'min(620px, calc(100dvh - 24px))',
            transition: panelTransition,
            transformOrigin: 'center center',
            transform: animating ? 'scale(1)' : 'scale(0.98)',
            opacity: fadedOut ? 0 : 1,
          }}
        >
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/8 bg-white/3 px-4">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-text-muted/60" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search apps or settings"
                className="w-full bg-transparent text-[14px] text-text outline-none placeholder:text-text-muted/45"
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <button
              type="button"
              onClick={requestClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted/70 transition-all duration-150 hover:bg-white/10 hover:text-text"
              aria-label="Close search"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {filteredTargets.length > 0 ? (
              <div className="space-y-1">
                {filteredTargets.map((target, index) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => runTarget(target)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        active
                          ? 'bg-[var(--color-accent)]/10 ring-1 ring-[var(--color-accent)]/15'
                          : 'hover:bg-black/5 dark:hover:bg-white/6',
                      )}
                    >
                      <SpotlightIcon target={target} />

                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium text-text">{target.label}</div>
                        <div className="truncate text-[12px] text-text-muted/70">{target.description}</div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted/55">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                          {target.kind === 'app' ? 'App' : 'Settings'}
                        </span>
                        <ChevronRight className="h-4 w-4 text-text-muted/35" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-text-muted/65">
                No apps or settings found.
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-white/8 bg-white/3 px-4 py-2 text-[11px] text-text-muted/60">
            <span>Apps and settings</span>
            <span>↑↓ Enter Esc</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
