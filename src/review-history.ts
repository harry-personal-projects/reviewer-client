import { apiOrigin, parseHistoryEntry, type ReviewHistoryEntry } from './review-api';

const maxEntries = 100;

function keyPrefix(): string {
  return `chess-reviewer:history:v1:${apiOrigin()}/`;
}

export function loadReviewHistory(now = Date.now()): ReviewHistoryEntry[] {
  const entries: ReviewHistoryEntry[] = [];
  try {
    const prefix = keyPrefix();
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      let entry: ReviewHistoryEntry | undefined;
      try {
        entry = parseHistoryEntry(JSON.parse(raw));
      } catch {
        continue;
      }
      if (!entry || key !== `${prefix}${entry.id.toLowerCase()}`) continue;
      if (Date.parse(entry.expiresAt) <= now) storage.removeItem(key);
      else entries.push(entry);
    }
    entries.sort((a, b) => {
      const millis = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (millis) return millis;
      const aSubMillis = a.createdAt.match(/\.\d{3}(\d+)/)?.[1] ?? '';
      const bSubMillis = b.createdAt.match(/\.\d{3}(\d+)/)?.[1] ?? '';
      return bSubMillis.localeCompare(aSubMillis) || a.id.localeCompare(b.id);
    });
    for (const entry of entries.splice(maxEntries)) storage.removeItem(`${prefix}${entry.id.toLowerCase()}`);
  } catch {
    // History is optional when the origin is not configured or browser storage is blocked.
  }
  return entries;
}

export function rememberReview(entry: ReviewHistoryEntry): void {
  try {
    window.localStorage.setItem(`${keyPrefix()}${entry.id.toLowerCase()}`, JSON.stringify(entry));
  } catch {
    // The accepted review can still be opened without browser storage.
  }
}

export function forgetReview(id: string): void {
  try {
    window.localStorage.removeItem(`${keyPrefix()}${id.toLowerCase()}`);
  } catch {
    // Browser storage may be blocked.
  }
}

export function reviewHistoryChanged(event: StorageEvent): boolean {
  try {
    return event.storageArea === window.localStorage && (event.key === null || event.key.startsWith(keyPrefix()));
  } catch {
    return false;
  }
}
