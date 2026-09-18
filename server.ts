import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const app = express();
app.use(express.json({ limit: "25mb" }));

// Basic API endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/config", (req, res) => {
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY,
    models: [
      { id: "gemini-3.8-live", name: "Gemini 3.8 Live (Default Audio & Vision)", default: true },
      { id: "gemini-3.8-live-extended-thinking", name: "Gemini 3.8 Live Extended Thinking (Deep Reasoning)" },
      { id: "gemini-3.5-transcribe-live", name: "Gemini 3.5 Transcribe Live (Live Translation)" }
    ],
    voices: ["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]
  });
});

async function start() {
  const server = http.createServer(app);

  // Attach WebSocket server for Live API stream
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "", `http://${request.headers.host}`);
    if (pathname === "/api/live") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });

  // Tools declaration for Live API
  const liveTools = [
    {
      functionDeclarations: [
        {
          name: "get_current_time",
          description: "Returns the current local time and date for the user.",
          parameters: {
            type: "OBJECT" as any,
            properties: {
              timezone: { type: "STRING" as any, description: "Optional timezone identifier e.g. America/New_York or Europe/London" }
            }
          }
        },
        {
          name: "calculate",
          description: "Evaluates a mathematical expression or calculation.",
          parameters: {
            type: "OBJECT" as any,
            properties: {
              expression: { type: "STRING" as any, description: "Math expression like 'sqrt(144) + 42 * 3'" }
            },
            required: ["expression"]
          }
        }
      ]
    }
  ];

  function executeToolCall(name: string, args: Record<string, any>): Record<string, any> {
    if (name === "get_current_time") {
      const now = new Date();
      return {
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        iso: now.toISOString()
      };
    }
    if (name === "calculate") {
      try {
        const sanitized = String(args.expression || "").replace(/[^0-9+\-*/().%^e\s]/g, "");
        // Safe evaluation of simple arithmetic
        const fn = new Function(`return (${sanitized})`);
        const result = fn();
        return { expression: args.expression, result };
      } catch (err: any) {
        return { error: `Failed to calculate: ${err?.message || "Invalid expression"}` };
      }
    }
    return { result: "Tool executed successfully" };
  }

  wss.on("connection", (clientWs: WebSocket) => {
    let session: any = null;
    let isConnected = false;

    const safeSend = (msg: object) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(msg));
      }
    };

    clientWs.on("message", async (raw) => {
      try {
        const payload = JSON.parse(raw.toString());

        // Initial setup / connect
        if (payload.type === "init") {
          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey) {
            safeSend({
              type: "error",
              error: "GEMINI_API_KEY is not configured in environment. Please add it in Settings > Secrets."
            });
            return;
          }

          const modelName = payload.model || "gemini-3.8-live";
          const voiceName = payload.voice || "Zephyr";
          const systemInstruction = payload.systemInstruction || 
            "You are Gemini Live, a natural, highly intelligent, friendly, and multimodal real-time AI companion. You can see through the user's camera/screen when active, and listen to their voice. Keep spoken responses conversational, concise, natural, and engaging without overly verbose bulleted lists.";

          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build",
              },
            },
          });

          safeSend({ type: "status", status: "connecting", message: `Connecting to ${modelName}...` });

          try {
            session = await ai.live.connect({
              model: modelName,
              config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
                systemInstruction,
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                tools: liveTools as any,
              },
              callbacks: {
                onopen: () => {
                  isConnected = true;
                  safeSend({
                    type: "session_ready",
                    model: modelName,
                    voice: voiceName,
                  });
                  safeSend({ type: "status", status: "ready" });
                },
                onmessage: async (message: LiveServerMessage) => {
                  // 1. Audio stream from model
                  const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                  if (audio) {
                    safeSend({ type: "audio", data: audio });
                  }

                  // 2. Text parts if present in modelTurn
                  const text = message.serverContent?.modelTurn?.parts?.find((p) => p.text)?.text;
                  if (text) {
                    safeSend({ type: "model_text", text });
                  }

                  // 3. User input transcription
                  if (message.serverContent?.inputTranscription?.text) {
                    safeSend({
                      type: "input_transcription",
                      text: message.serverContent.inputTranscription.text,
                      finished: message.serverContent.inputTranscription.finished ?? false,
                    });
                  }

                  // Low-latency interim user transcription
                  if (message.serverContent?.interimInputTranscription?.text) {
                    safeSend({
                      type: "interim_input_transcription",
                      text: message.serverContent.interimInputTranscription.text,
                    });
                  }

                  // 4. Output transcription (what Gemini spoke)
                  if (message.serverContent?.outputTranscription?.text) {
                    safeSend({
                      type: "output_transcription",
                      text: message.serverContent.outputTranscription.text,
                      finished: message.serverContent.outputTranscription.finished ?? false,
                    });
                  }

                  // 5. Interruption signal
                  if (message.serverContent?.interrupted) {
                    safeSend({ type: "interrupted" });
                  }

                  // 6. Turn complete signal
                  if (message.serverContent?.turnComplete) {
                    safeSend({ type: "turn_complete" });
                  }

                  // 7. Tool calls handling
                  if (message.toolCall?.functionCalls) {
                    for (const call of message.toolCall.functionCalls) {
                      safeSend({
                        type: "tool_call_started",
                        name: call.name,
                        args: call.args,
                        id: call.id,
                      });

                      const result = executeToolCall(call.name || "", call.args || {});

                      safeSend({
                        type: "tool_call_completed",
                        name: call.name,
                        id: call.id,
                        result,
                      });

                      if (session) {
                        try {
                          session.sendToolResponse({
                            functionResponses: [
                              {
                                id: call.id,
                                name: call.name,
                                response: result,
                              },
                            ],
                          });
                        } catch (toolErr) {
                          console.error("Failed to send tool response:", toolErr);
                        }
                      }
                    }
                  }
                },
                onerror: (err: any) => {
                  console.error("Gemini Live session error:", err);
                  safeSend({
                    type: "error",
                    error: err?.message || String(err) || "Unknown Live session error",
                  });
                },
                onclose: () => {
                  isConnected = false;
                  safeSend({ type: "session_closed" });
                },
              },
            });
          } catch (connErr: any) {
            console.error("Failed to connect to Live API:", connErr);
            safeSend({
              type: "error",
              error: `Connection error: ${connErr?.message || "Failed to start Live session"}`,
            });
          }
          return;
        }

        // Realtime audio chunk (PCM 16kHz)
        if (payload.type === "audio" && session && isConnected) {
          session.sendRealtimeInput({
            audio: {
              data: payload.data,
              mimeType: "audio/pcm;rate=16000",
            },
          });
          return;
        }

        // Realtime video frame (JPEG base64)
        if (payload.type === "video" && session && isConnected) {
          session.sendRealtimeInput({
            video: {
              data: payload.data,
              mimeType: "image/jpeg",
            },
          });
          return;
        }

        // Text input sent to live session
        if (payload.type === "text" && session && isConnected) {
          session.sendRealtimeInput({
            text: payload.text,
          });
          return;
        }

        // Client requested manual interruption
        if (payload.type === "interrupt" && session && isConnected) {
          try {
            session.sendRealtimeInput({
              activityStart: {},
            });
          } catch {
            // ignore if unsupported
          }
          return;
        }

        // Close session request
        if (payload.type === "close" && session) {
          try {
            session.close();
          } catch {
            // ignore
          }
          isConnected = false;
          safeSend({ type: "session_closed" });
          return;
        }
      } catch (err: any) {
        console.error("Error processing websocket message:", err);
        safeSend({ type: "error", error: err?.message || "Internal server error" });
      }
    });

    clientWs.on("close", () => {
      if (session) {
        try {
          session.close();
        } catch {
          // ignore
        }
        session = null;
      }
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Gemini Live server running on http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
