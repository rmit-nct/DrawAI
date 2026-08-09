import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIGuessResponse } from "@/types";

/**
 * POST /api/guess
 * Body: { imageBase64: string } — base64 PNG of the current canvas
 * Returns: AIGuessResponse
 *
 * Kept server-side so the Gemini API key never reaches the browser.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server" },
      { status: 500 }
    );
  }

  const { imageBase64 } = await req.json();
  if (!imageBase64) {
    return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt =
      "You are playing a Pictionary-style game. Look at this simple line drawing " +
      "and guess what it depicts. Respond ONLY with JSON in this exact shape: " +
      '{"guesses":[{"label":"...","confidence":0.0}]} with up to 3 guesses, ' +
      "confidence between 0 and 1, most likely first. No markdown, no extra text.";

    const result = await model.generateContent([
      prompt,
      { inlineData: { mimeType: "image/png", data: imageBase64 } },
    ]);

    const text = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);

    const response: AIGuessResponse = { guesses: parsed.guesses ?? [], isMock: false };
    return NextResponse.json(response);
  } catch (err) {
    console.error("Gemini guess error:", err);
    return NextResponse.json(
      { error: "AI guess failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
