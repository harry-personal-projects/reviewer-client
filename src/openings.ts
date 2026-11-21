import { createBoard, parseBoard, type Square } from './board';
import { apiOrigin, getOpenings, ReviewRequestError } from './review-api';
import { element } from './review-view';

const pageSize = 50;
const uciMove = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

type OpeningReplayKey = { id: number; eco: string; name: string };
type ReplayMove = { board: Square[]; san: string; uci: string };
type OpeningReplay = { initial: Square[]; moves: ReplayMove[] };

function button(label: string) {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  return control;
}

function coordinates(className: string, labels: string) {
  const axis = document.createElement('div');
  axis.className = className;
  axis.setAttribute('aria-hidden', 'true');
  for (const label of labels) {
    const tick = document.createElement('span');
    tick.textContent = label;
    axis.append(tick);
  }
  return axis;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function replayBoard(fen: unknown): Square[] {
  const board = typeof fen === 'string' ? parseBoard(fen) : null;
  if (!board) throw new ReviewRequestError('invalid_response');
  return board;
}

async function getOpeningReplay(
  item: OpeningReplayKey, revision: string, signal: AbortSignal,
): Promise<OpeningReplay> {
  const query = new URLSearchParams({ revision });
  const response = await fetch(`${apiOrigin()}/v1/openings/${item.id}?${query}`, {
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (response.status !== 200) {
    void response.body?.cancel().catch(() => {});
    throw new ReviewRequestError('request_failed', response.status);
  }
  const value: unknown = await response.json();
  if (!record(value) || value.revision !== revision || value.id !== item.id
    || value.eco !== item.eco || value.name !== item.name
    || !Array.isArray(value.moves) || !value.moves.length) {
    throw new ReviewRequestError('invalid_response');
  }
  return {
    initial: replayBoard(value.initialFen),
    moves: value.moves.map((move: unknown, index: number): ReplayMove => {
      if (!record(move) || move.ply !== index + 1 || typeof move.san !== 'string'
        || !move.san.trim() || typeof move.uci !== 'string' || !uciMove.test(move.uci)) {
        throw new ReviewRequestError('invalid_response');
      }
      return { board: replayBoard(move.fen), san: move.san, uci: move.uci };
    }),
  };
}

function createOpeningReplay(restoreCatalog: () => void) {
  const panel = document.createElement('section');
  panel.className = 'opening-replay';
  panel.setAttribute('aria-labelledby', 'opening-replay-title');
  panel.hidden = true;
  const title = document.createElement('h3');
  title.id = 'opening-replay-title';
  title.tabIndex = -1;
  const back = button('Back to opening catalog');
  const status = document.createElement('p');
  status.id = 'opening-replay-status';
  status.setAttribute('role', 'status');
  const position = document.createElement('div');
  position.className = 'opening-replay-position';
  const frame = document.createElement('div');
  frame.className = 'board-frame';
  const board = document.createElement('div');
  board.id = 'opening-board';
  board.setAttribute('role', 'img');
  frame.append(board, coordinates('ranks', '87654321'), coordinates('files', 'abcdefgh'));
  const actions = document.createElement('div');
  actions.className = 'actions';
  const start = button('Starting position');
  const previous = button('Previous');
  const next = button('Next');
  actions.append(start, previous, next);
  position.append(frame, actions);
  panel.append(title, back, status, position);

  let active: AbortController | undefined;
  let replay: OpeningReplay | undefined;
  let renderBoard: ((squares: Square[], move?: string) => void) | undefined;
  let ply = 0;

  function show(nextPly: number) {
    if (!replay || nextPly < 0 || nextPly > replay.moves.length) return;
    ply = nextPly;
    const move = ply === 0 ? undefined : replay.moves[ply - 1];
    (renderBoard ??= createBoard(board).render)(move?.board ?? replay.initial, move?.uci);
    previous.disabled = ply === 0;
    next.disabled = ply === replay.moves.length;
    status.textContent = move ? `Ply ${ply} of ${replay.moves.length}: ${move.san}` : 'Starting position';
  }

  function close() {
    active?.abort();
    active = undefined;
    replay = undefined;
    panel.hidden = true;
  }

  back.addEventListener('click', () => {
    close();
    restoreCatalog();
  });
  start.addEventListener('click', () => show(0));
  previous.addEventListener('click', () => show(ply - 1));
  next.addEventListener('click', () => show(ply + 1));

  return {
    panel,
    close,
    async open(item: OpeningReplayKey, revision: string) {
      close();
      const request = active = new AbortController();
      title.textContent = `${item.eco} · ${item.name}`;
      position.hidden = true;
      status.textContent = '';
      panel.hidden = false;
      title.focus();
      status.textContent = 'Loading opening replay…';
      try {
        const loaded = await getOpeningReplay(item, revision, request.signal);
        if (active !== request) return;
        replay = loaded;
        position.hidden = false;
        show(0);
      } catch (error) {
        if (active !== request) return;
        status.textContent = error instanceof ReviewRequestError && error.status === 404
          ? 'This opening is no longer available.'
          : 'The opening replay is unavailable.';
      } finally {
        if (active === request) active = undefined;
      }
    },
  };
}

export function createOpenings() {
  const title = element('openings-title');
  const status = element('openings-status');
  const list = element('opening-list');
  const previous = element<HTMLButtonElement>('previous-openings');
  const next = element<HTMLButtonElement>('next-openings');
  const retry = element('retry-openings');
  const page = element('openings-page');
  const catalog = document.createElement('div');
  let replayTrigger: HTMLButtonElement | undefined;
  const replay = createOpeningReplay(() => {
    catalog.hidden = false;
    replayTrigger?.focus();
    replayTrigger = undefined;
  });
  for (const child of Array.from(page.children)) {
    if (child !== title) catalog.append(child);
  }
  page.append(catalog, replay.panel);

  let active: AbortController | undefined;
  let revision: string | undefined;
  let cursors = [0];
  let index = 0;
  let nextAfter: number | null = null;

  function cancelLoad() {
    active?.abort();
    active = undefined;
  }

  function cancel() {
    cancelLoad();
    replay.close();
    catalog.hidden = false;
    replayTrigger = undefined;
  }

  async function load() {
    cancelLoad();
    const request = active = new AbortController();
    status.textContent = 'Loading named openings…';
    list.replaceChildren();
    list.hidden = previous.hidden = next.hidden = retry.hidden = true;
    try {
      const page = await getOpenings(revision, cursors[index], pageSize, request.signal);
      if (active !== request) return;
      revision = page.revision;
      nextAfter = page.nextAfter;
      const rows = page.items.map(item => {
        const row = document.createElement('li');
        const heading = document.createElement('h3');
        const moves = document.createElement('p');
        const open = button(`${item.eco} · ${item.name}`);
        open.addEventListener('click', () => {
          replayTrigger = open;
          catalog.hidden = true;
          void replay.open(item, page.revision);
        });
        heading.append(open);
        moves.textContent = item.movesSan.map((san, ply) => ply % 2 ? san : `${ply / 2 + 1}. ${san}`).join(' ');
        row.append(heading, moves);
        return row;
      });
      list.replaceChildren(...rows);
      list.hidden = !rows.length;
      status.textContent = rows.length
        ? `Page ${index + 1} · ${rows.length} named ${rows.length === 1 ? 'opening' : 'openings'}`
        : 'No named openings on this page.';
      previous.hidden = next.hidden = false;
      previous.disabled = index === 0;
      next.disabled = nextAfter === null;
    } catch (error) {
      if (active !== request) return;
      status.textContent = error instanceof ReviewRequestError && error.code === 'configuration'
        ? 'The API origin is missing or invalid.'
        : 'The opening catalog is unavailable.';
      retry.hidden = false;
      previous.hidden = index === 0;
      previous.disabled = index === 0;
    } finally {
      if (active === request) active = undefined;
    }
  }

  previous.addEventListener('click', () => {
    if (index === 0 || active) return;
    index--;
    title.focus();
    void load();
  });
  next.addEventListener('click', () => {
    if (nextAfter === null || active) return;
    cursors[++index] = nextAfter;
    title.focus();
    void load();
  });
  retry.addEventListener('click', () => {
    title.focus();
    void load();
  });

  return {
    cancel,
    start() {
      cancel();
      revision = undefined;
      cursors = [0];
      index = 0;
      nextAfter = null;
      void load();
    },
  };
}
