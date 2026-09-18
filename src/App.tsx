import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  LiveStatus,
  VisualizerMode,
  TranscriptItem,
  LiveSessionConfig,
  ToolCallEvent,
} from "./types";
import { LiveAudioPlayer, LiveAudioRecorder } from "./utils/audio";
import { LiveVisualizer } from "./components/LiveVisualizer";
import { LiveControls } from "./components/LiveControls";
import { TranscriptDrawer } from "./components/TranscriptDrawer";
import { VideoFeed } from "./components/VideoFeed";
import { SettingsModal } from "./components/SettingsModal";
import { ToolCallBadge } from "./components/ToolCallBadge";
import {
  Sparkles,
  AlertCircle,
  Key,
  ShieldCheck,
  Radio,
  ExternalLink,
  Volume2,
} from "lucide-react";

export default function App() {
  const [status, setStatus] = useState<LiveStatus>("disconnected");
  const [hasApiKey, setHasApiKey] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [activeVideoSource, setActiveVideoSource] = useState<"camera" | "screen" | null>(null);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>("orb");
  const [isTranscriptOpen, setIsTranscriptOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [interimUserText, setInterimUserText] = useState<string>("");
  const [interimGeminiText, setInterimGeminiText] = useState<string>("");
  const [toolCalls, setToolCalls] = useState<ToolCallEvent[]>([]);

  const [config, setConfig] = useState<LiveSessionConfig>({
    model: "gemini-3.8-live",
    voice: "Zephyr",
    systemInstruction:
      "You are Gemini Live, a natural, highly intelligent, friendly, and multimodal real-time AI companion. You can see through the user's camera/screen when active, and listen to their voice. Keep spoken responses conversational, concise, natural, and engaging without overly verbose bulleted lists.",
    fps: 1.0,
    affectiveDialog: true,
  });

  // Audio system references
  const audioPlayerRef = useRef<LiveAudioPlayer | null>(null);
  const audioRecorderRef = useRef<LiveAudioRecorder | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [userAnalyser, setUserAnalyser] = useState<AnalyserNode | null>(null);
  const [geminiAnalyser, setGeminiAnalyser] = useState<AnalyserNode | null>(null);

  // Check backend config
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        setHasApiKey(data.hasApiKey);
      })
      .catch((err) => {
        console.warn("Could not check config:", err);
      });
  }, []);

  // Connect to Gemini Live API WebSocket
  const connectSession = useCallback(async () => {
    setErrorMessage(null);
    setStatus("connecting");

    // Initialize audio player
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new LiveAudioPlayer();
    }
    audioPlayerRef.current.init();
    setGeminiAnalyser(audioPlayerRef.current.getAnalyser());

    // Connect WebSocket
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/live`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = async () => {
      // Send session initialization
      ws.send(
        JSON.stringify({
          type: "init",
          model: config.model,
          voice: config.voice,
          systemInstruction: config.systemInstruction,
        })
      );

      // Start audio recording
      try {
        if (!audioRecorderRef.current) {
          audioRecorderRef.current = new LiveAudioRecorder();
        }
        await audioRecorderRef.current.start((base64Pcm) => {
          if (ws.readyState === WebSocket.OPEN && !isMuted) {
            ws.send(
              JSON.stringify({
                type: "audio",
                data: base64Pcm,
              })
            );
          }
        });
        setUserAnalyser(audioRecorderRef.current.getAnalyser());
      } catch (micErr: any) {
        console.error("Microphone access error:", micErr);
        setErrorMessage("Microphone access was denied or is unavailable. Please grant microphone permissions.");
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "session_ready":
            setStatus("ready");
            setErrorMessage(null);
            break;

          case "audio":
            setStatus("speaking");
            audioPlayerRef.current?.playChunk(msg.data);
            break;

          case "model_text":
            setInterimGeminiText((prev) => (prev ? prev + " " + msg.text : msg.text));
            break;

          case "input_transcription":
            if (msg.finished) {
              setTranscripts((prev) => [
                ...prev,
                {
                  id: String(Date.now()),
                  role: "user",
                  text: msg.text,
                  timestamp: new Date(),
                },
              ]);
              setInterimUserText("");
            } else {
              setInterimUserText(msg.text);
            }
            break;

          case "interim_input_transcription":
            setInterimUserText(msg.text);
            if (status !== "speaking") {
              setStatus("listening");
            }
            break;

          case "output_transcription":
            if (msg.finished) {
              setTranscripts((prev) => [
                ...prev,
                {
                  id: String(Date.now()),
                  role: "gemini",
                  text: msg.text,
                  timestamp: new Date(),
                },
              ]);
              setInterimGeminiText("");
            } else {
              setInterimGeminiText(msg.text);
            }
            break;

          case "interrupted":
            audioPlayerRef.current?.interrupt();
            setStatus("interrupted");
            setInterimGeminiText("");
            setTimeout(() => {
              setStatus("ready");
            }, 800);
            break;

          case "turn_complete":
            if (interimGeminiText) {
              setTranscripts((prev) => [
                ...prev,
                {
                  id: String(Date.now()),
                  role: "gemini",
                  text: interimGeminiText,
                  timestamp: new Date(),
                },
              ]);
              setInterimGeminiText("");
            }
            setStatus("ready");
            break;

          case "tool_call_started":
            setToolCalls((prev) => [
              ...prev,
              {
                id: msg.id,
                name: msg.name,
                args: msg.args || {},
                status: "pending",
                timestamp: new Date(),
              },
            ]);
            break;

          case "tool_call_completed":
            setToolCalls((prev) =>
              prev.map((t) =>
                t.id === msg.id ? { ...t, status: "done", result: msg.result } : t
              )
            );
            setTranscripts((prev) => [
              ...prev,
              {
                id: String(Date.now()),
                role: "tool",
                text: `Invoked ${msg.name}`,
                toolName: msg.name,
                toolResult: msg.result,
                timestamp: new Date(),
              },
            ]);
            break;

          case "error":
            console.error("Live API error received:", msg.error);
            setErrorMessage(msg.error);
            setStatus("error");
            break;

          case "session_closed":
            setStatus("disconnected");
            break;

          default:
            break;
        }
      } catch (err) {
        console.error("Failed to parse websocket message:", err);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setErrorMessage("WebSocket connection error");
      setStatus("error");
    };

    ws.onclose = () => {
      setStatus("disconnected");
    };
  }, [config, isMuted, status, interimGeminiText]);

  // Disconnect session
  const disconnectSession = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ type: "close" }));
      socketRef.current.close();
      socketRef.current = null;
    }
    audioRecorderRef.current?.stop();
    audioPlayerRef.current?.interrupt();
    setStatus("disconnected");
  }, []);

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    audioRecorderRef.current?.setRecording(!nextMuted);
    audioPlayerRef.current?.setMuted(nextMuted);
  };

  // Toggle Camera
  const handleToggleCamera = () => {
    if (activeVideoSource === "camera") {
      setActiveVideoSource(null);
    } else {
      setActiveVideoSource("camera");
    }
  };

  // Toggle Screen Share
  const handleToggleScreen = () => {
    if (activeVideoSource === "screen") {
      setActiveVideoSource(null);
    } else {
      setActiveVideoSource("screen");
    }
  };

  // Send Video Frame
  const handleSendFrame = (base64Jpeg: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "video",
          data: base64Jpeg,
        })
      );
    }
  };

  // Manual Interruption
  const handleInterrupt = () => {
    audioPlayerRef.current?.interrupt();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "interrupt" }));
    }
    setStatus("interrupted");
    setInterimGeminiText("");
    setTimeout(() => {
      setStatus("ready");
    }, 600);
  };

  // Send Text Message
  const handleSendText = (text: string) => {
    setTranscripts((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        role: "user",
        text,
        timestamp: new Date(),
      },
    ]);

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "text",
          text,
        })
      );
      setStatus("thinking");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectSession();
      audioPlayerRef.current?.close();
    };
  }, [disconnectSession]);

  return (
    <div id="gemini-live-app" className="relative w-screen h-screen bg-slate-950 text-white overflow-hidden select-none font-sans">
      {/* Dynamic Background Aura */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-30">
        <div
          className={`absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[120px] transition-all duration-1000 ${
            status === "speaking"
              ? "bg-purple-600/40"
              : status === "listening"
              ? "bg-sky-600/40"
              : status === "thinking"
              ? "bg-amber-600/40"
              : "bg-indigo-900/30"
          }`}
        />
        <div
          className={`absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full blur-[140px] transition-all duration-1000 ${
            status === "speaking"
              ? "bg-pink-600/30"
              : status === "listening"
              ? "bg-emerald-600/30"
              : "bg-blue-900/30"
          }`}
        />
      </div>

      {/* Top Navigation Bar */}
      <header id="top-navbar" className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/40 backdrop-blur-md">
        {/* Brand identity */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 shadow-md shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-white">Gemini Live</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-slate-300 font-medium border border-white/10">
                Bidirectional Audio & Vision
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Low-latency Gemini 3.8 Live API</p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-2.5">
          {/* Active Model pill */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
            <Radio className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="font-medium">{config.model}</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">{config.voice}</span>
          </div>

          {/* Connection Status Badge */}
          <div
            id="status-badge"
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              status === "speaking"
                ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                : status === "listening"
                ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                : status === "thinking"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                : status === "ready"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                : status === "connecting"
                ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                : status === "interrupted"
                ? "bg-amber-500/30 text-amber-200 border-amber-500/40"
                : "bg-slate-800 text-slate-400 border-white/10"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status === "speaking"
                  ? "bg-purple-400 animate-pulse"
                  : status === "listening"
                  ? "bg-sky-400 animate-ping"
                  : status === "thinking"
                  ? "bg-amber-400 animate-spin"
                  : status === "ready"
                  ? "bg-emerald-400"
                  : status === "connecting"
                  ? "bg-indigo-400 animate-pulse"
                  : "bg-slate-500"
              }`}
            />
            <span className="capitalize font-semibold">
              {status === "speaking"
                ? "Gemini Speaking"
                : status === "listening"
                ? "Listening..."
                : status === "thinking"
                ? "Reasoning..."
                : status === "ready"
                ? "Listening (Say anything)"
                : status === "connecting"
                ? "Connecting..."
                : status === "interrupted"
                ? "Interrupted"
                : "Disconnected"}
            </span>
          </div>
        </div>
      </header>

      {/* API Key Missing Warning Banner */}
      {!hasApiKey && (
        <div id="missing-api-key-banner" className="relative z-20 px-4 py-2.5 bg-amber-950/40 border-b border-amber-500/20 text-amber-200 flex items-center justify-between text-xs backdrop-blur-md">
          <div className="flex items-center gap-2 max-w-2xl">
            <Key className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>GEMINI_API_KEY</strong> is needed to establish live bidirectional sessions. Please add your key in <em>Settings &gt; Secrets</em>.
            </span>
          </div>
        </div>
      )}

      {/* Error Message Banner */}
      {errorMessage && (
        <div id="error-message-banner" className="relative z-20 px-4 py-2 bg-rose-950/60 border-b border-rose-500/30 text-rose-200 flex items-center justify-between text-xs backdrop-blur-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-white text-xs underline ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Stage: Fluid Gemini Live Visualizer */}
      <main id="live-stage" className="relative w-full h-[calc(100vh-140px)] flex items-center justify-center">
        {/* Visualizer Canvas */}
        <LiveVisualizer
          status={status}
          mode={visualizerMode}
          userAnalyser={userAnalyser}
          geminiAnalyser={geminiAnalyser}
          isMuted={isMuted}
        />

        {/* Center Prompt / Greeting when Disconnected or Ready */}
        {status === "disconnected" && (
          <div className="absolute z-10 flex flex-col items-center text-center p-6 max-w-md bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1.5">Start Gemini Live Session</h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Experience seamless, low-latency spoken voice and real-time vision interaction powered by the official Gemini Live API.
            </p>
            <button
              id="main-start-session-btn"
              onClick={connectSession}
              className="px-6 py-3 rounded-full bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-semibold text-sm shadow-xl shadow-indigo-600/30 transition transform hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Connect &amp; Start Talking</span>
            </button>
          </div>
        )}

        {/* Spoken subtitle overlay right above controls */}
        {(interimUserText || interimGeminiText) && (
          <div className="absolute bottom-28 inset-x-4 max-w-xl mx-auto z-20 pointer-events-none text-center">
            {interimUserText && (
              <div className="inline-block px-4 py-2 rounded-2xl bg-sky-950/70 backdrop-blur-md border border-sky-400/30 text-sky-200 text-xs shadow-lg mb-2">
                <span className="font-semibold text-sky-400 mr-1.5">You:</span>
                <span>{interimUserText}</span>
              </div>
            )}
            {interimGeminiText && (
              <div className="inline-block px-5 py-2.5 rounded-2xl bg-indigo-950/80 backdrop-blur-md border border-indigo-400/40 text-indigo-100 text-sm shadow-xl font-medium">
                <span className="font-semibold text-indigo-400 mr-1.5">Gemini:</span>
                <span>{interimGeminiText}</span>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Active Function Call Badges */}
      <ToolCallBadge
        toolCalls={toolCalls}
        onDismiss={(id) => setToolCalls((prev) => prev.filter((t) => t.id !== id))}
      />

      {/* Floating Camera or Screen Vision PIP */}
      <VideoFeed
        sourceType={activeVideoSource}
        fps={config.fps}
        onFrame={handleSendFrame}
        onClose={() => setActiveVideoSource(null)}
      />

      {/* Bottom Floating Controls Toolbar */}
      <LiveControls
        status={status}
        isMuted={isMuted}
        isCameraActive={activeVideoSource === "camera"}
        isScreenActive={activeVideoSource === "screen"}
        visualizerMode={visualizerMode}
        transcriptCount={transcripts.length}
        isTranscriptOpen={isTranscriptOpen}
        onToggleMute={handleToggleMute}
        onToggleCamera={handleToggleCamera}
        onToggleScreen={handleToggleScreen}
        onInterrupt={handleInterrupt}
        onSendText={handleSendText}
        onToggleTranscript={() => setIsTranscriptOpen(!isTranscriptOpen)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onReconnect={connectSession}
        onToggleVisualizerMode={() =>
          setVisualizerMode((prev) => (prev === "orb" ? "waveform" : "orb"))
        }
      />

      {/* Slide-out Real-time Transcript Drawer */}
      <TranscriptDrawer
        isOpen={isTranscriptOpen}
        onClose={() => setIsTranscriptOpen(false)}
        items={transcripts}
        interimUserText={interimUserText}
        interimGeminiText={interimGeminiText}
        onClear={() => setTranscripts([])}
      />

      {/* Configuration & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onSaveConfig={(newConfig) => setConfig(newConfig)}
        isConnected={status !== "disconnected"}
      />
    </div>
  );
}
