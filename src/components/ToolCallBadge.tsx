import React from "react";
import { Wrench, CheckCircle, Clock } from "lucide-react";
import { ToolCallEvent } from "../types";

interface ToolCallBadgeProps {
  toolCalls: ToolCallEvent[];
  onDismiss: (id: string) => void;
}

export const ToolCallBadge: React.FC<ToolCallBadgeProps> = ({ toolCalls, onDismiss }) => {
  if (toolCalls.length === 0) return null;

  return (
    <div id="live-tool-calls-container" className="fixed top-20 right-6 z-30 flex flex-col gap-2 max-w-sm pointer-events-auto">
      {toolCalls.slice(-2).map((tc) => (
        <div
          key={tc.id}
          className="p-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-amber-500/30 shadow-xl flex items-start gap-3 animate-fade-in text-xs"
        >
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 mt-0.5">
            {tc.status === "pending" ? (
              <Clock className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white truncate">
                Function: <span className="text-amber-300 font-mono">{tc.name}</span>
              </span>
              <span className="text-[10px] text-slate-400">
                {tc.status === "pending" ? "Calling..." : "Success"}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
              {JSON.stringify(tc.args)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
