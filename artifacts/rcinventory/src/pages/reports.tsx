import { useState, useRef, useEffect } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot, User, Mic, Play, Square, Loader2, Send, Download,
  Phone, PhoneOff, MicOff, Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useListStores } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type CallPhase = "listening" | "thinking" | "speaking";

// SpeechRecognition is only used for the manual mic button in the text input bar.
const SR: (new () => any) | null =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

// Cross-browser AudioContext (Safari < 14.5 uses webkit prefix)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AC: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext ?? null;

// Cross-browser MIME type negotiation for MediaRecorder (call mode)
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];
function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mt of PREFERRED_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(mt)) return mt;
    } catch {
      // some browsers throw on isTypeSupported
    }
  }
  return undefined;
}

// Silence detection thresholds
const SILENCE_RMS_THRESHOLD = 0.015;
const SILENCE_DURATION_MS = 1600;
const MIN_SPEECH_MS = 400;

async function* parseSSE(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            yield JSON.parse(raw) as Record<string, unknown>;
          } catch {
            // skip malformed frames
          }
        }
      }
    }

    if (buffer.trim()) {
      for (const line of buffer.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          yield JSON.parse(raw) as Record<string, unknown>;
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function formatDate(d: Date) {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Strips markdown-style formatting for cleaner TTS output
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\|[^\n]+\|/g, (match) => match.replace(/\|/g, " ").trim())
    .replace(/[-*+]\s+/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

type AIVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

const AI_VOICES: Record<AIVoice, string> = {
  alloy:   "Alloy (neutral)",
  echo:    "Echo (male)",
  fable:   "Fable (storyteller)",
  onyx:    "Onyx (deep male)",
  nova:    "Nova (female)",
  shimmer: "Shimmer (soft female)",
};

/** Encode a Blob to base64 string (data URI stripped). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function Reports() {
  const { currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";

  const { data: allStores } = useListStores();
  const stores = isEmployee && currentUser?.storeId
    ? allStores?.filter((s) => s.id === currentUser.storeId) ?? []
    : allStores ?? [];

  const MESSAGES_KEY = "rcInventory.reportMessages";
  const MAX_STORED_MESSAGES = 20;

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const stored = localStorage.getItem(MESSAGES_KEY);
      return stored ? (JSON.parse(stored) as Message[]) : [];
    } catch {
      return [];
    }
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [aiVoice, setAiVoice] = useState<AIVoice>(
    () => (localStorage.getItem("rcInventory.aiVoice") as AIVoice | null) ?? "nova"
  );
  const [selectedStore, setSelectedStore] = useState<string>(
    () => localStorage.getItem("rcInventory.reportsStore") ?? "all"
  );

  useEffect(() => {
    localStorage.setItem("rcInventory.aiVoice", aiVoice);
  }, [aiVoice]);

  useEffect(() => {
    localStorage.setItem("rcInventory.reportsStore", selectedStore);
  }, [selectedStore]);

  useEffect(() => {
    try {
      const toStore = messages.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(toStore));
    } catch {
      // ignore quota errors
    }
  }, [messages]);

  const handleClearConversation = () => {
    setMessages([]);
    localStorage.removeItem(MESSAGES_KEY);
  };

  const [callMode, setCallMode] = useState(false);
  const [callPhase, setCallPhase] = useState<CallPhase>("listening");

  const scrollRef = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Resolves any in-flight speakWithAI() Promise so stopAudio() always settles it
  const stopPlaybackRef = useRef<(() => void) | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const callActiveRef = useRef(false);
  // Ref to always hold the latest version of the loop function (avoids stale closures)
  const loopRef = useRef<() => void>(() => {});
  // Callback set during the "listening" phase; calling it ends recording early
  const doneListeningRef = useRef<(() => void) | null>(null);
  // Ref to the active MediaStream so endCall can stop tracks immediately
  const callStreamRef = useRef<MediaStream | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isGenerating]);

  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      recognitionRef.current?.abort();
      callActiveRef.current = false;
      doneListeningRef.current = null;
      callStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // -------------------------------------------------------------------
  // Shared: fetch a report for a given prompt text, stream into chat.
  // Returns the full assistant response text, or throws on error.
  // -------------------------------------------------------------------
  const fetchReport = async (text: string): Promise<string> => {
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsgId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

    const token = localStorage.getItem("rc_auth_token");
    const storeNum = selectedStore !== "all" ? Number(selectedStore) : undefined;
    const storeName = storeNum
      ? stores.find((s) => s.id === storeNum)?.name
      : undefined;
    const promptWithContext = storeName
      ? `[Focusing on store: ${storeName}] ${text}`
      : text;

    const res = await fetch("/api/reports/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ prompt: promptWithContext }),
    });
    if (!res.ok) throw new Error("Failed to generate report");
    if (!res.body) throw new Error("No response body");

    let assistantContent = "";
    for await (const data of parseSSE(res.body)) {
      if (data.done) break;
      if (typeof data.content === "string") {
        assistantContent += data.content;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId ? { ...msg, content: assistantContent } : msg
          )
        );
      }
      if (data.error) throw new Error(String(data.error));
    }
    return assistantContent;
  };

  // -------------------------------------------------------------------
  // Manual input handlers (unchanged behaviour)
  // -------------------------------------------------------------------
  const handleToggleRecording = () => {
    if (!SR) {
      toast({
        title: "Not supported",
        description: "Speech recognition is not available in this browser.",
        variant: "destructive",
      });
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SR();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = (event.results[0]?.[0]?.transcript as string) ?? "";
      if (transcript) setPrompt(transcript);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (event.error !== "aborted") {
        toast({
          title: "Recognition error",
          description: event.error as string,
          variant: "destructive",
        });
      }
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleGenerateReport = async () => {
    if (!prompt.trim() || isGenerating) return;
    const text = prompt;
    setPrompt("");
    setIsGenerating(true);
    try {
      await fetchReport(text);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Report generation failed",
        variant: "destructive",
      });
      setMessages((prev) => prev.filter((m) => m.role !== "assistant" || m.content));
    } finally {
      setIsGenerating(false);
    }
  };

  // Stop any in-flight audio immediately and settle the speakWithAI() Promise.
  const stopAudio = () => {
    if (stopPlaybackRef.current) {
      stopPlaybackRef.current();
      stopPlaybackRef.current = null;
    } else if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsPlaying(false);
  };

  // Speak text using OpenAI TTS via /api/voice/speak.
  // Resolves when audio finishes (or is stopped early via stopAudio).
  const speakWithAI = async (text: string): Promise<void> => {
    stopAudio();
    if (!text.trim()) return;

    const token = localStorage.getItem("rc_auth_token");
    const res = await fetch("/api/voice/speak", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text: stripMarkdown(text), voice: aiVoice }),
    });

    if (!res.ok || !res.body) throw new Error("TTS request failed");

    const audioChunks: Uint8Array[] = [];
    for await (const frame of parseSSE(res.body)) {
      if (frame.done) break;
      if (frame.error) throw new Error(String(frame.error));
      if (typeof frame.audio === "string") {
        const bytes = Uint8Array.from(atob(frame.audio), (c) => c.charCodeAt(0));
        audioChunks.push(bytes);
      }
    }

    const totalLength = audioChunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    const blob = new Blob([merged], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const cleanup = () => {
        stopPlaybackRef.current = null;
        currentAudioRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };

      // Register a stop handle so stopAudio() can settle this Promise early
      stopPlaybackRef.current = () => {
        audio.pause();
        cleanup();
      };

      audio.onended = cleanup;
      audio.onerror = cleanup;
      audio.play().catch(cleanup);
    });
  };

  const playResponse = async (text: string) => {
    if (isPlaying) {
      stopAudio();
      return;
    }
    if (!text.trim()) return;

    setIsPlaying(true);
    try {
      await speakWithAI(text);
    } catch {
      // silently ignore TTS errors for Read Aloud button
    } finally {
      setIsPlaying(false);
    }
  };

  // -------------------------------------------------------------------
  // Call mode — record audio → Whisper transcribe → think → speak loop
  // Works on all browsers (Chrome, Firefox, Safari) via MediaRecorder.
  // -------------------------------------------------------------------
  const callLoop = async () => {
    if (!callActiveRef.current) return;

    setCallPhase("listening");
    doneListeningRef.current = null;

    let stream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    try {
      if (typeof MediaRecorder === "undefined" || !AC) {
        toast({
          title: "Not supported",
          description: "Voice call requires a browser that supports MediaRecorder (iOS 14.3+ or modern Android/desktop).",
          variant: "destructive",
        });
        endCall();
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      callStreamRef.current = stream;

      // Set up silence detection via Web Audio API
      // Use webkit-prefixed fallback for iOS Safari < 14.5
      audioContext = new AC();
      // Resume the context — required on iOS Safari where it starts suspended
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Set up MediaRecorder
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start(100);

      // Wait for silence or manual "Done Speaking" tap
      let hasSpeech = false;
      let speechStartMs: number | null = null;
      let silenceStartMs: number | null = null;

      await new Promise<void>((resolve) => {
        // Let the "Done speaking" button trigger resolve
        doneListeningRef.current = () => resolve();

        const tick = () => {
          if (!callActiveRef.current) { resolve(); return; }

          analyser.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (const v of dataArray) {
            const n = v / 128 - 1;
            sum += n * n;
          }
          const rms = Math.sqrt(sum / dataArray.length);

          const now = Date.now();
          if (rms > SILENCE_RMS_THRESHOLD) {
            if (!hasSpeech) { hasSpeech = true; speechStartMs = now; }
            silenceStartMs = null;
          } else if (hasSpeech) {
            if (silenceStartMs === null) silenceStartMs = now;
            const speechElapsed = speechStartMs !== null ? now - speechStartMs : 0;
            if (
              speechElapsed >= MIN_SPEECH_MS &&
              now - silenceStartMs > SILENCE_DURATION_MS
            ) {
              resolve();
              return;
            }
          }

          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      doneListeningRef.current = null;

      // Stop recording and collect audio
      const blobReady = new Promise<Blob>((resolve) => {
        recorder.onstop = () => {
          const blobType = mimeType ?? recorder.mimeType ?? "audio/webm";
          resolve(new Blob(chunks, { type: blobType }));
        };
      });
      recorder.stop();
      stream.getTracks().forEach((t) => t.stop());
      callStreamRef.current = null;
      audioContext.close();
      audioContext = null;

      if (!callActiveRef.current) return;

      const audioBlob = await blobReady;

      // Skip if no meaningful speech was captured
      if (!hasSpeech || audioBlob.size < 2000) {
        if (callActiveRef.current) loopRef.current();
        return;
      }

      // Transcribe via Whisper
      setCallPhase("thinking");
      setIsGenerating(true);

      const base64 = await blobToBase64(audioBlob);
      const token = localStorage.getItem("rc_auth_token");
      const transcribeRes = await fetch("/api/voice/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ audio: base64 }),
      });

      if (!transcribeRes.ok) throw new Error("Transcription failed");
      const { text } = await transcribeRes.json() as { text: string };

      if (!text.trim() || !callActiveRef.current) {
        setIsGenerating(false);
        if (callActiveRef.current) loopRef.current();
        return;
      }

      // Voice exit commands
      const lower = text.toLowerCase().trim();
      if (/^(stop|end call|hang up|goodbye|exit|quit)\.?$/.test(lower)) {
        endCall();
        return;
      }

      // Feed transcript into the report loop
      const response = await fetchReport(text);
      if (!callActiveRef.current) return;

      setCallPhase("speaking");
      setIsPlaying(true);

      await speakWithAI(response);
      setIsPlaying(false);
      if (callActiveRef.current) loopRef.current();

    } catch (err) {
      // Clean up on error
      stream?.getTracks().forEach((t) => t.stop());
      callStreamRef.current = null;
      audioContext?.close();

      if (callActiveRef.current) {
        toast({
          title: "Error during call",
          description: err instanceof Error ? err.message : "Something went wrong",
          variant: "destructive",
        });
        // Brief pause before retrying so we don't spin-loop on persistent errors
        setTimeout(() => { if (callActiveRef.current) loopRef.current(); }, 500);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Keep loopRef in sync with the latest callLoop every render
  loopRef.current = callLoop;

  const startCall = () => {
    recognitionRef.current?.abort();
    stopAudio();
    setIsListening(false);

    callActiveRef.current = true;
    setCallMode(true);
    loopRef.current();
  };

  const endCall = () => {
    callActiveRef.current = false;
    doneListeningRef.current = null;
    callStreamRef.current?.getTracks().forEach((t) => t.stop());
    callStreamRef.current = null;
    stopAudio();
    setCallMode(false);
    setCallPhase("listening");
    setIsGenerating(false);
  };

  // -------------------------------------------------------------------
  // PDF export — renders markdown tables, headers, bullets, and bold
  // -------------------------------------------------------------------
  const handleExportPdf = () => {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 48;
    const contentW = pageW - margin * 2;
    let y = margin;
    const BASE_FONT = 10;
    const LINE_H = BASE_FONT * 1.55;
    const CELL_PAD_X = 6;
    const CELL_PAD_Y = 5;

    const ensureSpace = (h: number) => {
      if (y + h > pageH - margin) { doc.addPage(); y = margin; }
    };

    // Strip all inline markdown markers to get plain text
    const plain = (s: string) =>
      s.replace(/\*\*([^*]+)\*\*/g, "$1")
       .replace(/\*([^*]+)\*/g, "$1")
       .replace(/`([^`]+)`/g, "$1")
       .trim();

    // Measure text width using current doc font settings
    const tw = (s: string) => doc.getTextWidth(s);

    // Render a line of text with inline **bold** support
    const renderRichLine = (
      text: string, x: number, yPos: number,
      fontSize: number = BASE_FONT, forceBold = false
    ) => {
      doc.setFontSize(fontSize);
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      let cx = x;
      for (const part of parts) {
        if (part.startsWith("**") && part.endsWith("**")) {
          const inner = part.slice(2, -2);
          doc.setFont("helvetica", "bold");
          doc.text(inner, cx, yPos);
          cx += tw(inner);
        } else if (part) {
          doc.setFont("helvetica", forceBold ? "bold" : "normal");
          doc.text(part, cx, yPos);
          cx += tw(part);
        }
      }
      doc.setFont("helvetica", "normal");
    };

    // Parse and render a markdown table block
    const renderTable = (tableLines: string[]) => {
      // Drop separator rows (---|---|---)
      const dataLines = tableLines.filter(l => !/^\|[-:| ]+\|$/.test(l.trim()));
      if (dataLines.length < 2) return;

      const parseRow = (l: string): string[] =>
        l.split("|").slice(1, -1).map(c => plain(c));

      const headers = parseRow(dataLines[0]);
      const rows = dataLines.slice(1).map(parseRow);
      const cols = headers.length;
      if (cols === 0) return;

      const fontSize = 9;
      const rowH = fontSize + CELL_PAD_Y * 2;

      // Measure each column's natural width
      doc.setFontSize(fontSize);
      const naturalWidths = headers.map((h, i) => {
        const hw = tw(h);
        const dw = rows.reduce((mx, r) => Math.max(mx, tw(r[i] ?? "")), 0);
        return Math.max(hw, dw) + CELL_PAD_X * 2;
      });

      // Scale proportionally so table fits contentW
      const totalNatural = naturalWidths.reduce((a, b) => a + b, 0);
      const scale = totalNatural > contentW ? contentW / totalNatural : 1;
      const colW = naturalWidths.map(w => w * scale);

      ensureSpace(rowH * (rows.length + 1) + 8);
      const tableY = y;

      // Header row — grey background
      doc.setFillColor(230, 230, 230);
      doc.rect(margin, y, contentW, rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      doc.setTextColor(20);
      let cx = margin;
      for (let i = 0; i < cols; i++) {
        doc.text(headers[i], cx + CELL_PAD_X, y + CELL_PAD_Y + fontSize);
        cx += colW[i];
      }
      y += rowH;

      // Data rows
      doc.setFont("helvetica", "normal");
      for (let r = 0; r < rows.length; r++) {
        // Alternate stripe
        if (r % 2 === 0) {
          doc.setFillColor(248, 248, 248);
          doc.rect(margin, y, contentW, rowH, "F");
        }
        cx = margin;
        doc.setTextColor(40);
        for (let i = 0; i < cols; i++) {
          doc.text(rows[r][i] ?? "", cx + CELL_PAD_X, y + CELL_PAD_Y + fontSize);
          cx += colW[i];
        }
        y += rowH;
      }

      // Outer border
      doc.setDrawColor(180);
      doc.setLineWidth(0.5);
      doc.rect(margin, tableY, contentW, y - tableY, "S");

      // Header separator
      doc.setDrawColor(160);
      doc.line(margin, tableY + rowH, margin + contentW, tableY + rowH);

      // Row dividers
      let ry = tableY + rowH;
      for (let r = 0; r < rows.length - 1; r++) {
        ry += rowH;
        doc.setDrawColor(215);
        doc.line(margin, ry, margin + contentW, ry);
      }

      // Column dividers
      cx = margin;
      for (let i = 0; i < cols - 1; i++) {
        cx += colW[i];
        doc.setDrawColor(200);
        doc.line(cx, tableY, cx, y);
      }

      doc.setLineWidth(1);
      y += 10;
    };

    // ---- Document header ----
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(20);
    doc.text("RCinventory — AI Report", margin, y);
    y += 26;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Exported ${formatDate(new Date())}`, margin, y);
    y += 8;

    doc.setDrawColor(180);
    doc.setLineWidth(1);
    doc.line(margin, y, pageW - margin, y);
    y += 18;
    doc.setTextColor(0);

    // ---- Messages ----
    for (const msg of messages) {
      if (!msg.content) continue;
      const isUser = msg.role === "user";

      // Speaker label
      ensureSpace(LINE_H * 2.5);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(isUser ? 30 : 100);
      doc.text(isUser ? "YOU" : "AI ASSISTANT", margin, y);
      y += LINE_H * 0.85;

      doc.setTextColor(isUser ? 30 : 40);

      if (isUser) {
        // User messages: plain wrapped text
        doc.setFont("helvetica", "normal");
        doc.setFontSize(BASE_FONT);
        const wrapped = doc.splitTextToSize(msg.content, contentW) as string[];
        for (const line of wrapped) {
          ensureSpace(LINE_H);
          doc.text(line, margin, y);
          y += LINE_H;
        }
      } else {
        // AI messages: parse markdown line-by-line
        const rawLines = msg.content.split("\n");
        let i = 0;
        while (i < rawLines.length) {
          const line = rawLines[i];

          // Collect table block
          if (line.trimStart().startsWith("|")) {
            const tableLines: string[] = [];
            while (i < rawLines.length && rawLines[i].trimStart().startsWith("|")) {
              tableLines.push(rawLines[i]);
              i++;
            }
            renderTable(tableLines);
            continue;
          }

          // Markdown heading
          const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const text = plain(headingMatch[2]);
            const sz = level === 1 ? 13 : level === 2 ? 11.5 : 10.5;
            ensureSpace(sz * 2.2);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(sz);
            doc.setTextColor(20);
            doc.text(text, margin, y);
            y += sz * 1.7;
            doc.setFont("helvetica", "normal");
            doc.setTextColor(40);
            i++;
            continue;
          }

          // Bullet point
          const bulletMatch = line.match(/^[ \t]*[-*+]\s+(.+)/);
          if (bulletMatch) {
            const text = bulletMatch[1];
            doc.setFontSize(BASE_FONT);
            const wrappedBullet = doc.splitTextToSize(plain(text), contentW - 14) as string[];
            for (let wi = 0; wi < wrappedBullet.length; wi++) {
              ensureSpace(LINE_H);
              if (wi === 0) {
                doc.setFont("helvetica", "normal");
                doc.setTextColor(40);
                doc.text("•", margin + 3, y);
              }
              renderRichLine(wi === 0 ? text : wrappedBullet[wi], margin + 14, y);
              y += LINE_H;
            }
            i++;
            continue;
          }

          // Blank line
          if (line.trim() === "") {
            y += LINE_H * 0.35;
            i++;
            continue;
          }

          // Normal paragraph with inline bold
          doc.setFontSize(BASE_FONT);
          const wrappedNormal = doc.splitTextToSize(plain(line), contentW) as string[];
          for (let wi = 0; wi < wrappedNormal.length; wi++) {
            ensureSpace(LINE_H);
            // For first line, use rich rendering; subsequent wrapped lines are plain
            if (wi === 0) {
              renderRichLine(line, margin, y);
            } else {
              doc.setFont("helvetica", "normal");
              doc.text(wrappedNormal[wi], margin, y);
            }
            y += LINE_H;
          }
          i++;
        }
      }

      y += LINE_H * 0.9;

      // Separator between messages
      if (msg !== messages[messages.length - 1]) {
        doc.setDrawColor(230);
        doc.setLineWidth(0.5);
        doc.line(margin, y, margin + contentW, y);
        doc.setLineWidth(1);
        y += 8;
      }
    }

    doc.save(`rc-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  const assistantMessages = messages.filter((m) => m.role === "assistant" && m.content);

  const callPhaseLabel: Record<CallPhase, string> = {
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };

  const callPhaseColor: Record<CallPhase, string> = {
    listening: "bg-green-500",
    thinking: "bg-yellow-500",
    speaking: "bg-blue-500",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between print-hide">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Reports</h1>
          <p className="text-muted-foreground">Query your inventory data using natural language</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {messages.length > 0 && !isGenerating && !callMode && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={handleClearConversation}
            >
              <Trash2 className="w-4 h-4" />
              Clear conversation
            </Button>
          )}
          {assistantMessages.length > 0 && !isGenerating && !callMode && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExportPdf}
            >
              <Download className="w-4 h-4" />
              Export PDF
            </Button>
          )}
          <Button
            variant={callMode ? "destructive" : "default"}
            size="sm"
            className={`gap-2 ${callMode ? "animate-pulse" : ""}`}
            onClick={callMode ? endCall : startCall}
          >
            {callMode ? (
              <><PhoneOff className="w-4 h-4" /> End Call</>
            ) : (
              <><Phone className="w-4 h-4" /> Start Call</>
            )}
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden" data-print-area>
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 py-12 print-hide">
              <Bot className="w-16 h-16 mb-4" />
              <p>Ask about inventory levels, low stock items, or store data.</p>
              <p className="text-sm">"Which stores are low on Chlorpyrifos?"</p>
              <p className="text-sm mt-2">Or tap <strong>Start Call</strong> to ask hands-free.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  data-print-message
                  className={`flex items-start gap-4 ${
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <div
                    data-print-hide
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {msg.role === "user" ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
                  </div>
                  <div
                    className={`flex flex-col gap-1 max-w-[80%] ${
                      msg.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      data-print-message-user={msg.role === "user" ? true : undefined}
                      data-print-message-assistant={msg.role === "assistant" ? true : undefined}
                      className={`px-4 py-3 rounded-xl whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {msg.content || (
                        <span className="animate-pulse text-muted-foreground">...</span>
                      )}
                    </div>
                    {msg.role === "assistant" && msg.content && !isGenerating && !callMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        data-print-hide
                        className="h-8 text-xs text-muted-foreground print-hide"
                        onClick={() => playResponse(msg.content)}
                      >
                        {isPlaying ? (
                          <><Square className="w-3 h-3 mr-1 fill-current" /> Stop</>
                        ) : (
                          <><Play className="w-3 h-3 mr-1 fill-current" /> Read Aloud</>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input bar — switches to call status when in call mode */}
        <div className="p-4 border-t bg-card print-hide" data-print-input>
          {callMode ? (
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${callPhaseColor[callPhase]} ${callPhase === "listening" ? "animate-pulse" : ""}`} />
              <span className="text-sm font-medium flex-1">{callPhaseLabel[callPhase]}</span>
              {callPhase === "thinking" && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {callPhase === "listening" && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => doneListeningRef.current?.()}
                  title="Tap when done speaking"
                >
                  <MicOff className="w-3.5 h-3.5" />
                  Done Speaking
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={endCall}
              >
                <PhoneOff className="w-3.5 h-3.5" />
                End Call
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">🏪 Store</span>
                  <Select
                    value={selectedStore}
                    onValueChange={setSelectedStore}
                  >
                    <SelectTrigger className="h-7 text-xs w-44">
                      <SelectValue placeholder="All stores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All stores</SelectItem>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)} className="text-xs">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">🔊 AI Voice</span>
                  <Select
                    value={aiVoice}
                    onValueChange={(v) => setAiVoice(v as AIVoice)}
                  >
                    <SelectTrigger className="h-7 text-xs w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(AI_VOICES) as [AIVoice, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={isListening ? "destructive" : "secondary"}
                  size="icon"
                  onClick={handleToggleRecording}
                  disabled={isGenerating}
                  title={isListening ? "Stop recording" : "Speak your query"}
                  className={`shrink-0 ${isListening ? "animate-pulse" : ""}`}
                >
                  {isListening ? (
                    <Square className="w-4 h-4 fill-current" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </Button>

                <Input
                  placeholder="Ask about inventory..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleGenerateReport();
                    }
                  }}
                  disabled={isGenerating}
                  className="bg-background"
                />

                <Button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={!prompt.trim() || isGenerating}
                  className="shrink-0"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
