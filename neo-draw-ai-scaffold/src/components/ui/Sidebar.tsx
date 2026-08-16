"use client";

import { Brush, Download, Eraser, Palette, Redo2, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrushSize, DrawTool } from "@/types";

interface SidebarProps {
  tool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  brushSize: BrushSize;
  onBrushSizeChange: (size: BrushSize) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDownload: () => void;
  canUndo: boolean;
  canRedo: boolean;
  className?: string;
}

const BRUSH_SIZES: { value: BrushSize; label: string; dot: string }[] = [
  { value: "thin", label: "Thin brush", dot: "h-1.5 w-1.5" },
  { value: "medium", label: "Medium brush", dot: "h-2.5 w-2.5" },
  { value: "thick", label: "Thick brush", dot: "h-4 w-4" },
];

// Icons live on the navy chrome, so the default shadcn ring/border (navy)
// would be invisible on focus — override to gold for visibility here.
const NAVY_FOCUS_RING = "focus-visible:border-nct-gold focus-visible:ring-nct-gold/50";
const ICON_BUTTON = `h-11 w-11 text-nct-cream hover:bg-nct-navy-light hover:text-nct-gold disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-nct-cream ${NAVY_FOCUS_RING}`;

// A loose, hand-drawn squiggle instead of a ruler-straight rule — a small
// nod to the art theme in a spot that's purely decorative anyway.
function Divider() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 6"
      className="h-1.5 w-6 shrink-0 text-nct-navy-light sm:h-6 sm:w-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 3 Q4 0.5 8 3 T16 3 T24 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Sidebar({
  tool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  onUndo,
  onRedo,
  onClear,
  onDownload,
  canUndo,
  canRedo,
  className = "",
}: SidebarProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg bg-nct-navy p-2 sm:flex-col sm:items-stretch sm:gap-3 sm:p-3 ${className}`}
    >
      <Palette aria-hidden className="hidden size-5 shrink-0 self-center text-nct-gold/70 sm:block" />

      <div className="flex gap-2 sm:flex-col">
        <Button
          onClick={() => onToolChange("pen")}
          variant={tool === "pen" ? "default" : "ghost"}
          size="icon"
          title="Brush"
          aria-label="Brush tool"
          aria-pressed={tool === "pen"}
          className={`h-11 w-11 ${tool === "pen" ? NAVY_FOCUS_RING : `text-nct-cream/70 hover:bg-nct-navy-light hover:text-nct-cream ${NAVY_FOCUS_RING}`}`}
        >
          <Brush />
        </Button>
        <Button
          onClick={() => onToolChange("eraser")}
          variant={tool === "eraser" ? "default" : "ghost"}
          size="icon"
          title="Eraser"
          aria-label="Eraser tool"
          aria-pressed={tool === "eraser"}
          className={`h-11 w-11 ${tool === "eraser" ? NAVY_FOCUS_RING : `text-nct-cream/70 hover:bg-nct-navy-light hover:text-nct-cream ${NAVY_FOCUS_RING}`}`}
        >
          <Eraser />
        </Button>
      </div>

      <Divider />

      <div className="flex gap-2 sm:flex-col">
        {BRUSH_SIZES.map(({ value, label, dot }) => (
          <Button
            key={value}
            onClick={() => onBrushSizeChange(value)}
            variant={brushSize === value ? "default" : "ghost"}
            size="icon"
            title={label}
            aria-label={label}
            aria-pressed={brushSize === value}
            className={`h-11 w-11 ${brushSize === value ? NAVY_FOCUS_RING : `text-nct-cream/70 hover:bg-nct-navy-light hover:text-nct-cream ${NAVY_FOCUS_RING}`}`}
          >
            <span className={`rounded-full bg-current ${dot}`} />
          </Button>
        ))}
      </div>

      <Divider />

      <div className="flex gap-2 sm:flex-col">
        <Button
          onClick={onUndo}
          disabled={!canUndo}
          variant="ghost"
          size="icon"
          title="Undo"
          aria-label="Undo last stroke"
          className={ICON_BUTTON}
        >
          <Undo2 />
        </Button>
        <Button
          onClick={onRedo}
          disabled={!canRedo}
          variant="ghost"
          size="icon"
          title="Redo"
          aria-label="Redo last undone stroke"
          className={ICON_BUTTON}
        >
          <Redo2 />
        </Button>
      </div>

      <Divider />

      <div className="flex gap-2 sm:flex-col">
        <Button
          onClick={onClear}
          variant="ghost"
          size="icon"
          title="Clear canvas"
          aria-label="Clear the entire canvas"
          className={ICON_BUTTON}
        >
          <Trash2 />
        </Button>
        <Button
          onClick={onDownload}
          variant="ghost"
          size="icon"
          title="Download drawing"
          aria-label="Download drawing as PNG"
          className={ICON_BUTTON}
        >
          <Download />
        </Button>
      </div>
    </div>
  );
}
