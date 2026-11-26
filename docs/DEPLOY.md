# Deploying Voice Notes (free tier)

The client is a static site on **GitHub Pages**. The server runs on a **Render free web service**.
Both are free. The server sleeps after 15 minutes without traffic and takes about a minute to wake up;
the client shows a "waking up" banner while that happens.

```
Browser (GitHub Pages) ──Socket.IO──> Render (Express + Socket.IO) ──> Deepgram (speech to text)
                       └─HTTPS POST /api/notes/enhance──> same server ──> Gemini (AI clean-up)
```

## Pre-deploy checklist

- [ ] CI is green on the commit you are deploying (Render only auto-deploys after checks pass).
- [ ] A Deepgram API key exists that is **only** used by this deploy (not the revoked one).
- [ ] A Gemini API key exists, and you have checked its free-tier limits for `gemini-3.5-flash-lite` in Google AI Studio.
- [ ] No secrets are committed: `git grep -nE "(DEEPGRAM|GEMINI)_API_KEY=.+"` shows only empty example lines.
- [ ] You know the Pages URL: `https://alikonainofficial.github.io/<repo-name>/`.

## Runbook (step 7.3)

### 1. Gemini

1. Open [Google AI Studio](https://aistudio.google.com/) → **Get API key** → create a key.
2. Check the current free-tier limits for `gemini-3.5-flash-lite` on the rate-limits page.

### 2. Render (server)

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint** → pick this repository and the `main` branch. Render reads `render.yaml`.
3. Fill in the three secrets it asks for:
   - `DEEPGRAM_API_KEY`: the new Deepgram key.
   - `GEMINI_API_KEY`: the Gemini key.
   - `ALLOWED_ORIGINS`: `https://alikonainofficial.github.io` (the origin only: no path, no trailing slash).
4. **Apply**. Wait for the first deploy, then open `https://<service>.onrender.com/health`.
   Expect `{"status":"ok","uptime":…}`.

### 3. GitHub Pages (client)

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   `VITE_SERVER_URL` = `https://<service>.onrender.com` (no trailing slash).
3. Merge `improvement-plan` into `main` (or run **Actions → Deploy to GitHub Pages → Run workflow**).

### 4. Verify on the live site

Chrome, Firefox and Safari on desktop, plus one phone:

- [ ] Wake-up banner appears, then disappears when the server is up.
- [ ] Record about 20 s: words appear live.
- [ ] Stop: the note is saved and opened.
- [ ] Enhance with AI works.
- [ ] A 61 s recording stops by itself at 60 s.
- [ ] The browser's microphone indicator turns off after Stop.
- [ ] A second person records at the same time without problems.

Record the live URLs in the README.

## Rollback

- **Server:** Render dashboard → the service → **Events** → pick the last good deploy → **Rollback**.
- **Client:** GitHub → **Actions → Deploy to GitHub Pages** → open the run for the previous good commit → **Re-run all jobs**.

Roll back when any of these happen after a deploy:

- `/health` keeps failing after the server has had a minute to wake up.
- Recording starts but no transcription arrives (check the Render logs for Deepgram errors).
- `POST /api/notes/enhance` returns 5xx on every call (check the Gemini key and quota).

## Keys and limits

- Rotate a key: create a new one, update it in the Render dashboard (**Environment**), let it redeploy, then delete the old key.
- Demo limits (Render **Environment**): `MAX_SESSION_SECONDS`, `MAX_CONCURRENT_STREAMS`, `DAILY_SECONDS_PER_IP`, `ENHANCE_PER_HOUR`.
  They are in memory, so they reset whenever the server restarts or sleeps.
