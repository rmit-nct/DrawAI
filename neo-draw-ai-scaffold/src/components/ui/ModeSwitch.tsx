"use client";

import { Brush, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InputMode } from "@/types";

interface ModeSwitchProps {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  className?: string;
}

const MODES: { value: InputMode; label: string; icon: typeof Brush }[] = [
  { value: "draw", label: "Draw", icon: Brush },
  { value: "webcam", label: "Webcam", icon: Camera },
];

export function ModeSwitch({ inputMode, onInputModeChange, className = "" }: ModeSwitchProps) {
  return (
    <div
      className={`flex items-center gap-1 -translate-x-[3px] rounded-lg border border-nct-gold-tint-dark bg-nct-paper p-1 shadow-sm ${className}`}
    >
      {MODES.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          onClick={() => onInputModeChange(value)}
          variant={inputMode === value ? "default" : "ghost"}
          aria-pressed={inputMode === value}
          className={`h-9 gap-1.5 px-3 ${
            inputMode !== value ? "text-nct-navy/70 hover:bg-nct-gold-tint-dark hover:text-nct-navy" : ""
          }`}
        >
          <Icon className="size-4" />
          {label}
        </Button>
      ))}
    </div>
  );
}
