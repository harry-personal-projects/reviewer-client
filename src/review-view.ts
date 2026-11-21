import { moveClassificationIcon } from './move-icon';
import { createPositionView, keepMoveVisible, numberedMove, type PositionView } from './position-view';
import type { ReviewResult } from './review-api';
import type { ReviewView } from './review-controller';

export function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function describeAccuracy(score: number | null | undefined): string {
  return score == null ? 'Not available' : `${score.toFixed(1)}%`;
}

const historyDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

export function createReviewView(choose: (ply: number) => void): ReviewView {
  const form = element('review-form');
  const submit = element<HTMLButtonElement>('submit-review');
  const status = element('review-status');
  const retry = element('retry-review');
  const back = element('new-review');
  const replay = element('review-result');
  const board = element('board');
  const host = element('review-analysis');
  const clearArrows = element('clear-arrows');
  const list = element('move-list');
  const initial = element<HTMLButtonElement>('initial-position');
  const previous = element<HTMLButtonElement>('previous-move');
  const next = element<HTMLButtonElement>('next-move');
  const evaluation = element('evaluation');
  const meter = element<HTMLMeterElement>('evaluation-meter');
  let analysis: PositionView | undefined;
  const position = element('current-position');
  const opening = element('review-opening');
  const whiteAccuracy = element('white-accuracy');
  const blackAccuracy = element('black-accuracy');
  const history = element('review-history');
  const historyEmpty = element('review-history-empty');
  let result: ReviewResult;
  let buttons: HTMLButtonElement[] = [];
  let selected: HTMLButtonElement | undefined;

  function close() {
    analysis?.destroy();
    analysis = undefined;
    replay.hidden = true;
  }

  clearArrows.addEventListener('click', () => analysis?.clearArrows());

  return {
    close,
    status(message, options = {}) {
      form.hidden = !!options.back;
      submit.disabled = !!options.submitting;
      status.textContent = message;
      retry.hidden = !options.retry;
      back.hidden = !options.back;
      close();
    },
    result(id, nextResult) {
      close();
      result = nextResult;
      const match = result.opening;
      opening.textContent = match === undefined ? 'Opening not recorded'
        : match === null ? 'No matching opening' : `${match.eco} · ${match.name}`;
      whiteAccuracy.textContent = describeAccuracy(result.accuracy?.white);
      blackAccuracy.textContent = describeAccuracy(result.accuracy?.black);
      const rows = result.moves.map(move => {
        const row = document.createElement('li');
        const button = document.createElement('button');
        const notation = document.createElement('strong');
        const classification = document.createElement('span');
        notation.textContent = numberedMove(move.san, move.ply - 1);
        classification.textContent = move.classification;
        classification.prepend(moveClassificationIcon(move.classification));
        button.append(notation, classification);
        button.addEventListener('click', () => choose(move.ply));
        row.append(button);
        return row;
      });
      list.replaceChildren(...rows);
      buttons = rows.map(row => row.firstElementChild as HTMLButtonElement);
      form.hidden = retry.hidden = true;
      back.hidden = replay.hidden = false;
      status.textContent = 'Review complete.';
      analysis = createPositionView({ board, host, score: evaluation, meter },
        ply => ({ reviewId: id, ply }), result.initial, result.moves);
    },
    position(ply) {
      const move = result.moves[ply - 1];
      analysis?.select(ply);
      previous.disabled = ply === 0;
      next.disabled = ply === result.moves.length;
      position.textContent = move ? `Ply ${ply} of ${result.moves.length}: ${move.san}, ${move.classification}` : 'Starting position';
      selected?.removeAttribute('aria-current');
      selected = buttons[ply - 1] ?? initial;
      selected.setAttribute('aria-current', 'true');
      keepMoveVisible(list, buttons[ply - 1]);
    },
    history(entries, currentId) {
      const focused = document.activeElement;
      const focusedId = focused instanceof HTMLAnchorElement && history.contains(focused)
        ? focused.dataset.reviewId : undefined;
      let focusTarget: HTMLAnchorElement | undefined;
      const rows = entries.map(entry => {
        const row = document.createElement('li');
        const link = document.createElement('a');
        const time = document.createElement('time');
        const url = new URL(window.location.href);
        url.searchParams.set('review', entry.id);
        link.href = url.href;
        link.dataset.reviewId = entry.id;
        if (entry.id.toLowerCase() === currentId?.toLowerCase()) link.setAttribute('aria-current', 'page');
        if (entry.id === focusedId) focusTarget = link;
        time.dateTime = entry.createdAt;
        time.textContent = historyDate.format(Date.parse(entry.createdAt));
        link.append(time);
        row.append(link);
        return row;
      });
      history.replaceChildren(...rows);
      history.hidden = !rows.length;
      historyEmpty.hidden = !!rows.length;
      focusTarget?.focus({ preventScroll: true });
    },
  };
}
