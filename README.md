# Chess Reviewer Client

Static Vite and TypeScript frontend for [Chess Reviewer Engine](https://github.com/le-task/reviewer-engine). Paste one standard chess PGN to submit an analysis, then replay the game with per-move classifications and an evaluation bar. Stockfish 19 and PostgreSQL run on the backend, not in the browser.

## Run locally

Use Node 24 and npm. Start the backend first, then run:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173`. The example points to `http://127.0.0.1:8000`; edit `VITE_API_BASE_URL` in `.env.local` if the API is elsewhere, then restart Vite. The backend's `REVIEWER_CLIENT_ORIGIN` must match the address serving this page exactly, including the port. `localhost` and `127.0.0.1` are different origins.

## Review a game

Paste a PGN such as `1. f3 e5 2. g4 Qh4# 0-1` and select **Analyze game**. Use the move list, Previous/Next, or the left/right arrow keys to replay it. Evaluation is from White's perspective; a positive number favors White.

The review URL resumes polling or opens the existing result after reload. Anyone with the link can open the review for 24 hours. The browser does not store the pasted PGN. **Check again** retries loading the same review after a network error; it does not submit another job.

## Verify and deploy

```sh
npm run lint
npm exec -- tsc --noEmit
```

In the browser, verify a valid PGN completes, move navigation updates the board and evaluation, and reloading the review URL does not resubmit. An invalid PGN should show an error and keep the input.

Import this repo into Vercel. Set `VITE_API_BASE_URL` to the public HTTPS API origin before deploying; `VITE_*` values are public and must not contain secrets. `vercel.json` sets the Vite build and `dist/` output directory. Set the backend's `REVIEWER_CLIENT_ORIGIN` to the deployed frontend origin.

Update this README in the same PR when setup, configuration, or user-facing behavior changes.
