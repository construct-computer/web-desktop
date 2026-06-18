/**
 * ElevenLabs Realtime Speech-to-Text WebSocket client.
 * Connects to Scribe Realtime v2 for streaming transcription.
 */

import { log } from '@/lib/logger';

const logger = log('ElevenLabsSTT');

export interface ElevenLabsSTTCallbacks {
  onPartialTranscript: (text: string) => void;
  onCommittedTranscript: (text: string) => void;
  onSessionStarted: () => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export interface ElevenLabsSTTOptions {
  token: string;
  languageCode?: string;
  commitStrategy?: 'manual' | 'vad';
  vadSilenceThresholdSecs?: number;
}

const WS_BASE = 'wss://api.elevenlabs.io/v1/speech-to-text/realtime';

export class ElevenLabsSTTClient {
  private ws: WebSocket | null = null;
  private callbacks: ElevenLabsSTTCallbacks;
  private options: ElevenLabsSTTOptions;
  private closed = false;
  private sessionStarted = false;
  private pendingChunks: Array<{ base64: string; commit: boolean }> = [];

  constructor(options: ElevenLabsSTTOptions, callbacks: ElevenLabsSTTCallbacks) {
    this.options = options;
    this.callbacks = callbacks;
  }

  connect(): void {
    const params = new URLSearchParams({
      token: this.options.token,
      model_id: 'scribe_v2_realtime',
      audio_format: 'pcm_16000',
      commit_strategy: this.options.commitStrategy ?? 'vad',
      vad_silence_threshold_secs: String(this.options.vadSilenceThresholdSecs ?? 1.5),
    });

    if (this.options.languageCode) {
      params.set('language_code', this.options.languageCode);
    }

    const url = `${WS_BASE}?${params.toString()}`;
    logger.info('Connecting', { url: url.replace(/token=[^&]+/, 'token=***') });
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      logger.info('WebSocket opened');
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        logger.info('Received message', { type: msg.message_type, text: msg.text || undefined });
        this.handleMessage(msg);
      } catch {
        logger.warn('Failed to parse message', { data: event.data });
      }
    };

    this.ws.onerror = (e) => {
      logger.error('WebSocket error', { event: e });
      if (!this.closed) {
        this.callbacks.onError('Connection to transcription service failed');
      }
    };

    this.ws.onclose = (e) => {
      logger.info('WebSocket closed', { code: e.code, reason: e.reason });
      if (!this.closed) {
        this.callbacks.onClose();
      }
    };
  }

  /**
   * Send a PCM Int16 audio chunk to ElevenLabs.
   * Audio must be 16kHz mono signed 16-bit PCM.
   * Buffers chunks until session_started is received.
   */
  sendAudioChunk(pcmInt16: Int16Array, commit = false): void {
    if (!this.ws || this.closed) return;

    const bytes = new Uint8Array(pcmInt16.buffer, pcmInt16.byteOffset, pcmInt16.byteLength);
    const base64 = arrayBufferToBase64(bytes);

    if (!this.sessionStarted || this.ws.readyState !== WebSocket.OPEN) {
      // Buffer until session is ready
      this.pendingChunks.push({ base64, commit });
      return;
    }

    this.sendChunk(base64, commit);
  }

  /**
   * Signal end of audio input. Sends a final commit.
   */
  finalize(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      logger.info('Finalizing — sending commit');
      this.sendChunk('', true);
    }
  }

  close(): void {
    this.closed = true;
    this.pendingChunks = [];
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private handleMessage(msg: Record<string, unknown>): void {
    const type = msg.message_type as string;

    switch (type) {
      case 'session_started':
        logger.info('Session started, flushing buffered chunks', { bufferedChunks: this.pendingChunks.length });
        this.sessionStarted = true;
        this.flushPendingChunks();
        this.callbacks.onSessionStarted();
        break;

      case 'partial_transcript':
        this.callbacks.onPartialTranscript(msg.text as string);
        break;

      case 'committed_transcript':
      case 'committed_transcript_with_timestamps':
        this.callbacks.onCommittedTranscript(msg.text as string);
        break;

      case 'auth_error':
      case 'quota_exceeded':
      case 'rate_limited':
      case 'resource_exhausted':
      case 'input_error':
      case 'chunk_size_exceeded':
      case 'transcriber_error':
      case 'error': {
        const detail = (msg.error as string) || (msg.description as string) || `STT error: ${type}`;
        logger.error('STT error', { type, detail });
        this.callbacks.onError(detail);
        break;
      }

      default:
        logger.info('Unknown message type', { type });
    }
  }

  private flushPendingChunks(): void {
    for (const chunk of this.pendingChunks) {
      this.sendChunk(chunk.base64, chunk.commit);
    }
    this.pendingChunks = [];
  }

  private sendChunk(base64: string, commit: boolean): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      message_type: 'input_audio_chunk',
      audio_base_64: base64,
      commit,
      sample_rate: 16000,
    }));
  }
}

/** Convert Uint8Array to base64 string */
function arrayBufferToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
