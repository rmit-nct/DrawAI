"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHandTracking } from "@/hooks/useHandTracking";
import type { DrawingCanvasHandle } from "@/components/canvas/DrawingCanvas";
import { normalizedToLogical } from "@/lib/canvas/drawing";
import type { HandTrackingResult, Point } from "@/types";

interface WebcamGestureLayerProps {
  enabled: boolean;
  canvasHandle: React.RefObject<DrawingCanvasHandle | null>;
  /** Reports the fingertip in logical canvas space so the page can draw a cursor. */
  onCursorChange?: (cursor: (Point & { pinching: boolean }) | null) => void;
  paused?: boolean;
}

/**
 * Webcam gesture input.
 *
 * "Pen down" is a pinch (thumb + index finger together); moving the pinched
 * hand draws; releasing lifts the pen. It routes through the same
 * startStrokeAt / extendStrokeTo / endStroke calls as mouse and touch, so
 * drawing behaviour never diverges by input source.
 *
 * The <video> is now visible (mirrored, like a selfie camera) instead of
 * `display:none`. Beyond being what users expect — you need to see your hand to
 * aim it — browsers are entitled to throttle or skip frame delivery for a
 * display:none video, which starved the detector of frames.
 */
export function WebcamGestureLayer({
  enabled,
  canvasHandle,
  onCursorChange,
  paused = false,
}: WebcamGestureLayerProps) {
  const wasPinching = useRef(false);
  const pausedRef = useRef(paused);
  const onCursorChangeRef = useRef(onCursorChange);

  const [handVisible, setHandVisible] = useState(false);

  // Mirrored into refs in effects (not during render) so the detection callback
  // stays referentially stable and never restarts the webcam pipeline.
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onCursorChangeRef.current = onCursorChange;
  }, [onCursorChange]);

  const handleResult = useCallback(
    (result: HandTrackingResult) => {
      const handle = canvasHandle.current;

      // Hand left the frame (or the round ended): finish the stroke cleanly
      // rather than leaving the pen stuck down.
      if (!handle || !result.indexFingerTip || pausedRef.current) {
        if (wasPinching.current) handle?.endStroke();
        wasPinching.current = false;
        setHandVisible(false);
        onCursorChangeRef.current?.(null);
        return;
      }

      setHandVisible(true);

      // MediaPipe returns normalised coords from a non-mirrored frame; mirror x
      // so moving your hand right moves the pen right.
      const point = normalizedToLogical(result.indexFingerTip.x, result.indexFingerTip.y, true);
      onCursorChangeRef.current?.({ ...point, pinching: result.isPinching });

      if (result.isPinching && !wasPinching.current) {
        handle.startStrokeAt(point);
      } else if (result.isPinching && wasPinching.current) {
        handle.extendStrokeTo(point);
      } else if (!result.isPinching && wasPinching.current) {
        handle.endStroke();
      }

      wasPinching.current = result.isPinching;
    },
    [canvasHandle]
  );

  const { videoRef, status, error, retry, cameraLive } = useHandTracking({
    enabled,
    onResult: handleResult,
  });

  const statusText: Record<typeof status, string> = {
    idle: "Webcam off",
    "requesting-camera": "Waiting for camera permission…",
    "loading-model": "Loading the hand-tracking model…",
    ready: handVisible ? "Hand detected — pinch to draw" : "Show your hand to the camera",
    error: "Webcam unavailable",
  };

  const dotColor =
    status === "ready"
      ? handVisible
        ? "bg-nct-success"
        : "bg-nct-amber"
      : status === "error"
        ? "bg-nct-danger"
        : "bg-nct-steel";

  return (
    <section className="nct-panel overflow-hidden" aria-label="Webcam gesture input">
      <header className="flex items-center gap-2 border-b border-nct-steel/20 px-3 py-2">
        <span
          className={`h-2 w-2 rounded-full ${dotColor} ${status === "ready" && handVisible ? "nct-pulse" : ""}`}
        />
        <span className="nct-label !text-nct-steel-light">Webcam</span>
        <span className="ml-auto truncate text-[0.7rem] text-nct-muted">{statusText[status]}</span>
      </header>

      <div className="relative aspect-[4/3] w-full bg-nct-900">
        <video
          ref={videoRef}
          playsInline
          muted
          // -scale-x-100 mirrors the preview so it reads like a mirror, matching
          // the x-flip applied to the tracked coordinates.
          className={`h-full w-full -scale-x-100 object-cover transition-opacity ${
            status === "ready" || cameraLive ? "opacity-100" : "opacity-0"
          }`}
        />

        {status !== "ready" && (
          <div
            className={`absolute inset-0 grid place-items-center gap-2 p-4 text-center ${
              cameraLive ? "bg-nct-900/80" : ""
            }`}
          >
            {status === "error" ? (
              <div className="max-h-full w-full space-y-2 overflow-y-auto">
                <p className="text-[0.7rem] leading-relaxed break-words hyphens-auto text-nct-danger">
                  {error}
                </p>
                <button
                  onClick={retry}
                  className="nct-focus rounded-lg bg-nct-steel px-3 py-1.5 text-xs font-bold text-nct-900 transition hover:bg-nct-steel-light"
                >
                  Retry
                </button>
              </div>
            ) : (
              <p className="text-xs text-nct-muted">{statusText[status]}</p>
            )}
          </div>
        )}

        {status === "ready" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-nct-900 to-transparent px-3 pb-2 pt-6">
            <p className="text-[0.7rem] leading-snug text-nct-ink/90">
              <span className="font-bold text-nct-amber">Pinch</span> thumb + index to put the pen
              down. Release to lift.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
