import { MATCH_CHANCE, type LuckyNumber, type Settings } from "./types";
export const randomPage = (settings: Settings, random = Math.random) =>
  1 + Math.floor(random() * settings.pageMax);
export const lastDigit = (page: number) => page % 10;
export const isOdd = (digit: number) => digit % 2 === 1;
/** How many pages in 1..max end in `digit`. */
export const pagesEndingIn = (digit: number, max: number) => (digit === 0 ? Math.floor(max / 10) : max < digit ? 0 : Math.floor((max - digit) / 10) + 1);
/** The `index`-th page (0-based) in 1..max whose last digit is `digit`. */
const nthPage = (digit: number, index: number) => (digit === 0 ? 10 : digit) + 10 * index;
const pick = (digit: number, max: number, u: number) => nthPage(digit, Math.min(pagesEndingIn(digit, max) - 1, Math.floor(u * pagesEndingIn(digit, max))));

/**
 * ASSISTED notebook draw — deliberately NOT a uniform random page.
 * The outcome is decided first: a guaranteed match (the soldier missed last time) or a coin flip
 * with MATCH_CHANCE. Then a page is drawn whose last digit agrees with that outcome: a page ending
 * in the lucky number for a match, otherwise a page ending in one of the nine other digits.
 * One random draw decides everything, so the server's random source fully controls the result.
 */
export function assistedPage(settings: Settings, lucky: LuckyNumber, guaranteed: boolean, random = Math.random) {
  const r = Math.min(Math.max(random(), 0), 1 - Number.EPSILON);
  const match = guaranteed || r < MATCH_CHANCE;
  if (match) return { page: pick(lucky, settings.pageMax, guaranteed ? r : r / MATCH_CHANCE), match };
  const u = (r - MATCH_CHANCE) / (1 - MATCH_CHANCE);
  const others = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => d !== lucky && pagesEndingIn(d, settings.pageMax) > 0);
  const slot = Math.min(others.length - 1, Math.floor(u * others.length));
  return { page: pick(others[slot], settings.pageMax, u * others.length - slot), match };
}
