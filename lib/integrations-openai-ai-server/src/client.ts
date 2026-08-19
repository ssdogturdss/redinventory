import OpenAI from "openai";

// Supports both Replit AI Integrations (AI_INTEGRATIONS_OPENAI_*) and
// standard OpenAI credentials (OPENAI_API_KEY). Outside Replit, set
// OPENAI_API_KEY and optionally OPENAI_BASE_URL for a custom endpoint.
const apiKey =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

const baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
  process.env.OPENAI_BASE_URL ??
  "https://api.openai.com/v1";

if (!apiKey) {
  throw new Error(
    "No OpenAI API key configured. " +
      "Set OPENAI_API_KEY (standard) or AI_INTEGRATIONS_OPENAI_API_KEY (Replit AI Integrations).",
  );
}

export const openai = new OpenAI({ apiKey, baseURL });
