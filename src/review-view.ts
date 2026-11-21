import { createBoard } from './board';
import { moveClassificationIcon } from './move-icon';
import type { Evaluation, ReviewResult } from './review-api';
import type { ReviewView } from './review-controller';

export function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function describe(score: Evaluation) {
  if (score.kind === 'mate') {
    const side = score.winner === 'white' ? 'White' : 'Black';
    return { share: score.winner === 'white' ? 1 : 0,
      label: score.moves === 0 ? `${side} checkmates` : `${side} mate in ${score.moves}` };
  }
  const label = `${score.centipawns > 0 ? '+' : ''}${(score.centipawns / 100).toFixed(2)}`;
  const side = score.centipawns > 0 ? 'White ahead' : score.centipawns < 0 ? 'Black ahead' : 'Equal';
  return { share: Math.min(1, Math.max(0, 0.5 + score.centipawns / 2000)), label: `${label} · ${side}` };
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
  const board = createBoard(element('board'));
  element('clear-arrows').addEventListener('click', board.clearArrows);
  const list = element('move-list');
  const initial = element<HTMLButtonElement>('initial-position');
  const previous = element<HTMLButtonElement>('previous-move');
  const next = element<HTMLButtonElement>('next-move');
  const evaluation = element('evaluation');
  const meter = element<HTMLMeterElement>('evaluation-meter');
  const engineMoves = element('engine-moves');
  const engineMovesStatus = element('engine-moves-status');
  const position = element('current-position');
  const opening = element('review-opening');
  const whiteAccuracy = element('white-accuracy');
  const blackAccuracy = element('black-accuracy');
  const history = element('review-history');
  const historyEmpty = element('review-history-empty');
  let result: ReviewResult;
  let buttons: HTMLButtonElement[] = [];
  let selected: HTMLButtonElement | undefined;

  return {
    status(message, options = {}) {
      form.hidden = !!options.back;
      submit.disabled = !!options.submitting;
      status.textContent = message;
      retry.hidden = !options.retry;
      back.hidden = !options.back;
      replay.hidden = true;
    },
    result(nextResult) {
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
        notation.textContent = `${Math.ceil(move.ply / 2)}${move.ply % 2 ? '.' : '…'} ${move.san}`;
        classification.textContent = move.classification;
        const icon = moveClassificationIcon(move.classification);
        if (icon) classification.prepend(icon);
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
    },
    position(ply) {
      const move = result.moves[ply - 1];
      const current = move ?? result.initial;
      board.render(current.board, move?.uci);
      const score = describe(current.evaluation);
      evaluation.textContent = score.label;
      meter.value = score.share;
      meter.setAttribute('aria-valuetext', score.label);
      const candidates = current.recommendations;
      engineMovesStatus.textContent = candidates === undefined
        ? 'Not recorded. Submit this game again to get recommendations.'
        : candidates.length ? '' : 'No recommendations in a finished position.';
      engineMoves.replaceChildren(...(candidates ?? []).map(candidate => {
        const row = document.createElement('li');
        row.textContent = `${candidate.san} · ${describe(candidate.evaluation).label}`;
        return row;
      }));
      previous.disabled = ply === 0;
      next.disabled = ply === result.moves.length;
      position.textContent = move ? `Ply ${ply} of ${result.moves.length}: ${move.san}, ${move.classification}` : 'Starting position';
      selected?.removeAttribute('aria-current');
      selected = buttons[ply - 1] ?? initial;
      selected.setAttribute('aria-current', 'true');
      if (move) {
        const item = selected.getBoundingClientRect();
        const bounds = list.getBoundingClientRect();
        if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
        if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
      } else {
        list.scrollTop = 0;
      }
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
