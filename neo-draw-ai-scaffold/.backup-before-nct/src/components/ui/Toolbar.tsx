"use client";

import type { InputMode } from "@/types";

interface ToolbarProps {
  inputMode: InputMode;
  onInputModeChange: (mode: InputMode) => void;
  onUndo: () => void;
  onClear: () => void;
  secondsLeft: number;
}

export function Toolbar({
  inputMode,
  onInputModeChange,
  onUndo,
  onClear,
  secondsLeft,
}: ToolbarProps) {
  return (
    <div className="flex w-full max-w-[800px] items-center justify-between rounded-lg bg-neutral-100 px-4 py-2">
      <div className="flex gap-2">
        {(["mouse", "touch", "webcam"] as InputMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => onInputModeChange(mode)}
            className={`rounded-md px-3 py-1 text-sm capitalize transition ${
              inputMode === mode
                ? "bg-neutral-900 text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="text-lg font-mono font-semibold tabular-nums">
        {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
        {String(secondsLeft % 60).padStart(2, "0")}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onUndo}
          className="rounded-md bg-white px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200"
        >
          Undo
        </button>
        <button
          onClick={onClear}
          className="rounded-md bg-white px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-200"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
