# Arcade Energy Redesign — Design Spec

**Status:** Approved (chosen from 3 proposed directions — see conversation history on `feature/UI-design`)

## Goal

Give NEO DrawAI's round flow more of a competitive, kinetic, arcade-scoreboard
feel, without touching the fixed NCT brand palette (navy `#1F2844` / steel
`#5095AA` / amber `#F8B73A`) or introducing new dependencies. This is a
motion-and-typographic-weight pass over the existing `RoundHeader` and the
canvas/round-transition moment — not a materials/texture change (that was
"Direction A", not chosen) and not a new type system (that was "Direction C",
not chosen).

## Why this direction

The app's core loop is short, timed, competitive rounds among a small group.
The current `RoundHeader` communicates score/round/time correctly but
statically — the score snaps to its new value with no sense of a moment
having happened, the timer only changes color (no urgency signal beyond
that) when time is almost up, and a new round begins with a hard cut. None
of that is wrong, but none of it makes scoring or a close finish feel
exciting the way a party/arcade game should.

## Scope — four independent pieces, all in the round-flow area

1. **Score count-up.** When `score` changes, animate the displayed number
   from its old value to its new value (~600ms, ease-out) instead of
   snapping. Large numbers get thousand separators. The score's accessible
   name announces only the final value once (not every intermediate animated
   frame) via a separate `aria-live` status region — spamming a live region
   with 60fps intermediate values is worse than the current static text.
2. **Timer urgency pulse.** Reuse the existing `.nct-pulse` animation
   (already used for the webcam "hand detected" indicator) on the timer ring
   during the existing `urgent` window (`secondsLeft <= 10`), so the last 10
   seconds read as more alarming than a color change alone.
3. **Scoreboard visual treatment.** Group Score + Round into one bordered,
   denser "HUD" box (new `.nct-scoreboard` CSS class — inset shadow, tighter
   than the airy `.nct-panel`), with bolder/larger tabular-nums digits.
   Visual-only, no new state.
4. **Round-transition wipe.** A brief (~500ms) diagonal steel→amber wipe
   plays across the canvas frame at the start of every round (including the
   very first), echoing the diagonal "light source" motif already in the
   page background (`globals.css`, the `body` `background-image` comment).
   Implemented as a small component keyed by `round`, so remounting on
   round-change replays the CSS animation for free — no imperative
   animation-replay logic.

## Explicitly out of scope

- Any change to the NCT color palette, logo, or the marker-font treatment of
  the guessed word (`GuessReveal`) — brand is fixed per earlier decision.
- The eraser-tool concept discovered in the discarded parallel redesign
  (mentioned to the user as a possible separate future feature; not part of
  this spec).
- Any new npm dependency (no animation library) — everything here is CSS
  keyframes/transitions plus one small `requestAnimationFrame` hook,
  matching the existing hand-rolled approach (`.nct-pulse`, `.nct-rise`, the
  hand-rolled SVG ring timer).

## Constraints (apply to every piece above)

- Every new animation must be inert under `prefers-reduced-motion: reduce`,
  matching the existing pattern for `.nct-pulse` / `.nct-rise` in
  `globals.css`.
- No new npm dependencies.
- Existing Playwright regression script (`tests/client-drawing.spec.mjs`)
  must stay green at its current pre-existing baseline (34/36 — the 2
  failures are unrelated, pre-existing webcam-model-CDN issues in this
  sandbox).
