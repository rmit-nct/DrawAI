"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DrawingCanvas, type DrawingCanvasHandle } from "@/components/canvas/DrawingCanvas";
import { WebcamGestureLayer, GESTURE_EMOJI } from "@/components/webcam/WebcamGestureLayer";
import { GuessReveal } from "@/components/ai/GuessReveal";
import { Toolbar, BRUSH_COLORS, BRUSH_SIZES } from "@/components/ui/Toolbar";
import { RoundHeader } from "@/components/ui/RoundHeader";
import { RoundOverlay } from "@/components/ui/RoundOverlay";
import { RoundTransitionWipe } from "@/components/ui/RoundTransitionWipe";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useGameAudio } from "@/hooks/useGameAudio";
import { fetchAICapability, requestGuess } from "@/lib/ai/guessService";
import { getRandomPrompt, labelMatchesPrompt } from "@/lib/prompts";
import type { AIGuessResponse, AIMode, InputMode, RoundResult } from "@/types";

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

const LIVE_GUESS_DEBOUNCE_MS = 2500;
const MIN_MS_BETWEEN_LIVE_GUESSES = 4000;
const MIN_NEW_STROKES_PER_GUESS = 2;
const MAX_LIVE_GUESSES_PER_ROUND = 6;
const TICKING_START_SECONDS = 8;

export default function Home() {
  const canvasHandle = useRef<DrawingCanvasHandle>(null);
  const { muted, toggleMuted, playNewRound, startTicking, stopTicking } = useGameAudio();
  // Shared between the canvas's webcam-background layer and the gesture
  // tracker so both render/read the exact same MediaStream, not two cameras.
  const webcamVideoRef = useRef<HTMLVideoElement>(null);

  const [inputMode, setInputMode] = useState<InputMode>("mouse");
  const [color, setColor] = useState<string>(BRUSH_COLORS[0].value);
  const [lineWidth, setLineWidth] = useState<number>(BRUSH_SIZES[1].value);

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
  const [liveBudgetSpent, setLiveBudgetSpent] = useState(false);


  const inFlight = useRef<AbortController | null>(null);
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const strokeCountAtLastGuess = useRef(0);
  const lastGuessAt = useRef(0);
  const liveGuessesThisRound = useRef(0);
  const roundEndedRef = useRef(false);
  const pauseRef = useRef<() => void>(() => {});
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

  /**
   * Applies the outcome of a guess result to score + roundResult. Guarded so
   * it only ever fires once per round — see roundEndedRef above.
   */
  const completeRound = useCallback(
    (result: AIGuessResponse | null, fallbackReason: "time-up" | "guessed" = "time-up") => {
      if (roundEndedRef.current) return;
      roundEndedRef.current = true;

      const currentPrompt = promptRef.current;
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
        reason: match ? "guessed" : fallbackReason,
      });
    },
    []
  );

  const runGuess = useCallback(async (): Promise<AIGuessResponse | null> => {
    const strokes = canvasHandle.current?.getStrokes() ?? [];
    if (strokes.length === 0) return null;

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

      // A correct guess ends the round right away instead of waiting for the
      // timer to hit 0 — this fires for both live guesses and "Guess now".
      if (!roundEndedRef.current && promptRef.current) {
        const match = result.guesses.find((g) => labelMatchesPrompt(g.label, promptRef.current!));
        if (match) {
          if (liveTimer.current) clearTimeout(liveTimer.current);
          stopTicking();
          pauseRef.current();
          completeRound(result, "guessed");
        }
      }

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
  }, [completeRound, stopTicking]);

  // ----------------------------------------------------------- round flow ---

  const finishRound = useCallback(async () => {
    const currentPrompt = promptRef.current;

    setRoundResult({
      prompt: currentPrompt ?? "",
      guessed: false,
      matchedLabel: null,
      pointsAwarded: 0,
      reason: "time-up",
      pending: true,
    });

    const result = await runGuess();
    // No-op if runGuess already ended the round early via a correct guess.
    completeRound(result, "time-up");
  }, [runGuess, completeRound]);

  const { secondsLeft, restart, pause } = useCountdownTimer(ROUND_SECONDS, {
    autoStart: true, // the first round used to sit frozen at 01:00 until you pressed New Round
    onExpire: finishRound,
  });

  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  const newRound = useCallback(() => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    inFlight.current?.abort();
    inFlight.current = null;

    playNewRound();
    stopTicking();
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
    roundEndedRef.current = false;
    setLiveBudgetSpent(false);
    restart(ROUND_SECONDS);
  }, [restart, playNewRound, stopTicking]);

  const cycleColor = useCallback(() => {
    setColor((prev) => {
      const index = BRUSH_COLORS.findIndex((c) => c.value === prev);
      return BRUSH_COLORS[(index + 1) % BRUSH_COLORS.length].value;
    });
  }, []);

  const cycleBrushSize = useCallback(() => {
    setLineWidth((prev) => {
      const index = BRUSH_SIZES.findIndex((s) => s.value === prev);
      return BRUSH_SIZES[(index + 1) % BRUSH_SIZES.length].value;
    });
  }, []);

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

      liveTimer.current = setTimeout(() => {
        const strokesNow = canvasHandle.current?.getStrokes().length ?? 0;
        if (liveGuessBlockedReason(strokesNow) !== null) return;
        liveGuessesThisRound.current += 1;
        if (liveGuessesThisRound.current >= MAX_LIVE_GUESSES_PER_ROUND) setLiveBudgetSpent(true);
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

  useEffect(() => {
    if (secondsLeft === TICKING_START_SECONDS && !roundOver) startTicking();
  }, [secondsLeft, roundOver, startTicking]);

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
        muted={muted}
        onToggleMuted={toggleMuted}
      />

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:gap-6">
        <div className="flex w-full flex-col gap-4 lg:order-2 lg:w-80 lg:shrink-0">
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

          {inputMode === "webcam" ? (
            <WebcamGestureLayer
              enabled
              canvasHandle={canvasHandle}
              paused={roundOver}
              videoRef={webcamVideoRef}
              onUndo={() => canvasHandle.current?.undo()}
              onClear={() => canvasHandle.current?.clear()}
              onCycleColor={cycleColor}
              onCycleBrushSize={cycleBrushSize}
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
                  — your camera feed shows right on the canvas. {GESTURE_EMOJI.pinch}{" "}
                  <span className="font-bold text-nct-ink">Pinch</span> your thumb and index finger
                  to draw in the air.
                </li>
                <li>
                  <span className="font-bold text-nct-ink">4.</span> In Webcam mode, hold a shape for
                  a moment to fire it: {GESTURE_EMOJI.fist}{" "}
                  <span className="font-bold text-nct-ink">fist</span> undoes, {GESTURE_EMOJI.openPalm}{" "}
                  <span className="font-bold text-nct-ink">open palm</span> clears,{" "}
                  {GESTURE_EMOJI.peace} <span className="font-bold text-nct-ink">peace sign</span>{" "}
                  changes colour, and {GESTURE_EMOJI.thumbsUp}{" "}
                  <span className="font-bold text-nct-ink">thumbs up</span> changes brush size.
                </li>
              </ol>
            </section>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 lg:order-1">
          <div
            className="mx-auto flex w-full flex-col gap-3"
            style={{ maxWidth: "min(100%, calc((100dvh - 15rem) * 4 / 3))" }}
          >
            <DrawingCanvas
              ref={canvasHandle}
              color={color}
              lineWidth={lineWidth}
              disabled={roundOver}
              onStrokesChange={handleStrokesChange}
              showWebcamBackground={inputMode === "webcam"}
              videoRef={webcamVideoRef}
              // Webcam mode: the hand gesture is the sole stroke driver, so a
              // stray mouse move over the canvas can't also draw.
              pointerInputEnabled={inputMode !== "webcam"}
            >
              <RoundTransitionWipe key={round} />

              <RoundOverlay
                result={roundResult}
                onNewRound={newRound}
                onKeepDrawing={keepDrawing}
              />
            </DrawingCanvas>
          </div>

          <GuessReveal
            result={aiResult}
            loading={aiLoading}
            mode={aiMode}
            geminiAvailable={geminiAvailable}
            onModeChange={setAiMode}
            prompt={prompt}
            liveGuessing={liveGuessing}
            onLiveGuessingChange={setLiveGuessing}
            liveBudgetSpent={liveBudgetSpent && aiMode === "gemini"}
            onGuessNow={() => void runGuess()}
            canGuess={strokeCount > 0 && !roundOver}
          />
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
