"use client";

import { Button } from "@/components/ui/button";

interface TopBarProps {
  prompt: string | null;
  secondsLeft: number;
  onNewRound: () => void;
}

export function TopBar({ prompt, secondsLeft, onNewRound }: TopBarProps) {
  return (
    <div className="flex h-16 items-center justify-between gap-4 bg-nct-navy px-4 text-nct-cream">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/NCT_Logo.jpg"
          alt="NCT logo"
          className="h-8 w-8 rounded-md object-cover object-top"
        />
        <h1 className="font-heading text-xl font-bold tracking-wide">NEO DrawAI</h1>
        <p className="hidden text-nct-cream/80 sm:block">
          Draw:{" "}
          <span className="font-heading font-semibold capitalize">{prompt ?? "…"}</span>
        </p>
      </div>

      <div className="text-lg font-mono font-semibold tabular-nums text-nct-gold">
        {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
        {String(secondsLeft % 60).padStart(2, "0")}
      </div>

      <Button
        onClick={onNewRound}
        variant="secondary"
        className="font-heading h-11 focus-visible:border-white focus-visible:ring-white/50"
      >
        New Round
      </Button>
    </div>
  );
}
