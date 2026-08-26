"use client";

import type { AIGuessResponse, AIMode } from "@/types";
import { labelMatchesPrompt } from "@/lib/prompts";

interface AIGuessPanelProps {
  result: AIGuessResponse | null;
  loading: boolean;
  mode: AIMode;
  geminiAvailable: boolean;
  onModeChange: (mode: AIMode) => void;
  prompt: string | null;
  liveGuessing: boolean;
  onLiveGuessingChange: (enabled: boolean) => void;
  onGuessNow: () => void;
  canGuess: boolean;
}

export function AIGuessPanel({
  result,
  loading,
  mode,
  geminiAvailable,
  onModeChange,
  prompt,
  liveGuessing,
  onLiveGuessingChange,
  onGuessNow,
  canGuess,
}: AIGuessPanelProps) {
  // `guesses` is defensively defaulted: a failed request used to be dropped
  // straight into this component as `{ error }`, and `.map` on undefined took
  // the whole page down.
  const guesses = result?.guesses ?? [];
  const hasGuesses = guesses.length > 0;

  return (
    <aside className="nct-panel flex w-full flex-col gap-4 p-4 lg:w-80">
      <header className="flex items-center justify-between gap-2">
        <h2 className="nct-label !text-nct-amber">AI Guesses</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold tracking-wide ${
            mode === "gemini"
              ? "bg-nct-success/15 text-nct-success"
              : "bg-nct-amber/15 text-nct-amber"
          }`}
        >
          {mode === "gemini" ? "GEMINI" : "MOCK"}
        </span>
      </header>

      {/* Engine switch */}
      <div className="flex gap-1 rounded-xl bg-nct-900/60 p-1">
        {(["mock", "gemini"] as AIMode[]).map((m) => {
          const locked = m === "gemini" && !geminiAvailable;
          return (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              disabled={locked}
              title={
                locked
                  ? "Set GEMINI_API_KEY in .env.local and restart the dev server to enable the real model"
                  : m === "mock"
                    ? "Simulated predictions — always available, no API key needed"
                    : "Real predictions from the Gemini vision model"
              }
              className={`nct-focus flex-1 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === m
                  ? "bg-nct-steel text-nct-900"
                  : "text-nct-muted hover:bg-nct-700/70 hover:text-nct-ink"
              }`}
            >
              {m === "mock" ? "Mock" : "Gemini"}
              {locked && " 🔒"}
            </button>
          );
        })}
      </div>

      {/* Results */}
      <div className="min-h-[8.5rem]">
        {loading && (
          <div className="space-y-2" aria-live="polite">
            <p className="text-sm text-nct-steel-light">Analysing your drawing…</p>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-8 animate-pulse rounded-lg bg-nct-700/60"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}

        {!loading && !result && (
          <p className="text-sm leading-relaxed text-nct-muted">
            Draw something, then hit <span className="font-semibold text-nct-ink">Guess now</span>{" "}
            — or turn on live guessing and the AI will keep watching as you draw.
          </p>
        )}

        {!loading && result && hasGuesses && (
          <ol className="space-y-2" aria-live="polite">
            {guesses.map((g, i) => {
              const correct = prompt ? labelMatchesPrompt(g.label, prompt) : false;
              const pct = Math.round(g.confidence * 100);
              return (
                <li key={`${g.label}-${i}`} className="nct-rise">
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <span
                      className={`truncate text-sm font-semibold capitalize ${
                        correct ? "text-nct-success" : "text-nct-ink"
                      }`}
                    >
                      {correct && "✓ "}
                      {g.label}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-nct-muted">{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-nct-900/70">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ${
                        correct ? "bg-nct-success" : i === 0 ? "bg-nct-amber" : "bg-nct-steel"
                      }`}
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {!loading && result && !hasGuesses && !result.error && (
          <p className="text-sm text-nct-muted">
            No confident guess yet — add a few more strokes.
          </p>
        )}

        {!loading && result?.error && (
          <p className="mt-3 rounded-lg border border-nct-danger/40 bg-nct-danger/10 p-2.5 text-xs leading-relaxed text-nct-danger">
            {result.error}
          </p>
        )}
      </div>

      <div className="mt-auto space-y-3">
        <button
          onClick={onGuessNow}
          disabled={!canGuess || loading}
          className="nct-focus w-full rounded-xl bg-nct-amber px-4 py-2.5 text-sm font-black uppercase tracking-wide text-nct-900 transition hover:bg-nct-amber-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Thinking…" : "Guess now"}
        </button>

        <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-nct-muted">
          <span>Live guessing while I draw</span>
          <input
            type="checkbox"
            checked={liveGuessing}
            onChange={(e) => onLiveGuessingChange(e.target.checked)}
            className="nct-focus h-4 w-8 cursor-pointer appearance-none rounded-full bg-nct-600 transition-colors checked:bg-nct-steel relative after:absolute after:top-0.5 after:left-0.5 after:h-3 after:w-3 after:rounded-full after:bg-nct-ink after:transition-transform checked:after:translate-x-4"
          />
        </label>

        {result?.isMock && (
          <p className="text-[0.7rem] leading-relaxed text-nct-amber/90">
            <strong>Mock predictions.</strong> Simulated results so the game is playable without an
            API key — see the README&apos;s known-limitations note.
          </p>
        )}
      </div>
    </aside>
  );
}
