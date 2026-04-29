/**
 * AskUserCard — renders interactive question(s) from the agent.
 *
 * Aligned with the coding-agent reference design:
 *   - Rich MCQs with header chip, label + description per option
 *   - multiSelect support with chip-toggle + Confirm button
 *   - Auto-injected "Other" escape hatch (free-text input per question)
 *   - Multi-question batches stacked in one card; submit only when all done
 *   - After submission, each question collapses to {header}: {answer}
 *
 * Backward compat:
 *   - If `data.questions` is missing, falls back to legacy `options` (single MCQ)
 *   - If only `fields` are present, renders the original form-input UI but
 *     echoes per-field answers instead of "Details provided"
 */

import { useMemo, useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import {
  useComputerStore,
  type AskUserData,
  type AskUserOption,
  type AskUserQuestion,
} from '@/stores/agentStore';

interface AskUserCardProps {
  data: AskUserData;
}

const OTHER_VALUE = '__other__';

/**
 * Per-question UI state. We track selections (label[]) for both single and
 * multi-select uniformly — single-select just enforces .length <= 1 on click.
 * `customText` holds the typed value when "Other" is chosen.
 */
interface QuestionState {
  selected: string[];        // option.label values picked
  customText: string;
  showCustom: boolean;
}

function isOtherOption(opt: AskUserOption): boolean {
  return (opt.value === OTHER_VALUE) || opt.label.toLowerCase() === 'other';
}

function optionValue(opt: AskUserOption): string {
  return opt.value || opt.label;
}

function deriveQuestions(data: AskUserData): AskUserQuestion[] {
  if (data.questions && data.questions.length > 0) return data.questions;
  // Legacy single-question shape — wrap as one MCQ
  if (data.options && data.options.length > 0 && data.question) {
    return [{
      question: data.question,
      header: data.question.slice(0, 20),
      options: data.options,
      multiSelect: false,
    }];
  }
  return [];
}

export function AskUserCard({ data }: AskUserCardProps) {
  const respondToAskUser = useComputerStore(s => s.respondToAskUser);

  const questions = useMemo(() => deriveQuestions(data), [data]);
  const fields = data.fields || [];
  const hasQuestions = questions.length > 0;
  const hasFields = !hasQuestions && fields.length > 0;
  const isAnswered = !!data.answers || data.selectedValue !== undefined;

  // Per-question state, keyed by index
  const [qStates, setQStates] = useState<Record<number, QuestionState>>(() =>
    Object.fromEntries(questions.map((_, i) => [i, { selected: [], customText: '', showCustom: false }]))
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [legacyCustomValue, setLegacyCustomValue] = useState('');
  const [legacyShowCustom, setLegacyShowCustom] = useState(false);

  // ── Field-only legacy path (no questions) ──────────────────────────────
  const missingRequiredField = fields.some(f => f.required !== false && !fieldValues[f.id]?.trim());

  const handleFieldsSubmit = () => {
    if (missingRequiredField || isAnswered) return;
    const answers: Record<string, string> = {};
    for (const f of fields) {
      const v = (fieldValues[f.id] || '').trim();
      if (v) answers[f.label] = v;
    }
    respondToAskUser(data.questionId, answers);
  };

  // ── Question handlers ─────────────────────────────────────────────────
  const updateQ = (index: number, patch: Partial<QuestionState>) =>
    setQStates(prev => ({ ...prev, [index]: { ...prev[index], ...patch } }));

  const toggleOption = (index: number, opt: AskUserOption, multiSelect: boolean) => {
    if (isAnswered) return;
    const current = qStates[index] || { selected: [], customText: '', showCustom: false };
    const optKey = optionValue(opt);

    if (isOtherOption(opt)) {
      // Selecting "Other" reveals the input and clears any other selections
      updateQ(index, { showCustom: true, selected: [optKey] });
      return;
    }

    if (multiSelect) {
      const exists = current.selected.includes(optKey);
      const next = exists
        ? current.selected.filter(v => v !== optKey)
        : [...current.selected.filter(v => v !== OTHER_VALUE), optKey]; // un-select Other when picking real
      updateQ(index, {
        selected: next,
        showCustom: false,
        customText: '',
      });
    } else {
      // Single-select: pick this one and immediately count as answered for this Q
      updateQ(index, { selected: [optKey], showCustom: false, customText: '' });
    }
  };

  // For each question, the resolved answer text (label of selection, or customText for Other,
  // or comma-joined labels for multiSelect). Empty string when not yet answered.
  const resolvedAnswers: Record<number, string> = useMemo(() => {
    const out: Record<number, string> = {};
    for (let i = 0; i < questions.length; i++) {
      const state = qStates[i];
      if (!state) { out[i] = ''; continue; }
      if (state.selected.includes(OTHER_VALUE) && state.customText.trim()) {
        out[i] = state.customText.trim();
        continue;
      }
      const labels = state.selected
        .filter(v => v !== OTHER_VALUE)
        .map(v => {
          const opt = questions[i].options.find(o => optionValue(o) === v);
          return opt?.label || v;
        });
      out[i] = labels.join(',');
    }
    return out;
  }, [qStates, questions]);

  const allAnswered = questions.every((_, i) => !!resolvedAnswers[i]);
  // Single-question single-select: auto-submit on selection (best UX, matches reference)
  const isAutoSubmittable = questions.length === 1 && !questions[0].multiSelect;

  const submitQuestions = (overrideAnswers?: Record<number, string>) => {
    if (isAnswered) return;
    const source = overrideAnswers || resolvedAnswers;
    const answers: Record<string, string> = {};
    for (let i = 0; i < questions.length; i++) {
      const a = source[i];
      if (a) answers[questions[i].question] = a;
    }
    respondToAskUser(data.questionId, answers);
  };

  // Auto-submit handler for single-question MCQ (called from option click)
  const handleSingleSelectClick = (opt: AskUserOption) => {
    if (isAnswered) return;
    if (isOtherOption(opt)) {
      updateQ(0, { showCustom: true, selected: [optionValue(opt)] });
      return;
    }
    const optKey = optionValue(opt);
    updateQ(0, { selected: [optKey], showCustom: false, customText: '' });
    if (isAutoSubmittable) {
      // Submit immediately with the just-clicked option
      const answers: Record<string, string> = { [questions[0].question]: opt.label };
      respondToAskUser(data.questionId, answers);
    }
  };

  // ── Persisted-answers view (after submission) ─────────────────────────
  // `data.answers` is the canonical map. For old persisted messages with
  // only `selectedValue`, fall back to that.
  const persistedAnswers: Record<string, string> = useMemo(() => {
    if (data.answers && Object.keys(data.answers).length > 0) return data.answers;
    if (data.selectedValue) {
      // Try parsing as JSON first (legacy fields path used JSON.stringify)
      try {
        const parsed = JSON.parse(data.selectedValue);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Map field id → label when possible
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
            if (typeof v !== 'string') continue;
            const fieldLabel = fields.find(f => f.id === k)?.label || k;
            out[fieldLabel] = v;
          }
          return out;
        }
      } catch {
        // Plain string — treat as the answer to the first question / first field
      }
      const firstLabel =
        questions[0]?.question ||
        fields[0]?.label ||
        data.question ||
        'Answer';
      return { [firstLabel]: data.selectedValue };
    }
    return {};
  }, [data.answers, data.selectedValue, questions, fields, data.question]);

  return (
    <div className="mt-2 mb-1">
      {/* Question header (shown when there's a single question or a leading question text) */}
      {!hasQuestions && data.question && (
        <div className="flex items-start gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
          <span className="text-[14px] font-medium text-[var(--color-text)]">{data.question}</span>
        </div>
      )}

      {/* ── Rich multi-question MCQ rendering ────────────────────────── */}
      {hasQuestions && !isAnswered && (
        <div className="space-y-4">
          {questions.map((q, qIdx) => {
            const state = qStates[qIdx] || { selected: [], customText: '', showCustom: false };
            return (
              <div key={qIdx} className="space-y-2">
                {/* Header chip + question text */}
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
                    {q.header}
                  </span>
                  <span className="text-[13px] font-medium text-[var(--color-text)]">{q.question}</span>
                  {q.multiSelect && (
                    <span className="text-[10px] text-[var(--color-text-muted)]">(pick one or more)</span>
                  )}
                </div>

                {/* Option buttons */}
                <div className="flex flex-wrap gap-2">
                  {q.options.map((opt, optIdx) => {
                    const optKey = optionValue(opt);
                    const isSelected = state.selected.includes(optKey);
                    const isOther = isOtherOption(opt);

                    return (
                      <button
                        key={optIdx}
                        onClick={() => questions.length === 1 && !q.multiSelect
                          ? handleSingleSelectClick(opt)
                          : toggleOption(qIdx, opt, q.multiSelect ?? false)
                        }
                        className={`
                          group relative px-4 py-2 rounded-xl text-left transition-all duration-150 cursor-pointer
                          ${isSelected
                            ? 'bg-[var(--color-accent)] text-white shadow-md'
                            : isOther
                              ? 'bg-[var(--color-bg-secondary)]/40 hover:bg-[var(--color-bg-secondary)]/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-dashed border-[var(--color-border)]/20 hover:border-[var(--color-border)]/40'
                              : 'bg-[var(--color-bg-secondary)]/60 hover:bg-[var(--color-accent)]/15 text-[var(--color-text)] hover:text-[var(--color-accent)] border border-[var(--color-border)]/20 hover:border-[var(--color-accent)]/30'
                          }
                        `}
                      >
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          <span className="text-[13px] font-medium">{opt.label}</span>
                        </div>
                        {opt.description && (
                          <p className={`text-[11px] mt-0.5 ${isSelected ? 'text-white/70' : 'text-[var(--color-text-muted)]/60'}`}>
                            {opt.description}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* "Other" text input (revealed when Other is selected) */}
                {state.showCustom && (
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={state.customText}
                      onChange={e => updateQ(qIdx, { customText: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && state.customText.trim()) {
                          if (isAutoSubmittable) {
                            const overrides: Record<number, string> = { ...resolvedAnswers, [qIdx]: state.customText.trim() };
                            submitQuestions(overrides);
                          }
                        }
                      }}
                      placeholder="Type your answer..."
                      autoFocus
                      className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]/20 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/40 outline-none focus:border-[var(--color-accent)]/40"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Submit button — shown for multi-question batches AND multiSelect questions */}
          {!isAutoSubmittable && (
            <button
              onClick={() => submitQuestions()}
              disabled={!allAnswered}
              className="mt-2 px-4 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {questions.length > 1 ? 'Submit all answers' : 'Confirm'}
            </button>
          )}
        </div>
      )}

      {/* ── Legacy fields-only rendering ─────────────────────────────── */}
      {hasFields && !isAnswered && (
        <div className="mt-2 space-y-2">
          {fields.map(field => (
            <label key={field.id} className="block">
              <span className="block mb-1 text-[11px] font-medium text-[var(--color-text-muted)]">
                {field.label}{field.required === false ? '' : ' *'}
              </span>
              <input
                type="text"
                value={fieldValues[field.id] || ''}
                onChange={e => setFieldValues(values => ({ ...values, [field.id]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && !missingRequiredField) handleFieldsSubmit(); }}
                placeholder={field.placeholder || field.label}
                className="w-full px-3 py-1.5 rounded-lg text-[13px] bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]/20 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/40 outline-none focus:border-[var(--color-accent)]/40"
              />
            </label>
          ))}
          <button
            onClick={handleFieldsSubmit}
            disabled={missingRequiredField}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Send details
          </button>
        </div>
      )}

      {/* ── Legacy custom-input fallback (no questions, no fields, allow_custom) ── */}
      {!hasQuestions && !hasFields && data.allowCustom && !isAnswered && (
        <div className="mt-2">
          {!legacyShowCustom ? (
            <button
              onClick={() => setLegacyShowCustom(true)}
              className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--color-bg-secondary)]/40 hover:bg-[var(--color-bg-secondary)]/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-dashed border-[var(--color-border)]/20 hover:border-[var(--color-border)]/40 transition-all"
            >
              Type your answer...
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={legacyCustomValue}
                onChange={e => setLegacyCustomValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && legacyCustomValue.trim()) {
                    respondToAskUser(data.questionId, { [data.question || 'Answer']: legacyCustomValue.trim() });
                  }
                }}
                placeholder="Type your answer..."
                autoFocus
                className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]/20 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/40 outline-none focus:border-[var(--color-accent)]/40"
              />
              <button
                onClick={() => {
                  if (legacyCustomValue.trim()) {
                    respondToAskUser(data.questionId, { [data.question || 'Answer']: legacyCustomValue.trim() });
                  }
                }}
                disabled={!legacyCustomValue.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                Send
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Answered state: per-question / per-field echo ────────────── */}
      {isAnswered && Object.keys(persistedAnswers).length > 0 && (
        <div className="mt-3 space-y-1.5">
          {Object.entries(persistedAnswers).map(([q, a]) => (
            <div
              key={q}
              className="flex items-start gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-bg-secondary)]/40"
            >
              <Check className="w-3.5 h-3.5 text-[var(--color-accent)] shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] text-[var(--color-text-muted)] truncate">{q}</div>
                <div className="text-[12px] font-medium text-[var(--color-text)] break-words">{a}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
