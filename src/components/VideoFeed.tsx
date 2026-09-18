import React, { useEffect, useRef, useState } from "react";
import { Camera, Monitor, X, Maximize2, Minimize2, VideoOff } from "lucide-react";

interface VideoFeedProps {
  sourceType: "camera" | "screen" | null;
  fps: number;
  onFrame: (base64Jpeg: string) => void;
  onClose: () => void;
}

export const VideoFeed: React.FC<VideoFeedProps> = ({
  sourceType,
  fps,
  onFrame,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  useEffect(() => {
    if (!sourceType) {
      cleanup();
      return;
    }

    let isMounted = true;

    async function initStream() {
      setError(null);
      try {
        let stream: MediaStream;
        if (sourceType === "camera") {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: "user",
            },
          });
        } else {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
          });
        }

        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // If screen share ends via browser UI
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.onended = () => {
            onClose();
          };
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Start frame capture loop
        const intervalMs = Math.max(1000, Math.floor(1000 / (fps || 1)));
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        intervalRef.current = window.setInterval(() => {
          if (!videoRef.current || !ctx || videoRef.current.readyState < 2) return;
          const video = videoRef.current;
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 480;

          // Scale down for efficient transmission (max 640x480)
          const maxDim = 640;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          const base64 = dataUrl.split(",")[1];
          if (base64) {
            onFrame(base64);
            setFrameCount((prev) => prev + 1);
          }
        }, intervalMs);
      } catch (err: any) {
        console.error("Failed to acquire video stream:", err);
        setError(err?.message || "Failed to access video device");
      }
    }

    initStream();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [sourceType, fps]);

  function cleanup() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  if (!sourceType) return null;

  return (
    <div
      id="live-video-feed"
      className={`absolute z-30 transition-all duration-300 shadow-2xl rounded-2xl overflow-hidden border border-white/10 bg-slate-950/80 backdrop-blur-md ${
        isExpanded
          ? "inset-4 sm:inset-10 flex flex-col"
          : "bottom-24 right-4 sm:right-8 w-64 sm:w-80 aspect-video"
      }`}
    >
      {/* Video header bar */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
        <div className="flex items-center gap-2">
          {sourceType === "camera" ? (
            <Camera className="w-4 h-4 text-emerald-400" />
          ) : (
            <Monitor className="w-4 h-4 text-sky-400" />
          )}
          <span className="text-xs font-medium text-white/90">
            {sourceType === "camera" ? "Camera Stream" : "Screen Share"}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
            {fps} FPS ({frameCount})
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            id="video-toggle-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            id="video-close-btn"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-rose-500/20 text-white/70 hover:text-rose-400 transition"
            title="Stop Video Feed"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Video Element */}
      <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
        {error ? (
          <div className="p-4 text-center">
            <VideoOff className="w-8 h-8 mx-auto mb-2 text-rose-400 opacity-80" />
            <p className="text-xs text-rose-300">{error}</p>
            <button
              onClick={onClose}
              className="mt-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-xs text-white"
            >
              Dismiss
            </button>
          </div>
        ) : (
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>
    </div>
  );
};
