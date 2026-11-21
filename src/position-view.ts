import { createBoard } from './board';
import { createBranchAnalysis, type RecordedPosition } from './branch-analysis';
import { moveClassificationIcon } from './move-icon';
import type { Evaluation, PositionSource, Recommendation } from './review-api';

export function numberedMove(san: string, plyBeforeMove: number, numberBlack = true): string {
  const number = Math.floor(plyBeforeMove / 2) + 1;
  if (plyBeforeMove % 2 === 0) return `${number}. ${san}`;
  return numberBlack ? `${number}… ${san}` : san;
}

export function keepMoveVisible(list: HTMLElement, selected?: HTMLElement) {
  if (!selected) {
    list.scrollTop = 0;
    return;
  }
  const item = selected.getBoundingClientRect();
  const bounds = list.getBoundingClientRect();
  if (item.top < bounds.top) list.scrollTop -= bounds.top - item.top;
  else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
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

function engineLine(candidate: Recommendation, ply: number) {
  const row = document.createElement('li');
  const line = document.createElement('strong');
  line.className = 'engine-line';
  line.textContent = (candidate.line ?? [candidate])
    .map((move, index) => numberedMove(move.san, ply + index, index === 0)).join(' ');
  const score = document.createElement('span');
  score.className = 'engine-line-score';
  score.textContent = describe(candidate.evaluation).label;
  row.append(line, ' ', score);
  if (!candidate.line || candidate.incomplete) {
    const note = document.createElement('small');
    note.className = 'engine-line-note';
    note.textContent = candidate.incomplete ? 'Incomplete line' : 'Continuation not recorded';
    row.append(' ', note);
  }
  return row;
}

type Elements = { board: HTMLElement; host: HTMLElement; score: HTMLElement; meter: HTMLMeterElement };
export type PositionView = { select(ply: number): void; clearArrows(): void; destroy(): void };

export function createPositionView(
  { board, host, score, meter }: Elements, source: (ply: number) => PositionSource,
  initial: RecordedPosition, moves: readonly (RecordedPosition & { uci: string })[],
): PositionView {
  const template = document.querySelector<HTMLTemplateElement>('#position-analysis-template')!;
  const panel = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
  const help = panel.querySelector<HTMLElement>('.board-help')!;
  const announcement = panel.querySelector<HTMLElement>('.board-keyboard-status')!;
  const undo = panel.querySelector<HTMLButtonElement>('.undo-branch')!;
  const reset = panel.querySelector<HTMLButtonElement>('.reset-branch')!;
  const retry = panel.querySelector<HTMLButtonElement>('.retry-analysis')!;
  const branchLine = panel.querySelector<HTMLElement>('.branch-line')!;
  const branchStatus = panel.querySelector<HTMLElement>('.branch-status')!;
  const engineStatus = panel.querySelector<HTMLElement>('.engine-moves-status')!;
  const lines = panel.querySelector<HTMLOListElement>('.engine-moves-list')!;
  const dialog = panel.querySelector<HTMLDialogElement>('.promotion-dialog')!;
  const promotionOptions = panel.querySelector<HTMLElement>('.promotion-options')!;
  const cancelPromotion = panel.querySelector<HTMLButtonElement>('.cancel-promotion')!;
  const isReview = board.id === 'board';
  help.id = `${board.id}-help`;
  engineStatus.id = isReview ? 'engine-moves-status' : 'opening-engine-moves-status';
  lines.id = isReview ? 'engine-moves' : 'opening-engine-moves';
  board.tabIndex = 0;
  board.setAttribute('role', 'application');
  board.setAttribute('aria-label', 'Chessboard, White at bottom');
  board.setAttribute('aria-describedby', help.id);
  host.replaceChildren(panel);

  const ground = createBoard(board, announcement, (from, to) => analysis.play(from, to));
  const analysis = createBranchAnalysis(source, initial, moves, {
    board: ground.render,
    analysis({ ply, position, branch, status, notice, canRetry }) {
      const evaluation = position.evaluation && describe(position.evaluation);
      score.textContent = evaluation?.label ?? 'Not available';
      meter.hidden = !evaluation;
      if (evaluation) {
        meter.value = evaluation.share;
        meter.setAttribute('aria-valuetext', evaluation.label);
      }
      undo.disabled = reset.disabled = !branch.length;
      branchLine.hidden = !branch.length;
      branchLine.replaceChildren();
      if (branch.length) {
        branchLine.append('Continuation: ');
        branch.forEach(({ local, analysis }, index) => {
          const move = analysis?.move;
          if (index) branchLine.append(' · ');
          branchLine.append(numberedMove(move?.san ?? local.san, ply + index, index === 0));
          if (move) branchLine.append(' ', moveClassificationIcon(move.classification), move.classification);
        });
      }
      branchStatus.textContent = notice;
      branchStatus.hidden = !notice;
      const recommendations = position.recommendations;
      engineStatus.textContent = status || (recommendations === undefined && position.evaluation
        ? 'Recommendations were not recorded for this review.'
        : recommendations?.length === 0 ? 'No recommendations in a finished position.' : '');
      retry.hidden = !canRetry;
      lines.replaceChildren(...(recommendations ?? []).map(candidate => engineLine(candidate, ply + branch.length)));
    },
    promotion(choices) {
      if (!choices) {
        dialog.close();
        return;
      }
      promotionOptions.replaceChildren(...Object.entries(choices).map(([key, name]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = name;
        button.addEventListener('click', () => analysis.promote(key as keyof typeof choices));
        return button;
      }));
      dialog.showModal();
    },
  });
  undo.addEventListener('click', () => {
    analysis.undo();
    if (undo.disabled) board.focus({ preventScroll: true });
  });
  reset.addEventListener('click', () => {
    analysis.reset();
    board.focus({ preventScroll: true });
  });
  retry.addEventListener('click', () => {
    analysis.retry();
    board.focus({ preventScroll: true });
  });
  cancelPromotion.addEventListener('click', () => analysis.promote());
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    analysis.promote();
  });

  return {
    select: analysis.select,
    clearArrows: ground.clearArrows,
    destroy() {
      analysis.destroy();
      ground.destroy();
      panel.remove();
    },
  };
}
