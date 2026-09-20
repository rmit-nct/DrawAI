"use client";

import { X } from "@phosphor-icons/react";
import { AIConvincedCard } from "@/components/ai/AIConvincedCard";
import { GuessHistoryStrip } from "@/components/ai/GuessHistoryStrip";
import { findWinningEntry } from "@/lib/ai/guessHistory";
import type { RoundSummary } from "@/types";

interface RoundReviewOverlayProps {
  summary: RoundSummary;
  onClose: () => void;
}

/**
 * Full-screen detail for one round from the game-over results grid: the
 * drawing that convinced the AI (if it guessed right) plus the full replay
 * strip. Rendered at the page root, not inside the canvas, so it's fixed
 * rather than absolute.
 */
export function RoundReviewOverlay({ summary, onClose }: RoundReviewOverlayProps) {
  const winning = summary.guessed ? findWinningEntry(summary.guessHistory, summary.prompt) : null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-nct-900/90 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="nct-rise w-full max-w-lg rounded-2xl border border-nct-steel/40 bg-nct-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="nct-label">Round {summary.round}</p>
            <p className="mt-1 text-lg font-black capitalize text-nct-ink">
              {summary.prompt}{" "}
              <span className={summary.guessed ? "text-nct-success" : "text-nct-danger"}>
                {summary.guessed ? `+${summary.pointsAwarded} pts` : "not guessed"}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="nct-focus shrink-0 rounded-full p-1 text-nct-muted transition hover:bg-nct-700 hover:text-nct-ink"
            aria-label="Close"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {winning && summary.matchedLabel && (
          <div className="mt-4">
            <AIConvincedCard
              snapshot={winning.entry.snapshot}
              confidence={winning.confidence}
              label={summary.matchedLabel}
              bounds={winning.entry.newStrokeBounds}
            />
          </div>
        )}

        {summary.guessHistory.length > 0 ? (
          <GuessHistoryStrip history={summary.guessHistory} highlightId={winning?.entry.id ?? null} />
        ) : (
          <p className="mt-4 text-sm text-nct-muted">
            The AI never made a confident guess on this drawing.
          </p>
        )}
      </div>
    </div>
  );
}
