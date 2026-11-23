import { createPositionView, keepMoveVisible, numberedMove, type PositionView } from './position-view';
import { getOpeningReplay, getOpenings, ReviewRequestError, type OpeningReplay } from './review-api';
import { element } from './review-view';

const pageSize = 50;

type OpeningReplayKey = { id: number; eco: string; name: string };

function button(label: string) {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = label;
  return control;
}

function createOpeningReplay(panel: HTMLElement, restoreCatalog: () => void) {
  const title = element('opening-replay-title');
  const back = element('back-to-openings');
  const status = element('opening-replay-status');
  const position = element('opening-replay-position');
  const board = element('opening-board');
  const start = element<HTMLButtonElement>('opening-start');
  const previous = element<HTMLButtonElement>('opening-previous');
  const next = element<HTMLButtonElement>('opening-next');
  const clear = element('opening-clear-arrows');
  const flip = element('opening-flip-board');
  const list = element('opening-recorded-list');
  const host = element('opening-analysis');
  const score = element('opening-evaluation');
  const meter = element<HTMLMeterElement>('opening-evaluation-meter');

  let active: AbortController | undefined;
  let replay: OpeningReplay | undefined;
  let analysis: PositionView | undefined;
  let selected: HTMLButtonElement | undefined;
  let buttons: HTMLButtonElement[] = [];
  let ply = 0;

  function show(nextPly: number) {
    if (!replay || nextPly < 0 || nextPly > replay.moves.length) return;
    ply = nextPly;
    const move = ply === 0 ? undefined : replay.moves[ply - 1];
    analysis?.select(ply);
    previous.disabled = ply === 0;
    next.disabled = ply === replay.moves.length;
    status.textContent = move ? `Ply ${ply} of ${replay.moves.length}: ${move.san}` : 'Starting position';
    selected?.removeAttribute('aria-current');
    selected = buttons[ply - 1] ?? start;
    selected.setAttribute('aria-current', 'true');
    keepMoveVisible(list, buttons[ply - 1]);
  }

  function close() {
    active?.abort();
    active = undefined;
    analysis?.destroy();
    analysis = undefined;
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
  clear.addEventListener('click', () => analysis?.clearArrows());
  flip.addEventListener('click', () => analysis?.flip());

  return {
    step(delta: number) {
      if (!replay || panel.hidden) return false;
      show(ply + delta);
      return true;
    },
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
        analysis = createPositionView({ board, host, score, meter },
          ply => ({ revision, openingId: item.id, ply }), { fen: loaded.initialFen }, loaded.moves);
        buttons = loaded.moves.map((move, index) => {
          const control = button(numberedMove(move.san, index));
          control.addEventListener('click', () => show(index + 1));
          return control;
        });
        list.replaceChildren(...buttons.map(control => {
          const row = document.createElement('li');
          row.append(control);
          return row;
        }));
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
  const searchInput = element<HTMLInputElement>('opening-search');
  const previous = element<HTMLButtonElement>('previous-openings');
  const next = element<HTMLButtonElement>('next-openings');
  const retry = element('retry-openings');
  const page = element('openings-page');
  const catalog = document.createElement('div');
  let replayTrigger: HTMLButtonElement | undefined;
  const template = element<HTMLTemplateElement>('opening-replay-template');
  const replayPanel = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  for (const child of Array.from(page.children)) {
    if (child !== title) catalog.append(child);
  }
  page.append(catalog, replayPanel);
  const replay = createOpeningReplay(replayPanel, () => {
    catalog.hidden = false;
    replayTrigger?.focus();
    replayTrigger = undefined;
  });

  let active: AbortController | undefined;
  let revision: string | undefined;
  let cursors = [0];
  let index = 0;
  let nextAfter: number | null = null;
  let search = '';
  let searchTimer: number | undefined;

  function cancelLoad() {
    active?.abort();
    active = undefined;
    window.clearTimeout(searchTimer);
    searchTimer = undefined;
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
      const page = await getOpenings(revision, cursors[index], pageSize, request.signal, search);
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
        moves.textContent = item.movesSan.map((san, ply) => numberedMove(san, ply, false)).join(' ');
        row.append(heading, moves);
        return row;
      });
      list.replaceChildren(...rows);
      list.hidden = !rows.length;
      status.textContent = rows.length
        ? `Page ${index + 1} · ${rows.length} named ${rows.length === 1 ? 'opening' : 'openings'}`
        : search ? 'No openings match your search.' : 'No named openings on this page.';
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

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query === search) return;
    cancelLoad();
    search = query;
    cursors = [0];
    index = 0;
    nextAfter = null;
    list.replaceChildren();
    list.hidden = previous.hidden = next.hidden = retry.hidden = true;
    status.textContent = search ? 'Searching named openings…' : 'Loading named openings…';
    searchTimer = window.setTimeout(() => void load(), 300);
  });

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
    step: replay.step,
    start() {
      cancel();
      revision = undefined;
      search = '';
      searchInput.value = '';
      cursors = [0];
      index = 0;
      nextAfter = null;
      void load();
    },
  };
}
