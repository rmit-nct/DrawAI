"use client";

import { forwardRef } from "react";
import { PieTimer, type PieTimerHandle } from "@/components/ui/PieTimer";

interface RoundStatusBarProps {
  prompt: string | null;
  duration: number;
  onComplete?: () => void;
}

export const RoundStatusBar = forwardRef<PieTimerHandle, RoundStatusBarProps>(
  function RoundStatusBar({ prompt, duration, onComplete }, ref) {
    return (
      <div className="relative z-10 flex w-full items-center justify-center gap-4 px-4 py-2">
        <p className="font-topic">
          Draw <span className="font-topic text-xl capitalize">{prompt ?? "…"}</span>
        </p>
        <PieTimer
          ref={ref}
          duration={duration}
          size={42}
          autoStart={false}
          onComplete={onComplete}
          label="Time remaining"
        />
      </div>
    );
  }
);
