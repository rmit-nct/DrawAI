"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingCanvas, type DrawingCanvasHandle } from "@/components/canvas/DrawingCanvas";
import { WebcamGestureLayer } from "@/components/webcam/WebcamGestureLayer";
import { AIGuessPanel } from "@/components/ai/AIGuessPanel";
import { Toolbar } from "@/components/ui/Toolbar";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { getMockGuess } from "@/lib/ai/mockGuesser";
import { getRandomPrompt } from "@/lib/prompts";
import type { AIGuessResponse, InputMode } from "@/types";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const ROUND_SECONDS = 60;

// Flip to `false` once the real Gemini endpoint is validated end-to-end.
// Kept as a single switch so grading/demo can show both paths easily,
// matching the spec's requirement to document AI limitations clearly.
const USE_MOCK_AI = true;

export default function Home() {
  const canvasHandle = useRef<DrawingCanvasHandle>(null);
  const [inputMode, setInputMode] = useState<InputMode>("mouse");
  // Starts null (same on server + client) and is filled in on mount so
  // Math.random() never runs during SSR — avoids a hydration mismatch,
  // since the server's random pick would differ from the client's.
  const [prompt, setPrompt] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIGuessResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setPrompt(getRandomPrompt());
  }, []);

  const { secondsLeft, start, reset } = useCountdownTimer(ROUND_SECONDS, () => {
    // round over — could trigger a final AI guess / reveal here
  });

  const runAIGuess = useCallback(async () => {
    setAiLoading(true);
    try {
      if (USE_MOCK_AI) {
        setAiResult(await getMockGuess());
      } else {
        const base64 = canvasHandle.current?.exportBase64();
        if (!base64) return;
        const res = await fetch("/api/guess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64 }),
        });
        setAiResult(await res.json());
      }
    } finally {
      setAiLoading(false);
    }
  }, []);

  const newRound = useCallback(() => {
    canvasHandle.current?.clear();
    setPrompt(getRandomPrompt());
    setAiResult(null);
    reset(ROUND_SECONDS);
    start();
  }, [reset, start]);

  return (
    <main className="flex min-h-screen flex-col items-center gap-4 bg-neutral-50 p-6">
      <h1 className="text-2xl font-bold text-neutral-800">NEO DrawAI</h1>

      <div className="flex items-center gap-3">
        <p className="text-neutral-600">
          Draw: <span className="font-semibold capitalize">{prompt ?? "…"}</span>
        </p>
        <button
          onClick={newRound}
          className="rounded-md bg-neutral-900 px-3 py-1 text-sm text-white hover:bg-neutral-700"
        >
          New Round
        </button>
      </div>

      <Toolbar
        inputMode={inputMode}
        onInputModeChange={setInputMode}
        onUndo={() => canvasHandle.current?.undo()}
        onClear={() => canvasHandle.current?.clear()}
        secondsLeft={secondsLeft}
      />

      <div className="flex flex-col items-start gap-4 md:flex-row">
        <DrawingCanvas ref={canvasHandle} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
        <AIGuessPanel result={aiResult} loading={aiLoading} />
      </div>

      {inputMode === "webcam" && (
        <WebcamGestureLayer
          enabled
          canvasHandle={canvasHandle}
          canvasWidth={CANVAS_WIDTH}
          canvasHeight={CANVAS_HEIGHT}
        />
      )}

      <button
        onClick={runAIGuess}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500"
      >
        Ask AI to Guess
      </button>
    </main>
  );
}
