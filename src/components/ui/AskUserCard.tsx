/**
 * AskUserCard — renders an interactive question from the agent with
 * clickable option buttons. Once the user picks an option, the card
 * shows the selected choice and becomes non-interactive.
 */

import { useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import { useComputerStore, type AskUserData } from '@/stores/agentStore';

interface AskUserCardProps {
  data: AskUserData;
}

export function AskUserCard({ data }: AskUserCardProps) {
  const respondToAskUser = useComputerStore(s => s.respondToAskUser);
  const [customValue, setCustomValue] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const isAnswered = data.selectedValue !== undefined;

  const handleSelect = (value: string, label: string) => {
    if (isAnswered) return;
    respondToAskUser(data.questionId, value, label);
  };

  const handleCustomSubmit = () => {
    if (!customValue.trim() || isAnswered) return;
    respondToAskUser(data.questionId, customValue.trim(), customValue.trim());
  };

  return (
    <div className="mt-2 mb-1">
      {/* Question */}
      <div className="flex items-start gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-[var(--color-accent)] shrink-0 mt-0.5" />
        <span className="text-[14px] font-medium text-[var(--color-text)]">{data.question}</span>
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-2">
        {data.options.map((opt, i) => {
          const isSelected = isAnswered && data.selectedValue === opt.value;
          const isDisabled = isAnswered && !isSelected;

          return (
            <button
              key={i}
              onClick={() => handleSelect(opt.value, opt.label)}
              disabled={isAnswered}
              className={`
                group relative px-4 py-2 rounded-xl text-left transition-all duration-150
                ${isSelected
                  ? 'bg-[var(--color-accent)] text-white shadow-md'
                  : isDisabled
                    ? 'bg-[var(--color-bg-secondary)]/30 text-[var(--color-text-muted)]/40 cursor-default'
                    : 'bg-[var(--color-bg-secondary)]/60 hover:bg-[var(--color-accent)]/15 text-[var(--color-text)] hover:text-[var(--color-accent)] border border-[var(--color-border)]/20 hover:border-[var(--color-accent)]/30 cursor-pointer'
                }
              `}
            >
              <div className="flex items-center gap-2">
                {isSelected && <Check className="w-3.5 h-3.5" />}
                <span className="text-[13px] font-medium">{opt.label}</span>
              </div>
              {opt.description && (
                <p className={`text-[11px] mt-0.5 ${isSelected ? 'text-white/70' : isDisabled ? 'text-[var(--color-text-muted)]/30' : 'text-[var(--color-text-muted)]/60'}`}>
                  {opt.description}
                </p>
              )}
            </button>
          );
        })}

        {/* Custom response option */}
        {data.allowCustom && !isAnswered && !showCustomInput && (
          <button
            onClick={() => setShowCustomInput(true)}
            className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--color-bg-secondary)]/40 hover:bg-[var(--color-bg-secondary)]/60 text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-dashed border-[var(--color-border)]/20 hover:border-[var(--color-border)]/40 transition-all"
          >
            Type your own...
          </button>
        )}
      </div>

      {/* Custom input */}
      {showCustomInput && !isAnswered && (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customValue}
            onChange={e => setCustomValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(); }}
            placeholder="Type your answer..."
            autoFocus
            className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-[var(--color-bg-secondary)]/60 border border-[var(--color-border)]/20 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]/40 outline-none focus:border-[var(--color-accent)]/40"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customValue.trim()}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[var(--color-accent)] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Send
          </button>
        </div>
      )}

      {/* Custom answer selected */}
      {isAnswered && data.selectedValue && !data.options.some(o => o.value === data.selectedValue) && (
        <div className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-accent)] text-white shadow-md w-fit">
          <Check className="w-3.5 h-3.5" />
          <span className="text-[13px] font-medium">{data.selectedValue}</span>
        </div>
      )}
    </div>
  );
}
