import { createSoldier } from "../shared/character";
import { PARTS, ROLES, type GameEvent } from "../shared/types";
export const INTRO_SECONDS = 37;
export const INTRO_STARTS = [0, 4, 8, 12, 16, 26, 31] as const;
export const INTRO_TITLES = [
  "1 · Choose your soldier",
  "2 · Choose your lucky number",
  "3 · Open the notebook",
  "4 · Match the last digit",
  "5 · Build your soldier",
  "6 · Next soldier",
  "7 · Attack!",
] as const;
/** Seconds into the build scene at which each part appears (one part every two seconds). */
export const BUILD_STEP = 2;
// These deterministic samples belong only to the introduction, never to the game engine.
export function introFrame(seconds: number) {
  const time = Math.max(0, Math.min(INTRO_SECONDS, seconds));
  const scene = INTRO_STARTS.findLastIndex((start) => time >= start);
  const elapsed = time - INTRO_STARTS[scene];
  const built = scene === 4 ? Math.min(5, Math.floor(elapsed / BUILD_STEP) + 1) : scene < 4 ? 0 : 5;
  const soldier = createSoldier("intro-main", "Assault");
  PARTS.slice(0, built).forEach((part) => (soldier.parts[part] = "completed"));
  soldier.ammo = built === 5 ? 3 : 0;
  // The player's squad: soldier 1 is the one being built; soldier 2 starts in the "next soldier" scene.
  const squad = ROLES.map((role, i) => (i === 0 ? soldier : createSoldier(`intro-squad:${i}`, role)));
  if (scene === 5 && elapsed >= 2) squad[1].parts.head = "completed";
  const target = createSoldier("intro-enemy", "Scout");
  PARTS.forEach((p) => (target.parts[p] = "completed"));
  target.ammo = 3;
  if (scene === 6 && elapsed >= 2.4) {
    target.parts.gun = "eliminated";
    soldier.ammo = 2;
  }
  const match: GameEvent = {
    id: 283,
    turn: 0,
    time: 0,
    kind: "notebook",
    actor: "tutorial",
    soldierId: soldier.id,
    page: 283,
    guess: 3,
    digit: 3,
    match: true,
    part: "head",
    text: "Tutorial sample: 3 matches 3.",
  };
  const miss: GameEvent = {
    id: 247,
    turn: 0,
    time: 0,
    kind: "notebook",
    actor: "tutorial",
    soldierId: soldier.id,
    page: 247,
    guess: 5,
    digit: 7,
    match: false,
    text: "Tutorial sample: 5 does not match 7.",
  };
  return { time, scene, elapsed, built, soldier, squad, target, match, miss };
}
