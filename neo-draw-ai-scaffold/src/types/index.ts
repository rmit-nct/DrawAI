// Core shared types for NEO DrawAI

// "draw" covers both mouse and touch — the Pointer Events API already
// unifies them into one event model, so there's no real behavioral
// difference to toggle between. "webcam" is the one genuinely different
// input path (hand-tracking driven).
export type InputMode = "draw" | "webcam";

// The active drawing tool: "pen" adds ink, "eraser" removes it from
// whatever's already on the canvas (via destination-out compositing).
export type DrawTool = "pen" | "eraser";

export type BrushSize = "thin" | "medium" | "thick";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  lineWidth: number;
  tool: DrawTool;
}

export interface AIGuessResult {
  label: string;
  confidence: number; // 0 - 1
}

export interface AIGuessResponse {
  guesses: AIGuessResult[];
  isMock: boolean;
}

export interface GameState {
  prompt: string;
  timeLeftSeconds: number;
  isDrawing: boolean;
  isRoundOver: boolean;
  score: number;
}

// Hand landmark subset we care about (wrist + index fingertip)
// Full list: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
export interface HandTrackingResult {
  indexFingerTip: Point | null;
  isPinching: boolean; // thumb tip close to index tip == "pen down"
  handedness: "Left" | "Right" | null;
}
