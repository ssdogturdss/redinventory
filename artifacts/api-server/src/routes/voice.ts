import { Router, type IRouter } from "express";
import { speechToText, textToSpeechStream, ensureCompatibleFormat } from "@workspace/integrations-openai-ai-server/audio";
import { TranscribeAudioBody, TranscribeAudioResponse, TextToSpeechBody } from "@workspace/api-zod";

const router: IRouter = Router();

// POST /voice/transcribe — STT, returns { text }
// Accepts any browser audio format (webm from Chrome/Firefox, mp4 from Safari).
// ensureCompatibleFormat converts to wav if needed, so Whisper always gets a valid file.
router.post("/voice/transcribe", async (req, res): Promise<void> => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { audio } = parsed.data;
  const rawBuffer = Buffer.from(audio, "base64");
  const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);

  const text = await speechToText(audioBuffer, format);
  res.json(TranscribeAudioResponse.parse({ text }));
});

// POST /voice/speak — TTS SSE stream
// Streams base64 audio chunks as SSE: data: { audio: "<base64>", done: false }
//                                      data: { done: true }
router.post("/voice/speak", async (req, res): Promise<void> => {
  const parsed = TextToSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const { text, voice } = parsed.data;
    const v = (voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer") ?? "alloy";
    const audioStream = await textToSpeechStream(text, v);

    for await (const chunk of audioStream) {
      res.write(`data: ${JSON.stringify({ audio: chunk, done: false })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "TTS error" })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
