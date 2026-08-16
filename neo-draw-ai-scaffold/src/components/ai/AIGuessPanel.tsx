"use client";

import { Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import type { AIGuessResponse } from "@/types";

interface AIGuessPanelProps {
  result: AIGuessResponse | null;
  loading: boolean;
  className?: string;
}

export function AIGuessPanel({ result, loading, className = "" }: AIGuessPanelProps) {
  return (
    <Card className={`w-full max-w-xs ring-nct-teal/20 ${className}`}>
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-1.5 text-nct-navy">
          <Sparkles aria-hidden className="size-4 text-nct-gold" />
          AI Guesses
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-sm text-nct-teal-dark/70">Thinking…</p>}

        {!loading && !result && (
          <p className="text-sm text-nct-teal-dark/70">Start drawing to see guesses.</p>
        )}

        {!loading && result && (
          <>
            <ul className="space-y-1">
              {result.guesses.map((g) => (
                <li key={g.label} className="flex justify-between text-sm">
                  <span className="capitalize text-nct-navy">{g.label}</span>
                  <span className="text-nct-teal-dark">{Math.round(g.confidence * 100)}%</span>
                </li>
              ))}
            </ul>
            {result.isMock && (
              <p className="mt-2 text-xs italic text-nct-gold-ink">
                Mock predictions — real AI model not yet connected.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
