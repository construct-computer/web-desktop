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
    <div className="divide-y divide-black/[0.06] font-sans">
      {entries.map(([key, value]) => (
        <div key={key} className="py-3.5 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-start gap-2">
          <span className="domain-record-label text-[10px] font-bold text-[#2d6a5a] uppercase tracking-wider w-full md:w-1/3 shrink-0 select-none">
            {key.replace(/_/g, ' ')}
          </span>
          <div className="flex-1 min-w-0">
            <pre className="text-[12px] text-[#333] whitespace-pre-wrap font-mono leading-relaxed max-w-full overflow-x-auto">
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
      <div className="h-full flex items-center justify-center browser-read-pane select-none">
        <div className="space-y-4 w-full max-w-md px-8">
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-subtle)] mb-4">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2d6a5a]" />
            Resolving domain records…
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 rounded-xl bg-black/[0.04] animate-pulse border border-black/[0.06]" />
          ))}
        </div>
      </div>
    );
  }

  const sections: DomainSection[] = ['overview', 'dns', 'whois', 'ssl', 'subdomains'];
  const has = (k: string) => data[k] !== undefined;

  return (
    <div className="h-full overflow-y-auto browser-read-pane font-sans">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#2d6a5a]/8 flex items-center justify-center border border-[#2d6a5a]/15 shrink-0 select-none">
            <Server className="w-6 h-6 text-[#2d6a5a]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-[var(--color-text)] leading-snug truncate">
              {tab.domain || 'Domain Intel'}
            </h2>
            <p className="text-[10px] text-[#5f6368] font-mono tracking-wider uppercase mt-1">
              Action: {tab.domainAction || 'lookup'}
            </p>
          </div>
        </div>

        <div className="h-px bg-black/[0.08] mb-8 select-none" />

        <div className="flex gap-1.5 p-0.5 rounded-lg bg-black/[0.03] border border-black/[0.08] mb-6 flex-wrap select-none max-w-max">
          {sections.filter((s) => s === 'overview' || has(s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSection(s)}
              className={`px-3 py-1 rounded-md text-[10px] uppercase tracking-wider font-semibold transition-all duration-150 ${
                section === s
                  ? 'bg-black/[0.08] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-black/[0.08] bg-black/[0.02] p-6 shadow-sm">
          {section === 'overview' && <RecordTable data={data} />}
          {section === 'dns' && has('dns') && <RecordTable data={data.dns as Record<string, unknown>} />}
          {section === 'whois' && has('whois') && (
            <pre className="text-[12px] text-[#333] whitespace-pre-wrap font-mono leading-relaxed select-text">
              {String(data.whois)}
            </pre>
          )}
          {section === 'ssl' && has('ssl') && <RecordTable data={data.ssl as Record<string, unknown>} />}
          {section === 'subdomains' && has('subdomains') && (
            <>
              {(typeof data.error === 'string' || typeof data.subdomains_error === 'string') && (
                <p className="text-[11px] text-[var(--color-text-subtle)] mb-3 font-sans">
                  {String(data.error ?? data.subdomains_error)}
                </p>
              )}
              <ul className="text-[12px] text-[var(--color-text-muted)] space-y-2 font-mono divide-y divide-black/[0.06] select-text">
                {(Array.isArray(data.subdomains) ? data.subdomains : []).length === 0 ? (
                  <li className="text-[var(--color-text-subtle)] italic font-sans">No subdomains discovered</li>
                ) : (
                  (Array.isArray(data.subdomains) ? data.subdomains : []).map((s) => (
                    <li key={String(s)} className="pt-2 first:pt-0">{String(s)}</li>
                  ))
                )}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

