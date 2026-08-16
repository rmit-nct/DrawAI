"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import { detectHand, initHandLandmarker } from "@/lib/mediapipe/handTracking";
import type { HandTrackingResult } from "@/types";

interface UseHandTrackingOptions {
  enabled: boolean;
  onResult?: (result: HandTrackingResult) => void;
}

/**
 * Starts the user's webcam and runs MediaPipe hand landmark detection on
 * every animation frame while `enabled` is true. Consumers hook into
 * onResult to drive canvas drawing (see useCanvasDrawing).
 */
export function useHandTracking({ enabled, onResult }: UseHandTrackingOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafId = useRef<number | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const loop = useCallback(() => {
    if (!videoRef.current || !landmarkerRef.current) return;
    if (videoRef.current.readyState >= 2) {
      const result = detectHand(landmarkerRef.current, videoRef.current, performance.now());
      onResult?.(result);
    }
    rafId.current = requestAnimationFrame(loop);
  }, [onResult]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        setStatus("loading");
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) return;

        if (!videoRef.current) {
          videoRef.current = document.createElement("video");
        }
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play();

        landmarkerRef.current = await initHandLandmarker();
        if (cancelled) return;

        setStatus("ready");
        rafId.current = requestAnimationFrame(loop);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to start webcam");
      }
    })();

    return () => {
      cancelled = true;
      if (rafId.current) cancelAnimationFrame(rafId.current);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled, loop]);

  return { videoRef, status, error };
}
