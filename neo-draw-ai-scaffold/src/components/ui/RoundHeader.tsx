"use client";

import { NctMark } from "@/components/brand/NctLogo";

interface RoundHeaderProps {
  prompt: string | null;
  secondsLeft: number;
  totalSeconds: number;
  score: number;
  round: number;
  isRoundOver: boolean;
  onNewRound: () => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function RoundHeader({
  prompt,
  secondsLeft,
  totalSeconds,
  score,
  round,
  isRoundOver,
  onNewRound,
}: RoundHeaderProps) {
  const pct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));
  const urgent = secondsLeft <= 10 && secondsLeft > 0 && !isRoundOver;

  return (
    <header className="relative z-10 w-full">
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-4 px-4 py-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <NctMark className="h-11 w-auto shrink-0" />
          <div>
            <h1 className="text-xl font-black leading-none tracking-tight text-nct-ink sm:text-2xl">
              NEO <span className="text-nct-amber">DRAW</span>
              <span className="text-nct-steel-light">AI</span>
            </h1>
            <p className="mt-1 text-[0.65rem] font-bold tracking-[0.18em] text-nct-muted">
              NEO CULTURE TECH
            </p>
          </div>
        </div>

        {/* Prompt */}
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1">
          <div className="nct-panel flex items-center gap-3 px-4 py-2.5">
            <span className="nct-label shrink-0">Your word</span>
            <span
              className="truncate text-lg font-black uppercase tracking-wide text-nct-amber sm:text-xl"
              aria-live="polite"
            >
              {prompt ?? "…"}
            </span>
          </div>
        </div>

        {/* Timer + score */}
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="nct-label">Score</div>
            <div className="font-mono text-lg font-bold tabular-nums text-nct-ink">{score}</div>
          </div>
          <div className="text-right">
            <div className="nct-label">Round</div>
            <div className="font-mono text-lg font-bold tabular-nums text-nct-ink">{round}</div>
          </div>

          <div
            className={`nct-panel min-w-[6.5rem] px-4 py-2 text-center ${
              urgent ? "border-nct-danger/60" : ""
            }`}
          >
            <div className="nct-label">Time</div>
            <div
              className={`font-mono text-2xl font-black tabular-nums ${
                urgent ? "text-nct-danger" : isRoundOver ? "text-nct-muted" : "text-nct-ink"
              }`}
              role="timer"
              aria-live="off"
            >
              {formatTime(secondsLeft)}
            </div>
          </div>

          <button
            onClick={onNewRound}
            className="nct-focus rounded-xl bg-nct-steel px-4 py-3 text-sm font-black uppercase tracking-wide text-nct-900 transition hover:bg-nct-steel-light"
          >
            New round
          </button>
        </div>
      </div>

      {/* Time bar */}
      <div className="h-1 w-full bg-nct-900/70">
        <div
          className={`h-full transition-[width] duration-300 ease-linear ${
            urgent ? "bg-nct-danger" : "bg-nct-amber"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </header>
  );
}
