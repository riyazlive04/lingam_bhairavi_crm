/**
 * Query-string helpers for GET filter links (pure, no Next.js imports, safe on server and client).
 * Empty values are dropped: undefined, null, "" and false. `true` becomes "1" (checkbox filters).
 * Keys keep their insertion order, with overrides applied in place.
 * Maintainer: Sirah Digital.
 */

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

/** "a=1&b=2" (no leading "?"). `overrides` replace or, when empty, remove keys from `params`. */
export function searchString(params: QueryParams, overrides?: QueryParams): string {
  const merged: QueryParams = overrides ? { ...params, ...overrides } : params;
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    u.set(k, v === true ? "1" : String(v));
  }
  return u.toString();
}

/**
 * "?a=1&b=2", or "" when nothing is set.
 * @example qs({ q: "pipe", page: 2 })            // "?q=pipe&page=2"
 * @example qs(base, { page: undefined })          // base without page
 */
export function qs(params: QueryParams, overrides?: QueryParams): string {
  const s = searchString(params, overrides);
  return s ? `?${s}` : "";
}

/**
 * `base` plus the query string, e.g. withParams("/stock", { low: 1 }) is "/stock?low=1",
 * and withParams("/stock", {}) is "/stock".
 */
export function withParams(base: string, params: QueryParams, overrides?: QueryParams): string {
  return base + qs(params, overrides);
}
