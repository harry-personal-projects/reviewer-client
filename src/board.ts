import { createBoardArrows } from './board-arrows';

const pieces = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
} as const;

const pieceNames = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' } as const;
type Piece = keyof typeof pieces;
export type Square = Piece | '';

export function parseBoard(fen: string): Square[] | null {
  const ranks = fen.split(' ', 1)[0].split('/');
  if (ranks.length !== 8) return null;
  const squares: Square[] = [];
  for (const rank of ranks) {
    const start = squares.length;
    for (const token of rank) {
      if (token >= '1' && token <= '8') {
        for (let i = 0; i < Number(token); i++) squares.push('');
      } else if (Object.hasOwn(pieces, token)) {
        squares.push(token as Piece);
      } else {
        return null;
      }
    }
    if (squares.length - start !== 8) return null;
  }
  return squares;
}

export function createBoard(board: HTMLElement) {
  const cells = Array.from({ length: 64 }, (_, index) => {
    const square = document.createElement('span');
    const rank = Math.floor(index / 8);
    const file = index % 8;
    square.className = `square ${(rank + file) % 2 ? 'square-dark' : 'square-light'}`;
    square.setAttribute('aria-hidden', 'true');
    board.append(square);
    const name = `${'abcdefgh'[file]}${8 - rank}`;
    square.dataset.square = name;
    return { square, name };
  });

  const annotations = createBoardArrows(board);

  function render(position: Square[], move?: string) {
    annotations.clear();
    const occupied: string[] = [];
    cells.forEach(({ square, name }, index) => {
      const piece = position[index];
      if (piece) {
        const color = piece === piece.toUpperCase() ? 'white' : 'black';
        occupied.push(`${color} ${pieceNames[piece.toLowerCase() as keyof typeof pieceNames]} on ${name}`);
        square.textContent = pieces[piece];
        square.dataset.color = color;
      } else {
        square.textContent = '';
        delete square.dataset.color;
      }
      square.classList.toggle('last-move', name === move?.slice(0, 2) || name === move?.slice(2, 4));
    });
    board.setAttribute('aria-label', `Chessboard, White at bottom. ${occupied.join(', ')}`);
  }

  return { render, clearArrows: annotations.clear };
}
