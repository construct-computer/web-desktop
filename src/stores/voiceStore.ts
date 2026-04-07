import { create } from 'zustand';
import { AudioCaptureService } from '@/services/audioCapture';
import { ElevenLabsSTTClient } from '@/services/elevenlabsSTT';
import { API_BASE_URL, STORAGE_KEYS } from '@/lib/constants';

export type STTState = 'idle' | 'requesting' | 'recording' | 'processing';

interface VoiceStore {
  sttState: STTState;
  interimTranscript: string;
  finalTranscript: string;
  audioLevel: number;
  micPermission: 'prompt' | 'granted' | 'denied';
  error: string | null;

  startRecording: () => Promise<void>;
  stopRecording: () => void;
  cancelRecording: () => void;
  reset: () => void;
}

let captureService: AudioCaptureService | null = null;
let sttClient: ElevenLabsSTTClient | null = null;
let accumulatedTranscript = '';
let silenceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Silence auto-stop timeout (ms).
 * After VAD commits a transcript segment and no new speech is detected
 * within this window, recording auto-stops.
 * 2.5s balances responsiveness with allowing natural pauses between sentences.
 */
const SILENCE_AUTO_STOP_MS = 2500;

function clearSilenceTimer(): void {
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
}

async function fetchSTTToken(): Promise<string | null> {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (!token) return null;

  try {
    const resp = await fetch(`${API_BASE_URL}/voice/stt-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { token: string };
    return data.token;
  } catch {
    return null;
  }
}

export const useVoiceStore = create<VoiceStore>()((set, get) => ({
  sttState: 'idle',
  interimTranscript: '',
  finalTranscript: '',
  audioLevel: 0,
  micPermission: 'prompt',
  error: null,

  startRecording: async () => {
    const state = get();
    if (state.sttState !== 'idle') return;

    set({ sttState: 'requesting', error: null, interimTranscript: '', finalTranscript: '' });
    accumulatedTranscript = '';
    clearSilenceTimer();

    // Fetch single-use token
    const sttToken = await fetchSTTToken();
    if (!sttToken) {
      set({ sttState: 'idle', error: 'Voice features not available' });
      return;
    }

    // Create STT client
    sttClient = new ElevenLabsSTTClient(
      { token: sttToken, languageCode: 'en', commitStrategy: 'vad', vadSilenceThresholdSecs: 1.5 },
      {
        onSessionStarted: () => {
          set({ sttState: 'recording' });
        },
        onPartialTranscript: (text) => {
          // New speech detected — cancel any pending auto-stop
          clearSilenceTimer();
          set({ interimTranscript: text });
        },
        onCommittedTranscript: (text) => {
          if (text.trim()) {
            accumulatedTranscript += (accumulatedTranscript ? ' ' : '') + text.trim();
            set({ finalTranscript: accumulatedTranscript, interimTranscript: '' });
          }

          // VAD committed = silence detected. Start auto-stop timer.
          // If user speaks again, onPartialTranscript will cancel it.
          if (accumulatedTranscript && get().sttState === 'recording') {
            clearSilenceTimer();
            silenceTimer = setTimeout(() => {
              console.log('[voice] Auto-stopping after silence');
              get().stopRecording();
            }, SILENCE_AUTO_STOP_MS);
          }
        },
        onError: (error) => {
          clearSilenceTimer();
          set({ error, sttState: 'idle' });
          cleanup();
        },
        onClose: () => {
          clearSilenceTimer();
          if (accumulatedTranscript && get().sttState === 'processing') {
            set({ finalTranscript: accumulatedTranscript, sttState: 'idle' });
          }
        },
      },
    );

    // Create audio capture
    captureService = new AudioCaptureService({
      onChunk: (pcm) => {
        sttClient?.sendAudioChunk(pcm);
      },
      onLevel: (level) => {
        set({ audioLevel: level });
      },
      onStateChange: (captureState) => {
        if (captureState === 'recording') {
          set({ micPermission: 'granted' });
        }
      },
      onError: (error) => {
        clearSilenceTimer();
        if (error === 'Microphone permission denied') {
          set({ micPermission: 'denied' });
        }
        set({ error, sttState: 'idle' });
        cleanup();
      },
    });

    // Connect STT WebSocket first, then start mic
    sttClient.connect();
    await captureService.start();

    // If capture failed (state went back to idle), don't proceed
    if (get().sttState === 'idle') {
      sttClient?.close();
      sttClient = null;
      return;
    }
  },

  stopRecording: () => {
    const state = get();
    if (state.sttState !== 'recording') return;

    clearSilenceTimer();
    set({ sttState: 'processing' });

    // Stop mic
    captureService?.stop();
    captureService = null;

    // Send final commit and close
    sttClient?.finalize();

    // Wait briefly for final committed_transcript, then close
    setTimeout(() => {
      sttClient?.close();
      sttClient = null;

      const current = get();
      if (current.sttState === 'processing') {
        set({
          sttState: 'idle',
          finalTranscript: accumulatedTranscript || current.interimTranscript || current.finalTranscript,
          audioLevel: 0,
        });
      }
    }, 500);
  },

  cancelRecording: () => {
    clearSilenceTimer();
    cleanup();
    accumulatedTranscript = '';
    set({
      sttState: 'idle',
      interimTranscript: '',
      finalTranscript: '',
      audioLevel: 0,
      error: null,
    });
  },

  reset: () => {
    set({ interimTranscript: '', finalTranscript: '', error: null });
    accumulatedTranscript = '';
  },
}));

function cleanup(): void {
  clearSilenceTimer();
  captureService?.stop();
  captureService = null;
  sttClient?.close();
  sttClient = null;
}
