"use client";

import { useEffect, useRef, useState } from "react";

interface TimerRingProps {
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
}

const SIZE = 38;

export function TimerRing({ secondsLeft, totalSeconds, isRunning }: TimerRingProps) {
  const [elapsedDeg, setElapsedDeg] = useState(
    () => 360 * ((totalSeconds - secondsLeft) / totalSeconds)
  );
  // Tracks the wall-clock moment secondsLeft last ticked, so the sweep can
  // interpolate smoothly between the countdown hook's once-per-second updates
  // instead of jumping in 6deg (360/60) steps.
  const tickRef = useRef<{ secondsLeft: number; at: number } | null>(null);

  useEffect(() => {
    tickRef.current = { secondsLeft, at: performance.now() };
  }, [secondsLeft]);

  useEffect(() => {
    let frame: number;
    const tick = () => {
      if (!isRunning) {
        setElapsedDeg(360 * ((totalSeconds - secondsLeft) / totalSeconds));
        return;
      }
      const base = tickRef.current ?? { secondsLeft, at: performance.now() };
      const drift = (performance.now() - base.at) / 1000;
      const remaining = Math.max(0, base.secondsLeft - drift);
      const elapsed = Math.min(totalSeconds, totalSeconds - remaining);
      setElapsedDeg((360 * elapsed) / totalSeconds);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isRunning, secondsLeft, totalSeconds]);

  return (
    <div
      className="relative flex shrink-0 items-center justify-center rounded-full border"
      style={{
        width: SIZE,
        height: SIZE,
        borderColor: "rgba(20, 41, 59, 0.2)",
        background: `conic-gradient(var(--bar-bg) 0deg ${elapsedDeg}deg, #fff ${elapsedDeg}deg 360deg)`,
      }}
    >
      <span
        className="font-mono text-[11px] font-semibold tabular-nums text-nct-navy"
        style={{ textShadow: "0 0 3px rgba(255,255,255,0.9), 0 0 1px rgba(255,255,255,0.9)" }}
      >
        {Math.max(0, secondsLeft)}
      </span>
    </div>
  );
}
