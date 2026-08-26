// Core shared types for NEO DrawAI

export type InputMode = "mouse" | "touch" | "webcam";

/** Which engine produced the guesses. */
export type AIMode = "mock" | "gemini";

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  /** Points are in LOGICAL canvas space (see LOGICAL_WIDTH/HEIGHT in lib/canvas/drawing). */
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
  /** Set when the guess could not be produced; the UI renders this instead of crashing. */
  error?: string;
}

export interface GameState {
  prompt: string;
  timeLeftSeconds: number;
  isDrawing: boolean;
  isRoundOver: boolean;
  score: number;
}

/** Outcome of a round, shown in the end-of-round overlay. */
export interface RoundResult {
  prompt: string;
  guessed: boolean;
  matchedLabel: string | null;
  pointsAwarded: number;
  reason: "time-up" | "guessed";
  /**
   * True while the final guess is still in flight. The overlay used to wait for
   * the AI before appearing at all, so a slow call looked like the game had
   * frozen. Now the card shows immediately in a pending state and the verdict
   * fills in underneath.
   */
  pending?: boolean;
}

// Hand landmark subset we care about (wrist + index fingertip)
// Full list: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
export interface HandTrackingResult {
  indexFingerTip: Point | null;
  isPinching: boolean; // thumb tip close to index tip == "pen down"
  handedness: "Left" | "Right" | null;
  /** 0-1 strength of the pinch, used for on-screen feedback. */
  pinchStrength: number;
}

export type WebcamStatus = "idle" | "requesting-camera" | "loading-model" | "ready" | "error";
