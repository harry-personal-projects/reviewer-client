import './style.css';

import { createOpenings } from './openings';
import { createReviewController } from './review-controller';
import { reviewHistoryChanged } from './review-history';
import { createReviewView, element } from './review-view';

const controller = createReviewController(createReviewView(ply => controller.choose(ply)));
const openings = createOpenings();
const form = element<HTMLFormElement>('review-form');
const pgn = element<HTMLTextAreaElement>('pgn');
const replay = element('review-result');
const reviewPage = element('review-page');
const openingsPage = element('openings-page');
const showReview = element('show-review');
const showOpenings = element('show-openings');

function loadPage() {
  const showCatalog = new URL(window.location.href).searchParams.get('view') === 'openings';
  reviewPage.hidden = showCatalog;
  openingsPage.hidden = !showCatalog;
  showReview.setAttribute('aria-pressed', String(!showCatalog));
  showOpenings.setAttribute('aria-pressed', String(showCatalog));
  if (showCatalog) {
    controller.cancel();
    openings.start();
  } else {
    openings.cancel();
    controller.load();
  }
}

function navigate(showCatalog: boolean) {
  if (showCatalog === reviewPage.hidden) return;
  const url = new URL(window.location.href);
  if (showCatalog) {
    const returnReview = url.searchParams.get('review');
    url.searchParams.delete('review');
    url.searchParams.set('view', 'openings');
    window.history.pushState({ returnReview }, '', url);
  } else {
    const returnReview = window.history.state?.returnReview;
    url.searchParams.delete('view');
    if (typeof returnReview === 'string') url.searchParams.set('review', returnReview);
    window.history.pushState(null, '', url);
  }
  loadPage();
}

showReview.addEventListener('click', () => navigate(false));
showOpenings.addEventListener('click', () => navigate(true));

form.addEventListener('submit', event => {
  event.preventDefault();
  void controller.submit(pgn.value);
});
element('retry-review').addEventListener('click', controller.load);
element('new-review').addEventListener('click', () => {
  controller.open(null);
  pgn.focus();
});
element('initial-position').addEventListener('click', () => controller.choose(0));
element('previous-move').addEventListener('click', () => controller.step(-1));
element('next-move').addEventListener('click', () => controller.step(1));
element('review-history').addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
    || !(event.target instanceof Element)) return;
  const id = event.target.closest<HTMLAnchorElement>('a[data-review-id]')?.dataset.reviewId;
  if (!id) return;
  event.preventDefault();
  controller.open(id);
  element('review-status').focus();
});

document.addEventListener('keydown', event => {
  if (event.defaultPrevented || reviewPage.hidden || replay.hidden || event.altKey || event.ctrlKey || event.metaKey
    || !(event.target instanceof HTMLElement) || event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  controller.step(event.key === 'ArrowLeft' ? -1 : 1);
  if (event.target.closest('#move-list')) {
    replay.querySelector<HTMLButtonElement>('button[aria-current="true"]')?.focus({ preventScroll: true });
  }
});

window.addEventListener('storage', event => {
  if (!reviewPage.hidden && reviewHistoryChanged(event)) controller.refreshHistory();
});
window.addEventListener('popstate', loadPage);
window.addEventListener('pagehide', () => {
  controller.cancel();
  openings.cancel();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) loadPage();
});
loadPage();
