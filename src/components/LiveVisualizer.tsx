import React, { useEffect, useRef } from "react";
import { LiveStatus, VisualizerMode } from "../types";

interface LiveVisualizerProps {
  status: LiveStatus;
  mode: VisualizerMode;
  userAnalyser: AnalyserNode | null;
  geminiAnalyser: AnalyserNode | null;
  isMuted: boolean;
}

export const LiveVisualizer: React.FC<LiveVisualizerProps> = ({
  status,
  mode,
  userAnalyser,
  geminiAnalyser,
  isMuted,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const phaseRef = useRef<number>(0);
  const userVolSmoothedRef = useRef<number>(0);
  const geminiVolSmoothedRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const userFreqData = new Uint8Array(128);
    const geminiFreqData = new Uint8Array(128);

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Get user audio volume
      let userVolume = 0;
      if (userAnalyser && !isMuted) {
        userAnalyser.getByteFrequencyData(userFreqData);
        let sum = 0;
        for (let i = 0; i < userFreqData.length; i++) sum += userFreqData[i];
        userVolume = sum / (userFreqData.length * 255);
      }

      // Get Gemini voice volume
      let geminiVolume = 0;
      if (geminiAnalyser) {
        geminiAnalyser.getByteFrequencyData(geminiFreqData);
        let sum = 0;
        for (let i = 0; i < geminiFreqData.length; i++) sum += geminiFreqData[i];
        geminiVolume = sum / (geminiFreqData.length * 255);
      }

      // Smooth volumes
      userVolSmoothedRef.current += (userVolume - userVolSmoothedRef.current) * 0.2;
      geminiVolSmoothedRef.current += (geminiVolume - geminiVolSmoothedRef.current) * 0.25;

      const uVol = userVolSmoothedRef.current;
      const gVol = geminiVolSmoothedRef.current;

      phaseRef.current += 0.03 + (status === "speaking" ? gVol * 0.1 : status === "listening" ? uVol * 0.08 : 0.01);
      const phase = phaseRef.current;

      if (mode === "waveform") {
        // --- Waveform Mode ---
        drawWaveform(ctx, w, h, status, uVol, gVol, phase, geminiFreqData, userFreqData);
      } else {
        // --- Iconic Gemini Live Orb Mode ---
        drawGeminiOrb(ctx, cx, cy, status, uVol, gVol, phase);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    animationFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", resize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [status, mode, userAnalyser, geminiAnalyser, isMuted]);

  return (
    <div id="live-visualizer-container" className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <canvas
        id="live-visualizer-canvas"
        ref={canvasRef}
        className="w-full h-full block touch-none"
      />
    </div>
  );
};

// Render the iconic, organic multi-layered Gemini Live glowing fluid orb
function drawGeminiOrb(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  status: LiveStatus,
  uVol: number,
  gVol: number,
  phase: number
) {
  const baseRadius = Math.min(cx, cy) * 0.42;

  // Active voice scale reaction
  let activeVol = 0;
  if (status === "speaking") {
    activeVol = gVol * 1.5;
  } else if (status === "listening") {
    activeVol = uVol * 1.3;
  } else if (status === "thinking") {
    activeVol = 0.15 + Math.sin(phase * 3) * 0.08;
  }

  const radius = baseRadius * (1 + activeVol * 0.35);

  // Outer ambient glow
  const glowGrad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 2.2);
  if (status === "speaking") {
    glowGrad.addColorStop(0, "rgba(99, 102, 241, 0.45)"); // indigo
    glowGrad.addColorStop(0.5, "rgba(168, 85, 247, 0.25)"); // purple
    glowGrad.addColorStop(1, "rgba(236, 72, 153, 0)"); // transparent
  } else if (status === "listening") {
    glowGrad.addColorStop(0, "rgba(14, 165, 233, 0.45)"); // sky cyan
    glowGrad.addColorStop(0.5, "rgba(59, 130, 246, 0.25)"); // blue
    glowGrad.addColorStop(1, "rgba(34, 197, 94, 0)"); // transparent
  } else if (status === "thinking") {
    glowGrad.addColorStop(0, "rgba(245, 158, 11, 0.45)"); // amber
    glowGrad.addColorStop(0.5, "rgba(168, 85, 247, 0.25)"); // violet
    glowGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
  } else {
    // idle / ready
    glowGrad.addColorStop(0, "rgba(79, 70, 229, 0.2)");
    glowGrad.addColorStop(0.6, "rgba(59, 130, 246, 0.1)");
    glowGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  }

  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Multi-frequency distorted organic fluid layers
  const layerCount = 3;
  for (let l = 0; l < layerCount; l++) {
    const layerRadius = radius * (0.85 + l * 0.12);
    const layerPhase = phase + l * (Math.PI / 2.5);
    const points = 64;

    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const noise =
        Math.sin(angle * 3 + layerPhase * 1.5) * 8 * (1 + activeVol * 3) +
        Math.cos(angle * 5 - layerPhase * 2.2) * 6 * (1 + activeVol * 2.5) +
        Math.sin(angle * 7 + layerPhase * 0.8) * 4;

      const r = layerRadius + noise;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();

    // Internal fluid gradient
    const fluidGrad = ctx.createLinearGradient(
      cx - radius,
      cy - radius,
      cx + radius,
      cy + radius
    );

    if (status === "speaking") {
      fluidGrad.addColorStop(0, `rgba(59, 130, 246, ${0.45 - l * 0.1})`);
      fluidGrad.addColorStop(0.5, `rgba(147, 51, 234, ${0.55 - l * 0.1})`);
      fluidGrad.addColorStop(1, `rgba(236, 72, 153, ${0.4 - l * 0.1})`);
    } else if (status === "listening") {
      fluidGrad.addColorStop(0, `rgba(6, 182, 212, ${0.5 - l * 0.1})`);
      fluidGrad.addColorStop(0.5, `rgba(59, 130, 246, ${0.45 - l * 0.1})`);
      fluidGrad.addColorStop(1, `rgba(16, 185, 129, ${0.4 - l * 0.1})`);
    } else if (status === "thinking") {
      fluidGrad.addColorStop(0, `rgba(245, 158, 11, ${0.4 - l * 0.1})`);
      fluidGrad.addColorStop(0.5, `rgba(139, 92, 246, ${0.5 - l * 0.1})`);
      fluidGrad.addColorStop(1, `rgba(59, 130, 246, ${0.4 - l * 0.1})`);
    } else {
      fluidGrad.addColorStop(0, `rgba(99, 102, 241, ${0.35 - l * 0.08})`);
      fluidGrad.addColorStop(0.5, `rgba(59, 130, 246, ${0.3 - l * 0.08})`);
      fluidGrad.addColorStop(1, `rgba(147, 51, 234, ${0.25 - l * 0.08})`);
    }

    ctx.fillStyle = fluidGrad;
    ctx.fill();

    // Subtle edge rim light
    ctx.strokeStyle = status === "speaking" ? "rgba(216, 180, 254, 0.6)" : "rgba(186, 230, 253, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Inner core star/light beam
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 0.45);
  coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  coreGrad.addColorStop(0.4, "rgba(224, 231, 255, 0.7)");
  coreGrad.addColorStop(1, "rgba(255, 255, 255, 0)");

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

// Waveform visualizer for real-time audio visualization mode
function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  status: LiveStatus,
  uVol: number,
  gVol: number,
  phase: number,
  geminiFreqData: Uint8Array,
  userFreqData: Uint8Array
) {
  const cy = h / 2;
  const bars = 48;
  const barWidth = (w * 0.7) / bars;
  const startX = w * 0.15;

  const data = status === "speaking" ? geminiFreqData : userFreqData;
  const activeVol = status === "speaking" ? gVol : uVol;

  for (let i = 0; i < bars; i++) {
    const dataIndex = Math.floor((i / bars) * (data.length / 2));
    const val = (data[dataIndex] || 0) / 255;
    const wave = Math.sin(phase * 2 + (i / bars) * Math.PI * 2) * 0.15;
    const barHeight = Math.max(6, (val + wave + activeVol * 0.5) * (h * 0.35));

    const x = startX + i * barWidth;
    const y = cy - barHeight / 2;

    const grad = ctx.createLinearGradient(x, y, x, y + barHeight);
    if (status === "speaking") {
      grad.addColorStop(0, "#c084fc");
      grad.addColorStop(0.5, "#6366f1");
      grad.addColorStop(1, "#38bdf8");
    } else if (status === "listening") {
      grad.addColorStop(0, "#38bdf8");
      grad.addColorStop(0.5, "#3b82f6");
      grad.addColorStop(1, "#34d399");
    } else {
      grad.addColorStop(0, "#818cf8");
      grad.addColorStop(1, "#60a5fa");
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    // Rounded bar
    const radius = Math.min(barWidth * 0.35, 4);
    ctx.roundRect(x + 2, y, barWidth - 4, barHeight, radius);
    ctx.fill();
  }
}
