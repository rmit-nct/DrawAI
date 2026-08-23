"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface PieTimerProps {
  /** Total countdown length in seconds. */
  duration: number;
  /** Overall diameter in px. Default 96. */
  size?: number;
  /** Start counting down immediately on mount. Default true. */
  autoStart?: boolean;
  /** Pause externally without resetting elapsed progress. */
  paused?: boolean;
  /** Sweep direction of the depleting wedge. Default 'clockwise'. */
  direction?: "clockwise" | "counterclockwise";
  /** Color overrides — merge shallowly with defaults. */
  colors?: Partial<{ shellDark: string; shellLight: string; face: string }>;
  /** Optional numeric label (seconds remaining) rendered in the center. */
  showLabel?: boolean;
  /** Fires once when the timer reaches 0. */
  onComplete?: () => void;
  /** Fires roughly once per second with seconds remaining. */
  onTick?: (secondsRemaining: number) => void;
  /** Accessible label, e.g. "Time remaining". */
  label?: string;
}

export interface PieTimerHandle {
  start: () => void;
  pause: () => void;
  reset: () => void;
  restart: () => void;
}

const DEFAULT_COLORS = {
  shellDark: "#1c1a41ff",
  shellLight: "#d3c7c7ff",
  face: "#FFFFFF",
};

const OUTER_STROKE_RATIO = 0.07;
const TRACK_RATIO = 0.1;
const INNER_STROKE_RATIO = 0.015;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export const PieTimer = forwardRef<PieTimerHandle, PieTimerProps>(function PieTimer(
  {
    duration,
    size = 96,
    autoStart = true,
    paused = false,
    direction = "clockwise",
    colors,
    showLabel = false,
    onComplete,
    onTick,
    label,
  },
  ref
) {
  const resolvedColors = { ...DEFAULT_COLORS, ...colors };
  const reducedMotion = usePrefersReducedMotion();

  const faceRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(autoStart);
  const elapsedMsRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const lastTickSecondRef = useRef<number | null>(null);

  const [secondsLeft, setSecondsLeft] = useState(duration);

  const durationMs = duration * 1000;

  const applyProgress = useCallback(
    (progress: number) => {
      const clamped = Math.min(1, Math.max(0, progress));
      faceRef.current?.style.setProperty("--progress", String(clamped));

      const remaining = Math.max(0, Math.ceil(duration - clamped * duration));
      if (lastTickSecondRef.current !== remaining) {
        lastTickSecondRef.current = remaining;
        setSecondsLeft(remaining);
        onTick?.(remaining);
      }

      if (clamped >= 1 && !completedRef.current) {
        completedRef.current = true;
        runningRef.current = false;
        onComplete?.();
      }
    },
    [duration, onComplete, onTick]
  );

  const stopLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (intervalIdRef.current !== null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  const currentElapsedMs = useCallback(() => {
    if (segmentStartRef.current === null) return elapsedMsRef.current;
    return elapsedMsRef.current + (performance.now() - segmentStartRef.current);
  }, []);

  const startLoop = useCallback(() => {
    stopLoop();
    segmentStartRef.current = performance.now();

    if (reducedMotion) {
      applyProgress(currentElapsedMs() / durationMs);
      intervalIdRef.current = window.setInterval(() => {
        const elapsed = currentElapsedMs();
        applyProgress(elapsed / durationMs);
        if (elapsed >= durationMs) stopLoop();
      }, 1000);
      return;
    }

    const tick = () => {
      const elapsed = currentElapsedMs();
      applyProgress(elapsed / durationMs);
      if (elapsed >= durationMs) {
        stopLoop();
        return;
      }
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [applyProgress, currentElapsedMs, durationMs, reducedMotion, stopLoop]);

  const pauseInternal = useCallback(() => {
    elapsedMsRef.current = currentElapsedMs();
    segmentStartRef.current = null;
    stopLoop();
  }, [currentElapsedMs, stopLoop]);

  const start = useCallback(() => {
    if (completedRef.current) return;
    runningRef.current = true;
    if (!paused) startLoop();
  }, [paused, startLoop]);

  const pause = useCallback(() => {
    runningRef.current = false;
    pauseInternal();
  }, [pauseInternal]);

  const reset = useCallback(() => {
    runningRef.current = false;
    completedRef.current = false;
    elapsedMsRef.current = 0;
    segmentStartRef.current = null;
    lastTickSecondRef.current = null;
    stopLoop();
    applyProgress(0);
  }, [applyProgress, stopLoop]);

  const restart = useCallback(() => {
    reset();
    start();
  }, [reset, start]);

  useImperativeHandle(ref, () => ({ start, pause, reset, restart }), [
    start,
    pause,
    reset,
    restart,
  ]);

  // Mount: kick off if autoStart, otherwise just paint progress 0.
  useEffect(() => {
    if (autoStart) start();
    else applyProgress(0);
    return stopLoop;
    // Only run on mount/unmount — imperative handle covers later starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to the external `paused` prop without resetting elapsed progress.
  useEffect(() => {
    if (!runningRef.current) return;
    if (paused) pauseInternal();
    else startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  const outerStroke = size * OUTER_STROKE_RATIO;
  const track = size * TRACK_RATIO;
  const innerStroke = size * INNER_STROKE_RATIO;
  const trackSize = size - 2 * outerStroke;
  const faceSize = size - 2 * (outerStroke + track);

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={label ?? "Countdown timer"}
      className="relative shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        // Outer ring stroke color.
        backgroundColor: resolvedColors.shellDark,
      }}
    >
      <div
        className="absolute rounded-full"
        style={{
          width: trackSize,
          height: trackSize,
          top: outerStroke,
          left: outerStroke,
          // Track band tint.
          backgroundColor: resolvedColors.shellLight,
          // Thin stroke on the track band's inner edge, same color as the outer ring.
          boxShadow: `inset 0 0 0 ${innerStroke}px ${resolvedColors.shellDark}`,
        }}
      >
        <div
          className="absolute overflow-hidden rounded-full"
          style={{
            width: faceSize,
            height: faceSize,
            top: track,
            left: track,
          }}
        >
          <div
            ref={faceRef}
            className="absolute inset-0"
            style={
              {
                "--progress": 0,
                transform: direction === "counterclockwise" ? "scaleX(-1)" : undefined,
                // Elapsed wedge (shellDark) sweeping clockwise over the white face.
                background: `conic-gradient(from 0deg, ${resolvedColors.shellDark} 0deg, ${resolvedColors.shellDark} calc(var(--progress) * 360deg), ${resolvedColors.face} calc(var(--progress) * 360deg), ${resolvedColors.face} 360deg)`,
              } as React.CSSProperties
            }
          />
          {showLabel && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold tabular-nums"
              style={{ color: resolvedColors.shellDark }}
            >
              {secondsLeft}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
