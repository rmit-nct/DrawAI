"use client";

import { forwardRef, useEffect, useImperativeHandle } from "react";
import { useCanvasDrawing } from "@/hooks/useCanvasDrawing";
import { canvasToBase64 } from "@/lib/canvas/drawing";
import type { DrawTool } from "@/types";

export interface DrawingCanvasHandle {
  undo: () => void;
  redo: () => void;
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
  eraserWidth?: number;
  tool?: DrawTool;
  onHistoryChange?: (history: { canUndo: boolean; canRedo: boolean }) => void;
}

export const DrawingCanvas = forwardRef<DrawingCanvasHandle, DrawingCanvasProps>(
  function DrawingCanvas(
    { width = 800, height = 600, color, lineWidth, eraserWidth, tool, onHistoryChange },
    ref
  ) {
    const {
      canvasRef,
      canUndo,
      canRedo,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      startStrokeAt,
      extendStrokeTo,
      endStroke,
      undo,
      redo,
      clear,
    } = useCanvasDrawing({ color, lineWidth, eraserWidth, tool });

    useEffect(() => {
      onHistoryChange?.({ canUndo, canRedo });
    }, [canUndo, canRedo, onHistoryChange]);

    useImperativeHandle(ref, () => ({
      undo,
      redo,
      clear,
      exportBase64: () => (canvasRef.current ? canvasToBase64(canvasRef.current) : null),
      startStrokeAt,
      extendStrokeTo,
      endStroke,
    }));

    return (
      <div className="relative rounded-xl bg-nct-navy p-3 shadow-lg">
        {/* A mini artist's-palette dab, like a wax seal on the easel frame — purely
            decorative, lives outside the canvas so it never touches the drawing/export. */}
        <div aria-hidden className="absolute -top-2.5 left-4 flex gap-1">
          <span className="size-2.5 rounded-full bg-nct-gold ring-2 ring-nct-navy" />
          <span className="size-2.5 rounded-full bg-nct-teal-light ring-2 ring-nct-navy" />
          <span className="size-2.5 rounded-full bg-nct-cream ring-2 ring-nct-navy" />
        </div>
        <div className="rounded-lg bg-nct-paper p-1 shadow-inner ring-1 ring-nct-gold-tint-dark">
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
            className="touch-none select-none rounded-md bg-white"
            style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" }}
          />
        </div>
      </div>
    );
  }
);
