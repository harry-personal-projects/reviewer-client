import { parseBoard, type Square } from './board';

export type Evaluation = { kind: 'cp'; centipawns: number }
  | { kind: 'mate'; winner: 'white' | 'black'; moves: number };
type Position = { board: Square[]; evaluation: Evaluation };
export type ReviewedMove = Position & { ply: number; san: string; uci: string; classification: string };
export type ReviewResult = {
  initial: Position;
  moves: ReviewedMove[];
};
export type ReviewState = { id: string; status: 'queued' | 'running' }
  | { id: string; status: 'failed'; error: { code: string } }
  | { id: string; status: 'succeeded'; result: ReviewResult };
type Submission = { id: string; status: 'queued' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uci = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const baseUrl = configuredUrl || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '');

export class ReviewRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function origin(): string {
  try {
    const url = new URL(baseUrl);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {
    // A missing or invalid origin is a configuration error, not a network failure.
  }
  throw new ReviewRequestError('configuration');
}

function errorCode(value: unknown): string | undefined {
  if (record(value) && record(value.error) && text(value.error.code)) return value.error.code;
}

function invalidResponse(): never {
  throw new ReviewRequestError('invalid_response');
}

function evaluation(value: unknown): Evaluation {
  if (record(value)) {
    if (value.kind === 'cp' && integer(value.centipawns)) {
      return { kind: 'cp', centipawns: value.centipawns };
    }
    if (value.kind === 'mate' && (value.winner === 'white' || value.winner === 'black')
      && integer(value.moves) && value.moves >= 0) {
      return { kind: 'mate', winner: value.winner, moves: value.moves };
    }
  }
  return invalidResponse();
}

function position(fen: unknown, score: unknown): Position {
  const board = typeof fen === 'string' ? parseBoard(fen) : null;
  if (!board) return invalidResponse();
  return { board, evaluation: evaluation(score) };
}

function result(value: unknown): ReviewResult {
  if (!record(value) || !Array.isArray(value.moves) || !value.moves.length) return invalidResponse();
  const profile = value.profile;
  if (!record(profile) || !text(profile.stockfishVersion) || !text(profile.classificationVersion)
    || !text(profile.bookVersion) || !integer(profile.nodes) || profile.nodes <= 0
    || !integer(profile.multiPv) || profile.multiPv <= 0) return invalidResponse();
  return {
    initial: position(value.initialFen, value.initialEvaluation),
    moves: value.moves.map((item: unknown, index: number): ReviewedMove => {
      if (!record(item) || item.ply !== index + 1 || !text(item.san)
        || !text(item.uci) || !uci.test(item.uci) || !text(item.classification)) return invalidResponse();
      return { ...position(item.fen, item.evaluation), ply: item.ply, san: item.san,
        uci: item.uci, classification: item.classification };
    }),
  };
}

async function request(path: string, signal: AbortSignal, expected: number, init?: RequestInit): Promise<unknown> {
  const url = `${origin()}/v1/reviews${path}`;
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (response.status === 404 && path) throw new ReviewRequestError('review_not_found');
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return invalidResponse();
  }
  if (!response.ok) throw new ReviewRequestError(errorCode(payload) ?? 'request_failed');
  if (response.status !== expected) return invalidResponse();
  return payload;
}

export async function submitReview(pgn: string, signal: AbortSignal): Promise<Submission> {
  const payload = await request('', signal, 202, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn }),
  });
  if (record(payload) && typeof payload.id === 'string' && uuid.test(payload.id) && payload.status === 'queued') {
    return { id: payload.id, status: 'queued' };
  }
  return invalidResponse();
}

export async function getReview(id: string, signal: AbortSignal): Promise<ReviewState> {
  if (!uuid.test(id)) throw new ReviewRequestError('review_not_found');
  const payload = await request(`/${encodeURIComponent(id)}`, signal, 200);
  if (!record(payload) || typeof payload.id !== 'string' || payload.id.toLowerCase() !== id.toLowerCase()) {
    return invalidResponse();
  }
  const { status } = payload;
  if (status === 'queued' || status === 'running') return { id, status };
  if (status === 'succeeded') return { id, status, result: result(payload.result) };
  const code = errorCode(payload);
  if (status === 'failed' && code) return { id, status, error: { code } };
  return invalidResponse();
}
