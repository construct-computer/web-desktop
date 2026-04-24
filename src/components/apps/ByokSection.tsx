/**
 * ByokSection — Bring Your Own OpenRouter API Key.
 *
 * Lets users:
 *  - paste + validate their OpenRouter API key (server validates against /auth/key)
 *  - pick a mode (auto-fallback / exclusive) once a key is saved
 *  - choose a model (curated list + searchable combobox + custom override)
 *  - set a self-imposed weekly USD cap
 *
 * Rendered inside `SubscriptionSection` below the main plan picker.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { ExternalLink, Loader2, Trash2, AlertCircle, CheckCircle2, Key } from 'lucide-react';
import { Button, Input, Label, Select, type SelectOption } from '@/components/ui';
import { useBillingStore } from '@/stores/billingStore';
import type { ByokMode } from '@/services/api';

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.03] dark:bg-white/[0.04] ${className}`}>
      {children}
    </div>
  );
}

const MODES: Array<{ id: 'auto' | 'exclusive'; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto-fallback', hint: 'Platform first. When limits hit, use my key.' },
  { id: 'exclusive', label: 'Exclusive', hint: 'Always use my key. Skip platform AI.' },
];

export function ByokSection() {
  const {
    byok,
    byokLoading,
    byokError,
    byokModels,
    byokModelsLoading,
    fetchByok,
    saveByokKey,
    deleteByokKey,
    setByokMode,
    setByokModel,
    setByokWeeklyLimit,
    fetchByokModels,
  } = useBillingStore();

  // Local form state
  const [keyInput, setKeyInput] = useState('');
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySuccess, setKeySuccess] = useState<string | null>(null);

  const [limitDraft, setLimitDraft] = useState('');
  const [limitBusy, setLimitBusy] = useState(false);
  const [limitError, setLimitError] = useState<string | null>(null);

  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  useEffect(() => { fetchByok(); }, [fetchByok]);
  useEffect(() => { fetchByokModels(); }, [fetchByokModels]);

  // Keep local limit draft in sync with server-side value on load.
  useEffect(() => {
    if (byok && !limitBusy) {
      setLimitDraft(byok.weeklyLimitUsd != null ? String(byok.weeklyLimitUsd) : '');
    }
  }, [byok?.weeklyLimitUsd]); // eslint-disable-line react-hooks/exhaustive-deps

  const recommendedIds = useMemo(
    () => new Set((byokModels?.recommended || []).map((m) => m.id)),
    [byokModels],
  );
  const catalogue = byokModels?.models || [];
  const catalogueIds = useMemo(() => new Set(catalogue.map((m) => m.id)), [catalogue]);

  const providerState = useBillingStore((s) => s.getEffectiveProvider());
  const isByokCapBlocked = providerState.kind === 'blocked-byok-cap';

  const hasKey = !!byok?.hasKey;
  const mode: ByokMode = hasKey ? (byok?.mode === 'off' || !byok?.mode ? 'auto' : byok.mode) : 'off';
  const selectedModel = byok?.model || '';
  const isCustom = selectedModel && !recommendedIds.has(selectedModel);

  // Build the Select options: a recommended group (always shown), then the
  // full catalogue. If the user has a selected model that isn't in either
  // list (e.g. their custom id), we inject it so the trigger label renders.
  const selectOptions: SelectOption[] = useMemo(() => {
    const recOpts: SelectOption[] = (byokModels?.recommended || []).map((m) => ({
      value: m.id,
      label: m.label,
      description: 'Recommended',
    }));
    const catOpts: SelectOption[] = catalogue
      .filter((m) => !recommendedIds.has(m.id))
      .map((m) => ({ value: m.id, label: m.label, description: m.id }));
    const opts = [...recOpts, ...catOpts];
    if (selectedModel && !opts.find((o) => o.value === selectedModel)) {
      opts.unshift({ value: selectedModel, label: selectedModel, description: 'Custom' });
    }
    return opts;
  }, [byokModels, catalogue, recommendedIds, selectedModel]);

  const onSaveKey = useCallback(async () => {
    setKeyBusy(true);
    setKeyError(null);
    setKeySuccess(null);
    const trimmed = keyInput.trim();
    if (!trimmed) {
      setKeyError('Enter your OpenRouter API key.');
      setKeyBusy(false);
      return;
    }
    if (!trimmed.startsWith('sk-or-')) {
      setKeyError('OpenRouter keys start with "sk-or-".');
      setKeyBusy(false);
      return;
    }
    const res = await saveByokKey(trimmed);
    setKeyBusy(false);
    if (res.ok) {
      setKeyInput('');
      setKeySuccess('Key saved.');
      setTimeout(() => setKeySuccess(null), 2500);
    } else {
      setKeyError(res.error || 'Failed to save key.');
    }
  }, [keyInput, saveByokKey]);

  const onDeleteKey = useCallback(async () => {
    if (!confirm('Remove your OpenRouter API key? You will use the platform AI until you add a key again.')) return;
    setKeyBusy(true);
    await deleteByokKey();
    setKeyBusy(false);
  }, [deleteByokKey]);

  const onModeChange = useCallback(async (next: 'auto' | 'exclusive') => {
    if (next === mode) return;
    setModeError(null);
    const res = await setByokMode(next);
    if (!res.ok) setModeError(res.error || 'Failed to update mode.');
  }, [mode, setByokMode]);

  const onModelChange = useCallback(async (next: string) => {
    setModelBusy(true);
    setModelError(null);
    const res = await setByokModel(next || null);
    setModelBusy(false);
    if (!res.ok) setModelError(res.error || 'Failed to update model.');
  }, [setByokModel]);

  const onCustomModelSubmit = useCallback(async () => {
    const id = customModel.trim();
    if (!id) return;
    // Light validation: must contain a slash (openrouter format is `provider/model`).
    if (!id.includes('/')) {
      setModelError('Model ids look like "anthropic/claude-sonnet-4.5".');
      return;
    }
    // Warn if not in the catalogue but allow save (OpenRouter sometimes has beta models).
    if (catalogueIds.size > 0 && !catalogueIds.has(id)) {
      if (!confirm(`"${id}" isn't in OpenRouter's public model list. Save anyway?`)) return;
    }
    await onModelChange(id);
    setShowCustomInput(false);
    setCustomModel('');
  }, [customModel, catalogueIds, onModelChange]);

  const onLimitSave = useCallback(async () => {
    setLimitBusy(true);
    setLimitError(null);
    let value: number | null = null;
    const trimmed = limitDraft.trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setLimitError('Enter a non-negative number, or leave blank for no limit.');
        setLimitBusy(false);
        return;
      }
      value = parsed;
    }
    const res = await setByokWeeklyLimit(value);
    setLimitBusy(false);
    if (!res.ok) setLimitError(res.error || 'Failed to save limit.');
  }, [limitDraft, setByokWeeklyLimit]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (byokLoading && !byok) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-muted)] px-4 py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading BYOK settings...
        </div>
      </Card>
    );
  }

  const modeHint = hasKey
    ? MODES.find((m) => m.id === (mode === 'exclusive' ? 'exclusive' : 'auto'))?.hint
    : undefined;

  return (
    <div className="space-y-3">
      <Card>
        <div className="px-4 pt-3.5 pb-4 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> Your OpenRouter API key
              </div>
              <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">
                Bring your own key to extend usage beyond the platform cap, or go exclusive and bypass the platform entirely.{' '}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
                >
                  Get one <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>
          </div>

          {byokError && (
            <div className="flex items-center gap-2 text-[12px] text-red-500">
              <AlertCircle className="w-3.5 h-3.5" /> {byokError}
            </div>
          )}

          {/* Key input / status */}
          {hasKey ? (
            <div className="flex items-center justify-between gap-3 text-[13px] rounded-md border border-black/[0.06] dark:border-white/[0.06] px-3 py-2 bg-black/[0.02] dark:bg-white/[0.02]">
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span className="font-mono text-[12px] truncate">{byok?.keyPreview || 'Key saved'}</span>
                {byok?.credits && byok.credits.limit != null && (
                  <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                    · ${(byok.credits.usage || 0).toFixed(2)} / ${byok.credits.limit.toFixed(2)} used
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDeleteKey}
                disabled={keyBusy}
                className="text-red-500 hover:text-red-600 flex-shrink-0"
              >
                {keyBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder="sk-or-v1-..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !keyBusy) onSaveKey();
                  }}
                  className="font-mono text-[12px]"
                />
                <Button onClick={onSaveKey} disabled={keyBusy || !keyInput.trim()}>
                  {keyBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                </Button>
              </div>
              {keyError && (
                <div className="flex items-center gap-1.5 text-[12px] text-red-500">
                  <AlertCircle className="w-3 h-3" /> {keyError}
                </div>
              )}
              {keySuccess && (
                <div className="flex items-center gap-1.5 text-[12px] text-emerald-500">
                  <CheckCircle2 className="w-3 h-3" /> {keySuccess}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Mode selector (only when a key is saved) */}
      {hasKey && (
        <Card>
          <div className="px-4 pt-3.5 pb-4 space-y-3">
            <div>
              <Label className="text-[13px] font-semibold">How should we use your key?</Label>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{modeHint}</p>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map((m) => {
                const isActive = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onModeChange(m.id)}
                    className={`px-3 py-2 rounded-md text-[12px] font-medium border transition-colors ${
                      isActive
                        ? 'border-[var(--color-accent)]/40 bg-[var(--color-accent)]/[0.08] text-[var(--color-text)]'
                        : 'border-black/[0.06] dark:border-white/[0.08] text-[var(--color-text-muted)] hover:bg-black/[0.03] dark:hover:bg-white/[0.03]'
                    }`}
                    title={m.hint}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {modeError && (
              <div className="flex items-center gap-1.5 text-[12px] text-red-500">
                <AlertCircle className="w-3 h-3" /> {modeError}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Model selector */}
      <Card>
        <div className="px-4 pt-3.5 pb-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-[13px] font-semibold">Model</Label>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Only used when BYOK is Auto-fallback or Exclusive.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomInput((v) => !v)}
              className="text-[11px] text-[var(--color-accent)] hover:underline"
            >
              {showCustomInput ? 'Cancel custom' : 'Custom model id'}
            </button>
          </div>

          {showCustomInput ? (
            <div className="flex gap-2">
              <Input
                placeholder="anthropic/claude-sonnet-4.5"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onCustomModelSubmit();
                }}
                className="font-mono text-[12px]"
              />
              <Button onClick={onCustomModelSubmit} disabled={!customModel.trim()}>
                Use
              </Button>
            </div>
          ) : (
            <Select
              value={selectedModel}
              onChange={onModelChange}
              options={selectOptions}
              placeholder={byokModelsLoading ? 'Loading models...' : 'Pick a model'}
              searchable
              disabled={modelBusy || byokModelsLoading}
            />
          )}

          {isCustom && !showCustomInput && (
            <div className="text-[11px] text-[var(--color-text-muted)]">
              Using custom model: <span className="font-mono">{selectedModel}</span>
            </div>
          )}
          {modelError && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-500">
              <AlertCircle className="w-3 h-3" /> {modelError}
            </div>
          )}
        </div>
      </Card>

      {/* Weekly limit */}
      <Card>
        <div className="px-4 pt-3.5 pb-4 space-y-2">
          <Label className="text-[13px] font-semibold">Weekly spend limit (USD)</Label>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            Only counts traffic that hits your OpenRouter key. Leave blank for no limit. Resets Monday 00:00 UTC.
          </p>
          {isByokCapBlocked && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              You've hit this cap this week — raise it or wait until Monday.
            </div>
          )}
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 20"
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !limitBusy) onLimitSave();
              }}
              className={isByokCapBlocked ? 'border-red-500/40' : undefined}
            />
            <Button onClick={onLimitSave} disabled={limitBusy}>
              {limitBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
          {limitError && (
            <div className="flex items-center gap-1.5 text-[12px] text-red-500">
              <AlertCircle className="w-3 h-3" /> {limitError}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
