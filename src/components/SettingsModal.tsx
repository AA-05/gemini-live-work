import React, { useState, useEffect } from "react";
import { X, Volume2, Cpu, FileText, Sliders, Check, Key, Shield, Globe, Zap, Eye, EyeOff } from "lucide-react";
import { GeminiLiveModel, GeminiVoice, LiveSessionConfig } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LiveSessionConfig;
  onSaveConfig: (newConfig: LiveSessionConfig) => void;
  isConnected: boolean;
  apiKey?: string;
  onSaveApiKey?: (key: string) => void;
  connectionMode?: "direct" | "proxy";
  onSaveConnectionMode?: (mode: "direct" | "proxy") => void;
  isVercel?: boolean;
}

const VOICE_OPTIONS: { id: GeminiVoice; name: string; description: string }[] = [
  { id: "Zephyr", name: "Zephyr", description: "Balanced, natural, and expressive (Recommended)" },
  { id: "Puck", name: "Puck", description: "Playful, bright, and upbeat tone" },
  { id: "Charon", name: "Charon", description: "Deep, calm, and grounded voice" },
  { id: "Kore", name: "Kore", description: "Warm, conversational, and friendly" },
  { id: "Fenrir", name: "Fenrir", description: "Crisp, confident, and direct" },
];

const MODEL_OPTIONS: { id: GeminiLiveModel; name: string; description: string; badge: string }[] = [
  {
    id: "gemini-3.8-live",
    name: "Gemini 3.8 Live",
    description: "Low-latency bidirectional native audio & real-time visual streaming.",
    badge: "Recommended",
  },
  {
    id: "gemini-3.8-live-extended-thinking",
    name: "Gemini 3.8 Live Extended Thinking",
    description: "Enhanced reasoning capabilities and deep multi-step problem solving in live audio.",
    badge: "Reasoning",
  },
  {
    id: "gemini-3.5-transcribe-live",
    name: "Gemini 3.5 Transcribe Live",
    description: "Specialized for real-time speech translation and low-latency audio transcription.",
    badge: "Translation",
  },
];

const PROMPT_PRESETS = [
  {
    name: "Natural Companion",
    prompt:
      "You are Gemini Live, a natural, highly intelligent, friendly, and multimodal real-time AI companion. You can see through the user's camera/screen when active, and listen to their voice. Keep spoken responses conversational, concise, natural, and engaging without overly verbose bulleted lists.",
  },
  {
    name: "Vision & Screen Analyst",
    prompt:
      "You are Gemini Live acting as a visual copilot. Analyze what is visible on the user's camera or screen in real-time. Describe objects, debug UI/code, read text on screens, and answer questions about what the user shows you concisely.",
  },
  {
    name: "Concise Voice Assistant",
    prompt:
      "You are a lightning-fast voice assistant. Deliver extremely concise, crisp, spoken answers (typically 1 to 2 sentences) optimized for direct conversation.",
  },
  {
    name: "Interactive Code Coach",
    prompt:
      "You are an interactive programming mentor. Help explain code visible on screen or discussed via voice. Guide the user step by step with encouraging, direct feedback.",
  },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  isConnected,
  apiKey = "",
  onSaveApiKey,
  connectionMode = "direct",
  onSaveConnectionMode,
  isVercel = false,
}) => {
  const [draft, setDraft] = useState<LiveSessionConfig>(config);
  const [draftKey, setDraftKey] = useState<string>(apiKey);
  const [draftMode, setDraftMode] = useState<"direct" | "proxy">(connectionMode);
  const [showKey, setShowKey] = useState<boolean>(false);

  useEffect(() => {
    setDraft(config);
    setDraftKey(apiKey);
    setDraftMode(connectionMode);
  }, [config, apiKey, connectionMode, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveConfig(draft);
    if (onSaveApiKey) onSaveApiKey(draftKey);
    if (onSaveConnectionMode) onSaveConnectionMode(draftMode);
    onClose();
  };

  return (
    <div
      id="settings-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
    >
      <div
        id="settings-modal-card"
        className="w-full max-w-2xl max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-semibold text-white">Live Session Settings</h2>
              <p className="text-xs text-slate-400">Configure models, voices, and Vercel connection options</p>
            </div>
          </div>
          <button
            id="close-settings-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
          {isConnected && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-start gap-2">
              <span className="font-semibold">Note:</span>
              <span>Changes to model, voice, or connection mode will take effect on your next session reconnection.</span>
            </div>
          )}

          {/* Connection Engine / Vercel Readiness */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-sky-400" />
                Connection Mode & Hosting
              </label>
              {isVercel && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                  Vercel Environment Detected
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                id="mode-direct-btn"
                onClick={() => setDraftMode("direct")}
                className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all ${
                  draftMode === "direct"
                    ? "bg-sky-500/15 border-sky-500/60 shadow-sm"
                    : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                }`}
              >
                <div className="space-y-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-semibold text-white">Direct Gemini Live</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300">Vercel Ready</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Connects directly from your browser to Google's official Live servers. Required for Vercel and serverless hosts.
                  </p>
                </div>
                {draftMode === "direct" && (
                  <div className="p-1 rounded-full bg-sky-500 text-white shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>

              <button
                type="button"
                id="mode-proxy-btn"
                onClick={() => setDraftMode("proxy")}
                className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all ${
                  draftMode === "proxy"
                    ? "bg-indigo-600/15 border-indigo-500/60 shadow-sm"
                    : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                }`}
              >
                <div className="space-y-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-semibold text-white">Local Server Proxy</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-500/20 text-slate-300">Node only</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Relays through a local Node.js Express server. (Fails on serverless platforms like Vercel).
                  </p>
                </div>
                {draftMode === "proxy" && (
                  <div className="p-1 rounded-full bg-indigo-500 text-white shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Gemini API Key Configuration */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-400" />
                Gemini API Key
              </label>
              <span className="text-[11px] text-slate-400">Used for direct browser Live session</span>
            </div>

            <div className="relative">
              <input
                id="settings-api-key-input"
                type={showKey ? "text" : "password"}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value.trim())}
                placeholder="AIzaSy..."
                className="w-full pl-3 pr-10 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              On Vercel, you can also add <code className="text-indigo-300 bg-white/5 px-1 py-0.5 rounded">VITE_GEMINI_API_KEY</code> in your Vercel Project Settings &gt; Environment Variables.
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Gemini Live Model
            </label>
            <div className="grid grid-cols-1 gap-2">
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  id={`model-option-${m.id}`}
                  onClick={() => setDraft({ ...draft, model: m.id })}
                  className={`flex items-start justify-between p-3.5 rounded-xl border text-left transition-all ${
                    draft.model === m.id
                      ? "bg-indigo-600/15 border-indigo-500/60 shadow-sm"
                      : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{m.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{m.description}</p>
                  </div>
                  {draft.model === m.id && (
                    <div className="p-1 rounded-full bg-indigo-500 text-white shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Prebuilt Voice Selection */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
              <Volume2 className="w-4 h-4 text-purple-400" />
              Prebuilt Voice
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  id={`voice-option-${v.id}`}
                  onClick={() => setDraft({ ...draft, voice: v.id })}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                    draft.voice === v.id
                      ? "bg-purple-600/20 border-purple-500/60 shadow-sm"
                      : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold text-white">{v.name}</div>
                    <div className="text-[11px] text-slate-400">{v.description}</div>
                  </div>
                  {draft.voice === v.id && (
                    <div className="p-1 rounded-full bg-purple-500 text-white shrink-0 ml-2">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* System Instructions & Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                System Instructions & Persona
              </label>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {PROMPT_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setDraft({ ...draft, systemInstruction: preset.prompt })}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 hover:text-white transition"
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <textarea
              id="settings-system-instruction-input"
              value={draft.systemInstruction}
              onChange={(e) => setDraft({ ...draft, systemInstruction: e.target.value })}
              rows={4}
              className="w-full p-3 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
              placeholder="Provide guidelines for Gemini's personality, brevity, and tone..."
            />
          </div>

          {/* Vision Frame Rate */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Vision Stream Rate
              </span>
              <span className="text-xs font-mono text-indigo-400">{draft.fps} FPS</span>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Gemini Live processes camera and screen video frames. 1 FPS is recommended by the Gemini Live API specifications.
            </p>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.5"
              value={draft.fps}
              onChange={(e) => setDraft({ ...draft, fps: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-950/50">
          <button
            id="settings-cancel-btn"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
          >
            Cancel
          </button>
          <button
            id="settings-save-btn"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition"
          >
            Apply & Save
          </button>
        </div>
      </div>
    </div>
  );
};
