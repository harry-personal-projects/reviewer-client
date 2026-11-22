# Chess Reviewer Client

Responsive Vite and TypeScript frontend for [Chess Reviewer Engine](https://github.com/harry-personal-projects/reviewer-engine). Review a PGN or explore a named opening on a Chessground board. chess.js checks interactive moves in the browser; Stockfish 19 and PostgreSQL run on the backend.

## Run locally

Use Node 24 and npm. Start the backend first, then run:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173`. The example `VITE_API_BASE_URL` points to `http://127.0.0.1:8000`. If the API runs on a different port, edit `.env.local` and restart Vite. The backend's `REVIEWER_CLIENT_ORIGIN` must match the address serving this page exactly, including the port. `localhost` and `127.0.0.1` are different origins.

## Review a game

Paste a PGN such as `1. f3 e5 2. g4 Qh4# 0-1` and select **Analyze game**. Use the move list, Previous/Next, or the left/right arrow keys to replay it. Evaluation is from White's perspective; a positive number favors White.

The review URL resumes polling or opens the existing result after reload. Anyone with the link can open the review for 24 hours. The browser does not store the pasted PGN. **Check again** retries loading the same review after a network error; it does not submit another job.

Recent submissions are stored as links in the current browser for up to 24 hours (latest 100); they do not sync between devices. Failed submissions and externally shared links are not added. In the opening catalog, search by name or ECO code (for example, `Sicilian` or `B20`). Search covers the full catalog and starts after a brief typing pause. Select any result to replay it; going back restores the filtered page.

Both boards accept legal moves directly. Click or drag a piece, or focus the board and use the arrow keys and Enter to select a square. Pick a piece when promoting. The engine classifies the candidate and refreshes its recommendations. Undo or return to the recorded ply without changing the original game or catalog opening.

The engine panel shows up to three ranked moves for the side to move, with the root and up to four replies per line. Mate and automatic draws can shorten a line. Opening SAN is shown separately. Older reviews may only have stored roots. New reviews show accuracy v3 per side: costly drops in engine win chance count more than small errors. This is not Chess.com's proprietary score. Resubmit to recalculate an older review; its stored score is unchanged.

The selected review move or newly classified continuation shows its classification badge on the piece's destination square, as well as its text label next to the move. Right-drag to draw an arrow; knight offsets bend in an L. Right-click an arrow or an endpoint to remove it, repeat the drag to toggle it, or select **Clear arrows**. Moving to another position clears arrows.

## Verify locally

```sh
npm run lint
npm exec -- tsc --noEmit
```

In the browser, verify a valid PGN completes, move navigation updates the board and evaluation, and reloading the review URL does not resubmit. An invalid PGN should show an error and keep the input.

Check review and opening boards on a narrow touch viewport and in both color themes. Play a legal continuation, verify the returned label and engine lines, and undo it without changing the recorded SAN.
