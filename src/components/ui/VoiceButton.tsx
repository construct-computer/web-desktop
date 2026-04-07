import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Tooltip } from '@/components/ui';
import { useVoiceStore } from '@/stores/voiceStore';

export function VoiceButton({ disabled }: { disabled?: boolean }) {
  const sttState = useVoiceStore((s) => s.sttState);
  const audioLevel = useVoiceStore((s) => s.audioLevel);
  const error = useVoiceStore((s) => s.error);
  const micPermission = useVoiceStore((s) => s.micPermission);
  const startRecording = useVoiceStore((s) => s.startRecording);
  const stopRecording = useVoiceStore((s) => s.stopRecording);
  const cancelRecording = useVoiceStore((s) => s.cancelRecording);

  const isRecording = sttState === 'recording';
  const isProcessing = sttState === 'processing';
  const isRequesting = sttState === 'requesting';
  const isActive = isRecording || isProcessing || isRequesting;
  const isDenied = micPermission === 'denied';

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (isProcessing || isRequesting) {
      cancelRecording();
    } else {
      startRecording();
    }
  };

  const tooltipContent = error
    ? error
    : isDenied
      ? 'Microphone access denied'
      : isRecording
        ? 'Stop recording'
        : isProcessing
          ? 'Processing...'
          : 'Voice input';

  return (
    <Tooltip content={tooltipContent} side="top">
      <button
        onClick={handleClick}
        disabled={disabled || isDenied}
        className={`relative p-1.5 rounded-md transition-colors ${
          isRecording
            ? 'text-red-400 hover:bg-red-500/15'
            : isActive
              ? 'text-[var(--color-accent)]/80'
              : 'text-[var(--color-text-muted)]/40 hover:text-[var(--color-text-muted)] hover:bg-white/10'
        } disabled:opacity-20`}
      >
        {/* Pulsing ring when recording */}
        {isRecording && (
          <span
            className="absolute inset-0 rounded-md border border-red-400/60 animate-pulse"
            style={{
              // Scale ring based on audio level
              transform: `scale(${1 + audioLevel * 0.3})`,
              transition: 'transform 100ms ease-out',
            }}
          />
        )}

        {isProcessing || isRequesting ? (
          <Loader2 className="w-4.5 h-4.5 animate-spin" />
        ) : isDenied ? (
          <MicOff className="w-4.5 h-4.5" />
        ) : (
          <Mic className="w-4.5 h-4.5" />
        )}
      </button>
    </Tooltip>
  );
}
