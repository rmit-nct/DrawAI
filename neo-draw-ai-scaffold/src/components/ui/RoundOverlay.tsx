"use client";

import type { RoundResult } from "@/types";

interface RoundOverlayProps {
  result: RoundResult | null;
  onNewRound: () => void;
  onKeepDrawing: () => void;
}

/** End-of-round card, shown over the canvas when the clock runs out. */
export function RoundOverlay({ result, onNewRound, onKeepDrawing }: RoundOverlayProps) {
  if (!result) return null;

  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-nct-900/85 p-4 backdrop-blur-sm">
      <div className="nct-rise w-full max-w-sm rounded-2xl border border-nct-steel/40 bg-nct-800 p-6 text-center shadow-2xl">
        {/* The clock has already stopped, but the final guess may still be in
            flight. Show the card straight away rather than making the player
            stare at a live canvas that no longer accepts strokes. */}
        {result.pending ? (
          <>
            <p className="nct-label">Time&apos;s up</p>
            <p className="mt-3 text-2xl font-black tracking-tight text-nct-ink">
              Checking your drawing&hellip;
            </p>
            <div className="mt-4 flex justify-center gap-1.5" aria-live="polite">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-2 w-2 animate-pulse rounded-full bg-nct-steel"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="nct-label">{result.guessed ? "Nice drawing" : "Time's up"}</p>

            <p className="mt-3 text-2xl font-black tracking-tight text-nct-ink">
              {result.guessed ? (
                <>
                  The AI guessed{" "}
                  <span className="text-nct-success capitalize">{result.matchedLabel}</span>
                </>
              ) : (
                <>
                  The AI didn&apos;t get <span className="text-nct-amber capitalize">{result.prompt}</span>
                </>
              )}
            </p>

            <p className="mt-2 text-sm text-nct-muted">
              {result.guessed
                ? `+${result.pointsAwarded} points`
                : "No points this round — try bolder, simpler shapes."}
            </p>

            <div className="mt-6 flex gap-2">
              <button
                onClick={onKeepDrawing}
                className="nct-focus flex-1 rounded-xl border border-nct-steel/40 px-4 py-2.5 text-sm font-bold text-nct-ink transition hover:bg-nct-700"
              >
                Keep drawing
              </button>
              <button
                onClick={onNewRound}
                className="nct-focus flex-1 rounded-xl bg-nct-amber px-4 py-2.5 text-sm font-black uppercase tracking-wide text-nct-900 transition hover:bg-nct-amber-light"
              >
                New round
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
