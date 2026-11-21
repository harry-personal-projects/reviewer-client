const svgNamespace = 'http://www.w3.org/2000/svg';

function center(square: string): [number, number] {
  return [square.charCodeAt(0) - 97 + 0.5, 8 - Number(square[1]) + 0.5];
}

function drawArrow(from: string, to: string): SVGPathElement {
  const [x, y] = center(from);
  const [endX, endY] = center(to);
  const length = Math.hypot(endX - x, endY - y);
  const dx = (endX - x) / length;
  const dy = (endY - y) / length;
  const neckX = endX - 0.4 * dx;
  const neckY = endY - 0.4 * dy;
  const path = document.createElementNS(svgNamespace, 'path');
  path.setAttribute('d', `M ${x - .11 * dy} ${y + .11 * dx}
    L ${neckX - .11 * dy} ${neckY + .11 * dx}
    L ${neckX - .24 * dy} ${neckY + .24 * dx} L ${endX} ${endY}
    L ${neckX + .24 * dy} ${neckY - .24 * dx}
    L ${neckX + .11 * dy} ${neckY - .11 * dx}
    L ${x + .11 * dy} ${y - .11 * dx} Z`);
  return path;
}

export function createBoardArrows(board: HTMLElement): { clear(): void } {
  const overlay = document.createElementNS(svgNamespace, 'svg');
  overlay.setAttribute('viewBox', '0 0 8 8');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.classList.add('board-arrows');
  board.append(overlay);
  const arrows = new Map<string, SVGPathElement>();
  let drag: { pointer: number; from: string; to?: string; preview?: SVGPathElement } | undefined;

  function squareAt(event: PointerEvent) {
    const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-square]');
    return cell?.parentElement === board ? cell.dataset.square : undefined;
  }

  function cancel(pointer: number) {
    if (drag?.pointer !== pointer) return;
    drag.preview?.remove();
    drag = undefined;
    if (board.hasPointerCapture(pointer)) board.releasePointerCapture(pointer);
  }

  board.addEventListener('contextmenu', event => event.preventDefault());
  board.addEventListener('pointerdown', event => {
    if (event.button !== 2 || drag) return;
    const from = squareAt(event);
    if (!from) return;
    event.preventDefault();
    board.setPointerCapture(event.pointerId);
    drag = { pointer: event.pointerId, from };
  });
  board.addEventListener('pointermove', event => {
    if (drag?.pointer !== event.pointerId) return;
    if (!(event.buttons & 2)) {
      cancel(event.pointerId);
      return;
    }
    const to = squareAt(event);
    if (to === drag.to) return;
    drag.preview?.remove();
    drag.preview = undefined;
    drag.to = to;
    if (to && to !== drag.from) {
      drag.preview = drawArrow(drag.from, to);
      drag.preview.classList.add('arrow-preview');
      overlay.append(drag.preview);
    }
  });
  board.addEventListener('pointerup', event => {
    if (drag?.pointer !== event.pointerId) return;
    const { from } = drag;
    const to = squareAt(event);
    cancel(event.pointerId);
    if (event.button !== 2 || !to || to === from) return;
    const key = from + to;
    const previous = arrows.get(key);
    if (previous) {
      previous.remove();
      arrows.delete(key);
      return;
    }
    const arrow = drawArrow(from, to);
    arrows.set(key, arrow);
    overlay.append(arrow);
  });
  board.addEventListener('pointercancel', event => cancel(event.pointerId));
  board.addEventListener('lostpointercapture', event => cancel(event.pointerId));

  return {
    clear() {
      if (drag) cancel(drag.pointer);
      arrows.clear();
      overlay.replaceChildren();
    },
  };
}
