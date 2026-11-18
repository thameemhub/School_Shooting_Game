import { alive, canDevelop, canShoot, completed, developmentTarget } from "./character";
import { LUCKY_NUMBERS, PARTS, type Action, type Game, type Part, type Soldier } from "./types";
const choose = <T,>(values: readonly T[], random: () => number): T => values[Math.floor(random() * values.length)];
/**
 * Bots follow exactly the human rules: pick a soldier and a lucky number, then the engine runs the
 * same assisted draw (50%, guaranteed after a miss). Bots get no extra luck. Difficulty only
 * changes priorities (which soldier, whether to attack, what to hit).
 */
export function botAction(g: Game, random = Math.random): Action {
  const p = g.players[g.active], difficulty = g.settings.difficulty;
  const develop = (): Action => {
    const growing = p.soldiers.filter(canDevelop);
    const options = growing.length ? growing : p.soldiers.filter(alive);
    // Medium/hard reload an empty gun first, otherwise follow the same SOLDIER 1 → 4 order as humans.
    const empty = p.soldiers.find((s) => canDevelop(s) && s.parts.bullets === "completed" && s.ammo === 0);
    const s = difficulty === "easy" ? choose(options, random) : empty || developmentTarget(p)!;
    return { type: "notebook", soldierId: s.id, guess: choose(LUCKY_NUMBERS, random) };
  };
  const loaded = p.soldiers.filter(canShoot);
  const canBuild = p.soldiers.some(canDevelop);
  if (!loaded.length || (canBuild && random() < (difficulty === "easy" ? 0.45 : 0.12))) return develop();
  const shooter = difficulty === "easy" ? choose(loaded, random) : loaded.sort((a, b) => b.ammo - a.ammo)[0];
  const targets = g.players.filter((t) => t.id !== p.id && alive(t)).flatMap((t) => t.soldiers.filter(alive).map((s) => ({ player: t, soldier: s })));
  const remaining = (s: Soldier) => PARTS.filter((n) => s.parts[n] !== "eliminated").length;
  const threat = (s: Soldier) => (canShoot(s) ? 30 : 0) + completed(s) * 3 + (difficulty === "hard" && remaining(s) === 1 ? 100 : 0);
  const target = difficulty === "easy" ? choose(targets, random) : targets.sort((a, b) => threat(b.soldier) - threat(a.soldier))[0];
  const open = PARTS.filter((n) => target.soldier.parts[n] !== "eliminated");
  const part = difficulty === "easy" ? choose(open, random) : (["gun", "bullets", "head", "body", "face"] as Part[]).find((n) => open.includes(n))!;
  return { type: "attack", soldierId: shooter.id, target: target.player.id, targetSoldierId: target.soldier.id, part };
}
