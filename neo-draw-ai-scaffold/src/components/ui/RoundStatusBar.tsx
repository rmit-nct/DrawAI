"use client";

import type { CSSProperties } from "react";
import { TimerRing } from "@/components/ui/TimerRing";

interface RoundStatusBarProps {
  prompt: string | null;
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
}

// TimerRing's conic-gradient reads this custom property so the "eaten"
// wedge always matches the bar it sits on, wherever the bar's background is set.
const barStyle = { "--bar-bg": "var(--color-nct-gold-tint)" } as CSSProperties;

export function RoundStatusBar({
  prompt,
  secondsLeft,
  totalSeconds,
  isRunning,
}: RoundStatusBarProps) {
  return (
    <div
      className="relative z-10 flex w-full items-center justify-center gap-4 bg-nct-gold-tint px-4 py-2"
      style={barStyle}
    >
      <p className="text-sm font-medium text-nct-navy/70">
        Draw: <span className="capitalize">{prompt ?? "…"}</span>
      </p>
      <TimerRing secondsLeft={secondsLeft} totalSeconds={totalSeconds} isRunning={isRunning} />
    </div>
  );
}
