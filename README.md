# Chess Reviewer Client

Static Vite and TypeScript frontend for [Chess Reviewer Engine](https://github.com/le-task/reviewer-engine). The current page calls the API's `/readyz` endpoint and shows whether the backend and PostgreSQL are ready. Stockfish and PostgreSQL run outside the browser.

## Run locally

Use Node 24 and npm. Start the backend first, then run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The dev server defaults to the API at `http://127.0.0.1:8000`. To use another API origin, set `VITE_API_BASE_URL` in a local `.env.local` and restart Vite. `REVIEWER_CLIENT_ORIGIN` on the backend must match the URL serving this page exactly, including the port. `localhost` and `127.0.0.1` are different origins.

## Verify and deploy

```sh
npm run lint
npm exec -- tsc --noEmit
```

In the browser, check that **Check again** refreshes the status. With the API running, temporarily stop your local test database to verify the unavailable state.

Import this repo into Vercel. Set `VITE_API_BASE_URL` to the public HTTPS API origin before deploying; `VITE_*` values are public and must not contain secrets. `vercel.json` sets the Vite build and `dist/` output directory. Set the backend's `REVIEWER_CLIENT_ORIGIN` to the deployed frontend origin.

Update this README in the same PR when setup, configuration, or user-facing behavior changes.
