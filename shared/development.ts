import { alive, canDevelop, canReload, nextPart } from "./character";
import { record } from "./history";
import { assistedPage, lastDigit } from "./numbers";
import { nextTurn } from "./turns";
import { LUCKY_NUMBERS, PART_LABELS, type Game, type LuckyNumber, type Player } from "./types";

/**
 * One notebook opening per turn. The player has already chosen a soldier and a lucky number;
 * the page is generated here (on the server for online games — clients never send results).
 * Assisted matching: 50% chance, guaranteed after a miss on the same soldier (see assistedPage).
 * Only an exact match between the lucky number and the page's last digit advances that soldier.
 * Every outcome ends the turn.
 */
export function openNotebook(g: Game, p: Player, soldierId: unknown, guess: unknown, random: () => number, now: number) {
  if (!LUCKY_NUMBERS.includes(guess as LuckyNumber)) throw new Error("Choose a lucky number: 1, 3, 5, 7 or 9.");
  const s = p.soldiers.find((s) => s.id === soldierId);
  if (!s) throw new Error("Choose one of your own soldiers.");
  if (!alive(s)) throw new Error("That soldier has been defeated. Choose a surviving soldier.");
  // Normally only a soldier with something left to gain may be chosen. If none can, the player may
  // still open the notebook (a wasted turn) so a squad is never left without a legal action.
  if (!canDevelop(s) && p.soldiers.some(canDevelop)) throw new Error("That soldier cannot develop any further. Choose another soldier.");
  const lucky = guess as LuckyNumber;
  const assisted = !!s.assist;
  const { page, match } = assistedPage(g.settings, lucky, assisted, random);
  const digit = lastDigit(page);
  // Invariant: the displayed page always agrees with the verdict, and assisted soldiers always match.
  if (match !== (digit === lucky) || page < 1 || page > g.settings.pageMax || (assisted && !match)) throw new Error("Notebook draw failed validation.");
  s.assist = !match;
  const base = { kind: "notebook" as const, actor: p.id, soldierId: s.id, page, guess: lucky, digit, match, ...(assisted ? { assisted: true } : {}) };
  if (!match) {
    record(g, { ...base, text: `${p.name} picked ${lucky} for their ${s.role} and opened page ${page}. Last digit ${digit}. No match — next opening for this soldier is a guaranteed match.` }, now);
  } else if (!canDevelop(s)) {
    record(g, { ...base, text: `${p.name} picked ${lucky} and opened page ${page}: match, but their ${s.role} has nothing left to unlock.` }, now);
  } else if (canReload(s)) {
    s.ammo = 3;
    record(g, { ...base, reload: true, text: `${p.name} picked ${lucky}, opened page ${page}: match! ${s.role} reloaded to 3 bullets.` }, now);
  } else {
    const part = nextPart(s)!;
    s.parts[part] = "completed";
    if (part === "bullets") s.ammo = 3;
    p.score += 10;
    p.developments++;
    record(g, { ...base, part, text: `${p.name} picked ${lucky}, opened page ${page}: match! ${s.role} unlocked ${PART_LABELS[part]}. +10 points.` }, now);
  }
  nextTurn(g, now);
}
