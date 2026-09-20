import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3000';
const results = [];
function log(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 940 } });
const page = await ctx.newPage();

const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.addInitScript(() => {
  window.__playLog = [];
  window.__pauseLog = [];
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    window.__playLog.push(this.currentSrc || this.src);
    return origPlay.apply(this, args);
  };
  const origPause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function (...args) {
    window.__pauseLog.push(this.currentSrc || this.src);
    return origPause.apply(this, args);
  };
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.getByLabel(/your name/i).fill('Playwright Bot');
await page.getByRole('button', { name: /^start game$/i }).click(); // dismiss the start screen; also arms background music
await page.waitForTimeout(900);

const canvas = page.locator('canvas').first();
await canvas.waitFor();

// The mock guesser randomly "recognises" the prompt as strokes are drawn, and
// live guessing (on by default, unmetered in mock mode) would otherwise end
// a round early at random behind this whole suite's back — every AI-related
// check below already drives guesses explicitly via "Guess now".
await page.getByRole('checkbox', { name: /live/i }).uncheck();

const inkCount = async () =>
  page.evaluate(() => {
    const c = document.querySelector('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) n++;
    }
    return n;
  });

let box = await canvas.boundingBox();
const P = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

async function stroke(pts) {
  const p0 = P(...pts[0]);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  for (const pt of pts.slice(1)) {
    const p = P(...pt);
    await page.mouse.move(p.x, p.y, { steps: 8 });
  }
  await page.mouse.up();
  await page.waitForTimeout(140);
}

const readTimer = async () =>
  (await page.locator('[role="timer"]').first().textContent().catch(() => null))?.trim() ?? null;

// ---------- T1 ----------
log('T1 canvas starts blank/white', (await inkCount()) === 0, `ink=${await inkCount()}`);

// ---------- T2 ----------
await stroke([[0.15, 0.2], [0.4, 0.35], [0.6, 0.25], [0.8, 0.5]]);
const s1 = await inkCount();
log('T2 mouse drag draws a stroke', s1 > 500, `ink=${s1}`);

// ---------- T3: SECOND stroke survives commit (the null-stroke regression) ----------
await stroke([[0.2, 0.6], [0.45, 0.72], [0.7, 0.62]]);
await page.waitForTimeout(300);
const s2 = await inkCount();
log('T3 second stroke persists after pointer up', s2 > s1 * 1.4, `one=${s1} two=${s2}`);

// ---------- T3b: many strokes all persist ----------
for (let i = 0; i < 4; i++) {
  await stroke([[0.1 + i * 0.05, 0.85], [0.2 + i * 0.05, 0.9]]);
}
const s6 = await inkCount();
log('T3b six strokes all persist', s6 > s2, `six=${s6}`);

// ---------- T4: single click makes a dot ----------
const preDot = await inkCount();
const dp = P(0.9, 0.9);
await page.mouse.move(dp.x, dp.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(220);
const postDot = await inkCount();
log('T4 single click leaves a dot', postDot > preDot, `before=${preDot} after=${postDot}`);

// ---------- T5: undo actually removes the visible last mark ----------
const beforeUndo = await inkCount();
await page.getByRole('button', { name: /^undo$/i }).click();
await page.waitForTimeout(280);
const afterUndo = await inkCount();
log('T5 undo removes the last visible stroke', afterUndo < beforeUndo, `before=${beforeUndo} after=${afterUndo}`);

// ---------- T5b: redo restores it ----------
await page.getByRole('button', { name: /^redo$/i }).click();
await page.waitForTimeout(280);
const afterRedo = await inkCount();
log('T5b redo restores the stroke', afterRedo > afterUndo, `after=${afterRedo}`);

// ---------- T5c: keyboard undo ----------
await page.keyboard.press('Control+z');
await page.waitForTimeout(280);
log('T5c Ctrl+Z undoes', (await inkCount()) < afterRedo, `ink=${await inkCount()}`);

// ---------- T6: clear ----------
await page.getByRole('button', { name: /^clear$/i }).click();
await page.waitForTimeout(280);
const afterClear = await inkCount();
log('T6 clear empties the canvas', afterClear === 0, `ink=${afterClear}`);

// ---------- T7: dragging off-canvas keeps working (pointer capture) ----------
const p0 = P(0.3, 0.3);
await page.mouse.move(p0.x, p0.y);
await page.mouse.down();
await page.mouse.move(box.x + box.width + 80, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const offCanvasInk = await inkCount();
await stroke([[0.2, 0.4], [0.5, 0.45], [0.7, 0.4]]);
const afterReenter = await inkCount();
log('T7 stroke survives dragging off-canvas', offCanvasInk > 200, `ink=${offCanvasInk}`);
log('T7b drawing still works afterwards', afterReenter > offCanvasInk, `ink=${afterReenter}`);

// ---------- T8: timer runs on load ----------
const t1 = await readTimer();
await page.waitForTimeout(2400);
const t2 = await readTimer();
log('T8 timer runs on page load (no New Round needed)', t1 && t2 && t1 !== t2, `t1=${t1} t2=${t2}`);

// ---------- T9: timer ticks ~1/s ----------
const samples = [];
for (let i = 0; i < 5; i++) { samples.push(await readTimer()); await page.waitForTimeout(1000); }
log('T9 timer ticks once per second', new Set(samples).size >= 4, `samples=${samples.join(',')}`);

// ---------- T10: brush colour + size are applied ----------
await page.getByRole('button', { name: /NCT Amber/i }).click();
await page.getByTitle(/Bold \(12px\)/i).click();
await stroke([[0.35, 0.15], [0.65, 0.18]]);
const amberPixels = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - 0xf8) < 22 && Math.abs(d[i + 1] - 0xb7) < 22 && Math.abs(d[i + 2] - 0x3a) < 26) n++;
  }
  return n;
});
log('T10 brush colour is applied to strokes', amberPixels > 200, `amberPx=${amberPixels}`);

// ---------- T11: New round ----------
await page.getByRole('button', { name: /new round/i }).first().click();
await page.waitForTimeout(400);
log('T11 New Round clears the canvas', (await inkCount()) === 0, `ink=${await inkCount()}`);
const r1 = await readTimer();
await page.waitForTimeout(2300);
log('T11b New Round restarts the countdown', r1 !== (await readTimer()), `r1=${r1} r2=${await readTimer()}`);

// ---------- T26: round-transition wipe renders on New Round ----------
const wipeCount = await page.locator('[data-testid="round-wipe"]').count();
log('T26 round-transition wipe renders on New Round', wipeCount === 1, `count=${wipeCount}`);

// ---------- T27: mute toggle flips aria-pressed and silences audio elements ----------
const muteBtn = page.locator('[data-testid="mute-toggle"]');
const pressedBefore = await muteBtn.getAttribute('aria-pressed');
await muteBtn.click();
const pressedAfter = await muteBtn.getAttribute('aria-pressed');
log('T27 mute toggle flips aria-pressed', pressedBefore !== pressedAfter, `before=${pressedBefore} after=${pressedAfter}`);
await muteBtn.click(); // unmute again, back to the default state for later tests
log('T27b mute toggle unmutes back to the original state', (await muteBtn.getAttribute('aria-pressed')) === pressedBefore, '');

// ---------- T28: the three sound assets actually load ----------
const soundResources = await page.evaluate(() =>
  performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes('/sound/'))
);
log(
  'T28 background music, new-round, and ticking sounds are all fetched',
  ['background-music.mp3', 'new-round.wav', 'ticking-sound.wav'].every((f) =>
    soundResources.some((n) => n.endsWith(f))
  ),
  soundResources.join(', ')
);

// ---------- T12: manual AI guess (mock) ----------
await stroke([[0.3, 0.3], [0.6, 0.5], [0.4, 0.7], [0.3, 0.3]]);
await page.getByRole('button', { name: /guess now/i }).click();
await page.waitForTimeout(2200);
let bodyText = await page.locator('body').innerText();
const guessWord = (await page.locator('[data-testid="ai-guess-word"]').first().innerText().catch(() => '')).trim();
log('T12 AI guess returns a prediction', guessWord.length > 0, guessWord);
log('T12b mock output is labelled as mock', /mock/i.test(bodyText), '');

// ---------- T13: prompt shown ----------
const promptText = await page.locator('main, header').first().innerText();
log('T13 a drawing prompt is displayed', !/YOUR WORD\s*…/i.test(promptText), (promptText.match(/YOUR WORD\s*\n?\s*\w+/i) || [''])[0].replace(/\n/g, ' '));

// ---------- T23: score has an accessible status region ----------
const scoreStatus = page.locator('[role="status"]').first();
const scoreStatusText = (await scoreStatus.textContent().catch(() => '')) ?? '';
log('T23 score has an accessible status region', /score\s*0/i.test(scoreStatusText), scoreStatusText);
await page.waitForTimeout(700); // past the ~600ms count-up duration
const scoreDigits = (await page.locator('[data-testid="score-value"]').innerText().catch(() => '')).trim();
log('T23b displayed score settles to the real value', scoreDigits === '0', scoreDigits);

// ---------- T24: timer pulses when urgent (<=10s left) ----------
// Fresh round first: by this point in the suite, real wall-clock time spent
// on earlier steps could already have eaten well into the 30s budget, so the
// +18s jump below could overshoot past 0 instead of landing in the urgent
// window (or disable "Guess now" for T14/T15 right after).
await page.getByRole('button', { name: /new round/i }).first().click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  window.__realDateNow = Date.now.bind(Date);
  let offset = 0;
  window.__advance = (ms) => { offset += ms; };
  Date.now = () => window.__realDateNow() + offset;
});
await page.evaluate(() => window.__advance(22000)); // 30s round -> 8s left, safely inside the urgent (<=10s) window with margin on both sides
await page.waitForTimeout(400); // one 250ms timer tick, plus margin
const ringWrapperClass = await page.evaluate(() => {
  const timerEl = document.querySelector('[role="timer"]');
  return timerEl?.closest('[title="Time left"]')?.className ?? '';
});
log('T24 timer ring pulses in the urgent window', /nct-pulse/.test(ringWrapperClass), ringWrapperClass);

// Undo the Date.now patch and start a fresh round: T14/T15 below test API
// error handling, not the timer, and a stale +18s offset left in place would
// race the round's 30s budget and disable "Guess now" out from under them.
await page.evaluate(() => { Date.now = window.__realDateNow; });
await page.getByRole('button', { name: /new round/i }).first().click();
await page.waitForTimeout(400);
// That reset also cleared the canvas (New Round wipes strokes), and T14/T15
// need ink on it to enable "Guess now" — draw a quick stroke to restore it.
await stroke([[0.3, 0.3], [0.6, 0.5], [0.4, 0.7]]);

// ---------- T25: scoreboard treatment is applied ----------
const scoreboardCount = await page.locator('.nct-scoreboard').count();
log('T25 Score/Round grouped in the scoreboard treatment', scoreboardCount === 1, `count=${scoreboardCount}`);

// ---------- T14: API failure must NOT crash the UI (old crash bug) ----------
const errCountBefore = pageErrors.length;
await page.route('**/api/guess', (route) =>
  route.request().method() === 'POST'
    ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) })
    : route.continue()
);
// force the real (gemini) path if available, else the mock path still exercises the client
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: /guess now/i }).click();
await page.waitForTimeout(2200);
bodyText = await page.locator('body').innerText();
const stillAlive = await page.locator('canvas').count();
log('T14 API 500 does not crash the page', pageErrors.length === errCountBefore && stillAlive === 1,
  pageErrors.slice(errCountBefore).join(' | '));
await page.unroute('**/api/guess');

// ---------- T15: malformed JSON response handled ----------
await page.route('**/api/guess', (route) =>
  route.request().method() === 'POST'
    ? route.fulfill({ status: 200, contentType: 'text/html', body: '<html>not json</html>' })
    : route.continue()
);
const errBefore2 = pageErrors.length;
await page.getByRole('button', { name: /guess now/i }).click();
await page.waitForTimeout(2200);
log('T15 non-JSON API response handled gracefully', pageErrors.length === errBefore2,
  pageErrors.slice(errBefore2).join(' | '));
await page.unroute('**/api/guess');

// ---------- T16: round end -> overlay + scoring ----------
await page.getByRole('button', { name: /new round/i }).last().click();
await page.waitForTimeout(600);

await page.evaluate(() => {
  // shortcut: we can't wait 60s, so drive the clock by faking Date.now
  const realNow = Date.now;
  let offset = 0;
  window.__advance = (ms) => { offset += ms; };
  Date.now = () => realNow.call(Date) + offset;
});
await page.evaluate(() => window.__advance(62000));
await page.waitForTimeout(3000);
bodyText = await page.locator('body').innerText();
log('T16 round ends with an end-of-round card', /time's up|nice drawing/i.test(bodyText),
  (bodyText.match(/(TIME'S UP|NICE DRAWING)[\s\S]{0,60}/i) || [''])[0].replace(/\n/g, ' | '));
const timerAtEnd = await readTimer();
log('T16b timer stops at 00:00', timerAtEnd === '00:00', `timer=${timerAtEnd}`);

// ---------- T16c: a correct guess ends the round immediately, before 00:00 ----------
await page.getByRole('button', { name: /new round/i }).last().click();
await page.waitForTimeout(600);
const promptForMatch = (await page.locator('main, header').first().innerText())
  .match(/YOUR WORD\s*\n?\s*(\w+)/i)?.[1] ?? '';
await page.route('**/api/guess', (route) =>
  route.request().method() === 'POST'
    ? route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ guesses: [{ label: promptForMatch, confidence: 0.95 }], isMock: false }),
      })
    : route.continue()
);
await stroke([[0.2, 0.2], [0.5, 0.4], [0.7, 0.3]]);
await page.getByRole('button', { name: /guess now/i }).click();
await page.waitForTimeout(2000);
bodyText = await page.locator('body').innerText();
log('T16c a correct guess shows "Nice drawing" without waiting for the timer',
  /nice drawing/i.test(bodyText), (bodyText.match(/NICE DRAWING[\s\S]{0,60}/i) || [''])[0].replace(/\n/g, ' | '));
const timerRightAfterGuess = await readTimer();
await page.waitForTimeout(2000);
const timerAfterWaiting = await readTimer();
log('T16d timer freezes above 00:00 on an early correct guess (proves it did not just wait it out)',
  timerRightAfterGuess !== '00:00' && timerRightAfterGuess === timerAfterWaiting,
  `rightAfter=${timerRightAfterGuess} after2s=${timerAfterWaiting}`);
await page.unroute('**/api/guess');

// back to a fresh round
await page.getByRole('button', { name: /new round/i }).last().click();
await page.waitForTimeout(600);

// ---------- T17: webcam mode ----------
const webcamBtn = page.getByRole('radio', { name: /webcam/i }).first();
await webcamBtn.click();
await page.waitForTimeout(4000);
const videoInfo = await page.evaluate(() => {
  const v = document.querySelector('video');
  if (!v) return { exists: false };
  const cs = getComputedStyle(v);
  const r = v.getBoundingClientRect();
  return { exists: true, display: cs.display, w: v.videoWidth, h: v.videoHeight, ready: v.readyState, paused: v.paused, boxW: Math.round(r.width), boxH: Math.round(r.height) };
});
bodyText = await page.locator('body').innerText();
log('T17 webcam mode mounts a video element', videoInfo.exists, JSON.stringify(videoInfo));
log('T17b webcam preview is visible (not display:none)', videoInfo.exists && videoInfo.display !== 'none' && videoInfo.boxW > 50, `display=${videoInfo.display} box=${videoInfo.boxW}x${videoInfo.boxH}`);
log('T17c camera preview stays live when the model fails', videoInfo.w > 0 && !videoInfo.paused, `${videoInfo.w}x${videoInfo.h} ready=${videoInfo.ready} paused=${videoInfo.paused}`);
const modelErr = (bodyText.match(/Could not load[^\n]*/i) || [''])[0];
log('T17d error names the model, not the camera', !/Failed to start webcam/i.test(bodyText) && /Could not load the hand-tracking model/i.test(bodyText), modelErr.slice(0, 90) || 'no model error');
log('T17e a Retry affordance is offered', await page.getByRole('button', { name: /^retry$/i }).count() > 0, '');
log('T17f in-panel duplicate pinch caption removed (kept only below the panel)', !/thumb \+ index/i.test(bodyText), '');
await page.getByRole('radio', { name: /^mouse$/i }).first().click();
await page.waitForTimeout(500);

// ---------- T18: responsive ----------
for (const [w, h, label] of [[390, 844, 'iPhone 390px'], [768, 1024, 'iPad 768px']]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(700);
  const o = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    canvasW: Math.round(document.querySelector('canvas').getBoundingClientRect().width),
  }));
  log(`T18 no horizontal overflow — ${label}`, o.scrollW <= o.clientW + 1, JSON.stringify(o));
}

// ---------- T19: drawing works on a small viewport (coordinate mapping) ----------
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(600);
box = await canvas.boundingBox();
const clearBtn = page.getByRole('button', { name: /^clear$/i });
if (await clearBtn.isEnabled()) { await clearBtn.click(); await page.waitForTimeout(250); }
await stroke([[0.2, 0.3], [0.8, 0.7]]);
const mobileInk = await inkCount();
log('T19 drawing works on a 390px viewport', mobileInk > 200, `ink=${mobileInk}`);

// where did the ink actually land? should be along the diagonal we drew
const inkBounds = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4;
    if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { minX: minX / c.width, maxX: maxX / c.width, minY: minY / c.height, maxY: maxY / c.height };
});
const accurate = Math.abs(inkBounds.minX - 0.2) < 0.06 && Math.abs(inkBounds.maxX - 0.8) < 0.06 &&
                 Math.abs(inkBounds.minY - 0.3) < 0.06 && Math.abs(inkBounds.maxY - 0.7) < 0.06;
log('T19b strokes land where the pointer was (scaled canvas)', accurate, JSON.stringify(
  Object.fromEntries(Object.entries(inkBounds).map(([k, v]) => [k, +v.toFixed(3)]))));

// ---------- T20: retina sharpness ----------
await page.setViewportSize({ width: 1440, height: 940 });
await page.waitForTimeout(500);
const dprInfo = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  return { backing: c.width, css: Math.round(c.getBoundingClientRect().width), dpr: window.devicePixelRatio };
});
log('T20 canvas backing store matches CSS size × DPR', dprInfo.backing >= dprInfo.css, JSON.stringify(dprInfo));

// ---------- T29: sound effects actually fire at the right moments ----------
await page.evaluate(() => { window.__playLog.length = 0; });
await page.getByRole('button', { name: /new round/i }).first().click();
await page.waitForTimeout(150);
const playLogAfterNewRound = await page.evaluate(() => window.__playLog.slice());
log(
  'T29 New Round plays the new-round sound effect',
  playLogAfterNewRound.some((src) => src.includes('new-round.wav')),
  playLogAfterNewRound.join(', ')
);

await page.evaluate(() => {
  const realNow = Date.now;
  let offset = 0;
  Date.now = () => realNow.call(Date) + offset;
  window.__advance = (ms) => { offset += ms; };
});
await page.evaluate(() => window.__advance(22000)); // 30s round -> 8s left
await page.waitForTimeout(400); // one 250ms timer tick, plus margin
const timerAtEight = await readTimer();
const playLogAtEight = await page.evaluate(() => window.__playLog.slice());
log(
  'T29b ticking sound starts when the timer hits 8 seconds left',
  timerAtEight === '00:08' && playLogAtEight.some((src) => src.includes('ticking-sound.wav')),
  `timer=${timerAtEight} log=${playLogAtEight.join(', ')}`
);

// ---------- T29d: mute/unmute silences ticking without pausing it, so it stays in sync with the timer ----------
const tickingState = () =>
  page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('audio')).find((a) => a.src.includes('ticking-sound'));
    return el ? { paused: el.paused, muted: el.muted, currentTime: el.currentTime } : null;
  });
const beforeMute = await tickingState();
await muteBtn.click(); // mute
await page.waitForTimeout(300);
const whileMuted = await tickingState();
await muteBtn.click(); // unmute
await page.waitForTimeout(300);
const afterUnmute = await tickingState();
log(
  'T29d ticking never pauses across mute/unmute (stays in sync with the timer)',
  !beforeMute.paused && !whileMuted.paused && !afterUnmute.paused,
  JSON.stringify({ beforeMute, whileMuted, afterUnmute })
);
log(
  "T29d' mute/unmute only flips audibility, playhead keeps advancing throughout",
  whileMuted.muted === true &&
    afterUnmute.muted === false &&
    whileMuted.currentTime > beforeMute.currentTime &&
    afterUnmute.currentTime > whileMuted.currentTime,
  JSON.stringify({ beforeMute, whileMuted, afterUnmute })
);

// ---------- T29c: the round ending naturally must NOT cut the ticking sound short ----------
await page.evaluate(() => { window.__pauseLog.length = 0; });
await page.evaluate(() => window.__advance(9000)); // pushes past 0 -> round expires
await page.waitForTimeout(400);
const timerAtZero = await readTimer();
const pauseLogAtZero = await page.evaluate(() => window.__pauseLog.slice());
log(
  'T29c ticking sound is left to finish playing when the round ends naturally',
  timerAtZero === '00:00' && !pauseLogAtZero.some((src) => src.includes('ticking-sound.wav')),
  `timer=${timerAtZero} pauseLog=${pauseLogAtZero.join(', ')}`
);

await page.screenshot({ path: process.env.SHOT || '/tmp/neo/shot.png', fullPage: false });

const realConsoleErrors = consoleErrors.filter(
  (e) => !/favicon|React DevTools|ERR_TUNNEL|jsdelivr|storage\.googleapis|Failed to load resource: the server responded with a status of 500|net::ERR/i.test(e)
);
log('T21 no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
log('T22 no unexpected console errors', realConsoleErrors.length === 0, realConsoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n==== ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) console.log('FAILED: ' + failed.map((f) => f.name).join('; '));
