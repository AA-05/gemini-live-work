import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { LiveSessionConfig } from "../types";

export interface LiveClientCallbacks {
  onStatusChange: (status: "connecting" | "ready" | "speaking" | "listening" | "interrupted" | "disconnected" | "error", message?: string) => void;
  onAudioData: (base64Pcm: string) => void;
  onModelText?: (text: string) => void;
  onInputTranscription: (text: string, finished: boolean) => void;
  onInterimTranscription?: (text: string) => void;
  onOutputTranscription: (text: string, finished: boolean) => void;
  onInterrupted: () => void;
  onTurnComplete: () => void;
  onToolCallStarted?: (id: string, name: string, args: Record<string, any>) => void;
  onToolCallCompleted?: (id: string, name: string, result: any) => void;
  onError: (error: string) => void;
  onClose: () => void;
}

export interface LiveSessionHandle {
  sendAudio: (base64Pcm: string) => void;
  sendVideo: (base64Jpeg: string) => void;
  sendText: (text: string) => void;
  sendInterrupt: () => void;
  close: () => void;
}

// Built-in tools for live assistant
const clientLiveTools = [
  {
    functionDeclarations: [
      {
        name: "get_current_time",
        description: "Returns the current local time, date, and timezone for the user.",
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

function executeClientTool(name: string, args: Record<string, any>): Record<string, any> {
  if (name === "get_current_time") {
    const now = new Date();
    return {
      time: now.toLocaleTimeString(),
      date: now.toLocaleDateString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      iso: now.toISOString(),
    };
  }
  if (name === "calculate") {
    try {
      const sanitized = String(args.expression || "").replace(/[^0-9+\-*/().%^e\s]/g, "");
      const fn = new Function(`return (${sanitized})`);
      const result = fn();
      return { expression: args.expression, result };
    } catch (err: any) {
      return { error: `Failed to calculate: ${err?.message || "Invalid expression"}` };
    }
  }
  return { result: "Tool executed successfully" };
}

/**
 * Connect directly to Google Gemini Live API from browser.
 * This runs flawlessly on Vercel, Netlify, Cloud Run, or any static/serverless host.
 */
export async function connectDirectGeminiLive(
  config: LiveSessionConfig,
  apiKey: string,
  callbacks: LiveClientCallbacks
): Promise<LiveSessionHandle> {
  if (!apiKey) {
    callbacks.onError("Gemini API key is required. Please provide it in Settings or via VITE_GEMINI_API_KEY.");
    throw new Error("Missing Gemini API key");
  }

  callbacks.onStatusChange("connecting", `Connecting to ${config.model}...`);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  let session: any = null;
  let isClosed = false;
  const pendingAudioQueue: string[] = [];

  const sessionPromise = ai.live.connect({
    model: config.model || "gemini-3.8-live",
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: config.voice || "Zephyr" },
        },
      },
      systemInstruction: config.systemInstruction,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools: clientLiveTools as any,
    },
    callbacks: {
      onopen: () => {
        callbacks.onStatusChange("ready");
      },
      onmessage: async (message: LiveServerMessage) => {
        if (isClosed) return;

        // 1. Spoken audio chunk from Gemini
        const audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audio) {
          callbacks.onAudioData(audio);
        }

        // 2. Text reply
        const text = message.serverContent?.modelTurn?.parts?.find((p) => p.text)?.text;
        if (text && callbacks.onModelText) {
          callbacks.onModelText(text);
        }

        // 3. User input transcription
        if (message.serverContent?.inputTranscription?.text) {
          callbacks.onInputTranscription(
            message.serverContent.inputTranscription.text,
            message.serverContent.inputTranscription.finished ?? false
          );
        }

        // Interim user speech transcription
        if (message.serverContent?.interimInputTranscription?.text && callbacks.onInterimTranscription) {
          callbacks.onInterimTranscription(message.serverContent.interimInputTranscription.text);
        }

        // 4. Output transcription (spoken words from Gemini)
        if (message.serverContent?.outputTranscription?.text) {
          callbacks.onOutputTranscription(
            message.serverContent.outputTranscription.text,
            message.serverContent.outputTranscription.finished ?? false
          );
        }

        // 5. Interruption signal
        if (message.serverContent?.interrupted) {
          callbacks.onInterrupted();
        }

        // 6. Turn complete
        if (message.serverContent?.turnComplete) {
          callbacks.onTurnComplete();
        }

        // 7. Tool calls handling
        if (message.toolCall?.functionCalls) {
          for (const call of message.toolCall.functionCalls) {
            if (callbacks.onToolCallStarted) {
              callbacks.onToolCallStarted(call.id || String(Date.now()), call.name || "tool", call.args || {});
            }

            const result = executeClientTool(call.name || "", call.args || {});

            if (callbacks.onToolCallCompleted) {
              callbacks.onToolCallCompleted(call.id || String(Date.now()), call.name || "tool", result);
            }

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
                console.error("Failed to send client tool response:", toolErr);
              }
            }
          }
        }
      },
      onerror: (err: any) => {
        console.error("Gemini Live direct error:", err);
        const errStr = err?.message || String(err) || "Live session connection error";
        callbacks.onError(errStr);
      },
      onclose: () => {
        isClosed = true;
        callbacks.onClose();
      },
    },
  });

  try {
    session = await sessionPromise;
    // Flush any pending audio queued during setup
    while (pendingAudioQueue.length > 0 && !isClosed) {
      const pcm = pendingAudioQueue.shift();
      if (pcm) {
        session.sendRealtimeInput({
          audio: {
            data: pcm,
            mimeType: "audio/pcm;rate=16000",
          },
        });
      }
    }
  } catch (err: any) {
    console.error("Failed to establish direct Gemini Live session:", err);
    callbacks.onError(err?.message || "Failed to establish Live session");
    throw err;
  }

  return {
    sendAudio: (base64Pcm: string) => {
      if (isClosed) return;
      if (session) {
        try {
          session.sendRealtimeInput({
            audio: {
              data: base64Pcm,
              mimeType: "audio/pcm;rate=16000",
            },
          });
        } catch (e) {
          console.warn("Error sending audio to live session:", e);
        }
      } else {
        pendingAudioQueue.push(base64Pcm);
      }
    },
    sendVideo: (base64Jpeg: string) => {
      if (isClosed || !session) return;
      try {
        session.sendRealtimeInput({
          video: {
            data: base64Jpeg,
            mimeType: "image/jpeg",
          },
        });
      } catch (e) {
        console.warn("Error sending video frame to live session:", e);
      }
    },
    sendText: (text: string) => {
      if (isClosed || !session) return;
      try {
        session.sendRealtimeInput({ text });
      } catch (e) {
        console.warn("Error sending text to live session:", e);
      }
    },
    sendInterrupt: () => {
      if (isClosed || !session) return;
      try {
        session.sendRealtimeInput({ activityStart: {} });
      } catch (e) {
        console.warn("Error sending interrupt to live session:", e);
      }
    },
    close: () => {
      isClosed = true;
      if (session) {
        try {
          session.close();
        } catch {
          // ignore
        }
      }
    },
  };
}

/**
 * Connect via Server WebSocket Proxy (when local custom Node server is running).
 */
export function connectProxyWebSocket(
  config: LiveSessionConfig,
  callbacks: LiveClientCallbacks
): Promise<LiveSessionHandle> {
  return new Promise((resolve, reject) => {
    callbacks.onStatusChange("connecting", "Connecting to live proxy...");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/live`;
    const ws = new WebSocket(wsUrl);

    let hasOpened = false;

    ws.onopen = () => {
      hasOpened = true;
      ws.send(
        JSON.stringify({
          type: "init",
          model: config.model,
          voice: config.voice,
          systemInstruction: config.systemInstruction,
        })
      );

      resolve({
        sendAudio: (base64Pcm: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "audio", data: base64Pcm }));
          }
        },
        sendVideo: (base64Jpeg: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "video", data: base64Jpeg }));
          }
        },
        sendText: (text: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "text", text }));
          }
        },
        sendInterrupt: () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "interrupt" }));
          }
        },
        close: () => {
          try {
            ws.send(JSON.stringify({ type: "close" }));
            ws.close();
          } catch {
            // ignore
          }
        },
      });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "session_ready":
            callbacks.onStatusChange("ready");
            break;
          case "audio":
            callbacks.onAudioData(msg.data);
            break;
          case "model_text":
            if (callbacks.onModelText) callbacks.onModelText(msg.text);
            break;
          case "input_transcription":
            callbacks.onInputTranscription(msg.text, msg.finished ?? false);
            break;
          case "interim_input_transcription":
            if (callbacks.onInterimTranscription) callbacks.onInterimTranscription(msg.text);
            break;
          case "output_transcription":
            callbacks.onOutputTranscription(msg.text, msg.finished ?? false);
            break;
          case "interrupted":
            callbacks.onInterrupted();
            break;
          case "turn_complete":
            callbacks.onTurnComplete();
            break;
          case "tool_call_started":
            if (callbacks.onToolCallStarted) {
              callbacks.onToolCallStarted(msg.id, msg.name, msg.args);
            }
            break;
          case "tool_call_completed":
            if (callbacks.onToolCallCompleted) {
              callbacks.onToolCallCompleted(msg.id, msg.name, msg.result);
            }
            break;
          case "error":
            callbacks.onError(msg.error);
            break;
          case "session_closed":
            callbacks.onClose();
            break;
        }
      } catch (e) {
        console.error("Failed to parse websocket message:", e);
      }
    };

    ws.onerror = (err) => {
      console.warn("Proxy WebSocket error:", err);
      if (!hasOpened) {
        reject(new Error("WebSocket connection error"));
      } else {
        callbacks.onError("WebSocket connection error");
      }
    };

    ws.onclose = () => {
      callbacks.onClose();
    };
  });
}
