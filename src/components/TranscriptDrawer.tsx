import React, { useEffect, useRef } from "react";
import { TranscriptItem } from "../types";
import { MessageSquare, X, Copy, Check, Trash2, Wrench, Sparkles, User } from "lucide-react";

interface TranscriptDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: TranscriptItem[];
  interimUserText?: string;
  interimGeminiText?: string;
  onClear: () => void;
}

export const TranscriptDrawer: React.FC<TranscriptDrawerProps> = ({
  isOpen,
  onClose,
  items,
  interimUserText,
  interimGeminiText,
  onClear,
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [items, interimUserText, interimGeminiText, isOpen]);

  const copyTranscript = () => {
    const text = items
      .map((item) => {
        const time = new Date(item.timestamp).toLocaleTimeString();
        return `[${time}] ${item.role.toUpperCase()}: ${item.text}`;
      })
      .join("\n\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      id="transcript-drawer"
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 md:w-[440px] bg-slate-950/95 backdrop-blur-xl border-l border-white/10 shadow-2xl flex flex-col transition-transform duration-300"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide">Live Transcripts</h2>
            <p className="text-[11px] text-slate-400">Real-time bidirectional speech logs</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="copy-transcript-btn"
            onClick={copyTranscript}
            disabled={items.length === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition disabled:opacity-40"
            title="Copy Transcript"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            id="clear-transcript-btn"
            onClick={onClear}
            disabled={items.length === 0}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-rose-400 transition disabled:opacity-40"
            title="Clear History"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            id="close-transcript-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-white/10">
        {items.length === 0 && !interimUserText && !interimGeminiText && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
            <Sparkles className="w-8 h-8 mb-2 opacity-30 text-indigo-400" />
            <p className="text-xs font-medium text-slate-400">No conversation yet</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[240px]">
              Start speaking or type a prompt below. Real-time transcriptions will stream here live.
            </p>
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className={`flex flex-col rounded-xl p-3 border transition-all ${
              item.role === "user"
                ? "bg-sky-950/20 border-sky-500/20 text-sky-100 ml-4"
                : item.role === "gemini"
                ? "bg-indigo-950/20 border-indigo-500/20 text-indigo-100 mr-4"
                : item.role === "tool"
                ? "bg-amber-950/20 border-amber-500/20 text-amber-100 text-xs"
                : "bg-slate-900 border-white/5 text-slate-300 text-xs"
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                {item.role === "user" ? (
                  <User className="w-3 h-3 text-sky-400" />
                ) : item.role === "gemini" ? (
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                ) : item.role === "tool" ? (
                  <Wrench className="w-3 h-3 text-amber-400" />
                ) : null}
                <span className="text-[11px] font-semibold uppercase tracking-wider opacity-75">
                  {item.role === "user"
                    ? "You"
                    : item.role === "gemini"
                    ? "Gemini Live"
                    : item.role === "tool"
                    ? `Tool: ${item.toolName || "Function"}`
                    : "System"}
                </span>
              </div>
              <span className="text-[10px] opacity-40 font-mono">
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>

            {item.role === "tool" ? (
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="text-amber-300/90">{item.text}</div>
                {item.toolResult && (
                  <pre className="p-2 rounded bg-black/40 overflow-x-auto text-[10px] text-emerald-300">
                    {JSON.stringify(item.toolResult, null, 2)}
                  </pre>
                )}
              </div>
            ) : (
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{item.text}</p>
            )}
          </div>
        ))}

        {/* Interim User Transcription (Speech in progress) */}
        {interimUserText && (
          <div className="flex flex-col rounded-xl p-3 bg-sky-950/30 border border-sky-400/40 text-sky-200 ml-4 animate-pulse">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-sky-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
                You (speaking...)
              </span>
            </div>
            <p className="text-xs italic leading-relaxed">{interimUserText}</p>
          </div>
        )}

        {/* Interim Gemini Output Transcription (Streaming in progress) */}
        {interimGeminiText && (
          <div className="flex flex-col rounded-xl p-3 bg-indigo-950/30 border border-indigo-400/40 text-indigo-200 mr-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping" />
                Gemini (speaking...)
              </span>
            </div>
            <p className="text-xs leading-relaxed">{interimGeminiText}</p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Footer Info */}
      <div className="px-4 py-2.5 bg-black/30 border-t border-white/5 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Low-latency audio transcription</span>
        <span className="font-mono text-[10px] text-indigo-400">Live API Bidirectional</span>
      </div>
    </div>
  );
};
