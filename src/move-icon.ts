const marks: Record<string, readonly [string, string]> = {
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
};

export function moveClassificationIcon(classification: string): HTMLElement | undefined {
  if (!Object.hasOwn(marks, classification)) return;
  const mark = marks[classification];
  const icon = document.createElement('span');
  icon.className = 'move-icon';
  icon.dataset.mark = mark[1];
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = mark[0];
  return icon;
}
