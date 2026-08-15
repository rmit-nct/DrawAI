"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Point, Stroke } from "@/types";
import { getRelativePoint, redrawAll } from "@/lib/canvas/drawing";

interface UseCanvasDrawingOptions {
  lineWidth?: number;
  color?: string;
}

/**
 * Handles mouse + touch drawing on a canvas, plus undo/clear.
 * External input (e.g. webcam hand-tracking) can call
 * startStrokeAt / extendStrokeTo / endStroke directly — same code path
 * as mouse/touch, so drawing logic never diverges by input source.
 */
export function useCanvasDrawing(options: UseCanvasDrawingOptions = {}) {
  const { lineWidth = 4, color = "#111111" } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const currentStroke = useRef<Stroke | null>(null);
  const isDrawing = useRef(false);

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    redrawAll(canvasRef.current, strokes);
  }, [strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const startStrokeAt = useCallback(
    (point: Point) => {
      isDrawing.current = true;
      currentStroke.current = { points: [point], color, lineWidth };
    },
    [color, lineWidth]
  );

  const extendStrokeTo = useCallback((point: Point) => {
    if (!isDrawing.current || !currentStroke.current || !canvasRef.current) return;
    currentStroke.current.points.push(point);
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      const pts = currentStroke.current.points;
      const prev = pts[pts.length - 2];
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }, [color, lineWidth]);

  const endStroke = useCallback(() => {
    // Snapshot before clearing the ref below — setStrokes's updater runs
    // later (at render time), so a closure reading currentStroke.current
    // directly would see it already nulled out, silently dropping every
    // stroke past the first into the array as `null`.
    const finishedStroke = currentStroke.current;
    if (finishedStroke) {
      setStrokes((prev) => [...prev, finishedStroke]);
    }
    currentStroke.current = null;
    isDrawing.current = false;
  }, []);

  // Mouse handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      startStrokeAt(getRelativePoint(canvasRef.current, e.clientX, e.clientY));
    },
    [startStrokeAt]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      extendStrokeTo(getRelativePoint(canvasRef.current, e.clientX, e.clientY));
    },
    [extendStrokeTo]
  );

  const handlePointerUp = useCallback(() => {
    endStroke();
  }, [endStroke]);

  const undo = useCallback(() => {
    setStrokes((prev) => prev.slice(0, -1));
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
  }, []);

  return {
    canvasRef,
    strokes,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    // exposed for webcam gesture input
    startStrokeAt,
    extendStrokeTo,
    endStroke,
    undo,
    clear,
  };
}
