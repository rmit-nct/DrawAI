# NEO DrawAI

A real-time collaborative drawing web app inspired by Google's *Quick, Draw!* — draw with your
mouse, touchscreen, or webcam gestures, race against a timer, and let an AI model guess what
you've drawn.

## Purpose

NEO DrawAI was built to demonstrate full-stack web development, real-time interaction, and
computer-vision integration in a single playable project. Users get a drawing prompt, sketch it
under a time limit using whichever input method they prefer, and an AI model attempts to guess
the drawing from the top predicted labels.

## How it works (high level)

- **Drawing engine**: A `<canvas>`-based drawing surface (`src/hooks/useCanvasDrawing.ts`) tracks
  strokes as arrays of points, supporting undo/clear and rendering via the browser's Canvas 2D API.
- **Input modes**: Mouse and touch draw directly via pointer events. Webcam mode
  (`src/hooks/useHandTracking.ts` + `src/lib/mediapipe/handTracking.ts`) uses MediaPipe's
  HandLandmarker to track the index fingertip; a pinch gesture (thumb + index finger together)
  acts as "pen down," feeding the same drawing functions used by mouse/touch input.
- **AI guessing**: The canvas can be exported as a base64 PNG and sent to `/api/guess`
  (`src/app/api/guess/route.ts`), a server-side route that calls the Gemini API and returns up to
  3 guessed labels with confidence scores.
- **Mock AI mode**: `src/lib/ai/mockGuesser.ts` returns randomized sample guesses so the game is
  fully playable and demoable without a configured Gemini key. Toggle `USE_MOCK_AI` in
  `src/app/page.tsx` to switch between mock and real predictions.

### Known limitation

At this stage, the Gemini-backed guessing route is implemented but not yet load-tested against a
wide range of hand-drawn sketches — accuracy on ambiguous or very rough drawings may be
inconsistent. The mock system is the default (`USE_MOCK_AI = true`) so the app is always fully
functional for grading/demo purposes even if the AI key isn't configured.

## Setup instructions

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# then fill in GEMINI_API_KEY (see .env format below)

# 3. Run the dev server
npm run dev
# open http://localhost:3000
```

### Build for production

```bash
npm run build
npm run start
```

## Library dependencies

| Library | Purpose |
|---|---|
| `next`, `react`, `react-dom` | App framework / UI |
| `typescript` | Type safety |
| `tailwindcss` | Styling |
| `@mediapipe/tasks-vision` | Webcam hand-landmark detection for gesture drawing |
| `@google/generative-ai` | Gemini API client for AI guessing |

Database (MongoDB or PostgreSQL — final choice TBD by the team, see contribution table) will be
added once persistence (saved drawings, scores, leaderboards) is needed.

## .env format

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes, for real AI guesses | Get one at https://aistudio.google.com/app/apikey. Server-side only — never exposed to the browser. |
| `DATABASE_URL` | Not yet | Will be required once the database layer is added. |

**Never commit `.env.local`.** Only `.env.example` (with blank values) belongs in the repo.

## Extra features

- Undo/clear controls, independent of input mode.
- Input-mode switcher (mouse / touch / webcam) so the app is fully usable without a webcam.
- Round timer with a "New Round" button that picks a new random prompt.
- Mock AI system that keeps the game playable even without an API key configured.

## Team contribution

| Name | GitHub | Role |
|---|---|---|
| _TBD_ | _TBD_ | _TBD_ |
| _TBD_ | _TBD_ | _TBD_ |
| _TBD_ | _TBD_ | _TBD_ |

*(Fill in as the team is finalized — this table is required in the final README per the project spec.)*

## Project structure

```
src/
  app/
    page.tsx               # Main game page
    api/guess/route.ts     # Gemini-backed AI guessing endpoint
  components/
    canvas/DrawingCanvas.tsx
    webcam/WebcamGestureLayer.tsx
    ai/AIGuessPanel.tsx
    ui/Toolbar.tsx
  hooks/
    useCanvasDrawing.ts     # Stroke state, undo/clear, pointer handlers
    useHandTracking.ts      # Webcam + MediaPipe loop
    useCountdownTimer.ts
  lib/
    canvas/drawing.ts       # Pure drawing helper functions
    mediapipe/handTracking.ts
    ai/mockGuesser.ts
    prompts.ts
  types/index.ts            # Shared TypeScript types
```

## Deadline

Project deadline: **17/9/2026**
