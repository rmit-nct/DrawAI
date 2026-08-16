import type { AIGuessResponse } from "@/types";

/**
 * Mock prediction system, used during early development before the
 * real AI integration is wired up (spec explicitly allows/requires this
 * to be documented as a known limitation if the real model isn't finished).
 *
 * Swap callers over to `/api/guess` (Gemini-backed) once that's ready —
 * both return the same AIGuessResponse shape so the UI doesn't change.
 */
const SAMPLE_LABELS = [
  "cat", "dog", "house", "tree", "car", "sun", "star", "flower",
  "fish", "bird", "cloud", "mountain", "boat", "umbrella", "bicycle",
];

export async function getMockGuess(): Promise<AIGuessResponse> {
  // simulate network latency so UI loading states can be tested
  await new Promise((resolve) => setTimeout(resolve, 400));

  const shuffled = [...SAMPLE_LABELS].sort(() => Math.random() - 0.5);
  const guesses = shuffled.slice(0, 3).map((label, i) => ({
    label,
    confidence: Number((0.9 - i * 0.25 - Math.random() * 0.1).toFixed(2)),
  }));

  return { guesses, isMock: true };
}
