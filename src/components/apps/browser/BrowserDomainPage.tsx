import { memo, useState } from 'react';
import { Server, AlertTriangle, Loader2 } from 'lucide-react';
import type { BrowserTab } from '@/stores/browserTabStore';

type DomainSection = 'dns' | 'whois' | 'ssl' | 'subdomains' | 'overview';

function RecordTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) {
    return <p className="text-xs text-[var(--color-text-subtle)] italic select-none">No records available</p>;
  }
  return (
    <div className="divide-y divide-white/[0.04] font-sans">
      {entries.map(([key, value]) => (
        <div key={key} className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start gap-2">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider w-full md:w-1/3 shrink-0 select-none">
            {key.replace(/_/g, ' ')}
          </span>
          <div className="flex-1 min-w-0">
            <pre className="text-[12px] text-[var(--color-text-muted)] whitespace-pre-wrap font-mono leading-relaxed max-w-full overflow-x-auto">
              {Array.isArray(value) ? value.join('\n') : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </pre>
          </div>
        </div>
      ))}
    </div>
  );
}

export const BrowserDomainPage = memo(function BrowserDomainPage({ tab }: { tab: BrowserTab }) {
  const [section, setSection] = useState<DomainSection>('overview');
  const data = tab.domainData || {};

  if (tab.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center bg-[var(--color-surface)] select-none">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
          <AlertTriangle className="w-6 h-6 text-red-400" />
        </div>
        <p className="text-sm font-semibold text-red-400 mb-2">Domain lookup failed</p>
        <p className="text-xs text-[var(--color-text-muted)] max-w-sm leading-relaxed">{tab.error}</p>
      </div>
    );
  }

  if (tab.status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface)] select-none">
        <div className="space-y-4 w-full max-w-md px-8">
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)] mb-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            Resolving domain records…
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  const sections: DomainSection[] = ['overview', 'dns', 'whois', 'ssl', 'subdomains'];
  const has = (k: string) => data[k] !== undefined;

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-surface)] text-[var(--color-text)] font-sans">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0 select-none">
            <Server className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-text)] leading-snug truncate">
              {tab.domain || 'Domain Intel'}
            </h2>
            <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase mt-1">
              Action: {tab.domainAction || 'lookup'}
            </p>
          </div>
        </div>

        <div className="h-px bg-white/[0.06] mb-8 select-none" />

        <div className="flex gap-1.5 p-0.5 rounded-lg bg-white/[0.02] border border-white/[0.06] mb-6 flex-wrap select-none max-w-max">
          {sections.filter((s) => s === 'overview' || has(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`px-3 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold transition-all duration-150 ${
                section === s
                  ? 'bg-white/10 text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] p-6 shadow-sm">
          {section === 'overview' && <RecordTable data={data} />}
          {section === 'dns' && has('dns') && <RecordTable data={data.dns as Record<string, unknown>} />}
          {section === 'whois' && has('whois') && (
            <pre className="text-[12px] text-[var(--color-text-muted)] whitespace-pre-wrap font-mono leading-relaxed select-text">
              {String(data.whois)}
            </pre>
          )}
          {section === 'ssl' && has('ssl') && <RecordTable data={data.ssl as Record<string, unknown>} />}
          {section === 'subdomains' && has('subdomains') && (
            <ul className="text-[12px] text-[var(--color-text-muted)] space-y-2 font-mono divide-y divide-white/[0.03] select-text">
              {(Array.isArray(data.subdomains) ? data.subdomains : []).map((s) => (
                <li key={String(s)} className="pt-2 first:pt-0">{String(s)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
});

