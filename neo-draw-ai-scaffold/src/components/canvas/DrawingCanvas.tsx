"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useCanvasDrawing } from "@/hooks/useCanvasDrawing";
import { canvasToBase64 } from "@/lib/canvas/drawing";

export interface DrawingCanvasHandle {
  undo: () => void;
  clear: () => void;
  exportBase64: () => string | null;
  // used by webcam gesture input to drive the same drawing logic as mouse/touch
  startStrokeAt: ReturnType<typeof useCanvasDrawing>["startStrokeAt"];
  extendStrokeTo: ReturnType<typeof useCanvasDrawing>["extendStrokeTo"];
  endStroke: () => void;
}

interface DrawingCanvasProps {
  width?: number;
  height?: number;
  color?: string;
  lineWidth?: number;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas({ width = 800, height = 600, color, lineWidth }, ref) {
    const {
      canvasRef,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      startStrokeAt,
      extendStrokeTo,
      endStroke,
      undo,
      clear,
    } = useCanvasDrawing({ color, lineWidth });

    useImperativeHandle(ref, () => ({
      undo,
      clear,
      exportBase64: () => (canvasRef.current ? canvasToBase64(canvasRef.current) : null),
      startStrokeAt,
      extendStrokeTo,
      endStroke,
    }));

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        draggable={false}
        onPointerDown={(e) => {
          // Once the canvas has pixels on it, browsers let you drag it like
          // an image — that native drag gesture hijacks the pointer sequence
          // and would otherwise swallow every stroke after the first.
          // preventDefault + the draggable/onDragStart guards below are
          // enough to stop that; deliberately NOT using setPointerCapture
          // here — it can get stuck active across browsers when combined
          // with preventDefault, silently blocking every stroke after the
          // one where it got stuck (that's what caused the "every other
          // stroke fails" bug).
          e.preventDefault();
          handlePointerDown(e);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDragStart={(e) => e.preventDefault()}
        className="touch-none select-none rounded-lg border border-neutral-300 bg-white shadow-sm"
        style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
      />
    );
  }
);
