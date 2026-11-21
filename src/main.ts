import './style.css';

import { createReviewController } from './review-controller';
import { createReviewView, element } from './review-view';

const controller = createReviewController(createReviewView(ply => controller.choose(ply)));
const form = element<HTMLFormElement>('review-form');
const pgn = element<HTMLTextAreaElement>('pgn');
const replay = element('review-result');

form.addEventListener('submit', event => {
  event.preventDefault();
  void controller.submit(pgn.value);
});
element('retry-review').addEventListener('click', controller.load);
element('new-review').addEventListener('click', () => {
  controller.back();
  pgn.focus();
});
element('initial-position').addEventListener('click', () => controller.choose(0));
element('previous-move').addEventListener('click', () => controller.step(-1));
element('next-move').addEventListener('click', () => controller.step(1));

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || replay.hidden || event.altKey || event.ctrlKey || event.metaKey
    || !(event.target instanceof HTMLElement) || event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  controller.step(event.key === 'ArrowLeft' ? -1 : 1);
  if (event.target.closest('#move-list')) {
    replay.querySelector<HTMLButtonElement>('button[aria-current="true"]')?.focus({ preventScroll: true });
  }
});

window.addEventListener('popstate', controller.load);
window.addEventListener('pagehide', controller.cancel);
window.addEventListener('pageshow', event => {
  if (event.persisted) controller.load();
});
controller.load();
