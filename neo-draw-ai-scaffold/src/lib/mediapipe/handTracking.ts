import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { HandTrackingResult, Point } from "@/types";

let handLandmarker: HandLandmarker | null = null;

/**
 * Loads the MediaPipe HandLandmarker model. Call once (e.g. in a useEffect)
 * before running detection on video frames. Model files are fetched from
 * Google's CDN by default — for offline/self-hosted use, download the
 * .task file into /public/models and point wasmFileset/modelAssetPath there.
 */
export async function initHandLandmarker(): Promise<HandLandmarker> {
  if (handLandmarker) return handLandmarker;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 1,
  });

  return handLandmarker;
}

// Landmark indices per MediaPipe hand model
const INDEX_FINGER_TIP = 8;
const THUMB_TIP = 4;

const PINCH_THRESHOLD = 0.06; // normalized distance; tune during testing

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Runs detection on a single video frame and extracts the info the
 * drawing canvas cares about: fingertip position + "pen down" pinch gesture.
 */
export function detectHand(
  landmarker: HandLandmarker,
  video: HTMLVideoElement,
  timestampMs: number
): HandTrackingResult {
  const result: HandLandmarkerResult = landmarker.detectForVideo(video, timestampMs);

  if (!result.landmarks || result.landmarks.length === 0) {
    return { indexFingerTip: null, isPinching: false, handedness: null };
  }

  const landmarks = result.landmarks[0];
  const indexTip = landmarks[INDEX_FINGER_TIP];
  const thumbTip = landmarks[THUMB_TIP];

  const isPinching = distance(indexTip, thumbTip) < PINCH_THRESHOLD;
  const handedness =
    (result.handedness[0]?.[0]?.categoryName as "Left" | "Right" | undefined) ?? null;

  return {
    indexFingerTip: { x: indexTip.x, y: indexTip.y }, // normalized 0-1, flip/scale in caller
    isPinching,
    handedness,
  };
}

export function closeHandLandmarker() {
  handLandmarker?.close();
  handLandmarker = null;
}
