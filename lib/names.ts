// Stable keys for the people in a crew field, so the same sailor matches across
// regattas regardless of case, accents, extra spaces or "Surname Name" vs
// "Name Surname" order. A pair like "A & B" yields one key per person.

const SPLIT = /\s*(?:&|\/|\+|,|;|\s+y\s+|\s+e\s+|\s+and\s+)\s*/i;

export function personKey(name: string): string | null {
  const tokens = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  // A lone initial or single word is too ambiguous to identify a person.
  if (tokens.length < 2 || tokens.join('').length < 5) return null;
  return tokens.sort().join('-');
}

export function crewKeys(crew: string | null | undefined): string[] {
  if (!crew) return [];
  const keys = crew
    .split(SPLIT)
    .map((p) => personKey(p))
    .filter((k): k is string => k !== null);
  return [...new Set(keys)];
}

/** The part of a crew string (e.g. "A & B") that corresponds to the given person key. */
export function displayNameFor(crew: string | null | undefined, key: string): string | null {
  if (!crew) return null;
  const part = crew.split(SPLIT).find((p) => personKey(p) === key);
  return part ? part.trim() : null;
}

/** Normalized search tokens (no accents, lower case) for matching a typed query against keys. */
export function queryTokens(q: string): string[] {
  return q
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
