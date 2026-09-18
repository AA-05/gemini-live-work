import React, { useState } from "react";
import {
  Mic,
  MicOff,
  Camera,
  Monitor,
  Square,
  MessageSquare,
  Settings,
  Send,
  Sparkles,
  RefreshCw,
  Activity,
  CircleDot,
} from "lucide-react";
import { LiveStatus, VisualizerMode } from "../types";

interface LiveControlsProps {
  status: LiveStatus;
  isMuted: boolean;
  isCameraActive: boolean;
  isScreenActive: boolean;
  visualizerMode: VisualizerMode;
  transcriptCount: number;
  isTranscriptOpen: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onInterrupt: () => void;
  onSendText: (text: string) => void;
  onToggleTranscript: () => void;
  onOpenSettings: () => void;
  onReconnect: () => void;
  onToggleVisualizerMode: () => void;
}

export const LiveControls: React.FC<LiveControlsProps> = ({
  status,
  isMuted,
  isCameraActive,
  isScreenActive,
  visualizerMode,
  transcriptCount,
  isTranscriptOpen,
  onToggleMute,
  onToggleCamera,
  onToggleScreen,
  onInterrupt,
  onSendText,
  onToggleTranscript,
  onOpenSettings,
  onReconnect,
  onToggleVisualizerMode,
}) => {
  const [showTextInput, setShowTextInput] = useState(false);
  const [textPrompt, setTextPrompt] = useState("");

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textPrompt.trim()) return;
    onSendText(textPrompt.trim());
    setTextPrompt("");
    setShowTextInput(false);
  };

  const isConnected = status !== "disconnected" && status !== "error" && status !== "connecting";

  return (
    <div id="live-controls-dock" className="fixed bottom-6 inset-x-0 z-30 flex flex-col items-center px-4 pointer-events-none">
      {/* Optional expand text prompt input bar */}
      {showTextInput && (
        <form
          id="live-text-prompt-form"
          onSubmit={handleSend}
          className="pointer-events-auto mb-3 w-full max-w-lg flex items-center gap-2 p-1.5 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-white/15 shadow-2xl transition-all"
        >
          <input
            id="live-text-prompt-input"
            type="text"
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            placeholder="Type a message to Gemini Live..."
            className="flex-1 px-4 py-2 bg-transparent text-sm text-white placeholder-slate-400 focus:outline-none"
            autoFocus
          />
          <button
            id="live-send-text-btn"
            type="submit"
            disabled={!textPrompt.trim()}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition shadow"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Main floating pill bar */}
      <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 px-4 py-2.5 rounded-full bg-slate-950/80 backdrop-blur-2xl border border-white/15 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
        {/* Mic toggle */}
        <button
          id="btn-toggle-mic"
          onClick={onToggleMute}
          disabled={!isConnected}
          className={`relative p-3.5 rounded-full transition-all duration-200 ${
            isMuted
              ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30"
              : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95"
          } disabled:opacity-40`}
          title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera toggle */}
        <button
          id="btn-toggle-camera"
          onClick={onToggleCamera}
          disabled={!isConnected}
          className={`p-3 rounded-full transition-all duration-200 ${
            isCameraActive
              ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/20"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          } disabled:opacity-40`}
          title={isCameraActive ? "Stop Camera" : "Start Camera (Live Vision)"}
        >
          <Camera className="w-5 h-5" />
        </button>

        {/* Screen share toggle */}
        <button
          id="btn-toggle-screen"
          onClick={onToggleScreen}
          disabled={!isConnected}
          className={`p-3 rounded-full transition-all duration-200 ${
            isScreenActive
              ? "bg-sky-500/25 text-sky-400 border border-sky-500/40 shadow-lg shadow-sky-500/20"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          } disabled:opacity-40`}
          title={isScreenActive ? "Stop Screen Share" : "Share Screen with Gemini"}
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Interrupt Gemini button (when speaking) */}
        {status === "speaking" && (
          <button
            id="btn-interrupt-gemini"
            onClick={onInterrupt}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-semibold tracking-wide transition animate-pulse"
            title="Interrupt Gemini's current speech"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Interrupt</span>
          </button>
        )}

        <div className="w-px h-6 bg-white/15 mx-0.5" />

        {/* Toggle Text message drawer */}
        <button
          id="btn-toggle-text-input"
          onClick={() => setShowTextInput(!showTextInput)}
          className={`p-3 rounded-full transition-all ${
            showTextInput
              ? "bg-indigo-500/30 text-indigo-300 border border-indigo-500/40"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
          title="Type text message"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        {/* Visualizer Mode Switch (Orb / Waveform) */}
        <button
          id="btn-toggle-visualizer-mode"
          onClick={onToggleVisualizerMode}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
          title={`Visualizer: ${visualizerMode === "orb" ? "Fluid Orb (click for Waveform)" : "Waveform (click for Orb)"}`}
        >
          {visualizerMode === "orb" ? (
            <CircleDot className="w-5 h-5 text-indigo-400" />
          ) : (
            <Activity className="w-5 h-5 text-emerald-400" />
          )}
        </button>

        {/* Transcript drawer toggle */}
        <button
          id="btn-toggle-transcript"
          onClick={onToggleTranscript}
          className={`relative p-3 rounded-full transition-all ${
            isTranscriptOpen
              ? "bg-white/20 text-white"
              : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white"
          }`}
          title="View conversation transcript"
        >
          <Sparkles className="w-5 h-5" />
          {transcriptCount > 0 && !isTranscriptOpen && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500 text-[10px] font-bold text-white flex items-center justify-center">
              {transcriptCount > 9 ? "9+" : transcriptCount}
            </span>
          )}
        </button>

        {/* Reconnect button if disconnected or error */}
        {!isConnected && (
          <button
            id="btn-reconnect-session"
            onClick={onReconnect}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Connect</span>
          </button>
        )}

        {/* Settings button */}
        <button
          id="btn-open-settings"
          onClick={onOpenSettings}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
          title="Session Configuration"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
