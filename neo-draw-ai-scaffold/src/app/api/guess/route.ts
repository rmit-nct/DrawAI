import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type ResponseSchema } from "@google/generative-ai";
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

// Flash-Lite, not Flash: a rough doodle needs speed, not deliberation, and the
// lite tier has the more generous free quota.
//
// 3.5, not 2.5: as of Aug 2026 Google returns 404 for gemini-2.5-flash-lite on
// newly-created API keys — "no longer available to new users" — and names
// gemini-3.5-flash-lite as the replacement. Existing keys still work, which is
// why the docs still list 2.5 as active.
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// 8s, not 20s. A round is 60s long, and finishRound() waits for this call
// before it can score, so a 20s deadline could leave the end-of-round card
// hanging a third of a round after the clock hit zero.
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~6MB of base64; a canvas PNG is far smaller

/**
 * The exact shape we want back. Handing this to the API as `responseSchema`
 * makes the *service* enforce the structure, instead of us asking for JSON in
 * the prompt and then repairing whatever actually turns up. That is what let us
 * delete the old extractJson() fence-stripper below.
 *
 * Note this guarantees TYPES, not VALUES: the model can still answer
 * `confidence: 85` when we wanted 0.85, or return eight guesses. Clamping that
 * is still normalizeGuesses()' job.
 */
const GUESS_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    guesses: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          label: { type: SchemaType.STRING, description: "A single common noun, e.g. \"cat\"." },
          confidence: { type: SchemaType.NUMBER, description: "Between 0 and 1." },
        },
        required: ["label", "confidence"],
      },
    },
  },
  required: ["guesses"],
};

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

/**
 * Last resort when the SDK hands us no numeric status: recover one from the
 * message text. Anchored to a bracketed "[404 " so that a number living inside
 * a URL, a model name or a token count can never be read as a status code.
 */
function statusFromMessage(message: string): number | null {
  const m = message.match(/\[(\d{3})\s/);
  return m ? Number(m[1]) : null;
}

/**
 * With GUESS_SCHEMA in place the body is already valid JSON, so this is only a
 * guard for the cases the schema cannot cover — a proxy error page, a dropped
 * connection, an SDK-level failure that hands us HTML.
 */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
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

  // Two things can cut this call short: our own deadline, or the player
  // starting another guess (live guessing aborts the previous fetch on every
  // new stroke). Before, only the deadline was wired up — so an abandoned
  // request kept running here, still billed tokens, and still burned one of the
  // 15 requests/minute the free tier allows.
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);

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
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: GUESS_SCHEMA,
        },
      },
      { signal }
    );

    const guesses = normalizeGuesses(parseJson(result.response.text() ?? ""));

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
    // The player already moved on and nothing is listening for this response.
    // Not an error, and definitely not a timeout — return quietly.
    if (req.signal.aborted) {
      return fail("Guess cancelled by a newer request.", 499);
    }

    console.error("Gemini guess error:", err);

    const message = err instanceof Error ? err.message : String(err);

    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return fail("The AI took too long to respond. Try again.", 504);
    }

    /*
     * Classify on the HTTP status the SDK attaches, NOT on words in the message.
     *
     * The previous version tested the message against /quota|rate|429|.../ — and
     * EVERY SDK error message embeds the request URL, which ends in
     * ".../models/<name>:generateContent". "gene(rate)Content" contains the
     * substring "rate", so a 404 "model not found" reported itself to the player
     * as "quota or rate limit reached". We spent a debugging session chasing a
     * quota problem that never existed.
     */
    const status =
      typeof (err as { status?: unknown })?.status === "number"
        ? (err as { status: number }).status
        : statusFromMessage(message);

    if (status === 404) {
      return fail(
        `Gemini has no model named "${MODEL_NAME}" available to this API key. ` +
          `Set GEMINI_MODEL in .env.local to one your key can use — ` +
          `run "node scripts/list-models.mjs" to print the list.`,
        502
      );
    }
    if (status === 401 || status === 403 || (status === 400 && /api[_ ]?key/i.test(message))) {
      return fail("Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.", 502);
    }
    if (status === 429) {
      return fail("Gemini quota or rate limit reached. Try again shortly, or use Mock mode.", 429);
    }
    if (status === 500 || status === 503) {
      return fail("Gemini is temporarily unavailable. Try again in a moment.", 502);
    }

    return fail(`AI guess failed: ${message}`, 502);
  }
}
