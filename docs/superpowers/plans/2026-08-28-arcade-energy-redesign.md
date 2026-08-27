# Arcade Energy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NEO DrawAI's round flow feel more like a competitive arcade
scoreboard — animated score count-up, an intensifying timer, a denser
scoreboard treatment for Score/Round, and a brief round-transition wipe —
without touching the fixed NCT brand palette or adding any dependency.

**Architecture:** Four independent, additive changes to `RoundHeader.tsx`
(count-up hook + a11y live region, timer pulse class, scoreboard CSS
treatment) plus one new small component (`RoundTransitionWipe.tsx`, keyed by
`round` in `page.tsx` so remounting replays its CSS animation). All motion
is plain CSS keyframes/transitions or a single `requestAnimationFrame` hook
— no new npm dependency, matching the codebase's existing hand-rolled
approach (`.nct-pulse`, `.nct-rise`, the SVG ring timer).

**Tech Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 (existing
`@theme` tokens in `globals.css`). Verification via `npm run lint`,
`npm run build`, and the project's own `tests/client-drawing.spec.mjs`
(a plain Node script driving Playwright — not a `playwright test` suite).

**Spec:** `docs/superpowers/specs/2026-08-28-arcade-energy-redesign.md`

## Global Constraints

- Every new animation must be inert under `prefers-reduced-motion: reduce`
  (fold into the existing media query block in `globals.css`, don't create
  a second one).
- No new npm dependency.
- `npm run lint` and `npm run build` must stay clean after every task.
- `tests/client-drawing.spec.mjs` must stay at its current pre-existing
  baseline (34/36 — the 2 failures, T17d/T17e, are unrelated pre-existing
  webcam-model-CDN issues in this sandbox; do not let that number drop
  further, and any new assertions added by this plan must pass).
- The dev server (`npm run dev`, default port 3000) must be running before
  the test script is run — `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
  should return `200`; start it in the background first if not.

---

### Task 1: Score count-up + accessible live region

**Files:**
- Modify: `neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx:1-23` (add hook above the component, change the Score block at lines 68-71)
- Test: `neo-draw-ai-scaffold/tests/client-drawing.spec.mjs` (append new assertions after the existing T13 block, around line 177)

**Interfaces:**
- Consumes: `score: number` prop (already exists on `RoundHeaderProps`).
- Produces: no new props — purely internal to `RoundHeader`. Later tasks in
  this plan don't depend on anything from this task.

- [ ] **Step 1: Write the new assertions (will fail — feature doesn't exist yet)**

Append to `tests/client-drawing.spec.mjs`, immediately after the existing
`T13` block (`log('T13 a drawing prompt is displayed', ...)`, currently
around line 177):

```javascript
// ---------- T23: score has an accessible status region ----------
// The mock guesser is non-deterministic (confidence grows with stroke
// count, wrong guesses drawn from CONFUSION_SETS), so this script can't
// reliably force a scoring round — instead this checks the a11y plumbing
// and number formatting are correct for whatever the score currently is
// (0, since no round has scored yet in this run), and that the visible
// digit settles to the real value rather than getting stuck mid-animation.
const scoreStatus = page.getByRole('status', { name: /^score/i });
const scoreStatusText = await scoreStatus.innerText().catch(() => '');
log('T23 score has an accessible status region', /score\s+0/i.test(scoreStatusText), scoreStatusText);
await page.waitForTimeout(700); // past the ~600ms count-up duration
const scoreDigits = (await page.locator('[data-testid="score-value"]').innerText().catch(() => '')).trim();
log('T23b displayed score settles to the real value', scoreDigits === '0', scoreDigits);
```

- [ ] **Step 2: Run the script to confirm it fails**

Requires the dev server running (`npm run dev` in another terminal/background, default `http://localhost:3000`).

Run: `node tests/client-drawing.spec.mjs`
Expected: `T23` and `T23b` both FAIL (no `role="status"` named "Score", no `data-testid="score-value"` yet).

- [ ] **Step 3: Implement the count-up hook and accessible region**

In `neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx`, add above the
`RoundHeader` function (after the existing `RING_CIRCUMFERENCE` constant,
currently line 22):

```tsx
/**
 * Animates `value` from its previous value to the new one over `durationMs`
 * (ease-out cubic), for the score count-up. Skips the animation entirely
 * under prefers-reduced-motion — jumps straight to the final value, same
 * policy as .nct-pulse/.nct-rise in globals.css.
 */
function useCountUp(value: number, durationMs = 600) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced || value === fromRef.current) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const delta = value - from;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return display;
}
```

Add the `useState`, `useRef`, `useEffect` imports this needs at the top of
the file (currently line 1-3 only imports `NctMark`):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { NctMark } from "@/components/brand/NctLogo";
```

Inside the `RoundHeader` component, right after the existing `urgent` line
(currently line 34):

```tsx
  const displayedScore = useCountUp(score);
```

Replace the Score block (currently lines 68-71):

```tsx
          <div className="text-right">
            <div className="nct-label">Score</div>
            <div className="font-mono text-lg font-bold tabular-nums text-nct-ink">{score}</div>
          </div>
```

with:

```tsx
          <div className="text-right">
            <div className="nct-label">Score</div>
            <div
              className="font-mono text-lg font-bold tabular-nums text-nct-ink"
              role="status"
              aria-atomic="true"
            >
              <span aria-hidden="true" data-testid="score-value">
                {displayedScore.toLocaleString()}
              </span>
              {/* Announces only the settled value, not every animated
                  intermediate frame — a live region re-rendered 60x/sec
                  would be far worse than the static number it replaces. */}
              <span className="sr-only" aria-live="polite">
                Score {score.toLocaleString()}
              </span>
            </div>
          </div>
```

`aria-label` for the `role="status"` query in the test comes from its own
text content ("Score …"), so no explicit `aria-label` attribute is needed —
Playwright's accessible-name computation already reads it from the
`sr-only` span's text.

`sr-only` needs to exist as a Tailwind utility — Tailwind v4 ships it by
default (visually-hidden-but-accessible), so no CSS addition is required;
verify by checking it renders with zero visible size in Step 4's screenshot
if in doubt.

- [ ] **Step 4: Run the script to verify it passes**

Run: `npm run lint && npm run build && node tests/client-drawing.spec.mjs`
Expected: lint clean, build clean, `T23` and `T23b` both PASS, overall
pass count is the previous baseline + 2.

- [ ] **Step 5: Commit**

```bash
git add neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx neo-draw-ai-scaffold/tests/client-drawing.spec.mjs
git commit -m "feat: animate score count-up with accessible status region"
```

---

### Task 2: Timer urgency pulse

**Files:**
- Modify: `neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx` (the ring wrapper div, currently line 77)
- Test: `neo-draw-ai-scaffold/tests/client-drawing.spec.mjs` (append after Task 1's T23b)

**Interfaces:**
- Consumes: the existing `urgent` boolean already computed in Task 1's
  unchanged line (`const urgent = secondsLeft <= 10 && secondsLeft > 0 && !isRoundOver;`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the new assertion (will fail)**

Append after `T23b`:

```javascript
// ---------- T24: timer pulses when urgent (<=10s left) ----------
// Reuses the same Date.now()-offset trick as T16 to fast-forward the clock
// mid-round (not to expiry) without waiting 20+ real seconds.
await page.evaluate(() => window.__advance(22000)); // 30s round -> ~8s left
await page.waitForTimeout(400); // one 250ms timer tick, plus margin
const ringWrapperClass = await page.evaluate(() => {
  const timerEl = document.querySelector('[role="timer"]');
  return timerEl?.closest('[title="Time left"]')?.className ?? '';
});
log('T24 timer ring pulses in the urgent window', /nct-pulse/.test(ringWrapperClass), ringWrapperClass);
```

- [ ] **Step 2: Run the script to confirm it fails**

Run: `node tests/client-drawing.spec.mjs`
Expected: `T24` FAILs (`nct-pulse` not yet applied).

- [ ] **Step 3: Implement**

In `RoundHeader.tsx`, the ring wrapper div (currently line 77):

```tsx
          <div className="relative grid h-16 w-16 shrink-0 place-items-center" title="Time left">
```

becomes:

```tsx
          <div
            className={`relative grid h-16 w-16 shrink-0 place-items-center ${urgent ? "nct-pulse" : ""}`}
            title="Time left"
          >
```

No CSS change needed — `.nct-pulse` already exists in `globals.css:136-138`
and is already covered by the `prefers-reduced-motion` block at
`globals.css:148-153`.

- [ ] **Step 4: Run the script to verify it passes**

Run: `npm run lint && npm run build && node tests/client-drawing.spec.mjs`
Expected: lint clean, build clean, `T24` PASSes.

- [ ] **Step 5: Commit**

```bash
git add neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx neo-draw-ai-scaffold/tests/client-drawing.spec.mjs
git commit -m "feat: pulse the timer ring during the urgent window"
```

---

### Task 3: Scoreboard visual treatment

**Files:**
- Modify: `neo-draw-ai-scaffold/src/app/globals.css` (new `.nct-scoreboard` class, after `.nct-panel` at line 101)
- Modify: `neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx` (Score+Round wrapper, currently lines 67-75 — note Score's inner content now comes from Task 1)
- Test: `neo-draw-ai-scaffold/tests/client-drawing.spec.mjs` (append after Task 2's T24)

**Interfaces:**
- Consumes: Task 1's Score markup (the `role="status"` div) and the plain
  Round digit div — both get wrapped, not replaced.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the new assertion (will fail)**

Append after `T24`:

```javascript
// ---------- T25: scoreboard treatment is applied ----------
const scoreboardCount = await page.locator('.nct-scoreboard').count();
log('T25 Score/Round grouped in the scoreboard treatment', scoreboardCount === 1, `count=${scoreboardCount}`);
```

- [ ] **Step 2: Run the script to confirm it fails**

Run: `node tests/client-drawing.spec.mjs`
Expected: `T25` FAILs (`count=0`).

- [ ] **Step 3: Implement**

In `globals.css`, after the `.nct-panel` block (currently ending line 101),
insert:

```css
/* Denser, more "HUD"-like than .nct-panel — an inset shadow reads as a lit
   segment display rather than a soft floating card. Groups Score + Round
   into one scoreboard-style unit (see RoundHeader). */
.nct-scoreboard {
  background: color-mix(in oklab, var(--color-nct-900) 92%, transparent);
  border: 1px solid color-mix(in oklab, var(--color-nct-steel) 35%, transparent);
  border-radius: 0.625rem;
  box-shadow:
    0 1px 0 0 color-mix(in oklab, var(--color-nct-steel) 10%, transparent) inset,
    0 2px 8px -4px rgba(0, 0, 0, 0.8) inset;
}
```

In `RoundHeader.tsx`, replace the Score+Round wrapper (currently lines
67-75 — the outer `<div className="text-right">Score…</div>` and
`<div className="text-right">Round…</div>` pair, immediately before the
timer ring div):

```tsx
          <div className="text-right">
            <div className="nct-label">Score</div>
            <div ...Task 1's markup... </div>
          </div>
          <div className="text-right">
            <div className="nct-label">Round</div>
            <div className="font-mono text-lg font-bold tabular-nums text-nct-ink">{round}</div>
          </div>
```

with (Score's inner content is exactly what Task 1 left it as — only the
wrapper and digit sizing change here):

```tsx
          <div className="nct-scoreboard flex items-stretch divide-x divide-nct-steel/20 px-3 py-1.5">
            <div className="pr-3 text-right">
              <div className="nct-label">Score</div>
              <div
                className="font-mono text-xl font-black tracking-wide tabular-nums text-nct-ink"
                role="status"
                aria-atomic="true"
              >
                <span aria-hidden="true" data-testid="score-value">
                  {displayedScore.toLocaleString()}
                </span>
                <span className="sr-only" aria-live="polite">
                  Score {score.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="pl-3 text-right">
              <div className="nct-label">Round</div>
              <div className="font-mono text-xl font-black tracking-wide tabular-nums text-nct-ink">
                {round}
              </div>
            </div>
          </div>
```

(This folds Task 1's Score markup into the new wrapper and bumps both
digits from `text-lg font-bold` to `text-xl font-black tracking-wide` —
apply this as one edit if executing Task 1 and Task 3 close together;
they're listed as separate tasks for review granularity, not because the
Score markup should be written twice.)

- [ ] **Step 4: Run the script to verify it passes**

Run: `npm run lint && npm run build && node tests/client-drawing.spec.mjs`
Expected: lint clean, build clean, `T25` PASSes, `T23`/`T23b`/`T24` still
PASS (scoreboard wrapper doesn't change the Score status region's
accessible name or the pulse class's target element).

Visual sanity check: the regression script already takes a full screenshot
at its end (`page.screenshot({ path: process.env.SHOT || ... })`, near the
bottom of `client-drawing.spec.mjs`) — set `SHOT` to a scratch path when
running Step 4's command and glance at it for the scoreboard's visual
weight; no separate script needed for this task.

- [ ] **Step 5: Commit**

```bash
git add neo-draw-ai-scaffold/src/app/globals.css neo-draw-ai-scaffold/src/components/ui/RoundHeader.tsx neo-draw-ai-scaffold/tests/client-drawing.spec.mjs
git commit -m "feat: denser scoreboard treatment for Score/Round"
```

---

### Task 4: Round-transition wipe

**Files:**
- Create: `neo-draw-ai-scaffold/src/components/ui/RoundTransitionWipe.tsx`
- Modify: `neo-draw-ai-scaffold/src/app/globals.css` (new keyframes + class, after `.nct-rise` at line 146; add to the existing reduced-motion block at lines 148-153)
- Modify: `neo-draw-ai-scaffold/src/app/page.tsx` (import at line 9, render inside `<DrawingCanvas>` alongside `RoundOverlay`, currently lines 389-393)
- Test: `neo-draw-ai-scaffold/tests/client-drawing.spec.mjs` (append after Task 3's T25)

**Interfaces:**
- Consumes: `round: number` (already exists as page.tsx state, incremented
  in `newRound()`).
- Produces: `RoundTransitionWipe` — a zero-prop component; `export function RoundTransitionWipe(): JSX.Element`.

- [ ] **Step 1: Write the new assertion (will fail)**

Append after `T25`:

```javascript
// ---------- T26: round-transition wipe renders on New Round ----------
// Existence check only (not exact animation timing, which would be
// flaky) — clicking New Round should mount a wipe element immediately.
await page.getByRole('button', { name: /new round/i }).first().click();
const wipeCount = await page.locator('[data-testid="round-wipe"]').count();
log('T26 round-transition wipe renders on New Round', wipeCount === 1, `count=${wipeCount}`);
await page.waitForTimeout(600); // let the round settle before any later checks
```

Place this near the existing `T11` New Round block (around line 156-162)
rather than at the very end, so it exercises the same "click New Round"
action already being tested there instead of adding a redundant click.
Either position is correct; keeping it near T11 keeps round-flow
assertions together.

- [ ] **Step 2: Run the script to confirm it fails**

Run: `node tests/client-drawing.spec.mjs`
Expected: `T26` FAILs (`count=0`, component doesn't exist yet).

- [ ] **Step 3: Implement**

Create `neo-draw-ai-scaffold/src/components/ui/RoundTransitionWipe.tsx`:

```tsx
"use client";

/**
 * Brief diagonal wipe played over the canvas at the start of each round,
 * echoing the diagonal amber/steel "light source" motif already in the
 * page background (see the body background-image comment in globals.css).
 * Keyed by `round` in page.tsx — remounting on round-change replays the
 * CSS animation with no imperative replay logic needed.
 */
export function RoundTransitionWipe() {
  return <div aria-hidden="true" data-testid="round-wipe" className="nct-round-wipe pointer-events-none absolute inset-0 z-20" />;
}
```

In `globals.css`, after `.nct-rise` (currently ending line 146), insert:

```css
/* Diagonal wipe played once per round (see RoundTransitionWipe) — two
   brand-color bands sweep across and off, echoing the angled light
   sources in the page background above. */
@keyframes nct-round-wipe {
  0% {
    transform: translateX(-120%) skewX(-12deg);
    opacity: 1;
  }
  70% {
    opacity: 1;
  }
  100% {
    transform: translateX(120%) skewX(-12deg);
    opacity: 0;
  }
}
.nct-round-wipe {
  background: linear-gradient(
    100deg,
    transparent 0%,
    var(--color-nct-steel) 35%,
    var(--color-nct-amber) 55%,
    transparent 75%
  );
  animation: nct-round-wipe 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
```

Then extend the existing reduced-motion block (currently lines 148-153):

```css
@media (prefers-reduced-motion: reduce) {
  .nct-pulse,
  .nct-rise {
    animation: none;
  }
}
```

to:

```css
@media (prefers-reduced-motion: reduce) {
  .nct-pulse,
  .nct-rise,
  .nct-round-wipe {
    animation: none;
  }
}
```

In `page.tsx`, add the import (currently line 9, right after the
`RoundOverlay` import):

```tsx
import { RoundOverlay } from "@/components/ui/RoundOverlay";
import { RoundTransitionWipe } from "@/components/ui/RoundTransitionWipe";
```

Render it inside `<DrawingCanvas>`, as a sibling to `RoundOverlay` (currently
lines 389-393):

```tsx
              <RoundOverlay
                result={roundResult}
                onNewRound={newRound}
                onKeepDrawing={keepDrawing}
              />
```

becomes:

```tsx
              <RoundTransitionWipe key={round} />

              <RoundOverlay
                result={roundResult}
                onNewRound={newRound}
                onKeepDrawing={keepDrawing}
              />
```

- [ ] **Step 4: Run the script to verify it passes**

Run: `npm run lint && npm run build && node tests/client-drawing.spec.mjs`
Expected: lint clean, build clean, `T26` PASSes, full suite at previous
baseline + 4 new passing assertions (T23, T23b, T24, T25, T26 — 5 total
across this plan) with the same 2 known-unrelated failures.

- [ ] **Step 5: Commit**

```bash
git add neo-draw-ai-scaffold/src/components/ui/RoundTransitionWipe.tsx neo-draw-ai-scaffold/src/app/globals.css neo-draw-ai-scaffold/src/app/page.tsx neo-draw-ai-scaffold/tests/client-drawing.spec.mjs
git commit -m "feat: play a diagonal wipe at the start of every round"
```

---

## Final verification (after all 4 tasks)

- [ ] Run `npm run lint && npm run build && node tests/client-drawing.spec.mjs` one more time end-to-end.
- [ ] Take a fresh desktop screenshot and a mobile (390×844) screenshot for visual sanity, same approach used earlier this session (a throwaway Playwright script writing to `$CLAUDE_JOB_DIR/tmp/`, deleted afterward — never commit a scratch script into `tests/`).
- [ ] Confirm the working tree has no leftover scratch files (`git status --short`).
