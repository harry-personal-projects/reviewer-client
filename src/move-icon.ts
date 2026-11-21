const marks = {
  Brilliant: ['!!', 'brilliant'],
  Great: ['!', 'great'],
  Best: ['★', 'best'],
  Excellent: ['👍︎', 'excellent'],
  Good: ['✓', 'good'],
  Book: ['◫', 'book'],
  Inaccuracy: ['?!', 'inaccuracy'],
  Mistake: ['?', 'mistake'],
  Miss: ['✕', 'miss'],
  Blunder: ['??', 'blunder'],
} as const;

export type MoveClassification = keyof typeof marks;

export function isMoveClassification(value: unknown): value is MoveClassification {
  return typeof value === 'string' && Object.hasOwn(marks, value);
}

export function moveClassificationIcon(classification: MoveClassification): HTMLElement {
  const mark = marks[classification];
  const icon = document.createElement('span');
  icon.className = 'move-icon';
  icon.dataset.mark = mark[1];
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = mark[0];
  return icon;
}
