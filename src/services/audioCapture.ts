/**
 * Browser microphone capture service.
 * Captures raw PCM Int16 audio at 16kHz for ElevenLabs Scribe STT.
 * Resamples from the browser's native sample rate if needed.
 */

export type AudioCaptureState = 'idle' | 'requesting' | 'recording' | 'stopped';

export interface AudioCaptureCallbacks {
  onChunk: (pcmInt16: Int16Array) => void;
  onLevel: (level: number) => void;
  onStateChange: (state: AudioCaptureState) => void;
  onError: (error: string) => void;
}

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_INTERVAL_MS = 100; // emit chunks every 100ms

export class AudioCaptureService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private state: AudioCaptureState = 'idle';
  private callbacks: AudioCaptureCallbacks;
  private buffer: Float32Array[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private nativeSampleRate = 0;

  constructor(callbacks: AudioCaptureCallbacks) {
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.state === 'recording') return;
    this.setState('requesting');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      const msg = err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : 'Could not access microphone';
      this.callbacks.onError(msg);
      this.setState('idle');
      return;
    }

    try {
      // Don't force sample rate — let browser use native rate, we'll resample
      this.audioContext = new AudioContext();
      this.nativeSampleRate = this.audioContext.sampleRate;
      console.log('[audio-capture] Native sample rate:', this.nativeSampleRate);

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

      const bufferSize = 4096;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        // Copy the buffer — the underlying ArrayBuffer gets reused
        this.buffer.push(new Float32Array(input));

        // Compute RMS for audio level visualization
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        this.callbacks.onLevel(Math.min(1, rms * 5));
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      // Flush buffer at regular intervals
      this.intervalId = setInterval(() => this.flushBuffer(), CHUNK_INTERVAL_MS);

      this.setState('recording');
      console.log('[audio-capture] Recording started');
    } catch (err) {
      console.error('[audio-capture] Init failed:', err);
      this.cleanup();
      this.callbacks.onError('Failed to initialize audio capture');
      this.setState('idle');
    }
  }

  stop(): void {
    console.log('[audio-capture] Stopping');
    this.flushBuffer();
    this.cleanup();
    this.setState('stopped');
  }

  private flushBuffer(): void {
    if (this.buffer.length === 0) return;

    // Concatenate buffered float32 arrays
    const totalLength = this.buffer.reduce((sum, b) => sum + b.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const b of this.buffer) {
      merged.set(b, offset);
      offset += b.length;
    }
    this.buffer = [];

    // Resample to 16kHz if needed
    const resampled = this.nativeSampleRate !== TARGET_SAMPLE_RATE
      ? resample(merged, this.nativeSampleRate, TARGET_SAMPLE_RATE)
      : merged;

    // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
    const pcm = new Int16Array(resampled.length);
    for (let i = 0; i < resampled.length; i++) {
      const s = Math.max(-1, Math.min(1, resampled[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.callbacks.onChunk(pcm);
  }

  private cleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    this.processorNode = null;
    this.sourceNode = null;

    if (this.audioContext?.state !== 'closed') {
      this.audioContext?.close().catch(() => {});
    }
    this.audioContext = null;

    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.buffer = [];
  }

  private setState(state: AudioCaptureState): void {
    this.state = state;
    this.callbacks.onStateChange(state);
  }

  getState(): AudioCaptureState {
    return this.state;
  }
}

/**
 * Linear interpolation resample from srcRate to targetRate.
 */
function resample(input: Float32Array, srcRate: number, targetRate: number): Float32Array {
  const ratio = srcRate / targetRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio;
    const srcFloor = Math.floor(srcIndex);
    const srcCeil = Math.min(srcFloor + 1, input.length - 1);
    const frac = srcIndex - srcFloor;
    output[i] = input[srcFloor] * (1 - frac) + input[srcCeil] * frac;
  }

  return output;
}
