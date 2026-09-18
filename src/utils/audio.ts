/**
 * Audio encoding, decoding, and playback utilities for Gemini Live API.
 * Live API requires:
 * - Input: 16-bit PCM, 16000 Hz, little-endian mono
 * - Output: 16-bit PCM, 24000 Hz, little-endian mono
 */

// Convert Float32Array (Web Audio API range [-1, 1]) to 16-bit PCM Little Endian base64 string
export function float32ToPcmBase64(float32Array: Float32Array): string {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  
  let binary = "";
  const bytes = new Uint8Array(int16Array.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 16-bit PCM string into Float32Array normalized [-1, 1]
export function pcmBase64ToFloat32(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

// Class to manage real-time gapless 24kHz audio playback
export class LiveAudioPlayer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isMuted = false;

  constructor() {
    // Lazily initialized on first user interaction
  }

  public init() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({ sampleRate: 24000 });
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public playChunk(base64Pcm: string) {
    this.init();
    if (!this.ctx || !this.analyser || this.isMuted) return;

    try {
      const float32Data = pcmBase64ToFloat32(base64Pcm);
      if (float32Data.length === 0) return;

      const audioBuffer = this.ctx.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      // Schedule gapless playback
      const currentTime = this.ctx.currentTime;
      if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.activeSources.push(source);
      source.onended = () => {
        const index = this.activeSources.indexOf(source);
        if (index > -1) {
          this.activeSources.splice(index, 1);
        }
      };
    } catch (err) {
      console.error("Error playing audio chunk:", err);
    }
  }

  public interrupt() {
    // Stop all active sources immediately
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // source may have already ended
      }
    }
    this.activeSources = [];
    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.interrupt();
    }
  }

  public close() {
    this.interrupt();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
  }
}

// Class to manage microphone stream & 16kHz audio capture
export class LiveAudioRecorder {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private isRecording = false;
  private onAudioDataCallback: ((base64Pcm: string) => void) | null = null;

  public async start(onAudioData: (base64Pcm: string) => void): Promise<void> {
    this.onAudioDataCallback = onAudioData;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass({ sampleRate: 16000 });

      if (this.ctx.state === "suspended") {
        await this.ctx.resume();
      }

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;

      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);

      // ScriptProcessorNode for standard cross-browser streaming (bufferSize 4096 = ~256ms of 16kHz audio)
      this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
      this.processor.onaudioprocess = (e) => {
        if (!this.isRecording || !this.onAudioDataCallback) return;
        const inputData = e.inputBuffer.getChannelData(0);
        const base64 = float32ToPcmBase64(inputData);
        this.onAudioDataCallback(base64);
      };

      this.source.connect(this.processor);
      // Connect to a mute node or destination to keep processor active without echoing
      const muteGain = this.ctx.createGain();
      muteGain.gain.value = 0;
      this.processor.connect(muteGain);
      muteGain.connect(this.ctx.destination);

      this.isRecording = true;
    } catch (err) {
      console.error("Failed to start audio recording:", err);
      throw err;
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public setRecording(recording: boolean) {
    this.isRecording = recording;
  }

  public stop() {
    this.isRecording = false;
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
    this.analyser = null;
  }
}
