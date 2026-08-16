"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingCanvas, type DrawingCanvasHandle } from "@/components/canvas/DrawingCanvas";
import { WebcamGestureLayer } from "@/components/webcam/WebcamGestureLayer";
import { AIGuessPanel } from "@/components/ai/AIGuessPanel";
import { TopBar } from "@/components/ui/TopBar";
import { Sidebar } from "@/components/ui/Sidebar";
import { ModeSwitch } from "@/components/ui/ModeSwitch";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { getMockGuess } from "@/lib/ai/mockGuesser";
import { getRandomPrompt } from "@/lib/prompts";
import type { AIGuessResponse, BrushSize, DrawTool, InputMode } from "@/types";

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const ROUND_SECONDS = 60;

// Pen/eraser widths per brush-size step. Eraser is scaled up from the pen
// width (matches the old hardcoded 4px pen / 24px eraser ratio) since it
// needs to cover more area to feel usable, especially with imprecise
// webcam-pinch input.
const BRUSH_SIZE_PX: Record<BrushSize, { line: number; eraser: number }> = {
  thin: { line: 2, eraser: 16 },
  medium: { line: 5, eraser: 28 },
  thick: { line: 10, eraser: 44 },
};

// Flip to `false` once the real Gemini endpoint is validated end-to-end.
// Kept as a single switch so grading/demo can show both paths easily,
// matching the spec's requirement to document AI limitations clearly.
const USE_MOCK_AI = true;

export default function Home() {
  const canvasHandle = useRef<DrawingCanvasHandle>(null);
  const [inputMode, setInputMode] = useState<InputMode>("draw");
  const [tool, setTool] = useState<DrawTool>("pen");
  const [brushSize, setBrushSize] = useState<BrushSize>("medium");
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
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

  const downloadDrawing = useCallback(() => {
    const base64 = canvasHandle.current?.exportBase64();
    if (!base64) return;
    const link = document.createElement("a");
    link.href = `data:image/png;base64,${base64}`;
    link.download = `neo-drawai-${(prompt ?? "drawing").toLowerCase()}.png`;
    link.click();
  }, [prompt]);

  // Standard undo/redo shortcuts, mirroring the sidebar buttons.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        canvasHandle.current?.redo();
      } else if (key === "z") {
        e.preventDefault();
        canvasHandle.current?.undo();
      } else if (key === "y") {
        e.preventDefault();
        canvasHandle.current?.redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="relative grid min-h-screen grid-rows-[64px_1fr] overflow-hidden bg-nct-gold-tint">
      {/* Decorative paint-splash backdrop — purely visual, sits behind all
          interactive content so it never intercepts clicks or gets exported. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 8% 12%, var(--color-nct-teal-light) 0%, transparent 22%), " +
            "radial-gradient(circle at 95% 8%, var(--color-nct-gold) 0%, transparent 18%), " +
            "radial-gradient(circle at 90% 92%, var(--color-nct-teal) 0%, transparent 20%), " +
            "radial-gradient(circle at 4% 90%, var(--color-nct-gold-light) 0%, transparent 16%)",
          filter: "blur(40px)",
        }}
      />

      <TopBar prompt={prompt} secondsLeft={secondsLeft} onNewRound={newRound} />

      <div className="relative z-10 grid grid-cols-1 gap-4 p-4 sm:grid-cols-[72px_1fr_320px]">
        <Sidebar
          tool={tool}
          onToolChange={setTool}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          onUndo={() => canvasHandle.current?.undo()}
          onRedo={() => canvasHandle.current?.redo()}
          onClear={() => canvasHandle.current?.clear()}
          onDownload={downloadDrawing}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          className="order-3 sm:order-1"
        />

        <section className="order-1 flex flex-col items-center gap-3 sm:order-2">
          <ModeSwitch
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            className="w-full max-w-[800px]"
          />

          <DrawingCanvas
            ref={canvasHandle}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            tool={tool}
            lineWidth={BRUSH_SIZE_PX[brushSize].line}
            eraserWidth={BRUSH_SIZE_PX[brushSize].eraser}
            onHistoryChange={setHistory}
          />

          {inputMode === "webcam" && (
            <WebcamGestureLayer
              enabled
              canvasHandle={canvasHandle}
              canvasWidth={CANVAS_WIDTH}
              canvasHeight={CANVAS_HEIGHT}
            />
          )}

          <Button
            onClick={runAIGuess}
            disabled={aiLoading}
            aria-busy={aiLoading}
            className="font-heading h-11 gap-2 px-4"
          >
            <Wand2 className="size-4" />
            {aiLoading ? "Thinking…" : "Ask AI to Guess"}
          </Button>
        </section>

        <AIGuessPanel
          result={aiResult}
          loading={aiLoading}
          className="order-2 w-full sm:order-3 sm:w-auto"
        />
      </div>
    </div>
  );
}
