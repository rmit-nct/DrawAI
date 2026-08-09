// Core shared types for NEO DrawAI

export type InputMode = "mouse" | "touch" | "webcam";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  lineWidth: number;
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
