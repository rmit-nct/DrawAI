import type { Point, Stroke } from "@/types";

/**
 * Pure canvas drawing helpers. Kept framework-agnostic so they can be
 * called from mouse events, touch events, or MediaPipe hand-tracking
 * output without duplicating logic.
 */

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke | null | undefined) {
  if (!stroke || !stroke.points || stroke.points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Eraser strokes cut through whatever's already been painted instead of
  // adding ink on top, so they work no matter what's underneath.
  ctx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

export function redrawAll(
  canvas: HTMLCanvasElement,
  strokes: Stroke[],
  backgroundColor = "#ffffff"
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
}

export function getRelativePoint(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): Point {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

/** Export the current canvas as a base64 PNG, e.g. to send to an AI guesser. */
export function canvasToBase64(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png").split(",")[1];
}
