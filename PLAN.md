# Voice Notes: Rebuild Plan

**Goal:** turn this repo (a 2024 take-home exercise) into a voice-notes app that's clearly **your own work**: real-time transcription that doesn't lose words, notes saved in the browser, an AI clean-up/title/summary step with Google Gemini, tests and CI that can actually fail, and a **free live demo**.

**Branch:** `improvement-plan` (this file lives there). Make every commit on this branch; never push to `main`.

---

## How to use this plan (instructions for the Claude Code session)

1. Work through the steps **in order**. Each step lists *Why*, *Do*, *Done when* and a *Commit* message.
2. **One commit per step**, using the commit message given (Conventional Commits). From Phase 2 on, run `npm run lint && npm test` (root scripts, added in 1.2) before each commit, and `npm run build` once the client changes. Don't commit a red build.
3. After finishing a step, tick its box in **Progress** and include that PLAN.md change in the same commit.
4. Fix bugs **test first**: write the failing test, then the fix.
5. If the code shows a step is wrong or out of date, take the smallest sensible route, add an entry to the **Deviations log** at the bottom, and carry on. Stop and ask only for steps marked **🧑 MANUAL** or anything irreversible (revoking keys, creating accounts, entering secrets, deploying, renaming the repo, force-pushing).
6. **Never commit secrets.** Real keys live only in git-ignored `.env` files or the hosting dashboards. Document variables in `.env.example`.
7. Keep React 18, Vite 5 and Node 20. No framework swaps (no Next.js, no TypeScript migration, no state library).
8. Plain, readable code over clever code: the owner will walk interviewers through it.
9. If a **frontend-design** skill is available in your session, load it before the UI steps (4.3).
10. At the end of each phase, print a 3–5 line summary of what changed and how it was verified.

---

## Progress

- [x] 0.1 🧑 MANUAL: revoke the leaked Deepgram key (do this before anything else)
- [x] 0.2 Remove the key from the workflow and check the baseline
- [x] 1.1 Remove the take-home scaffolding and third-party branding
- [x] 1.2 Tooling: root scripts, ESLint for both packages, `.env.example`
- [x] 2.1 Restructure the server for testability (`createServer` with injectable dependencies)
- [x] 2.2 Server tests with Vitest and a fake transcriber
- [x] 2.3 Deepgram transcriber: buffering, KeepAlive, graceful CloseStream, nova-3
- [x] 2.4 Socket session lifecycle: validation, re-configure, errors, cleanup
- [x] 2.5 Abuse limits for a public demo
- [x] 3.1 Audio capture: AudioWorklet, 16 kHz PCM, release the mic
- [x] 3.2 Configurable server URL and connection status
- [x] 4.1 Transcript state reducer (fixes duplicated words)
- [x] 4.2 Notes store in localStorage
- [x] 4.3 New UI: recorder and notes
- [x] 4.4 Client tests for the main flows
- [x] 5.1 Server: `POST /api/notes/enhance` with Gemini
- [x] 5.2 Client: "Enhance with AI" on a note
- [ ] 6.1 CI that can fail (replaces the old workflow)
- [ ] 7.1 Production server: `/health`, config, Render blueprint
- [ ] 7.2 Client deploy to GitHub Pages and wake-up UX
- [ ] 7.3 🧑 MANUAL: create accounts, deploy, verify
- [ ] 8.1 README, LICENSE and demo GIF placeholder
- [ ] 8.2 🧑 MANUAL: rename the repo and update links

---

## Context

**What's here now:** `client/` (React 18 + Vite, socket.io-client, an audio recorder hook) and `server/` (Express + Socket.IO, streaming audio to Deepgram over a raw WebSocket). Root `package.json` has test scripts only. One GitHub Actions workflow (`.github/workflows/test.yml`).

**Origin:** this began as a 2024 take-home exercise. The README is the exercise brief, and the server scaffold, recorder hook and both test suites were supplied with it. This plan replaces that material with the owner's own code and tests.

### Review findings (verified November 2026)

Severity: 🔴 broken, leaking or blocking · 🟠 wrong or risky · 🟡 quality.

| # | Sev | Finding | Evidence | How it was verified |
|---|-----|---------|----------|---------------------|
| V1 | 🔴 | **A Deepgram API key is committed** in a public workflow. | `.github/workflows/test.yml:36` | Read the file |
| V2 | 🔴 | **CI can never fail**: both test steps have `continue-on-error: true`. | `.github/workflows/test.yml:32,38` | Read the file |
| V3 | 🔴 | The app **fails its own test suite**: client 3 of 15 fail (the record button doesn't toggle to stop; no "Copied" state ×2); server 3 of 9 fail for real (`stop-stream`/`disconnect` without a transcriber; invalid `configure-stream` input still starts a transcriber). The other 4 server tests call the real Deepgram API. | `client/tests/socket.test.jsx`, `server/tests/server.test.js` | Ran `vitest run` (12/15 pass) and `jest` with a dummy key |
| V4 | 🟠 | Take-home leftovers: the README is the exercise brief with an unchecked checklist; scaffold comments ("No need to edit any of this code", "feel free to add more functions"); third-party company logos in `client/src/assets/`; the repo is named after that company; `.DS_Store` committed; `example.gif` shows the old UI. | `README.md`, `server/server.js:9`, `server/websocket.js:23`, `server/transcriber.js:106`, `client/src/useSocket.jsx:8`, `client/src/App.jsx:5` | Read the files |
| V5 | 🔴 | **The microphone stays on after Stop**: the `getUserMedia` tracks are never stopped, and the `AudioContext` is never closed (a new one is created on every recording). | `client/src/useAudioRecorder.jsx` `startRecording`/`stopRecording` | Code reading |
| V6 | 🟠 | Uses the deprecated `ScriptProcessorNode`, and also starts a `MediaRecorder` whose output is never used. It sends 4096-sample chunks at the device rate (often 48 kHz). | `useAudioRecorder.jsx` | Code reading |
| V7 | 🟠 | **The first words are lost**: audio that arrives before Deepgram's socket is open is silently dropped (`send()` ignores it when `!ready`). | `server/transcriber.js` `send()` | Code reading |
| V8 | 🟠 | **The last words are lost**: Stop closes the Deepgram socket immediately instead of sending `CloseStream` and waiting for the final results. There's no `KeepAlive`, so pausing for about 10 s kills the stream (NET-0001). Close/errors aren't reported to the client. | `transcriber.js` `endTranscriptionStream()` | Code reading against Deepgram's KeepAlive and CloseStream docs |
| V9 | 🟠 | **Duplicated words**: the textarea's value is `transcription + partial`, and `onChange` saves the whole value as `transcription`. Editing while a partial is shown bakes the partial in, and then the final is appended again. | `client/src/App.jsx` | Code reading |
| V10 | 🟠 | Server session bugs: `configure-stream` twice leaks the first Deepgram connection; no validation of `sampleRate`; errors are emitted as raw messages. | `server/websocket.js` | Code reading + V3 test failures |
| V11 | 🔴 *(for a public demo)* | **No limits**: anyone can open unlimited, endless Deepgram streams on your key. CORS is `*` on both Express and Socket.IO. | `server/server.js`, `server/websocket.js` | Code reading |
| V12 | 🟡 | Client server URL hard-coded to `http://localhost:8080`; unused dependencies (`@azure/openai`, `axios`, `@deepgram/sdk` client created but unused, `react-icons`, `lucide-react`, Tailwind/PostCSS set up but not used); `nova-2` model; ESLint reports 5 errors. | `client/src/useSocket.jsx:4`, both `package.json`s | Ran `eslint`; code reading |
| V13 | 🟡 | Product gaps: nowhere to save notes, an unstyled textarea with 4 buttons, no recording status or timer. | `client/src/App.jsx` | Code reading |

### Constraints and target architecture

Hosting must be **free** (checked November 2026):
- **Client:** GitHub Pages (static, HTTPS, always on).
- **Server:** Render free web service (Node). Supports WebSockets. It **spins down after 15 minutes** without HTTP requests or WebSocket messages and takes **about a minute** to wake. 750 free instance hours per workspace per month.
- **Deepgram:** new accounts get a free $200 credit with no card or expiry. Streaming model `nova-3`.
- **Gemini:** a free tier exists for the Flash-Lite models without billing. Default model `gemini-3.5-flash-lite` (it supports structured JSON output), configurable with `GEMINI_MODEL`. Google no longer publishes fixed free-tier numbers, so **check the live limits in Google AI Studio**.

```
Browser (GitHub Pages, React/Vite)
  ├── Socket.IO (wss) ──> Render free (Express + Socket.IO) ──wss──> Deepgram streaming (nova-3)
  └── HTTPS POST /api/notes/enhance ──> same server ──HTTPS──> Gemini (gemini-3.5-flash-lite)
Notes live in the browser (localStorage). No database, no accounts.
```

---

## Phase 0: Stop the leak, get a baseline

### 0.1 🧑 MANUAL: revoke the leaked Deepgram key
**Why:** V1. Removing the key from the file doesn't remove it from git history; **revoking it** is what protects you.
**User does:** Deepgram console → API Keys → delete the key starting `a75c0f16…`. Create a **new** key for local development, stored only in `server/.env`.
**Claude Code:** ask the user to confirm this is done before continuing past 0.2. Don't print or reuse the old key anywhere.

### 0.2 Remove the key from the workflow; check the baseline
**Do:** delete the hard-coded `DEEPGRAM_API_KEY` line from `.github/workflows/test.yml` (the workflow is replaced in 6.1). `npm ci` in both packages; run both dev servers with the new key; record in the Deviations log whether live transcription works today.
**Commit:** `fix(security): remove hard-coded Deepgram key from CI workflow`

---

## Phase 1: Make it yours

### 1.1 Remove the take-home scaffolding and third-party branding (V4, V12)
**Do:**
- Delete the brand logos and template assets (`client/src/assets/*-logo*.svg`, `react.svg`, `client/public/vite.svg`), `.DS_Store` (add it to a root `.gitignore`) and `example.gif` (a new GIF comes in 8.1).
- Delete the supplied test suites and their fixtures: `client/tests/socket.test.jsx`, `client/tests/ui.test.jsx`, `server/tests/server.test.js`, `server/tests/sample.wav`. They're replaced by your own tests in 2.2 and 4.4.
- Remove the scaffold comments ("No need to edit…", "feel free to…", "add needed event handlers…", the IMPORTANT block in `App.jsx`, "Utilizes the provided…").
- Remove unused dependencies: server `@azure/openai`, `axios`, `@deepgram/sdk` (the raw WebSocket is kept and improved in 2.3), `jest`, `babel-jest`, `@babel/*`, `jest-junit`, `wav`, `supertest` (re-add later only if needed); client `react-icons`, `lucide-react`, `socket.io-mock`, `msw`, `vitest-websocket-mock`, `standardized-audio-context-mock`, `@babel/*`, `babel-jest`, `jest`, `vitest-github-actions-reporter` (re-add any that a later step actually needs).
- Package names: client `voice-notes-client`, server `voice-notes-server`; set `"license": "MIT"` and a one-line description.
- Replace the README with a short placeholder ("Voice Notes: real-time transcription with AI clean-up. Full README coming in step 8.1.").
**Done when:** `grep -ri "speechify" .` (outside `node_modules` and `.git`) returns nothing; both packages install and the app still starts.
**Commit:** `chore: remove take-home scaffolding, branding and unused dependencies`

### 1.2 Tooling: root scripts, ESLint, env examples
**Do:**
- Root `package.json` scripts: `lint`, `test`, `build`, `dev` that run the client and server scripts (`npm --prefix client …`, `npm --prefix server …`). Add a root `.nvmrc` with `20`.
- Test runners: client keeps Vitest; add `vitest` as a server devDependency now. Both `test` scripts are `vitest run --passWithNoTests` until each package has tests (server 2.2, client 3.1); then drop the flag.
- Client ESLint: keep the existing config, fix its 5 errors (Node globals in `vite.config.js`, unused `recordingTime`, etc.).
- Server ESLint: `server/.eslintrc.cjs` (`eslint:recommended`, `env: node, es2022`, `sourceType: module`).
- `server/.env.example`: `PORT=8080`, `DEEPGRAM_API_KEY=`, `GEMINI_API_KEY=`, `GEMINI_MODEL=gemini-3.5-flash-lite`, `ALLOWED_ORIGINS=http://localhost:5173`, plus the limit variables from 2.5. `client/.env.example`: `VITE_SERVER_URL=http://localhost:8080`.
**Done when:** `npm run lint` passes from the root.
**Commit:** `chore: add root scripts, ESLint for client and server, env examples`

---

## Phase 2: Server: correct, tested, safe

### 2.1 Restructure the server for testability
**Do:** move the code to `server/src/`:
- `config.js`: reads and validates env vars once, with defaults; exports a frozen object.
- `app.js`: `createServer({ config, createTranscriber, enhancer, now })` → `{ app, httpServer, io }`. Nothing listens at import time.
- `socket/session.js`: per-socket session logic (from `websocket.js`).
- `transcription/deepgram-transcriber.js`: the `Transcriber` class (an `EventEmitter` with the same events: `ready`, `partial`, `final`, `error`, `closed`).
- `index.js`: the only file that calls `listen()`.
- Update `npm start` and `npm run dev` (use `node --watch` instead of nodemon and drop the dependency).
Behaviour unchanged in this step.
**Commit:** `refactor(server): split into config, app factory, session and transcriber modules`

### 2.2 Server tests with Vitest and a fake transcriber
**Do:**
- Add `socket.io-client` (dev) to the server; `npm test` = `vitest run` (remove `--passWithNoTests`).
- `test/fakes/fake-transcriber.js`: records `send()` calls; exposes `emitReady()`, `emitPartial(t)`, `emitFinal(t)`, `emitError(e)`; tracks `finish()`/`close()` calls.
- `test/helpers.js`: starts `createServer` on port 0 with the fake, and returns a connected client plus a cleanup function.
- First spec: `configure-stream` with a valid `sampleRate` → the client receives `transcriber-ready` once the fake emits ready; partial and final are forwarded.
**Done when:** `npm test` passes in `server/` with **no network access**.
**Commit:** `test(server): add Vitest harness with a fake transcriber`

### 2.3 Deepgram transcriber: buffering, KeepAlive, graceful close, nova-3 (V7, V8)
**Do (`deepgram-transcriber.js`):**
- Connect to `wss://api.deepgram.com/v1/listen` with `model=nova-3`, `encoding=linear16`, `sample_rate` (16000 after 3.1), `interim_results=true`, `smart_format=true`, `punctuate=true`, `language=en`. Remove `endpointing: 0` (a Deepgram default is fine), or document why it's kept.
- **Buffer** audio received before the socket is `OPEN` (cap about 10 s of audio, dropping the oldest if exceeded), then flush in order on open.
- **KeepAlive:** while open, send `{"type":"KeepAlive"}` every 4 s when no audio has been sent in the last 4 s (Deepgram closes after about 10 s of silence otherwise).
- **`finish()`**: send `{"type":"CloseStream"}`, keep emitting the remaining `final` results, and resolve when Deepgram closes the socket (or after a 5 s timeout, then force-close). **`close()`**: force-close immediately (used on disconnect).
- Emit `closed` with a reason; emit `error` with a **safe, short** message (never echo the API key or the URL).
- Handle `message` parsing defensively (ignore non-`Results` message types).
**Tests (unit, against a local fake Deepgram built with `ws` on port 0):** audio sent before open is delivered after open, in order; KeepAlive is sent after 4 s of no audio (fake timers); `finish()` sends CloseStream and still emits a final that arrives afterwards; an auth failure (fake returns 401) → `error` emitted, no crash.
**Commit:** `fix(server): buffer early audio, keep streams alive and flush finals on stop`

### 2.4 Socket session lifecycle (V3, V10)
**Do (`socket/session.js`):**
- Validate `configure-stream` payload: an object with an integer `sampleRate` in [8000, 48000]. Otherwise emit `stream-error { code: 'INVALID_CONFIG' }` and **don't** create a transcriber.
- A second `configure-stream` while active → `close()` the old transcriber first.
- `stop-stream` → `finish()`; when it resolves, emit `stream-ended`. `stop-stream` with no active stream → no-op (no crash).
- `disconnect` → `close()` if active.
- Rename the outgoing error event from `error` (reserved-ish in Socket.IO clients) to `stream-error { code, message }`. Document the full event protocol in a comment block at the top of the file **and** later in the README.
**Tests:** each bullet above, plus "audio before configure is ignored".
**Commit:** `fix(server): validate stream config and clean up sessions reliably`

### 2.5 Abuse limits for a public demo (V11)
**Do (all configurable via env, with these defaults):**
- `MAX_SESSION_SECONDS=60`: the server auto-stops a stream after 60 s (`finish()`, then emit `stream-ended { reason: 'time-limit' }`).
- `MAX_CONCURRENT_STREAMS=3` across the server → beyond that, `stream-error { code: 'BUSY' }`.
- `DAILY_SECONDS_PER_IP=600`: an in-memory per-IP daily budget (resets at UTC midnight or on restart; documented as best-effort) → `stream-error { code: 'DAILY_LIMIT' }`.
- **CORS:** `ALLOWED_ORIGINS` (comma-separated) for both Express and Socket.IO; no `*`.
- Client IP: `app.set('trust proxy', 1)`; for sockets, read the first `x-forwarded-for` entry when `TRUST_PROXY=1`, otherwise `socket.handshake.address`.
- Cap incoming socket message size (Socket.IO `maxHttpBufferSize`, e.g. 64 KB).
**Tests (fake timers + fake transcriber):** auto-stop at the limit; the 4th concurrent stream is rejected; the daily budget is enforced; a disallowed origin is refused.
**Commit:** `feat(server): time, concurrency and daily limits for the public demo`

---

## Phase 3: Client audio and connection

### 3.1 Audio capture: AudioWorklet, 16 kHz PCM, release the mic (V5, V6)
**Do:** rewrite `useAudioRecorder` as `client/src/audio/useRecorder.js`, plus `client/public/pcm-worklet.js` (or a Vite `?url` import; whichever works on GitHub Pages under a sub-path):
- `start()`: `getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })` → a new `AudioContext` → `audioWorklet.addModule(...)` → an `AudioWorkletNode` that **downsamples to 16 kHz** and posts Int16 chunks of about 100 ms → `onChunk(int16Buffer)`. Returns `16000`.
- `stop()`: disconnect the nodes, **stop every `MediaStreamTrack`**, **`audioContext.close()`**, and reset state. Safe to call twice.
- Expose `level` (0–1, RMS, throttled to about 15 fps) for a simple input meter, and `error` for permission-denied or no-device (`NotAllowedError`, `NotFoundError`).
- Remove `MediaRecorder` and the pause/resume code (no longer used).
- Put pure helpers in `audio/pcm.js`: `downsample(float32, inRate, outRate)` and `floatTo16BitPCM(float32)`.
**Tests:** unit-test `pcm.js` (length after 48k→16k, clamping, sign); test the hook with a mocked `getUserMedia`/`AudioContext` to check that `stop()` stops tracks and closes the context.
**Manual check:** in Chrome, the tab's microphone indicator turns **off** after Stop.
**Commit:** `fix(client): AudioWorklet capture at 16 kHz and release the microphone on stop`

### 3.2 Configurable server URL and connection status (V12)
**Do:** `client/src/net/useTranscriptionSocket.js` replaces `useSocket.jsx`:
- URL from `import.meta.env.VITE_SERVER_URL` (default `http://localhost:8080`).
- `transports: ['websocket']`, auto-reconnect.
- Exposes `status` (`'connecting' | 'connected' | 'disconnected'`), `startStream(sampleRate)`, `sendAudio(chunk)`, `stopStream()`, and callbacks for `ready`/`partial`/`final`/`ended`/`error`.
- One socket per app (create it in a provider or a module singleton, not per render).
**Commit:** `feat(client): configurable server URL and socket status`

---

## Phase 4: The notes app

### 4.1 Transcript state reducer (V9)
**Do:** `client/src/transcript/transcriptReducer.js`, a pure reducer with state `{ committed: string, partial: string, editing: boolean }` and actions `PARTIAL`, `FINAL`, `EDIT`, `CLEAR`, `LOAD`:
- `FINAL` appends to `committed` (with sensible spacing) and clears `partial`.
- While recording, the transcript display is **read-only**: `committed` in normal text plus `partial` in grey/italic, in an `aria-live="polite"` region. Editing happens on the saved note after Stop, so a partial can never be baked into the text.
**Tests:** unit-test the reducer, including "partial, then final, never duplicates" and spacing/punctuation joins.
**Commit:** `fix(client): transcript reducer so partial results never duplicate`

### 4.2 Notes store in localStorage
**Do:** `client/src/notes/notesStore.js`:
- Key `voice-notes:v1`. A note is `{ id, createdAt, updatedAt, title, text, durationSec, ai?: { title, summary, tags[], cleanedText, model, createdAt } }`.
- `list()` (newest first), `get`, `create`, `update`, `remove`, `exportMarkdown(note)`, `exportAll()` (JSON).
- **Defensive:** wrap every `localStorage` call in try/catch; corrupted JSON → start empty and keep the bad value under `voice-notes:v1:corrupt` (don't destroy it); quota errors → surfaced as an error the UI can show.
- `useNotes()` hook wrapping the store.
**Tests:** CRUD, ordering, corrupted-data recovery, quota error.
**Commit:** `feat(client): local notes store with defensive storage handling`

### 4.3 New UI: recorder and notes (V13)
**Do (Tailwind is already installed: add `tailwind.config.js`, `src/index.css`, and the `tailwindcss` plugin in `postcss.config.js`):**
- **Layout:** a notes list sidebar on the left (search box, newest first; collapses on mobile) and the main panel on the right.
- **Recorder:** one big **Start/Stop** toggle button (`aria-pressed`, `data-testid="record-toggle"`), state label (Idle / Connecting / Listening / Finishing…), an mm:ss timer counting toward the 60 s limit, an input-level meter from 3.1, and the live transcript (4.1). **Space** toggles recording when focus isn't in a text field.
- **On Stop:** wait for `stream-ended`, then **auto-save** a note (title = first 6–8 words until AI runs) and open it.
- **Note view:** editable title and text (saved on blur, with a "Saved" indicator), Copy (button text changes to "Copied" for 2 s), Download .md, Delete (with confirm), and the AI panel slot (filled in 5.2).
- **Errors:** friendly messages for each `stream-error` code (BUSY, DAILY_LIMIT, INVALID_CONFIG), mic permission denied, and server disconnected.
- **Look:** clean and calm; system font stack (no web-font requests); light and dark modes via `prefers-color-scheme`; visible focus rings; WCAG AA contrast.
**Done when (manual):** record 3 notes, reload the page (they persist), edit one, copy, download, delete. The mic indicator turns off after each Stop.
**Commit:** `feat(client): recorder and notes UI`

### 4.4 Client tests for the main flows
**Do:** Vitest + Testing Library (already installed). `vi.mock` the socket hook and the recorder hook with controllable fakes. Specs:
- Start → status Listening → a partial shows in grey → a final is committed → Stop → `stream-ended` → a note is saved and shown in the list.
- The record toggle can't start twice (one `startStream` call).
- Copy → `clipboard.writeText` is called with the note text and the button shows "Copied".
- Each error code shows its message.
- Notes persist across remounts (real `notesStore` + jsdom localStorage).
- Space-key shortcut toggles recording, but not while typing in the title field.
**Commit:** `test(client): cover recording, saving, copy and error flows`

---

## Phase 5: AI step with Gemini

### 5.1 Server: `POST /api/notes/enhance`
**Do:**
- Add `@google/genai` (the official JS SDK) and `zod`.
- `enhance/gemini-enhancer.js` exports `createGeminiEnhancer({ apiKey, model })` → `enhance(text) → { title, summary, tags, cleanedText }`:
  - Use `ai.models.generateContent` with **structured output** (JSON MIME type plus a response schema; check the current SDK docs for the exact config field names).
  - Instructions: remove filler words and false starts, fix punctuation and casing, **don't add facts**, keep the original language; title ≤ 60 chars; summary ≤ 2 sentences; 0–5 lowercase tags. Put the transcript inside a clearly delimited block and say it's content to process, not instructions.
  - Low temperature; 15 s timeout (`AbortSignal.timeout`); validate the response with zod and reject anything off-schema.
- Route: `POST /api/notes/enhance` with `{ text }`. Validate: non-empty, ≤ 6000 chars → otherwise 400. Rate-limit 10 per hour per IP (a small in-memory limiter, same IP logic as 2.5) → 429. Gemini errors → 502 with a safe message; a quota error (429 from Gemini) → 503 "AI is busy, try later".
- `GET /api/config` → `{ aiEnabled: Boolean(GEMINI_API_KEY), maxSessionSeconds }`.
- `createServer` takes `enhancer` (null when there's no key), so tests use a fake.
**Tests:** validation (empty, too long) → 400; AI disabled → 503 and `aiEnabled: false`; the fake enhancer's output passes through; invalid model output → 502; rate limit → 429. **No real Gemini calls in tests.**
**Commit:** `feat(server): AI clean-up, title and summary endpoint using Gemini`

### 5.2 Client: "Enhance with AI"
**Do:**
- On load, fetch `/api/config`; hide the AI button when `aiEnabled` is false.
- In the note view: **Enhance with AI** → loading state → shows the AI title, summary and tags, and a **side-by-side or toggle view** of the original vs the cleaned text. "Use AI title" and "Replace text with cleaned version" apply changes (both undoable by keeping the original in `note.ai`). Store the result in `note.ai`.
- Errors: show the server's message; keep the note untouched.
**Tests:** success flow, disabled flow, error flow (mocked `fetch`).
**Commit:** `feat(client): enhance notes with AI title, summary, tags and clean-up`

---

## Phase 6: CI that can fail

### 6.1 Replace the old workflow (V2)
**Do:** delete `.github/workflows/test.yml`; add `.github/workflows/ci.yml`:
- On `push` (`main`, `improvement-plan`) and `pull_request`. `concurrency` with `cancel-in-progress`.
- A matrix or two jobs, **client** and **server**: `actions/setup-node` (Node 20, npm cache per lockfile) → `npm ci` → `npm run lint` → `npm test` → (client) `npm run build`.
- **No `continue-on-error`. No secrets. No network calls to Deepgram or Gemini.**
- Use the current major versions of the actions.
- Add the CI badge to the README.
**Done when:** the workflow is green, and you've confirmed once (then reverted) that a deliberately failing test turns it red.
**Commit:** `ci: replace always-green workflow with a real lint, test and build pipeline`

---

## Phase 7: Free live demo

### 7.1 Production server: `/health`, config, Render blueprint
**Do:**
- `GET /health` → `{ status: 'ok', uptime }` (no external calls, so it's quick on wake).
- Startup: fail fast with a clear message if `DEEPGRAM_API_KEY` or `ALLOWED_ORIGINS` is missing in production; warn (and disable AI) if `GEMINI_API_KEY` is missing.
- Graceful shutdown on `SIGTERM`: stop accepting sockets, `finish()` active streams (≤ 5 s), close the server.
- Remove the Express static `public/` serving and the SPA catch-all from the old `server.js` (the client is on Pages).
- `render.yaml`: one web service (`runtime: node`, `plan: free`, `rootDir: server`, build `npm ci`, start `npm start`, `healthCheckPath: /health`). Env: `NODE_ENV=production`, `TRUST_PROXY=1`, the limits, `GEMINI_MODEL`; `DEEPGRAM_API_KEY`, `GEMINI_API_KEY` and `ALLOWED_ORIGINS` as `sync: false`. Check the field names against Render's current Blueprint spec.
- `docs/DEPLOY.md`: the runbook for 7.3, a pre-deploy checklist, a rollback plan (Render "Rollback"; re-run the Pages workflow on the previous commit), and rollback triggers (health failing after wake, transcription not starting, AI 5xx on every call).
**Commit:** `feat(server): health check, production config checks and Render blueprint`

### 7.2 Client deploy to GitHub Pages and wake-up UX
**Do:**
- `vite.config.js`: `base` from `VITE_BASE` (default `/`). The Pages build uses `/<repo-name>/`; this must keep working after the rename in 8.2, so take it from `github.event.repository.name` in the workflow.
- `.github/workflows/deploy-pages.yml`: on `push` to `main` and `workflow_dispatch` → build the client with `VITE_SERVER_URL` from the repository **variable** `VITE_SERVER_URL` → `actions/upload-pages-artifact` → `actions/deploy-pages` (with `pages: write`, `id-token: write`).
- **Wake-up UX:** on load, `GET {server}/health` with a 4 s timeout. While it's not answering, show "Waking up the free server (up to a minute)…" with a retry loop every 5 s; disable Record until it's healthy. Footer: "Free demo: recordings are limited to 60 s and a few minutes per day. Notes stay in your browser."
**Commit:** `feat: deploy client to GitHub Pages with a wake-up banner for the free server`

### 7.3 🧑 MANUAL: create accounts, deploy, verify
Follow `docs/DEPLOY.md`. The user does the account and secret steps:
1. **Gemini:** create an API key in Google AI Studio and check the free-tier limits for `gemini-3.5-flash-lite` there.
2. **Render:** New → Blueprint → this repo/branch → set `DEEPGRAM_API_KEY` (the new one from 0.1), `GEMINI_API_KEY`, `ALLOWED_ORIGINS=https://alikonainofficial.github.io` → deploy → `/health` OK.
3. **GitHub:** Settings → Pages → Source: GitHub Actions. Settings → Variables → `VITE_SERVER_URL=https://<render-app>.onrender.com`. Merge (or run the workflow manually).
4. **Verify on the live site:** Chrome, Firefox and Safari (desktop) plus one phone: wake banner → record 20 s → words appear live → Stop → note saved → AI enhance works → 61 s recording auto-stops → mic indicator off. Ask a second person to record at the same time.
**Done when:** every check passes; the URLs are recorded in the README.

---

## Phase 8: Present it

### 8.1 README, LICENSE, demo GIF placeholder
**Do:**
- README: **Voice Notes** title, one-line pitch, **Live demo** link with the cold-start note, CI badge, a GIF placeholder (🧑 the user records a new one: record → live text → stop → AI enhance), features, an architecture diagram (Mermaid, from this plan), the **socket event protocol table**, the **Engineering highlights** section (AudioWorklet 16 kHz pipeline, early-audio buffering + KeepAlive + CloseStream so no words are lost, a pure transcript reducer, demo abuse limits, structured-output AI with schema validation, tests with fakes and no network), local setup, env var table, testing, Known limitations (single server instance, in-memory limits reset on restart, notes are per-browser, free-tier cold start), and an **Origin** line: "Started in 2024 as a take-home exercise; rebuilt and extended in 2026." (Recommended for honesty, since the history is public. The user may remove it.)
- `LICENSE`: MIT, "Copyright (c) 2026 Ali Konain".
**Commit:** `docs: product README, architecture and MIT license`

### 8.2 🧑 MANUAL: rename the repo and update links
**User does (after merging):** GitHub → Settings → rename the repository to `voice-notes` (GitHub redirects the old URL). Then locally: `git remote set-url origin https://github.com/alikonainofficial/voice-notes.git`. Re-run the Pages workflow (the base path follows the new name) and update `ALLOWED_ORIGINS` only if the origin changed (it doesn't: still `https://alikonainofficial.github.io`). Update the links in the GitHub profile README (`alikonainofficial/alikonainofficial`) and on the portfolio site.

---

## Out of scope (don't do these)

- Accounts, a database or cloud sync of notes; sharing notes.
- Speaker diarization, multi-language UI, offline/PWA mode.
- TypeScript migration, framework changes, a state library.
- Pre-recorded file upload transcription.

## Definition of done

- The old key is revoked (0.1) and no secret exists in the working tree.
- CI is green, has no `continue-on-error`, and runs lint, tests and build for both packages with no network calls.
- Every finding V1–V13 is fixed or explicitly deferred in the Deviations log with a reason.
- The live demo passes every manual check in 7.3.
- No trace of the take-home brief or third-party branding remains in the current tree; the README presents the project as **Voice Notes**.

---

## Deviations log

_Add an entry whenever reality differs from this plan: date, step, what changed, why._

- **2026-11-25 · 0.1:** The owner deleted the leaked key in the Deepgram console and saved a new key only in the git-ignored `server/.env` of a local clone. Claude checked that the variable is set (40 characters) without printing it.
- **2026-11-25 · 0.2 baseline:** Client tests 12/15 pass, matching V3. The old server suite was not re-run, because 4 of its tests call the real Deepgram API. Live transcription **works today** on the server → Deepgram path: running the current server with the new key and streaming `server/tests/sample.wav` (8 kHz, first 20 s, at real-time pace in 100 ms chunks, starting after `transcriber-ready`) gave 12 partials and 5 accurate finals. The browser microphone path was **not** checked, because Claude has no microphone; the owner can check it with `npm run dev` in both packages. Local checks ran on Node 22, so CI pins Node 20 from 6.1.
- **2026-11-25 · 1.1:** `client/public/favicon.ico` was the third-party company's logo, so it was deleted and replaced by an original microphone icon (`client/public/favicon.svg`). Also removed: the unused client devDependencies `socket.io` and `ws` (only the deleted supplied tests used them), the Jest/Babel configs (`server/jest.config.cjs`, `server/babel.config.cjs`), the `<!-- DONT MODIFY -->` banner in `index.html`, the GitHub Actions/JUnit reporter config in `vite.config.js`, and the `testIdAttribute: "id"` override in `client/tests/setup.js` (new tests use `data-testid`). `ws` was added as an explicit server dependency, because the transcriber imports it and it had only been available transitively through `@deepgram/sdk`. Until 1.2, the server's `test` script just prints a placeholder (Jest is gone). The "Done when" grep still matches PLAN.md itself, which quotes the grep and names the repo; no other file matches.
- **2026-11-25 · 1.2:** After 1.1, client ESLint reported 2 errors and 1 warning, not 5; the other errors were in the deleted supplied tests. Fixed by exposing `recordingTime`/`isPaused` from the old recorder hook (rewritten in 3.1), adding `isPaused` to a `useCallback` dependency list, and replacing `__dirname` in `vite.config.js` with an ESM `import.meta.url` path. The client config gained overrides for Node tooling files and Vitest globals in tests. The server uses ESLint 8, matching the client, so both use the `.eslintrc` format. Root `npm run dev` starts both packages with a shell `&`, which works on macOS/Linux; no extra dependency was added for this.
- **2026-11-25 · 2.1:** `config.js` exports `loadConfig(env)`, which returns the frozen object, so tests can pass their own env. `index.js` loads `.env` and calls it once. The transcriber's stop method is now `close()` (same immediate-close behaviour as the old `endTranscriptionStream()`), so the fake in 2.2 and `finish()` in 2.3 share one interface. The transcriber now also emits `closed`, which nothing consumes yet. `createServer` will take `enhancer` from 5.1, when something uses it.
- **2026-11-26 · 2.3:** `endpointing: 0` and `diarize: false` were removed (Deepgram's defaults are fine for notes). The KeepAlive check runs every 1 s and sends `{"type":"KeepAlive"}` once 4 s have passed since the last audio or control message, so gaps stay under ~5 s. The transcriber takes `url` and `finishTimeoutMs` options, so tests can point it at a local fake Deepgram and use a short timeout. The KeepAlive test fakes only `setInterval` and `Date`, so real socket I/O still works. The early-audio buffer drops the oldest chunks once it holds more than 10 s of audio at the stream's sample rate. Error messages are mapped to a fixed set of safe strings: rejected key, busy, refused (HTTP status), lost connection.
- **2026-11-26 · 2.4:** `stream-ended` carries `{ reason }`: `"stopped"` after `stop-stream`, `"closed"` when the transcriber ends on its own (for example Deepgram closing or a connection error, which also sends `stream-error { code: "TRANSCRIBER_ERROR" }`). This reports closes to the client (part of V8). Audio sent after `stop-stream` is ignored. If `configure-stream` replaces a stream that is still finishing, the old stream's `stream-ended` is not sent. A replaced transcriber's listeners are removed and a no-op `error` listener is attached, so a late error can't crash the process. The old client still listens for `error`, so it won't show stream errors until it is rewritten in 3.2.
- **2026-11-26 · 2.5:** Disallowed origins are refused in Socket.IO's `allowRequest`, because the `cors` option only adds headers for browsers and doesn't stop a websocket. Requests with no `Origin` header (non-browser clients) are allowed. A session's time limit is `min(MAX_SESSION_SECONDS, the IP's remaining daily seconds)`, so the daily budget can't be overrun mid-stream. Daily usage is counted when a stream ends. The tests use an injected clock (`createServer({ now })`) for the daily budget, and a short real `MAX_SESSION_SECONDS` (e.g. `0.05`) for auto-stop, instead of Vitest fake timers, which would also freeze Socket.IO's internal timers. Because of this, `MAX_SESSION_SECONDS` and `DAILY_SECONDS_PER_IP` accept fractions. The `BUSY` and `DAILY_LIMIT` errors carry friendly messages (`LIMIT_MESSAGES` in `limits.js`). Messages over 64 KB disconnect the client (Socket.IO's behaviour for `maxHttpBufferSize`).
- **2026-11-26 · 3.1:** The worklet lives at `client/src/audio/pcm-worklet.js` and is loaded with Vite's `?worker&url` import, which bundles it with `pcm.js` and resolves its URL under the build's base path. A `--base /voice-notes/` build was checked: `/voice-notes/assets/pcm-worklet-*.js`, with no imports left. `start()` returns `null` on failure, with `error.code` set to `permission-denied`, `no-microphone`, `unsupported` or `unavailable`. `stop()` also cancels a `start()` that is still waiting for permission. The worklet node connects to the destination but writes silence, which keeps it running in every browser. The worklet itself was checked in Chromium (built-in browser) with an `OfflineAudioContext` and a 440 Hz tone at 48 kHz: 10 chunks × 1,600 samples per second, 440 Hz preserved, and 15 level messages per second. **Pending (owner):** the manual check that Chrome's tab mic indicator turns off after Stop, because Claude has no microphone.
- **2026-11-26 · 3.2:** The hook is `useTranscriptionSocket(handlers)`, with handlers `{ onReady, onPartial, onFinal, onEnded, onError }`. The socket is a module singleton (`getSocket()`). `connect_error` sets the status to `disconnected`, and Socket.IO's `reconnect_attempt` sets it back to `connecting`. `sendAudio` drops audio while offline instead of letting Socket.IO buffer it and replay stale audio later. The temporary `App.jsx` now shows the connection status, shows `stream-error` messages, disables Start until connected, and stops the recorder on `stream-ended` (for example after the time limit). The duplicated-words bug (V9) remains until 4.1.
- **2026-11-26 · 3.1 manual check:** The owner ran both dev servers on macOS and recorded in Chrome. Live text appeared, and the tab's mic indicator turned off after Stop. ✅
- **2026-11-26 · 4.1:** `editing` is set by `EDIT` (hand edits). While it's true, partials are ignored but finals are still appended, so no words are lost. `LOAD` and `CLEAR` reset it. `joinText()` handles spacing and leading punctuation. The temporary `App.jsx` now uses the reducer: a read-only `LiveTranscript` (`aria-live="polite"`, partial in grey italics) while recording, and an editable textarea only after Stop. ESLint's `react/prop-types` rule was turned off (no PropTypes dependency; React 19 removes them); props are documented in comments.
- **2026-11-26 · 4.2:** The store is a factory, `createNotesStore({ storage, now, newId })`, with a lazily created app instance (`getNotesStore()`), so tests use an in-memory storage that can fail on demand. Writes save first and only then update the in-memory list, so a failed save never shows a note that wasn't stored. A corrupt value is copied to `voice-notes:v1:corrupt`; if that already exists, it goes to `…:corrupt:<timestamp>`, so an earlier backup is never overwritten. Unreadable storage (e.g. blocked in private mode) starts empty with a `loadError`. `useNotes()` uses `useSyncExternalStore`, so all components share one list, and it turns storage errors into an `error` message. `defaultTitle()` (first 7 words) lives in the store module and is used by 4.3.
- **2026-11-26 · 4.3:** The recording flow lives in a `useRecordingSession` hook (phases idle → connecting → listening → finishing), so the components only render. If the server's `stream-ended` never arrives, the note is saved anyway after 8 s, and a client-side backstop stops recording at 63 s. If the socket disconnects mid-recording, what was transcribed so far is saved. An empty transcript saves nothing and shows a notice. The `INVALID_CONFIG` message is generic because users can't fix it. Design: system sans for the UI and system serif for note text (no web fonts); palette as CSS variables with a `prefers-color-scheme` dark set; the record button's ring is the 60 s timer. Delete uses `window.confirm`. The note view takes an `aiPanel` prop for 5.2. **Done-when check:** done in headless Chrome with a fake microphone and a scripted transcriber (no Deepgram): the Space shortcut, live text, auto-save after Stop including a late final, persistence across reload, dark mode, and the 390 px mobile layout, with no console errors. This caught and fixed a timer that never advanced. The owner's own real-mic run of the full checklist is still worth doing before deploy (7.3).
- **2026-11-26 · 4.4:** `tests/App.test.jsx` mocks `useTranscriptionSocket` and `useRecorder` with fakes the test controls (server events, connection status, mic errors) and uses the real notes store with jsdom's localStorage. "Can't start twice" is tested as a double click: the second click cancels the first while the mic starts, so at most one stream opens. Space key repeats are ignored. Besides the plan's specs, the tests cover Saved-on-blur, Delete with confirm, the time-limit auto-save, transcriber errors, and keeping text (including an unfinished partial) when the server disconnects mid-recording. Mutation check: removing the Space-repeat guard, the typing guard, late-final handling, or partial-keeping on disconnect each turns the suite red.
- **2026-11-26 · 5.1:**
  - **No temperature.** Google's current docs (checked Nov 2026) say the 3.5-generation models ignore sampling parameters (`temperature`, `top_p`, `top_k`) and they should be removed. So the request sets no temperature. Output stays consistent through the system instruction, structured output and zod validation. `gemini-3.5-flash-lite` is confirmed as a GA model ID.
  - **Structured output.** With `@google/genai` 3.6.1, the request uses `responseMimeType: "application/json"` plus a hand-written `responseJsonSchema` (only fields Gemini supports). A stricter zod schema validates the answer (title ≤ 60, summary ≤ 400, ≤ 5 tags lowercased, non-empty text); anything else is a 502.
  - **Prompt safety.** The transcript is wrapped in `<transcript>…</transcript>`, and a `</transcript>` inside it is defused.
  - **Errors.** All JSON `{ error: { code, message } }`: `AI_DISABLED` 503, `INVALID_TEXT` 400, `RATE_LIMITED` 429, `AI_BUSY` 503 (Gemini 429), `AI_FAILED` 502 (timeout, other API error, invalid output). Malformed JSON bodies get a JSON 400.
  - **Limits.** The per-IP limit is a sliding window, configurable with `ENHANCE_PER_HOUR` (default 10) and counted only for valid requests. The JSON body limit is 64 KB.
  - **Not yet checked against real Gemini.** That happens in 7.3, once the owner has a key.
- **2026-11-26 · 5.2:** `note.ai` also stores `originalTitle` and `originalText` (from when Enhance was clicked); that is what makes "Use AI title" and "Replace text…" undoable via "Restore original…" buttons. Original and cleaned text are compared with a two-button toggle (works on mobile) rather than side by side. `/api/config` also drives the recorder's time limit (`maxSessionSeconds`), so the ring matches the server. The server URL moved to `src/net/serverUrl.js`, shared by the socket and the new `src/net/api.js`. `NoteView` syncs its title and text inputs when the AI panel changes the note. Checked in headless Chrome with a fake enhancer: loading state, result, apply, undo, and persistence across reload, with no console errors.

