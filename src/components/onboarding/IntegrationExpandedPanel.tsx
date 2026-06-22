import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/PlatformIcon';
import { cn } from '@/lib/utils';

interface IntegrationExpandedPanelProps {
  slug: string;
  label: string;
  tagline: string;
  logoUrl?: string;
  connected: boolean;
  authPending?: boolean;
  anyBusy: boolean;
  error: string | null;
  prefersReducedMotion: boolean;
  onConnect: (e: { stopPropagation: () => void }) => void;
}

export function IntegrationExpandedPanel({
  slug,
  label,
  tagline,
  logoUrl,
  connected,
  authPending = false,
  anyBusy,
  error,
  prefersReducedMotion,
  onConnect,
}: IntegrationExpandedPanelProps) {
  const revealClass = prefersReducedMotion
    ? ''
    : cn(
        'opacity-0 translate-x-1 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
        'group-hover/card:opacity-100 group-hover/card:translate-x-0',
        'group-data-[open=true]/card:opacity-100 group-data-[open=true]/card:translate-x-0',
      );

  return (
    <div className={cn('flex h-full min-h-0 w-full flex-col gap-1.5 px-3 py-2', revealClass)}>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        <div className="shrink-0 rounded-lg bg-white/5 p-1">
          <PlatformIcon
            platform={slug}
            size={28}
            logoUrl={logoUrl}
            name={label}
            className="shrink-0"
          />
        </div>
        <span className="min-w-0 truncate text-[13px] font-semibold leading-tight text-text">
          {label}
        </span>
      </div>

      <p className="line-clamp-2 shrink min-h-0 text-pretty text-[11px] leading-snug text-text-muted">
        {tagline}
      </p>

      <div className="mt-auto flex flex-col gap-1.5">
        {connected ? (
          <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-medium text-emerald-500">
            <Check className="h-3 w-3 shrink-0" strokeWidth={3} />
            Connected
          </span>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="h-7 w-full text-[11px] font-semibold"
            onClick={onConnect}
            disabled={authPending || anyBusy}
          >
            {anyBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : authPending ? 'Loading…' : 'Connect'}
          </Button>
        )}
        {error && (
          <span className="line-clamp-2 text-center text-[10px] leading-tight text-red-400">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
