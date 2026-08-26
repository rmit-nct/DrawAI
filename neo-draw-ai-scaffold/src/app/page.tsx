"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingCanvas, type DrawingCanvasHandle } from "@/components/canvas/DrawingCanvas";
import { WebcamGestureLayer } from "@/components/webcam/WebcamGestureLayer";
import { AIGuessPanel } from "@/components/ai/AIGuessPanel";
import { Toolbar, BRUSH_COLORS, BRUSH_SIZES } from "@/components/ui/Toolbar";
import { RoundHeader } from "@/components/ui/RoundHeader";
import { RoundOverlay } from "@/components/ui/RoundOverlay";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { fetchAICapability, requestGuess } from "@/lib/ai/guessService";
import { getRandomPrompt, labelMatchesPrompt } from "@/lib/prompts";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "@/lib/canvas/drawing";
import type { AIGuessResponse, AIMode, InputMode, Point, RoundResult } from "@/types";

// 30s, not 60s. Commit 346282a was titled "Reduce Guessing time to 30s" but
// only renamed .env.example -> .env; the timer itself was never changed.
const ROUND_SECONDS = 30;

/* --------------------------------------------------------------------------
 * Live-guess budget
 *
 * The free Gemini tier allows 15 requests/minute and 1,000/day, shared by the
 * whole project — not per player. Live guessing used to fire 1.4s after every
 * single stroke, which is 15-25 calls in one 60s round: enough to blow the
 * per-minute limit on your own, and to burn the daily allowance in about ten
 * rounds across the team.
 *
 * These four rules together bring a round down to ~6 live calls, which leaves
 * room for roughly two and a half rounds per minute.
 * ----------------------------------------------------------------------- */

/** Wait this long after the last stroke before guessing. */
const LIVE_GUESS_DEBOUNCE_MS = 2500;
/** Never fire two live guesses closer together than this, however fast they draw. */
const MIN_MS_BETWEEN_LIVE_GUESSES = 4000;
/** A single extra stroke rarely changes what a drawing looks like. */
const MIN_NEW_STROKES_PER_GUESS = 2;
/** Hard ceiling per round, so one long round cannot drain the daily quota. */
const MAX_LIVE_GUESSES_PER_ROUND = 6;

export default function Home() {
  const canvasHandle = useRef<DrawingCanvasHandle>(null);

  const [inputMode, setInputMode] = useState<InputMode>("mouse");
  const [color, setColor] = useState<string>(BRUSH_COLORS[0].value);
  const [lineWidth, setLineWidth] = useState<number>(BRUSH_SIZES[1].value);

  // Starts null (identical on server + client) and is filled in on mount, so
  // Math.random() never runs during SSR — otherwise the server's pick and the
  // client's differ and React reports a hydration mismatch.
  const [prompt, setPrompt] = useState<string | null>(null);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);

  const [strokeCount, setStrokeCount] = useState(0);
  const [canRedo, setCanRedo] = useState(false);

  const [aiResult, setAiResult] = useState<AIGuessResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>("mock");
  const [geminiAvailable, setGeminiAvailable] = useState(false);
  const [liveGuessing, setLiveGuessing] = useState(true);

  const [cursor, setCursor] = useState<(Point & { pinching: boolean }) | null>(null);

  const inFlight = useRef<AbortController | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live-guess budget state. Refs, not state: these are read inside callbacks
  // and a re-render on every stroke would be pure waste.
  const strokeCountAtLastGuess = useRef(0);
  const lastGuessAt = useRef(0);
  const liveGuessesThisRound = useRef(0);

  // Keep the latest values reachable from callbacks without re-creating them.
  // Mirrored in effects, not during render.
  const promptRef = useRef(prompt);
  const aiModeRef = useRef(aiMode);

  useEffect(() => {
    promptRef.current = prompt;
  }, [prompt]);

  useEffect(() => {
    aiModeRef.current = aiMode;
  }, [aiMode]);

  useEffect(() => {
    // Client-only initialisation on purpose: picking the word during SSR would
    // give the server and the client different values and trip a hydration
    // mismatch, so the first paint renders a placeholder instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrompt(getRandomPrompt());
  }, []);

  // Ask the server once whether a Gemini key is configured. This replaces the
  // old hard-coded `USE_MOCK_AI` constant, which meant switching engines
  // required editing source and redeploying.
  useEffect(() => {
    let cancelled = false;
    fetchAICapability().then(({ configured }) => {
      if (cancelled) return;
      setGeminiAvailable(configured);
      if (configured) setAiMode("gemini");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ------------------------------------------------------------ AI guess ---

  /**
   * Should this live guess be allowed to fire?
   *
   * Only live guessing is metered. Pressing "Guess now" and the end-of-round
   * scoring call both go straight to runGuess() and bypass this — the player
   * asked for one, and the round has to be scored even if the budget is spent.
   *
   * Mock mode costs nothing, so it is not metered either.
   *
   * Returns null when the guess may proceed, or a short reason why it was
   * skipped (handy if you want to log it while tuning the numbers).
   */
  const liveGuessBlockedReason = useCallback((strokeCount: number): string | null => {
    if (aiModeRef.current !== "gemini") return null;
    if (liveGuessesThisRound.current >= MAX_LIVE_GUESSES_PER_ROUND) return "round budget spent";
    if (strokeCount - strokeCountAtLastGuess.current < MIN_NEW_STROKES_PER_GUESS) {
      return "not enough new strokes";
    }
    if (Date.now() - lastGuessAt.current < MIN_MS_BETWEEN_LIVE_GUESSES) {
      return "too soon after the last guess";
    }
    return null;
  }, []);

  const runGuess = useCallback(async (): Promise<AIGuessResponse | null> => {
    const strokes = canvasHandle.current?.getStrokes() ?? [];
    if (strokes.length === 0) return null;

    // Record what we are about to ask about, BEFORE awaiting. If we waited for
    // the response instead, two quick strokes would both pass the gate while
    // the first request was still open.
    strokeCountAtLastGuess.current = strokes.length;
    lastGuessAt.current = Date.now();

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setAiLoading(true);
    try {
      const result = await requestGuess({
        mode: aiModeRef.current,
        strokes,
        prompt: promptRef.current,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      setAiResult(result);
      return result;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return null;
      // Never let a rejected promise leave the panel stuck on "Thinking…".
      const message = err instanceof Error ? err.message : String(err);
      setAiResult({ guesses: [], isMock: aiModeRef.current === "mock", error: message });
      return null;
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setAiLoading(false);
      }
    }
  }, []);

  // ----------------------------------------------------------- round flow ---

  const finishRound = useCallback(async () => {
    const currentPrompt = promptRef.current;

    // Show the card the instant the clock stops. The scoring call below can
    // take a few seconds, and waiting for it before rendering anything made a
    // slow response look like a frozen game.
    setRoundResult({
      prompt: currentPrompt ?? "",
      guessed: false,
      matchedLabel: null,
      pointsAwarded: 0,
      reason: "time-up",
      pending: true,
    });

    const result = await runGuess();

    const match =
      currentPrompt && result
        ? (result.guesses.find((g) => labelMatchesPrompt(g.label, currentPrompt)) ?? null)
        : null;

    // Rank matters: getting it as the top guess is worth more than third.
    const rank = match && result ? result.guesses.indexOf(match) : -1;
    const points = match ? Math.max(20, 100 - rank * 25) : 0;

    if (points > 0) setScore((s) => s + points);
    setRoundResult({
      prompt: currentPrompt ?? "",
      guessed: Boolean(match),
      matchedLabel: match?.label ?? null,
      pointsAwarded: points,
      reason: match ? "guessed" : "time-up",
    });
  }, [runGuess]);

  const { secondsLeft, restart, pause } = useCountdownTimer(ROUND_SECONDS, {
    autoStart: true, // the first round used to sit frozen at 01:00 until you pressed New Round
    onExpire: finishRound,
  });

  const newRound = useCallback(() => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    inFlight.current?.abort();
    inFlight.current = null;

    canvasHandle.current?.clear();
    setPrompt((prev) => getRandomPrompt(prev));
    setAiResult(null);
    setAiLoading(false);
    setRoundResult(null);
    setStrokeCount(0);
    setCanRedo(false);
    setRound((r) => r + 1);

    // Fresh budget for the new round.
    strokeCountAtLastGuess.current = 0;
    lastGuessAt.current = 0;
    liveGuessesThisRound.current = 0;
    restart(ROUND_SECONDS);
  }, [restart]);

  const keepDrawing = useCallback(() => {
    setRoundResult(null);
    pause();
  }, [pause]);

  // ------------------------------------------------------- live guessing ---

  const handleStrokesChange = useCallback(
    (count: number) => {
      setStrokeCount(count);
      setCanRedo(Boolean(canvasHandle.current) && count >= 0);

      if (!liveGuessing || count === 0 || roundResult) return;
      if (liveTimer.current) clearTimeout(liveTimer.current);

      // Debounce first, then check the budget when the timer actually fires —
      // not now. Between arming and firing the player may have drawn more, or
      // another guess may have gone out, so a decision made here would be
      // 2.5 seconds stale by the time it mattered.
      liveTimer.current = setTimeout(() => {
        const strokesNow = canvasHandle.current?.getStrokes().length ?? 0;
        if (liveGuessBlockedReason(strokesNow) !== null) return;
        liveGuessesThisRound.current += 1;
        void runGuess();
      }, LIVE_GUESS_DEBOUNCE_MS);
    },
    [liveGuessing, roundResult, runGuess, liveGuessBlockedReason]
  );

  useEffect(() => {
    return () => {
      if (liveTimer.current) clearTimeout(liveTimer.current);
      inFlight.current?.abort();
    };
  }, []);

  // Keyboard shortcuts — undo/redo are muscle memory in any drawing tool.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) canvasHandle.current?.redo();
        else canvasHandle.current?.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const roundOver = roundResult !== null;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <RoundHeader
        prompt={prompt}
        secondsLeft={secondsLeft}
        totalSeconds={ROUND_SECONDS}
        score={score}
        round={round}
        isRoundOver={roundOver}
        onNewRound={newRound}
      />

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:gap-6">
        {/* Canvas column. The toolbar spans the column so it stays on one row;
            the canvas is capped and centred beneath it, because a 4:3 surface
            at full column width would otherwise grow taller than the space left
            under the header and push the game below the fold. */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Toolbar
            inputMode={inputMode}
            onInputModeChange={setInputMode}
            color={color}
            onColorChange={setColor}
            lineWidth={lineWidth}
            onLineWidthChange={setLineWidth}
            onUndo={() => canvasHandle.current?.undo()}
            onRedo={() => canvasHandle.current?.redo()}
            onClear={() => canvasHandle.current?.clear()}
            canUndo={strokeCount > 0}
            canRedo={canRedo}
            disabled={roundOver}
          />

          <div
            className="mx-auto flex w-full flex-col gap-3"
            style={{ maxWidth: "min(100%, calc((100dvh - 21rem) * 4 / 3))" }}
          >
            <DrawingCanvas
              ref={canvasHandle}
              color={color}
              lineWidth={lineWidth}
              disabled={roundOver}
              onStrokesChange={handleStrokesChange}
            >
            {/* Fingertip cursor, drawn in canvas space so it lines up exactly. */}
            {inputMode === "webcam" && cursor && !roundOver && (
              <span
                aria-hidden
                className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-[width,height] duration-100"
                style={{
                  left: `${(cursor.x / LOGICAL_WIDTH) * 100}%`,
                  top: `${(cursor.y / LOGICAL_HEIGHT) * 100}%`,
                  width: cursor.pinching ? 18 : 30,
                  height: cursor.pinching ? 18 : 30,
                  borderColor: cursor.pinching ? "#F8B73A" : "#5095AA",
                  backgroundColor: cursor.pinching ? "rgba(248,183,58,0.35)" : "transparent",
                }}
              />
            )}

              <RoundOverlay
                result={roundResult}
                onNewRound={newRound}
                onKeepDrawing={keepDrawing}
              />
            </DrawingCanvas>

            <p className="text-xs leading-relaxed text-nct-muted">
              {inputMode === "webcam"
                ? "Pinch your thumb and index finger together to put the pen down, and move your hand to draw. Release to lift the pen."
                : "Click or tap and drag to draw. ⌘/Ctrl+Z undoes, ⇧⌘/Ctrl+Z redoes."}
            </p>
          </div>
        </div>

        {/* Side column */}
        <div className="flex w-full flex-col gap-4 lg:w-80 lg:shrink-0">
          <AIGuessPanel
            result={aiResult}
            loading={aiLoading}
            mode={aiMode}
            geminiAvailable={geminiAvailable}
            onModeChange={setAiMode}
            prompt={prompt}
            liveGuessing={liveGuessing}
            onLiveGuessingChange={setLiveGuessing}
            onGuessNow={() => void runGuess()}
            canGuess={strokeCount > 0 && !roundOver}
          />

          {inputMode === "webcam" ? (
            <WebcamGestureLayer
              enabled
              canvasHandle={canvasHandle}
              onCursorChange={setCursor}
              paused={roundOver}
            />
          ) : (
            <section className="nct-panel hidden p-4 lg:block">
              <h2 className="nct-label !text-nct-steel-light">How to play</h2>
              <ol className="mt-3 space-y-2.5 text-xs leading-relaxed text-nct-muted">
                <li>
                  <span className="font-bold text-nct-ink">1.</span> Draw the word at the top before
                  the timer runs out.
                </li>
                <li>
                  <span className="font-bold text-nct-ink">2.</span> The AI guesses as you go — get
                  it as the top guess for the most points.
                </li>
                <li>
                  <span className="font-bold text-nct-ink">3.</span> Switch to{" "}
                  <button
                    onClick={() => setInputMode("webcam")}
                    className="nct-focus font-bold text-nct-amber underline underline-offset-2"
                  >
                    Webcam
                  </button>{" "}
                  to draw in the air with a pinch gesture.
                </li>
              </ol>
            </section>
          )}
        </div>
      </main>

      <footer className="relative z-10 border-t border-nct-steel/15 px-4 py-3 sm:px-6">
        <p className="mx-auto max-w-[1400px] text-[0.7rem] text-nct-muted">
          NEO DrawAI — a Neo Culture Tech project. Drawing, gesture tracking and AI guessing run in
          your browser and on Next.js API routes; your camera feed never leaves this device.
        </p>
      </footer>
    </div>
  );
}
