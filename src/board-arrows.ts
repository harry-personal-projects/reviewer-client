import type { Square } from 'chess.js';

const svgNamespace = 'http://www.w3.org/2000/svg';

function center(square: string): [number, number] {
  return [square.charCodeAt(0) - 97 + 0.5, 8 - Number(square[1]) + 0.5];
}

function edge(x: number, y: number, dx: number, dy: number, width: number): string {
  return `${x - width * dy} ${y + width * dx}`;
}

function drawArrow(from: string, to: string): SVGPathElement {
  const [x, y] = center(from);
  const [endX, endY] = center(to);
  const files = Math.abs(endX - x);
  const ranks = Math.abs(endY - y);
  const knight = (files === 2 && ranks === 1) || (files === 1 && ranks === 2);
  const bendX = knight && files > ranks ? endX : x;
  const bendY = knight && ranks > files ? endY : y;
  const length = Math.hypot(endX - bendX, endY - bendY);
  const dx = (endX - bendX) / length;
  const dy = (endY - bendY) / length;
  const startDx = knight ? Math.sign(bendX - x) : dx;
  const startDy = knight ? Math.sign(bendY - y) : dy;
  const neckX = endX - 0.4 * dx;
  const neckY = endY - 0.4 * dy;
  const shaft = 0.11;
  const head = 0.24;
  let leftBend = '';
  let rightBend = '';
  if (knight) {
    // The miter is offset from the centerline corner by both segment normals.
    const bendDx = startDx + dx;
    const bendDy = startDy + dy;
    leftBend = `L ${edge(bendX, bendY, bendDx, bendDy, shaft)}`;
    rightBend = `L ${edge(bendX, bendY, bendDx, bendDy, -shaft)}`;
  }
  const path = document.createElementNS(svgNamespace, 'path');
  path.setAttribute('d', `M ${edge(x, y, startDx, startDy, shaft)}
    ${leftBend} L ${edge(neckX, neckY, dx, dy, shaft)}
    L ${edge(neckX, neckY, dx, dy, head)} L ${endX} ${endY}
    L ${edge(neckX, neckY, dx, dy, -head)}
    L ${edge(neckX, neckY, dx, dy, -shaft)} ${rightBend}
    L ${edge(x, y, startDx, startDy, -shaft)} Z`);
  return path;
}

export function createBoardArrows(
  board: HTMLElement, squareAt: (x: number, y: number) => Square | undefined,
  toggleHighlight: (square: Square) => void,
) {
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const overlay = document.createElementNS(svgNamespace, 'svg');
  overlay.setAttribute('viewBox', '0 0 8 8');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.add('board-arrows');
  const arrows = new Map<string, SVGPathElement>();
  let drag: { pointer: number; from: Square; moved: boolean; to?: Square; preview?: SVGPathElement } | undefined;

  function removeArrow(key: string): boolean {
    const arrow = arrows.get(key);
    if (!arrow) return false;
    arrow.remove();
    return arrows.delete(key);
  }

  function cancel(pointer: number) {
    if (drag?.pointer !== pointer) return;
    drag.preview?.remove();
    drag = undefined;
    if (board.hasPointerCapture(pointer)) board.releasePointerCapture(pointer);
  }

  board.addEventListener('contextmenu', event => event.preventDefault(), options);
  board.addEventListener('pointerdown', event => {
    if (event.button !== 2 || drag) return;
    const from = squareAt(event.clientX, event.clientY);
    if (!from) return;
    event.preventDefault();
    board.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, from, moved: false };
  }, options);
  board.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    if (!(event.buttons & 2)) {
      cancel(event.pointerId);
      return;
    }
    const to = squareAt(event.clientX, event.clientY);
    if (to !== drag.from) drag.moved = true;
    if (to === drag.to) return;
    drag.preview?.remove();
    drag.preview = undefined;
    drag.to = to;
    if (to && to !== drag.from) {
      drag.preview = drawArrow(drag.from, to);
      drag.preview.classList.add('arrow-preview');
      overlay.append(drag.preview);
    }
  }, options);
  board.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    const { from, moved } = drag;
    const to = squareAt(event.clientX, event.clientY);
    cancel(event.pointerId);
    if (event.button !== 2 || !to) return;
    if (to === from) {
      if (!moved) toggleHighlight(to);
      return;
    }
    const key = from + to;
    if (removeArrow(key)) return;
    const arrow = drawArrow(from, to);
    arrows.set(key, arrow);
    overlay.append(arrow);
  }, options);
  board.addEventListener('pointercancel', event => cancel(event.pointerId), options);
  board.addEventListener('lostpointercapture', event => cancel(event.pointerId), options);

  function clear() {
    if (drag) cancel(drag.pointer);
    arrows.clear();
    overlay.replaceChildren();
  }

  return {
    mount(container: HTMLElement) {
      if (drag) cancel(drag.pointer);
      container.append(overlay);
    },
    clear,
    destroy() {
      clear();
      listeners.abort();
      overlay.remove();
    },
  };
}
