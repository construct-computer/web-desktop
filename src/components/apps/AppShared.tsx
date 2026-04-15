import { useState } from 'react';
import { Check, Copy, Loader2, Package, Search, Wrench } from 'lucide-react';
import Markdown from 'react-markdown';

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-md bg-black/[0.04] dark:bg-white/[0.06] text-[var(--color-text-muted)] border border-black/[0.06] dark:border-white/[0.06]">
      {children}
    </span>
  );
}

export function PanelLoading({ label }: { label: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[var(--color-bg-secondary)]">
      <div className="text-center">
        <Loader2 className="w-6 h-6 mx-auto mb-2 opacity-40 animate-spin" />
        <p className="text-xs opacity-40">{label}</p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex flex-col bg-[var(--color-bg-secondary)] text-[var(--color-text)] select-none">
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

const STATUS_TONE: Record<'emerald' | 'red' | 'amber' | 'blue' | 'purple' | 'gray', { dot: string; text: string; bg: string }> = {
  emerald: { dot: 'bg-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  red:     { dot: 'bg-red-500',     text: 'text-red-500',     bg: 'bg-red-500/10' },
  amber:   { dot: 'bg-amber-500',   text: 'text-amber-500',   bg: 'bg-amber-500/10' },
  blue:    { dot: 'bg-blue-500',    text: 'text-blue-500',    bg: 'bg-blue-500/10' },
  purple:  { dot: 'bg-purple-500',  text: 'text-purple-500',  bg: 'bg-purple-500/10' },
  gray:    { dot: 'bg-gray-400',    text: 'text-gray-400',    bg: 'bg-black/[0.06] dark:bg-white/[0.08]' },
};

export function AppHeroHeader({
  icon, fallbackIcon, name, subtitle, description, status, badges, actions, primaryAction
}: {
  icon?: string;
  fallbackIcon: React.ReactNode;
  name: string;
  subtitle?: string;
  description?: string;
  status?: { label: string; tone: keyof typeof STATUS_TONE };
  badges?: string[];
  actions?: React.ReactNode;
  primaryAction?: React.ReactNode;
}) {
  const tone = status ? STATUS_TONE[status.tone] : null;
  return (
    <div className="pb-5 border-b border-black/[0.06] dark:border-white/[0.08]">
      <div className="flex items-start gap-4">
        <div className="w-[72px] h-[72px] rounded-[16px] bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-sm">
          {icon ? (
            <img src={icon} alt={name} className="w-[52px] h-[52px] object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          ) : fallbackIcon}
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[20px] font-bold leading-tight truncate text-[var(--color-text)]">{name}</h2>
                {status && tone && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-px rounded-full uppercase tracking-wide ${tone.bg} ${tone.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                    {status.label}
                  </span>
                )}
              </div>
              {subtitle && (
                <p className="text-[13px] text-[var(--color-text-muted)] mt-1 truncate">{subtitle}</p>
              )}
              {badges && badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {badges.map((b) => <Badge key={b}>{b}</Badge>)}
                </div>
              )}
            </div>
            {(actions || primaryAction) && (
               <div className="flex items-center gap-2 flex-shrink-0">
                 {actions}
                 {primaryAction}
               </div>
            )}
          </div>
        </div>
      </div>
      {description && (
        <div className="text-[13px] text-[var(--color-text)]/85 leading-relaxed mt-4 app-description-md">
          <Markdown
            components={{
              p: ({ children }) => <p className="m-0 [&+p]:mt-2">{children}</p>,
              a: ({ children, href }) => (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
                  {children}
                </a>
              ),
              code: ({ children }) => (
                <code className="text-[11.5px] font-mono px-1 py-px rounded bg-black/[0.06] dark:bg-white/[0.08]">{children}</code>
              ),
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
            }}
          >
            {description}
          </Markdown>
        </div>
      )}
    </div>
  );
}

export function HeaderIconButton({
  children, onClick, href, disabled, title, className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const cls = `p-1.5 rounded-md text-black/50 dark:text-white/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors ${className || ''}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} disabled={disabled} className={cls} title={title}>
      {children}
    </button>
  );
}

export function InfoCard({
  title, subtitle, children, right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h3>
          {subtitle && (
            <p className="text-[10px] text-[var(--color-text-muted)]/70 mt-px">{subtitle}</p>
          )}
        </div>
        {right}
      </div>
      <div className="rounded-[10px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] px-3 py-2 space-y-1">
        {children}
      </div>
    </div>
  );
}

export function InfoRow({
  icon, label, value, mono, copyable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return (
    <div className="flex items-center gap-2 min-h-[22px]">
      <span className="text-[var(--color-text-muted)]/60 flex-shrink-0">{icon}</span>
      <span className="text-[11px] text-[var(--color-text-muted)] min-w-[78px]">{label}</span>
      <span className={`text-[11.5px] truncate flex-1 ${mono ? 'font-mono' : ''}`} title={value}>{value}</span>
      {copyable && (
        <button
          onClick={handleCopy}
          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-opacity flex-shrink-0"
          title="Copy"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 opacity-50" />}
        </button>
      )}
    </div>
  );
}

export interface DisplayTool { slug: string; name: string; description?: string }

export function ToolsList({ tools, emptyConnected }: { tools: DisplayTool[]; emptyConnected?: boolean }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = q
    ? tools.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q))
    : tools;

  if (tools.length === 0) {
    if (emptyConnected) {
      return (
        <div className="text-center py-8">
          <Check className="w-6 h-6 mx-auto mb-2 text-emerald-500/40" />
          <p className="text-xs opacity-40">Integration is connected. Tools are available to the agent.</p>
        </div>
      );
    }
    return (
      <div className="text-center py-8">
        <Package className="w-6 h-6 mx-auto mb-2 opacity-20" />
        <p className="text-xs opacity-40">No tools cached. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Tools · {tools.length}
        </h3>
      </div>
      {tools.length > 6 && (
        <div className="relative mb-2">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tools.length} tools...`}
            className="w-full text-[11.5px] pl-7 pr-2.5 py-1.5 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:border-[var(--color-accent)]/40 placeholder:text-[var(--color-text-muted)]"
          />
        </div>
      )}
      <div className="space-y-1">
        {filtered.map((tool) => (
          <ToolCard key={tool.slug} tool={tool} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-4">
            <p className="text-[11px] text-[var(--color-text-muted)]">No matches for "{query}"</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolCard({ tool }: { tool: DisplayTool }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(tool.slug).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return (
    <div className="group flex items-start gap-2.5 px-3 py-2 rounded-[8px] bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition-colors">
      <div className="w-[22px] h-[22px] rounded-[5px] bg-black/[0.04] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-px">
        <Wrench className="w-3 h-3 opacity-50" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-semibold truncate">{tool.name}</span>
          {tool.slug !== tool.name && (
            <span className="text-[9px] font-mono text-[var(--color-text-muted)]/70 truncate">{tool.slug.toLowerCase()}</span>
          )}
        </div>
        {tool.description && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-relaxed line-clamp-2">{tool.description}</p>
        )}
      </div>
      <button
        onClick={handleCopy}
        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-opacity flex-shrink-0"
        title="Copy tool name"
      >
        {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 opacity-50" />}
      </button>
    </div>
  );
}
