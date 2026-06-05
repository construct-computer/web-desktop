import { useState } from 'react';
import {
  Loader2, AlertCircle, Unplug, Link2, Code2, Globe, ExternalLink,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useDevAppStore } from '@/stores/devAppStore';
import { InfoHint } from '@/components/ui';
import { SectionPanel, SettingsCard, SettingsRow, Toggle } from './SettingsPrimitives';

export function DeveloperSection() {
  const { developerMode, setDeveloperMode } = useSettingsStore();
  const { status, error, appInfo, devUrl, connect, disconnect, refreshTools } = useDevAppStore();

  const [urlInput, setUrlInput] = useState(devUrl || '');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    await connect(urlInput.trim());
  };

  const handleOpenApp = () => {
    import('@/stores/windowStore').then(({ useWindowStore }) => {
      useWindowStore.getState().openWindow('app', {
        title: appInfo?.name || 'Dev App',
        icon: appInfo?.iconUrl || undefined,
        metadata: { appId: 'dev-app' },
      });
    });
  };

  return (
    <SectionPanel title="Developer" subtitle="Connect and test custom apps.">
      <SettingsCard>
        <SettingsRow
          label="App Builder Mode"
          info="Turns on local app testing controls. Useful when you are building or connecting a custom app."
          description="Enable controls for building and testing Construct apps."
        >
          <Toggle checked={developerMode} onChange={setDeveloperMode} />
        </SettingsRow>
      </SettingsCard>

      <div className="mt-3 px-1">
        <button
          type="button"
          onClick={() => {
            import('@/stores/windowStore').then(({ useWindowStore }) => {
              useWindowStore.getState().openWindow('app-builder');
            });
          }}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-accent)] hover:opacity-80 transition-opacity"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open App Builder
        </button>
      </div>

      {developerMode && (
        <div className="mt-4">
          <SettingsCard>
            <div className="px-4 py-3 border-b border-black/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center gap-2 mb-1">
                <Code2 className="w-4 h-4 opacity-50" />
                <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                  Connect Local App
                  <InfoHint side="top">Use this when your app is running on your computer and you want Construct to test it.</InfoHint>
                </span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-snug">
                Run your app locally, then enter its URL to connect it for testing.
              </p>
            </div>

            <div className="p-4">
              {status === 'connected' && appInfo ? (
                /* Connected state */
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      {appInfo.iconUrl ? (
                        <img src={appInfo.iconUrl} alt="" className="w-10 h-10 rounded-lg" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-black/[0.06] dark:bg-white/[0.06] flex items-center justify-center">
                          <Code2 className="w-5 h-5 opacity-40" />
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[var(--color-bg-secondary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium truncate">{appInfo.name}</span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">dev</span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] truncate">{appInfo.description}</p>
                    </div>
                    <span className="text-[11px] opacity-40 flex-shrink-0">{appInfo.tools.length} action{appInfo.tools.length !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-[10px] font-mono text-[var(--color-text-muted)] opacity-60">{devUrl}</p>
                  {appInfo.tools.length > 0 && (
                    <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
                      {appInfo.tools.map((t) => (
                        <div key={t.name} className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06]">{t.name}</span>
                          {t.description && <span className="truncate opacity-60">{t.description}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="settings-action-row flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={handleOpenApp}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                    >
                      <Globe className="w-3 h-3" />
                      Open App
                    </button>
                    <button
                      onClick={refreshTools}
                      className="px-3 py-1.5 text-[11px] font-medium rounded-md bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] transition-colors"
                    >
                      Refresh Actions
                    </button>
                    <button
                      onClick={disconnect}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md text-red-600 dark:text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-colors ml-auto"
                    >
                      <Unplug className="w-3 h-3" />
                      Disconnect
                    </button>
                  </div>
                </div>
              ) : (
                /* Disconnected / validating / error state */
                <div className="space-y-3">
                  <form onSubmit={handleConnect} className="settings-form-pair">
                    <input
                      type="url"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="http://localhost:8787"
                      disabled={status === 'validating'}
                      className="settings-form-field flex-1 px-3 py-1.5 text-[12px] font-mono rounded-md
                                 bg-black/[0.04] dark:bg-white/[0.06]
                                 border border-black/[0.08] dark:border-white/[0.08]
                                 text-[var(--color-text)] placeholder-black/30 dark:placeholder-white/30
                                 focus:outline-none
                                 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={status === 'validating' || !urlInput.trim()}
                      className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold rounded-md
                                 bg-[var(--color-accent)] text-white
                                 hover:brightness-110
                                 disabled:opacity-50
                                 transition-all"
                    >
                      {status === 'validating' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Link2 className="w-3 h-3" />
                      )}
                      {status === 'validating' ? 'Connecting...' : 'Connect'}
                    </button>
                  </form>
                  {error && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-red-500/5 dark:bg-red-500/10 text-red-700 dark:text-red-300">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </SettingsCard>

          <div className="mt-3 px-1">
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              Your app must serve <code className="px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] font-mono text-[10px]">/mcp</code> and <code className="px-1 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.06] font-mono text-[10px]">/health</code>. Construct can use the app’s actions while it is connected.
            </p>
          </div>
        </div>
      )}
    </SectionPanel>
  );
}