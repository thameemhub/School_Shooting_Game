import { PARTS, ROLES, type Part, type Player, type Soldier } from "./types";
export function createSoldier(id: string, role: Soldier["role"]): Soldier {
  return { id, role, parts: { head: "available", body: "available", face: "available", gun: "available", bullets: "available" }, ammo: 0 };
}
export function createPlayer(id: string, name: string, bot = false, avatar?: string): Player {
  return {
    id,
    name: name.trim().slice(0, 20) || "Commander",
    bot,
    connected: true,
    ready: bot,
    soldiers: ROLES.map((role, i) => createSoldier(`${id}:${i}`, role)),
    avatar,
    score: 0,
    shots: 0,
    developments: 0,
  };
}
export const alive = (p: Player | Soldier): boolean =>
  "soldiers" in p ? p.soldiers.some(alive) : PARTS.some((n) => p.parts[n] !== "eliminated");
/** The part a successful match would unlock: the first one in order that is neither built nor destroyed. */
export const nextPart = (s: Soldier): Part | undefined => PARTS.find((n) => s.parts[n] === "available");
export const completed = (p: Player | Soldier): number =>
  "soldiers" in p ? p.soldiers.reduce((sum, s) => sum + completed(s), 0) : PARTS.filter((n) => p.parts[n] === "completed").length;
export const ammunition = (p: Player) => p.soldiers.reduce((sum, s) => sum + s.ammo, 0);
export const survivors = (p: Player) => p.soldiers.filter(alive).length;
/** A soldier with intact, unlocked bullets and nothing left to build can use a match to reload to 3. */
export const canReload = (s: Soldier) => alive(s) && !nextPart(s) && s.parts.bullets === "completed" && s.ammo < 3;
/** Whether opening the notebook for this soldier could achieve anything. */
export const canDevelop = (s: Soldier) => alive(s) && (!!nextPart(s) || canReload(s));
export const canShoot = (p: Player | Soldier): boolean =>
  "soldiers" in p ? p.soldiers.some(canShoot) : alive(p) && p.parts.gun === "completed" && p.parts.bullets === "completed" && p.ammo > 0;
// Destroyed stages are skipped, so any soldier whose gun and bullets survive can eventually fire.
export function canEverShoot(p: Player | Soldier): boolean {
  if ("soldiers" in p) return p.soldiers.some(canEverShoot);
  return alive(p) && p.parts.gun !== "eliminated" && p.parts.bullets !== "eliminated";
}
/**
 * The soldier a squad develops next: SOLDIER 1 → 2 → 3 → 4. A soldier the player picked by hand
 * (`preferred`) stays selected while it still has parts to build. Otherwise the first soldier in
 * order with a part left; then one that can reload; then any survivor (a squad never gets stuck).
 */
export function developmentTarget(p: Player, preferred?: string): Soldier | undefined {
  const chosen = p.soldiers.find((s) => s.id === preferred);
  if (chosen && alive(chosen) && nextPart(chosen)) return chosen;
  return p.soldiers.find((s) => alive(s) && !!nextPart(s)) || p.soldiers.find(canReload) || p.soldiers.find(alive);
}
