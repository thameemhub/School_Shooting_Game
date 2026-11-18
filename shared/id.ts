// IDs identify offline entities; they are never used as online authentication credentials.
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
