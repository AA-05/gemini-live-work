export type LiveStatus = "disconnected" | "connecting" | "ready" | "listening" | "thinking" | "speaking" | "interrupted" | "error";

export type VisualizerMode = "orb" | "waveform" | "split";

export type GeminiVoice = "Puck" | "Charon" | "Kore" | "Fenrir" | "Zephyr";

export type GeminiLiveModel = 
  | "gemini-3.8-live" 
  | "gemini-3.8-live-extended-thinking" 
  | "gemini-3.5-transcribe-live";

export interface TranscriptItem {
  id: string;
  role: "user" | "gemini" | "tool" | "system";
  text: string;
  timestamp: Date;
  isInterim?: boolean;
  toolName?: string;
  toolResult?: any;
}

export interface LiveSessionConfig {
  model: GeminiLiveModel;
  voice: GeminiVoice;
  systemInstruction: string;
  fps: number; // 0.5 to 1.0 FPS for vision
  affectiveDialog: boolean;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  status: "pending" | "done";
  timestamp: Date;
}
