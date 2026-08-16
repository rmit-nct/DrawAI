"use client";

import type { AIGuessResponse } from "@/types";

interface AIGuessPanelProps {
  result: AIGuessResponse | null;
  loading: boolean;
}

export function AIGuessPanel({ result, loading }: AIGuessPanelProps) {
  return (
    <div className="w-full max-w-xs rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <h3 className="mb-2 text-sm font-semibold text-neutral-700">AI Guesses</h3>

      {loading && <p className="text-sm text-neutral-400">Thinking…</p>}

      {!loading && !result && (
        <p className="text-sm text-neutral-400">Start drawing to see guesses.</p>
      )}

      {!loading && result && (
        <>
          <ul className="space-y-1">
            {result.guesses.map((g) => (
              <li key={g.label} className="flex justify-between text-sm">
                <span className="capitalize">{g.label}</span>
                <span className="text-neutral-500">{Math.round(g.confidence * 100)}%</span>
              </li>
            ))}
          </ul>
          {result.isMock && (
            <p className="mt-2 text-xs italic text-amber-600">
              Mock predictions — real AI model not yet connected.
            </p>
          )}
        </>
      )}
    </div>
  );
}
