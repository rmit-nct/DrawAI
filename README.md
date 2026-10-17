# NEO DrawAI

A drawing game by **Neo Culture Tech**, inspired by Google's *Quick, Draw!* — draw with your
mouse, your finger, or a pinch of your hand in front of the webcam, race a timer, and let an AI
model guess what you've drawn.

## Purpose

NEO DrawAI demonstrates full-stack web development, real-time interaction, and computer-vision
integration in a single playable project. You get a drawing prompt, sketch it under a time limit
using whichever input method you prefer, and an AI model attempts to guess it from the top
predicted labels. Guessing correctly scores points; the round ends when the clock runs out.

## How it works (high level)

- **Drawing engine** — `src/hooks/useCanvasDrawing.ts` captures strokes as arrays of points and
  paints them with the Canvas 2D API. Strokes are stored in a fixed *logical* 800×600 space and
  mapped to the real canvas box × `devicePixelRatio` at paint time, so drawings stay sharp on
  high-DPI screens, survive window resizes, and are identical no matter what size the canvas is
  on screen. Supports undo, redo, clear, colours and brush sizes.
- **Input modes** — Mouse and touch draw through pointer events (with pointer capture, so a
  stroke keeps going if your cursor leaves the canvas). Webcam mode
  (`src/hooks/useHandTracking.ts` + `src/lib/mediapipe/handTracking.ts`) uses MediaPipe's
  HandLandmarker to track the index fingertip; a pinch (thumb + index finger together) acts as
  "pen down". All three feed the *same* `startStrokeAt` / `extendStrokeTo` / `endStroke`
  functions, so drawing behaviour never diverges by input source.
- **AI guessing** — The drawing is rendered off-screen to a base64 PNG and posted to `/api/guess`
  (`src/app/api/guess/route.ts`), a server-side route that calls the Gemini API and returns up to
  3 labels with confidence scores. The key stays on the server. Guessing can be triggered
  manually or live (debounced) while you draw.
- **Mock AI mode** — `src/lib/ai/mockGuesser.ts` produces plausible predictions entirely in the
  browser, so the game is fully playable and demoable with no API key. The client asks the server
  once (`GET /api/guess`) whether a key is configured, and switches automatically; you can also
  flip between **Mock** and **Gemini** in the AI panel at runtime. If a Gemini call fails, the app
  falls back to mock predictions and says so rather than breaking the round.

### Known limitations

- **AI accuracy.** The Gemini-backed route works, but it has not been evaluated across a wide
  range of rough hand-drawn sketches — results on ambiguous or very quick doodles are
  inconsistent. Mock mode is the default whenever `GEMINI_API_KEY` is absent, and mock results
  are always clearly labelled as such in the UI.
- **Hand-tracking assets.** MediaPipe's WASM runtime and the `hand_landmarker.task` model are
  fetched from public CDNs on first use of webcam mode (~10 MB). On a restricted network they
  will fail; the app reports that specifically (model, not camera) and offers a Retry. See
  *Self-hosting the hand-tracking model* below for the offline path.
- **No persistence yet.** Scores and drawings are in-memory only; there is no database or
  multi-user session. See *Roadmap*.

## Setup instructions

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# then fill in GEMINI_API_KEY (see .env format below) — optional, the game
# runs in Mock AI mode without it

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

Webcam mode needs camera permission and a secure context — `http://localhost` is fine in
development, but a deployed build must be served over **https://**.

### Build for production

```bash
npm run build
npm run start
```

### Self-hosting the hand-tracking model (optional, for offline demos)

```bash
mkdir -p public/mediapipe
cp -r node_modules/@mediapipe/tasks-vision/wasm public/mediapipe/wasm
curl -L -o public/mediapipe/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```

Then set in `.env.local`:

```
NEXT_PUBLIC_MEDIAPIPE_WASM_PATH=/mediapipe/wasm
NEXT_PUBLIC_HAND_MODEL_PATH=/mediapipe/hand_landmarker.task
```

## Library dependencies

| Library | Purpose |
|---|---|
| `next`, `react`, `react-dom` | App framework / UI |
| `typescript` | Type safety |
| `tailwindcss` | Styling (v4, with the NCT palette defined in `src/app/globals.css`) |
| `@mediapipe/tasks-vision` | Webcam hand-landmark detection for gesture drawing |
| `@google/generative-ai` | Gemini API client for AI guessing |

Database (MongoDB or PostgreSQL — final choice TBD by the team, see contribution table) will be
added once persistence (saved drawings, scores, leaderboards) is needed.

## .env format

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Optional | Enables real AI guesses. Get one at https://aistudio.google.com/app/apikey. Server-side only — never exposed to the browser. Without it the app runs in Mock AI mode. |
| `GEMINI_MODEL` | Optional | Overrides the Gemini model name. Defaults to `gemini-2.5-flash`. |
| `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH` | Optional | Self-hosted MediaPipe WASM directory. Defaults to the jsDelivr CDN. |
| `NEXT_PUBLIC_HAND_MODEL_PATH` | Optional | Self-hosted `hand_landmarker.task`. Defaults to Google's CDN. |
| `DATABASE_URL` | Not yet | Will be required once the database layer is added. |

**Never commit `.env.local`.** Only `.env.example` (with blank values) belongs in the repo.

## Design

The interface uses the **Neo Culture Tech** identity, with the palette sampled directly from the
NCT logo:

| Token | Hex | Role |
|---|---|---|
| NCT Navy | `#1F2844` | Surfaces, panels, default ink colour |
| NCT Steel | `#5095AA` | Structure, secondary actions, information |
| NCT Amber | `#F8B73A` | The single most important thing on screen — active tool, running timer, prompt word |

The logo's signature amber offset behind each slab of the "N" is reused as the frame around the
drawing canvas. The mark itself is vector-traced in `src/components/brand/NctLogo.tsx` and
`public/nct-mark.svg`, so it stays crisp at any size.

## Extra features

- Undo / **redo** / clear, with ⌘/Ctrl+Z and ⇧⌘/Ctrl+Z shortcuts, independent of input mode.
- Input-mode switcher (mouse / touch / webcam) so the app is fully usable without a camera.
- Five brand brush colours and four brush sizes.
- Round timer, score, and an end-of-round card that shows whether the AI got it.
- **Live guessing** — a debounced guess fires while you draw, not just on submit.
- Runtime **Mock ⇄ Gemini** switch, with automatic fallback to Mock when the API fails.
- Live webcam preview with a fingertip cursor that turns amber when the pen is down.
- Fully responsive from 390px phones up, with a device-pixel-ratio–aware canvas.

## Testing

Client-side behaviour is covered by a Playwright script that drives a real browser: stroke
capture and persistence, dots, undo/redo/clear, off-canvas drags, timer behaviour, round end and
scoring, AI success/failure/malformed-response paths, webcam mount and error reporting, mobile
overflow, coordinate accuracy on a scaled canvas, and DPR sharpness.

## Team contribution

| Name | GitHub | Role |
|---|---|---|
| Tran Vinh Trong | Dilson20 | developer |
| Mai Ho Tuan Anh | _TBD_ | developer |
| Tran Duc Khang | KhangTran13 | developer |
| Tram Anh Tuan | TuanTram2401 | developer |

*(Fill in as the team is finalized — this table is required in the final README per the project spec.)*

## Project structure

```
src/
  app/
    page.tsx                  # Main game page: round flow, scoring, layout
    layout.tsx                # Metadata, viewport, NCT background
    globals.css               # NCT design tokens and brand utilities
    api/guess/route.ts        # GET = capability probe, POST = Gemini guess
  components/
    brand/NctLogo.tsx         # Vector NCT "N" mark + lockup
    canvas/DrawingCanvas.tsx  # Responsive, DPR-aware canvas + imperative handle
    webcam/WebcamGestureLayer.tsx
    ai/AIGuessPanel.tsx
    ui/Toolbar.tsx            # Input mode, colours, brush sizes, history
    ui/RoundHeader.tsx        # Prompt, timer, score
    ui/RoundOverlay.tsx       # End-of-round card
  hooks/
    useCanvasDrawing.ts       # Stroke capture, undo/redo/clear, repaint
    useHandTracking.ts        # Webcam + MediaPipe loop
    useCountdownTimer.ts      # Deadline-based round timer
  lib/
    canvas/drawing.ts         # Pure drawing + coordinate helpers
    mediapipe/handTracking.ts # Model loading, pinch detection
    ai/guessService.ts        # Mock/Gemini routing + graceful degradation
    ai/mockGuesser.ts
    prompts.ts                # Word list, confusion sets, answer matching
  types/index.ts              # Shared TypeScript types
public/
  nct-mark.svg                # NCT logo mark
```

## Roadmap

- Persistence layer (MongoDB or PostgreSQL): saved drawings, scores, leaderboard.
- Multiplayer rooms over WebSockets, so several players draw and guess in one session.
- Demo video and deployed Vercel URL for submission.

## Demo Video Link
https://youtu.be/pAzVw3SZheE

## Deadline

Project deadline: **17/9/2026**
