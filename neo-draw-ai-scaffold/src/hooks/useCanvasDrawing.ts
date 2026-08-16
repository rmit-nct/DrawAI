"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DrawTool, Point, Stroke } from "@/types";
import { getRelativePoint, redrawAll } from "@/lib/canvas/drawing";

interface UseCanvasDrawingOptions {
  lineWidth?: number;
  color?: string;
  tool?: DrawTool;
  eraserWidth?: number;
}

/**
 * Handles mouse + touch drawing on a canvas, plus undo/redo/clear.
 * External input (e.g. webcam hand-tracking) can call
 * startStrokeAt / extendStrokeTo / endStroke directly — same code path
 * as mouse/touch, so drawing logic never diverges by input source.
 */
export function useCanvasDrawing(options: UseCanvasDrawingOptions = {}) {
  const { lineWidth = 4, color = "#111111", tool = "pen", eraserWidth = 24 } = options;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
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
      currentStroke.current = {
        points: [point],
        color,
        lineWidth: tool === "eraser" ? eraserWidth : lineWidth,
        tool,
      };
    },
    [color, lineWidth, tool, eraserWidth]
  );

  const extendStrokeTo = useCallback((point: Point) => {
    if (!isDrawing.current || !currentStroke.current || !canvasRef.current) return;
    const stroke = currentStroke.current;
    stroke.points.push(point);
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      const pts = stroke.points;
      const prev = pts[pts.length - 2];
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.lineWidth;
      ctx.lineCap = "round";
      ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      ctx.restore();
    }
  }, []);

  const endStroke = useCallback(() => {
    // Snapshot before clearing the ref below — setStrokes's updater runs
    // later (at render time), so a closure reading currentStroke.current
    // directly would see it already nulled out, silently dropping every
    // stroke past the first into the array as `null`.
    const finishedStroke = currentStroke.current;
    if (finishedStroke) {
      setStrokes((prev) => [...prev, finishedStroke]);
      // A fresh stroke invalidates whatever was undone before it — standard
      // undo/redo semantics (redoing after a new action would be surprising).
      setRedoStack([]);
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
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      setRedoStack((redo) => [...redo, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      setStrokes((strokes) => [...strokes, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    setStrokes([]);
    setRedoStack([]);
  }, []);

  return {
    canvasRef,
    strokes,
    canUndo: strokes.length > 0,
    canRedo: redoStack.length > 0,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    // exposed for webcam gesture input
    startStrokeAt,
    extendStrokeTo,
    endStroke,
    undo,
    redo,
    clear,
  };
}
