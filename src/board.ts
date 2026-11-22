import { Chessground } from '@lichess-org/chessground';
import type { Dests, Key } from '@lichess-org/chessground/types';
import type { Chess, PieceSymbol, Square } from 'chess.js';
import { createBoardArrows } from './board-arrows';
import { moveClassificationIcon, type MoveClassification } from './move-icon';

const files = 'abcdefgh';
const ranks = '12345678';
const pieceNames: Record<PieceSymbol, string> = {
  k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn',
};
const directions: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowDown: [0, -1], ArrowUp: [0, 1],
};

export function createBoard(
  board: HTMLElement, announcement: HTMLElement, play: (from: Square, to: Square) => void,
) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const ground = Chessground(board, {
    orientation: 'white',
    movable: { free: false, rookCastle: false, dests: new Map() },
    premovable: { enabled: false },
    animation: { enabled: !window.matchMedia('(prefers-reduced-motion: reduce)').matches },
    drawable: { enabled: false, visible: false },
  });
  const { board: surface, container } = ground.state.dom.elements;
  container.setAttribute('aria-hidden', 'true');
  surface.addEventListener('touchcancel', () => ground.cancelMove(), options);
  const arrows = createBoardArrows(surface, (x, y) => ground.getKeyAtDomPos([x, y]));
  let rules: Chess | undefined;
  let cursor: Square = 'e2';
  let keyboardCursor = false;
  let dests: Dests = new Map();
  let epoch = 0;
  let badge: HTMLElement | undefined;
  let badgeSquare: Square | undefined;
  let badgeLabel: MoveClassification | undefined;

  function announce() {
    const piece = rules?.get(cursor);
    const selected = ground.state.selected;
    const available = selected ? dests.get(selected) : undefined;
    const description = piece ? `${piece.color === 'w' ? 'white' : 'black'} ${pieceNames[piece.type]}` : 'empty';
    const turn = rules?.turn() === 'w' ? 'White' : 'Black';
    announcement.textContent = `${cursor}, ${description}. ${turn} to move${rules?.isCheck() ? ', in check' : ''}.`
      + (selected ? ` Selected ${selected}. ${available?.length ? `Legal destinations: ${available.join(', ')}.` : 'No legal moves.'}` : '');
  }

  function markCursor() {
    ground.set({ highlight: { custom: new Map(keyboardCursor ? [[cursor, 'keyboard-cursor']] : []) } });
    if (keyboardCursor) announce();
  }

  board.addEventListener('focus', () => {
    keyboardCursor = board.matches(':focus-visible');
    markCursor();
  }, options);
  board.addEventListener('blur', () => {
    keyboardCursor = false;
    markCursor();
  }, options);
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const key = ground.getKeyAtDomPos([event.clientX, event.clientY]);
    if (key && key !== 'a0') cursor = key;
    if (keyboardCursor) {
      keyboardCursor = false;
      markCursor();
    }
    board.focus({ preventScroll: true });
  }, options);
  board.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = Object.hasOwn(directions, event.key) ? directions[event.key] : undefined;
    if (direction) {
      const [x, y] = direction;
      const file = Math.min(7, Math.max(0, files.indexOf(cursor[0]) + x));
      const rank = Math.min(7, Math.max(0, ranks.indexOf(cursor[1]) + y));
      cursor = `${files[file]}${ranks[rank]}` as Square;
    } else if (event.key === 'Enter' || event.key === ' ') {
      if (!event.repeat) ground.selectSquare(ground.state.selected === cursor ? null : cursor);
    } else if (event.key === 'Escape') {
      ground.selectSquare(null);
    } else {
      return;
    }
    event.preventDefault();
    keyboardCursor = true;
    markCursor();
  }, options);

  return {
    render(chess: Chess, fen: string, lastMove: string | undefined, legal: Dests, clearArrows: boolean) {
      rules = chess;
      dests = legal;
      if (clearArrows) arrows.clear();
      ground.cancelMove();
      const turn = chess.turn() === 'w' ? 'white' : 'black';
      // Chessground defers its move event; a replay change must invalidate that event too.
      const positionEpoch = ++epoch;
      ground.set({
        fen,
        turnColor: turn,
        check: chess.isCheck() && turn,
        lastMove: lastMove === undefined ? undefined : [lastMove.slice(0, 2), lastMove.slice(2, 4)] as Key[],
        movable: { color: legal.size ? turn : undefined, dests: legal,
          events: { after: (from, to) => {
            if (epoch !== positionEpoch || from === 'a0' || to === 'a0') return;
            cursor = to;
            play(from, to);
          } } },
      });
      if (keyboardCursor) announce();
    },
    clearArrows: arrows.clear,
    markMove(uci?: string, label?: MoveClassification) {
      const square = label && uci ? uci.slice(2, 4) as Square : undefined;
      if (square === badgeSquare && label === badgeLabel) return;
      badge?.remove();
      badge = undefined;
      badgeSquare = square;
      badgeLabel = label;
      if (!square || !label) return;
      badge = moveClassificationIcon(label);
      badge.classList.add('board-move-badge');
      badge.style.left = `${(files.indexOf(square[0]) + 1) * 12.5}%`;
      badge.style.top = `${(8 - Number(square[1])) * 12.5}%`;
      container.append(badge);
    },
    destroy() {
      epoch++;
      listeners.abort();
      arrows.destroy();
      ground.destroy();
      board.replaceChildren();
      announcement.textContent = '';
    },
  };
}
