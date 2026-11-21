import { validateFen } from 'chess.js';
import { isMoveClassification, type MoveClassification } from './move-icon';

export type Evaluation = { kind: 'cp'; centipawns: number }
  | { kind: 'mate'; winner: 'white' | 'black'; moves: number };
type LineMove = { san: string; uci: string };
export type Recommendation = LineMove & { evaluation: Evaluation; line?: LineMove[]; incomplete?: boolean };
type ClassifiedMove = LineMove & { classification: MoveClassification };
type Position = { fen: string; evaluation: Evaluation; recommendations?: Recommendation[] };
export type ReviewedMove = Position & ClassifiedMove & { ply: number };
type OpeningReplayMove = LineMove & { fen: string };
export type OpeningReplay = { initialFen: string; moves: OpeningReplayMove[] };

export type PositionSource = { reviewId: string; ply: number } | { revision: string; openingId: number; ply: number };
type AnalysisRequest = { source: PositionSource; branch: string[]; candidate?: string };
export type PositionAnalysis = Position & { recommendations: Recommendation[]; move?: ClassifiedMove };
type Accuracy = { version: 'v1' | 'v2' | 'v3'; white: number | null; black: number | null };
type OpeningIdentity = { id: number; eco: string; name: string };
type MatchedOpening = OpeningIdentity & { matchedPly: number };
type CatalogOpening = OpeningIdentity & { movesSan: string[] };
type OpeningPage = { revision: string; items: CatalogOpening[]; nextAfter: number | null };
export type ReviewHistoryEntry = { id: string; createdAt: string; expiresAt: string };
export type ReviewResult = {
  initial: Position;
  moves: ReviewedMove[];
  accuracy?: Accuracy;
  opening?: MatchedOpening | null;
};
export type ReviewState = { id: string; status: 'queued' | 'running' }
  | { id: string; status: 'failed'; error: { code: string } }
  | { id: string; status: 'succeeded'; result: ReviewResult };
type Submission = { id: string; status: 'queued'; historyEntry?: ReviewHistoryEntry };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uci = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const ecoCode = /^[A-E][0-9]{2}$/;
const sha = /^[0-9a-f]{40}$/;
const timestamp = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const maxOrdinal = 2147483647;
const baseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? '';

export class ReviewRequestError extends Error {
  constructor(readonly code: string, readonly status?: number) {
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

export function apiOrigin(): string {
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

function timestampMillis(value: string): number {
  const match = timestamp.exec(value);
  if (!match) return NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || value.startsWith('24:', 11)) return NaN;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= days ? Date.parse(value) : NaN;
}

export function parseHistoryEntry(value: unknown): ReviewHistoryEntry | undefined {
  if (record(value) && typeof value.id === 'string' && uuid.test(value.id)
    && typeof value.createdAt === 'string' && typeof value.expiresAt === 'string'
    && timestampMillis(value.expiresAt) > timestampMillis(value.createdAt)) {
    return { id: value.id, createdAt: value.createdAt, expiresAt: value.expiresAt };
  }
}

function percentage(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && value >= 0 && value <= 100);
}

function accuracy(value: unknown): Accuracy {
  if (!record(value) || (value.version !== 'v1' && value.version !== 'v2' && value.version !== 'v3')
    || !percentage(value.white) || !percentage(value.black)) return invalidResponse();
  return { version: value.version, white: value.white, black: value.black };
}

function openingIdentity(value: Record<string, unknown>): OpeningIdentity {
  if (!integer(value.id) || value.id < 1 || value.id > maxOrdinal
    || !text(value.eco) || !ecoCode.test(value.eco) || !text(value.name)) return invalidResponse();
  return { id: value.id, eco: value.eco, name: value.name };
}

function opening(value: unknown, plyCount: number): MatchedOpening | null {
  if (value === null) return null;
  if (!record(value) || !integer(value.matchedPly) || value.matchedPly < 1
    || value.matchedPly > plyCount) return invalidResponse();
  return { ...openingIdentity(value), matchedPly: value.matchedPly };
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

function fen(value: unknown): string {
  if (typeof value !== 'string' || !validateFen(value).ok) return invalidResponse();
  return value;
}

function lineMove(value: unknown): LineMove {
  if (!record(value) || !text(value.san) || typeof value.uci !== 'string' || !uci.test(value.uci)) {
    return invalidResponse();
  }
  return { san: value.san, uci: value.uci };
}

function classifiedMove(value: Record<string, unknown>): ClassifiedMove {
  if (!isMoveClassification(value.classification)) return invalidResponse();
  return { ...lineMove(value), classification: value.classification };
}

function recommendations(candidates: unknown): Recommendation[] {
  if (!Array.isArray(candidates) || candidates.length > 3) return invalidResponse();
  const seen = new Set<string>();
  return candidates.map((candidate: unknown) => {
    if (!record(candidate)) return invalidResponse();
    const root = lineMove(candidate);
    if (seen.has(root.uci)) return invalidResponse();
    seen.add(root.uci);
    const recommendation: Recommendation = { ...root, evaluation: evaluation(candidate.evaluation) };
    if (candidate.line !== undefined) {
      if (!Array.isArray(candidate.line) || candidate.line.length < 1 || candidate.line.length > 5) {
        return invalidResponse();
      }
      recommendation.line = candidate.line.map(lineMove);
      const first = recommendation.line[0];
      if (first.uci !== root.uci || first.san !== root.san) return invalidResponse();
    }
    if (candidate.incomplete !== undefined) {
      if (typeof candidate.incomplete !== 'boolean'
        || (candidate.incomplete && (!recommendation.line || recommendation.line.length === 5))) {
        return invalidResponse();
      }
      recommendation.incomplete = candidate.incomplete;
    }
    return recommendation;
  });
}

function position(rawFen: unknown, score: unknown, candidates: unknown): Position {
  return { fen: fen(rawFen), evaluation: evaluation(score),
    recommendations: candidates == null ? undefined : recommendations(candidates) };
}

function result(value: unknown): ReviewResult {
  if (!record(value) || !Array.isArray(value.moves) || !value.moves.length) return invalidResponse();
  const profile = value.profile;
  if (!record(profile) || !text(profile.stockfishVersion) || !text(profile.classificationVersion)
    || !text(profile.bookVersion) || !integer(profile.nodes) || profile.nodes <= 0
    || !integer(profile.multiPv) || profile.multiPv <= 0) return invalidResponse();
  return {
    initial: position(value.initialFen, value.initialEvaluation, value.initialRecommendations),
    moves: value.moves.map((item: unknown, index: number): ReviewedMove => {
      if (!record(item) || item.ply !== index + 1) return invalidResponse();
      return { ...position(item.fen, item.evaluation, item.recommendations), ...classifiedMove(item), ply: item.ply };
    }),
    ...(value.accuracy === undefined ? {} : { accuracy: accuracy(value.accuracy) }),
    ...(value.opening === undefined ? {} : { opening: opening(value.opening, value.moves.length) }),
  };
}

async function request(
  path: string, signal: AbortSignal, expected: number, init?: RequestInit, timeout = 5000,
): Promise<unknown> {
  const url = `${apiOrigin()}${path}`;
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(timeout)]),
  });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    if (!response.ok) throw new ReviewRequestError('request_failed', response.status);
    return invalidResponse();
  }
  if (!response.ok) throw new ReviewRequestError(errorCode(payload) ?? 'request_failed', response.status);
  if (response.status !== expected) return invalidResponse();
  return payload;
}

export async function submitReview(pgn: string, signal: AbortSignal): Promise<Submission> {
  const payload = await request('/v1/reviews', signal, 202, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pgn }),
  });
  if (record(payload) && typeof payload.id === 'string' && uuid.test(payload.id) && payload.status === 'queued') {
    return { id: payload.id, status: 'queued', historyEntry: parseHistoryEntry(payload) };
  }
  return invalidResponse();
}

export async function getReview(id: string, signal: AbortSignal): Promise<ReviewState> {
  if (!uuid.test(id)) throw new ReviewRequestError('review_not_found');
  const payload = await request(`/v1/reviews/${encodeURIComponent(id)}`, signal, 200);
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

export async function getOpenings(
  revision: string | undefined, after: number, limit: number, signal: AbortSignal,
): Promise<OpeningPage> {
  const query = new URLSearchParams({ after: String(after), limit: String(limit) });
  if (revision !== undefined) query.set('revision', revision);
  const payload = await request(`/v1/openings?${query}`, signal, 200);
  if (!record(payload) || !text(payload.revision) || !sha.test(payload.revision)
    || (revision !== undefined && payload.revision !== revision)
    || !Array.isArray(payload.items) || payload.items.length > limit) return invalidResponse();
  let lastId = after;
  const items = payload.items.map((item: unknown): CatalogOpening => {
    if (!record(item) || !Array.isArray(item.movesSan) || !item.movesSan.length
      || !item.movesSan.every(text)) return invalidResponse();
    const identity = openingIdentity(item);
    if (identity.id <= lastId) return invalidResponse();
    lastId = identity.id;
    return { ...identity, movesSan: item.movesSan };
  });
  const { nextAfter } = payload;
  if (nextAfter !== null && (!integer(nextAfter) || items.length !== limit || nextAfter !== lastId)) {
    return invalidResponse();
  }
  return { revision: payload.revision, items, nextAfter };
}

export async function getOpeningReplay(
  item: OpeningIdentity, revision: string, signal: AbortSignal,
): Promise<OpeningReplay> {
  const query = new URLSearchParams({ revision });
  const value = await request(`/v1/openings/${item.id}?${query}`, signal, 200);
  if (!record(value) || value.revision !== revision || value.id !== item.id
    || value.eco !== item.eco || value.name !== item.name || !Array.isArray(value.moves) || !value.moves.length) {
    return invalidResponse();
  }
  return {
    initialFen: fen(value.initialFen),
    moves: value.moves.map((move: unknown, index): OpeningReplayMove => {
      if (!record(move) || move.ply !== index + 1) return invalidResponse();
      return { ...lineMove(move), fen: fen(move.fen) };
    }),
  };
}

export async function analyzePosition(input: AnalysisRequest, signal: AbortSignal): Promise<PositionAnalysis> {
  const value = await request('/v1/positions/analyze', signal, 200, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }, 15000);
  if (!record(value)) return invalidResponse();
  const view = { fen: fen(value.fen), evaluation: evaluation(value.evaluation),
    recommendations: recommendations(value.recommendations) };
  if (input.candidate === undefined && value.move === undefined) return view;
  if (!record(value.move)) return invalidResponse();
  const move = classifiedMove(value.move);
  if (move.uci !== input.candidate) return invalidResponse();
  return { ...view, move };
}
