"use client";

import { useCallback, useRef } from "react";
import { useHandTracking } from "@/hooks/useHandTracking";
import type { DrawingCanvasHandle } from "@/components/canvas/DrawingCanvas";
import type { HandTrackingResult } from "@/types";

interface WebcamGestureLayerProps {
  enabled: boolean;
  canvasHandle: React.RefObject<DrawingCanvasHandle | null>;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * "Pen down" = pinch (thumb + index finger together).
 * Moving the pinched hand draws; releasing the pinch lifts the pen.
 * This maps 1:1 onto the same startStrokeAt/extendStrokeTo/endStroke
 * calls used by mouse and touch input, so drawing behavior stays
 * consistent regardless of input source.
 */
export function WebcamGestureLayer({
  enabled,
  canvasHandle,
  canvasWidth,
  canvasHeight,
}: WebcamGestureLayerProps) {
  const wasPinching = useRef(false);

  const handleResult = useCallback(
    (result: HandTrackingResult) => {
      const handle = canvasHandle.current;
      if (!handle || !result.indexFingerTip) {
        if (wasPinching.current) handle?.endStroke();
        wasPinching.current = false;
        return;
      }

      // MediaPipe gives normalized [0,1] coords with x mirrored for a
      // "selfie" webcam view — flip x so drawing feels natural.
      const point = {
        x: (1 - result.indexFingerTip.x) * canvasWidth,
        y: result.indexFingerTip.y * canvasHeight,
      };

      if (result.isPinching && !wasPinching.current) {
        handle.startStrokeAt(point);
      } else if (result.isPinching && wasPinching.current) {
        handle.extendStrokeTo(point);
      } else if (!result.isPinching && wasPinching.current) {
        handle.endStroke();
      }

      wasPinching.current = result.isPinching;
    },
    [canvasHandle, canvasWidth, canvasHeight, wasPinching]
  );

  const { videoRef, status, error } = useHandTracking({ enabled, onResult: handleResult });

  return (
    <div className="text-sm text-neutral-500">
      {enabled && status === "loading" && <p>Starting webcam and loading hand model…</p>}
      {enabled && status === "error" && (
        <p className="text-red-600">Webcam error: {error}</p>
      )}
      {enabled && status === "ready" && (
        <p>Webcam active — pinch thumb + index finger to draw.</p>
      )}
      {/* Hidden video element MediaPipe reads frames from; not shown to keep UI clean.
          Swap to a visible <video> if you want users to see themselves while drawing. */}
      <video ref={videoRef} className="hidden" playsInline />
    </div>
  );
}
