import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIGuessResponse, AIGuessResult } from "@/types";

/**
 * AI guessing endpoint. Runs server-side only, so GEMINI_API_KEY never reaches
 * the browser (project spec: secrets go in .env, never in client code).
 *
 *   GET  /api/guess  -> { configured: boolean, model: string }
 *                       Lets the client decide at runtime whether the real
 *                       model is available, instead of the old hard-coded
 *                       USE_MOCK_AI constant that required a code edit.
 *   POST /api/guess  -> AIGuessResponse
 *                       Body: { imageBase64: string, prompt?: string }
 *
 * Every failure path returns a well-formed AIGuessResponse with `guesses: []`
 * and an `error` string. The previous version returned a bare `{ error }`
 * object, which the client then rendered — `result.guesses.map` on `undefined`
 * threw and took the whole page down with it.
 */

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~6MB of base64; a canvas PNG is far smaller

export async function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    model: MODEL_NAME,
  });
}

function fail(error: string, status: number) {
  const body: AIGuessResponse = { guesses: [], isMock: false, error };
  return NextResponse.json(body, { status });
}

/** Pull the JSON object out of a response that may be wrapped in prose or fences. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/** Never trust the model's shape — coerce and clamp before it reaches the UI. */
function normalizeGuesses(parsed: unknown): AIGuessResult[] {
  const raw =
    parsed && typeof parsed === "object" && Array.isArray((parsed as { guesses?: unknown }).guesses)
      ? ((parsed as { guesses: unknown[] }).guesses)
      : [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const { label, confidence } = item as { label?: unknown; confidence?: unknown };
      if (typeof label !== "string" || label.trim() === "") return null;
      const numeric = typeof confidence === "number" && Number.isFinite(confidence) ? confidence : 0;
      return {
        label: label.trim().slice(0, 40),
        // Models sometimes answer 85 instead of 0.85.
        confidence: Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric)),
      };
    })
    .filter((g): g is AIGuessResult => g !== null)
    .slice(0, 3);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // 503, not 500: the server is fine, the feature just isn't configured.
    // The client reads this and falls back to the mock guesser.
    return fail(
      "GEMINI_API_KEY is not set on the server. Add it to .env.local (see .env.example) and restart the dev server, or use Mock mode.",
      503
    );
  }

  let imageBase64: unknown;
  let promptWord: unknown;
  try {
    ({ imageBase64, prompt: promptWord } = await req.json());
  } catch {
    return fail("Request body must be valid JSON.", 400);
  }

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return fail("imageBase64 is required.", 400);
  }
  if (imageBase64.length > MAX_IMAGE_BYTES) {
    return fail("Drawing image is too large.", 413);
  }

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const instruction = [
      "You are the guesser in a Pictionary-style game.",
      "The image is a rough black-on-white doodle drawn in a few seconds with a mouse or a finger in the air.",
      "Guess what the player is drawing. Be decisive and use single common nouns.",
      typeof promptWord === "string" && promptWord
        ? "Do not assume any particular answer; judge only from the drawing."
        : "",
      'Respond ONLY with JSON of this exact shape: {"guesses":[{"label":"cat","confidence":0.82}]}',
      "Give up to 3 guesses, most likely first, confidence between 0 and 1.",
      "If the canvas is essentially empty, return an empty guesses array.",
      "No markdown, no code fences, no commentary.",
    ]
      .filter(Boolean)
      .join(" ");

    const result = await model.generateContent(
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: instruction },
              { inlineData: { mimeType: "image/png", data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      },
      { signal: timeout }
    );

    const guesses = normalizeGuesses(extractJson(result.response.text() ?? ""));

    if (guesses.length === 0) {
      const body: AIGuessResponse = {
        guesses: [],
        isMock: false,
        error: "The model could not make out the drawing. Add a few more strokes and try again.",
      };
      return NextResponse.json(body);
    }

    const body: AIGuessResponse = { guesses, isMock: false };
    return NextResponse.json(body);
  } catch (err) {
    console.error("Gemini guess error:", err);

    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return fail("The AI took too long to respond. Try again.", 504);
    }
    if (/api[_ ]?key|permission|unauthenticated|401|403/i.test(message)) {
      return fail("Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.", 502);
    }
    if (/quota|rate|429|resource[_ ]?exhausted/i.test(message)) {
      return fail("Gemini quota or rate limit reached. Try again shortly, or use Mock mode.", 429);
    }
    return fail(`AI guess failed: ${message}`, 502);
  }
}
