import { getReview, ReviewRequestError, submitReview, type ReviewResult } from './review-api';

type StatusOptions = { back?: boolean; retry?: boolean; submitting?: boolean };
export type ReviewView = {
  status(message: string, options?: StatusOptions): void;
  result(result: ReviewResult): void;
  position(ply: number): void;
};

function explain(error: unknown): string {
  const code = error instanceof ReviewRequestError ? error.code : '';
  switch (code) {
    case 'configuration': return 'The API origin is missing or invalid.';
    case 'invalid_pgn': return 'Paste one valid standard game with a result marker (such as * or 1-0).';
    case 'payload_too_large': return 'The PGN exceeds the request size limit.';
    case 'queue_full':
    case 'rate_limited': return 'Too many reviews right now. Wait a moment and try again.';
    case 'service_unavailable': return 'The review service is temporarily unavailable.';
    case 'invalid_response': return 'The server returned an unreadable review response.';
    default: return 'Could not reach the review service. Check your connection and try again.';
  }
}

function failure(code: string): string {
  switch (code) {
    case 'analysis_timeout': return 'Analysis took too long. You can submit the game again.';
    case 'worker_interrupted': return 'Analysis was interrupted. You can submit the game again.';
    default: return 'The engine could not finish this review. You can submit the game again.';
  }
}

export function createReviewController(view: ReviewView) {
  let active: AbortController | undefined;
  let timer: number | undefined;
  let submitting = false;
  let result: ReviewResult | undefined;
  let ply = 0;

  function cancel() {
    active?.abort();
    active = undefined;
    window.clearTimeout(timer);
    timer = undefined;
    submitting = false;
  }

  function setReviewInUrl(id: string | null) {
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete('review');
    else url.searchParams.set('review', id);
    if (url.href !== window.location.href) window.history.pushState(null, '', url);
  }

  async function poll(id: string, request: AbortController) {
    try {
      const review = await getReview(id, request.signal);
      if (active !== request) return;
      if (review.status === 'queued' || review.status === 'running') {
        view.status(review.status === 'queued' ? 'Review queued…' : 'Analyzing with Stockfish…', { back: true });
        timer = window.setTimeout(() => void poll(id, request), 2000);
      } else if (review.status === 'succeeded') {
        result = review.result;
        ply = 0;
        view.result(result);
        view.position(ply);
      } else if (review.status === 'failed') {
        view.status(failure(review.error.code), { back: true });
      }
    } catch (error) {
      if (active !== request) return;
      if (error instanceof ReviewRequestError && error.code === 'review_not_found') {
        view.status('This review was not found or has expired.', { back: true });
      } else {
        view.status(explain(error), { back: true, retry: true });
      }
    }
  }

  function load() {
    cancel();
    result = undefined;
    const id = new URL(window.location.href).searchParams.get('review');
    if (id === null) {
      view.status('');
      return;
    }
    const request = active = new AbortController();
    view.status('Checking review…', { back: true });
    void poll(id, request);
  }

  async function submit(pgn: string) {
    if (submitting || new URL(window.location.href).searchParams.has('review')) return;
    if (!pgn.trim()) {
      view.status('Paste a PGN first.');
      return;
    }
    cancel();
    const request = active = new AbortController();
    submitting = true;
    view.status('Submitting game…', { submitting: true });
    try {
      const review = await submitReview(pgn, request.signal);
      if (active !== request) return;
      setReviewInUrl(review.id);
      load();
    } catch (error) {
      if (active !== request) return;
      submitting = false;
      view.status(explain(error));
    }
  }

  function choose(plyIndex: number) {
    if (!result || plyIndex < 0 || plyIndex > result.moves.length || plyIndex === ply) return;
    ply = plyIndex;
    view.position(ply);
  }

  return {
    load, cancel, submit, choose,
    step: (delta: number) => choose(ply + delta),
    back: () => { setReviewInUrl(null); load(); },
  };
}
