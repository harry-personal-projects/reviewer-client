import { getOpenings, ReviewRequestError } from './review-api';
import { element } from './review-view';

const pageSize = 50;

export function createOpenings() {
  const title = element('openings-title');
  const status = element('openings-status');
  const list = element('opening-list');
  const previous = element<HTMLButtonElement>('previous-openings');
  const next = element<HTMLButtonElement>('next-openings');
  const retry = element('retry-openings');
  let active: AbortController | undefined;
  let revision: string | undefined;
  let cursors = [0];
  let index = 0;
  let nextAfter: number | null = null;

  function cancel() {
    active?.abort();
    active = undefined;
  }

  async function load() {
    cancel();
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
        heading.textContent = `${item.eco} · ${item.name}`;
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
      revision = undefined;
      cursors = [0];
      index = 0;
      nextAfter = null;
      void load();
    },
  };
}
