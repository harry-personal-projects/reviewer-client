import { Chess, type Move, type Square } from 'chess.js';
import { analyzePosition, ReviewRequestError, type Evaluation, type PositionAnalysis, type PositionSource,
  type Recommendation } from './review-api';

const branchLimit = 80;
const promotionNames = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' } as const;
type Promotion = keyof typeof promotionNames;
export type RecordedPosition = { fen: string; evaluation?: Evaluation; recommendations?: Recommendation[] };
type BranchMove = { local: Move; analysis?: PositionAnalysis };

type AnalysisDisplay = {
  ply: number;
  position: RecordedPosition;
  branch: readonly BranchMove[];
  status: string;
  notice: string;
  canRetry: boolean;
};

type BranchDisplay = {
  board(chess: Chess, fen: string, lastMove: string | undefined, dests: Map<Square, Square[]>, clearArrows: boolean): void;
  analysis(state: AnalysisDisplay): void;
  promotion(choices: typeof promotionNames | undefined): void;
};

export function createBranchAnalysis(
  source: (ply: number) => PositionSource, initial: RecordedPosition,
  recorded: readonly (RecordedPosition & { uci: string })[], display: BranchDisplay,
) {
  const chess = new Chess();
  const branch: BranchMove[] = [];
  let ply = 0;
  let active: AbortController | undefined;
  let openingAnalysis: PositionAnalysis | undefined;
  let promotion: { from: Square; to: Square } | undefined;
  let notice = '';
  let status = '';
  let canRetry = false;
  let sourceMissing = false;
  let checkingTerminal = false;
  let legal = new Map<Square, Square[]>();

  function cancelRequest() {
    active?.abort();
    active = undefined;
  }

  function cancelPromotion() {
    if (!promotion) return;
    promotion = undefined;
    display.promotion(undefined);
  }

  function current(): RecordedPosition {
    const last = branch.at(-1);
    if (last) return last.analysis ?? { fen: last.local.after };
    return openingAnalysis ?? recorded[ply - 1] ?? initial;
  }

  function paintBoard(clearArrows: boolean) {
    const position = current();
    legal = new Map();
    if (!promotion && !sourceMissing && !checkingTerminal
      && branch.length < branchLimit && position.recommendations?.length !== 0) {
      for (const { from, to } of chess.moves({ verbose: true })) {
        const dests = legal.get(from);
        if (!dests) legal.set(from, [to]);
        else if (!dests.includes(to)) dests.push(to);
      }
    }
    display.board(chess, position.fen, branch.at(-1)?.local.lan ?? recorded[ply - 1]?.uci, legal, clearArrows);
  }

  function paintAnalysis() {
    display.analysis({ ply, position: current(), branch, status, notice, canRetry });
  }

  async function refresh(force = false) {
    cancelRequest();
    const candidate = branch.at(-1);
    const before = current();
    status = '';
    canRetry = false;
    if (!force && before.evaluation) {
      if (checkingTerminal) {
        checkingTerminal = false;
        paintBoard(false);
      }
      paintAnalysis();
      return;
    }

    const request = active = new AbortController();
    status = 'Analyzing with Stockfish…';
    paintAnalysis();
    try {
      const result = await analyzePosition({
        source: source(ply),
        branch: branch.slice(0, candidate ? -1 : undefined).map(entry => entry.local.lan),
        candidate: candidate?.local.lan,
      }, request.signal);
      if (active !== request) return;
      // Keep the legal move history in chess.js, but display the server's FEN.
      if (result.fen.split(' ', 4).join(' ') !== chess.fen().split(' ', 4).join(' ')) {
        throw new ReviewRequestError('invalid_response');
      }
      if (candidate) candidate.analysis = result;
      else openingAnalysis = result;
      status = '';
      const terminal = result.recommendations.length === 0;
      const redraw = checkingTerminal || terminal || result.fen !== before.fen;
      checkingTerminal = false;
      if (terminal) cancelPromotion();
      if (redraw) paintBoard(false);
    } catch (error) {
      if (active !== request) return;
      const code = error instanceof ReviewRequestError ? error.code : '';
      if (code === 'invalid_move' || code === 'terminal_position' || code === 'invalid_request'
        || code === 'payload_too_large' || code === 'position_not_found') {
        cancelPromotion();
        if (candidate) {
          branch.pop();
          chess.undo();
        }
        sourceMissing = code === 'position_not_found';
        checkingTerminal = code === 'terminal_position';
        notice = sourceMissing ? 'The position is no longer available.' : code === 'terminal_position'
          ? candidate ? 'The previous position is finished. The continuation was not played.' : 'This position is finished.'
          : 'The server rejected this continuation.';
        status = '';
        paintBoard(!!candidate);
        if (candidate && !sourceMissing) {
          // A fast sequence can contain several optimistic moves. Revalidate its new tip.
          void refresh(code === 'terminal_position' && branch.length === 0);
          return;
        }
      } else {
        status = code === 'analysis_busy' ? 'Stockfish is busy. Try again in a moment.'
          : 'Live analysis is unavailable. You can try again.';
        canRetry = true;
      }
    } finally {
      if (active === request) active = undefined;
    }
    paintAnalysis();
  }

  function select(nextPly: number) {
    cancelRequest();
    cancelPromotion();
    notice = '';
    sourceMissing = false;
    checkingTerminal = false;
    if (nextPly !== ply) openingAnalysis = undefined;
    while (branch.length) {
      branch.pop();
      chess.undo();
    }
    while (ply > nextPly) {
      chess.undo();
      ply--;
    }
    while (ply < nextPly) {
      const { uci } = recorded[ply];
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      ply++;
    }
    paintBoard(true);
    void refresh();
  }

  function commit(from: Square, to: Square, chosen?: Promotion) {
    cancelRequest();
    notice = '';
    const move = chess.move({ from, to, promotion: chosen });
    branch.push({ local: move });
    if (branch.length === branchLimit) notice = `Continuation limit reached (${branchLimit} plies).`;
    paintBoard(true);
    void refresh();
  }

  return {
    select,
    play(from: Square, to: Square) {
      if (!legal.get(from)?.includes(to)) {
        paintBoard(false);
        return;
      }
      // All four promotions share a destination. Chessground cannot pick a piece itself.
      if (chess.get(from)?.type === 'p' && (to[1] === '8' || to[1] === '1')) {
        promotion = { from, to };
        paintBoard(false);
        display.promotion(promotionNames);
        return;
      }
      commit(from, to);
    },
    promote(choice?: Promotion) {
      if (!promotion) return;
      const { from, to } = promotion;
      cancelPromotion();
      if (choice) commit(from, to, choice);
      else paintBoard(false);
    },
    undo() {
      if (!branch.length) return;
      cancelRequest();
      cancelPromotion();
      branch.pop();
      chess.undo();
      checkingTerminal = false;
      notice = sourceMissing ? 'The position is no longer available.' : '';
      paintBoard(true);
      if (!sourceMissing) void refresh();
      else paintAnalysis();
    },
    reset() {
      if (branch.length) select(ply);
    },
    retry() {
      if (canRetry) void refresh(true);
    },
    destroy() {
      cancelRequest();
      cancelPromotion();
    },
  };
}
