import { alive, canShoot } from "./character";
import { record } from "./history";
import { PARTS, PART_LABELS, type Game, type Part, type Player } from "./types";
export function shoot(g: Game, p: Player, soldierId: string, targetId: string, targetSoldierId: string, part: Part, now: number) {
  const soldier = p.soldiers.find((s) => s.id === soldierId);
  if (!soldier || !canShoot(soldier)) throw new Error("You need an intact gun and loaded bullets.");
  const target = g.players.find((t) => t.id === targetId);
  if (!target || target.id === p.id || !alive(target)) throw new Error("Choose a surviving opponent.");
  const victim = target.soldiers.find((s) => s.id === targetSoldierId);
  if (!victim || !alive(victim)) throw new Error("Choose a surviving soldier on that opponent’s squad.");
  if (!PARTS.includes(part) || victim.parts[part] === "eliminated") throw new Error("That part cannot be targeted.");
  soldier.ammo--;
  p.score += 20;
  p.shots++;
  victim.parts[part] = "eliminated";
  if (part === "bullets") victim.ammo = 0;
  record(
    g,
    {
      kind: "shot",
      actor: p.id,
      target: target.id,
      soldierId: soldier.id,
      targetSoldierId: victim.id,
      part,
      text: `${p.name}'s ${soldier.role} hit ${target.name}'s ${victim.role}. ${PART_LABELS[part]} destroyed. +20 points.`,
    },
    now,
  );
  if (!alive(victim)) {
    victim.eliminatedAt = g.turn;
    p.score += 50;
    record(g, { kind: "defeat", actor: p.id, target: target.id, soldierId: soldier.id, targetSoldierId: victim.id, text: `${target.name}'s ${victim.role} is defeated. ${p.name} earns +50 points.` }, now);
  }
  if (!alive(target)) {
    target.eliminatedAt = g.turn;
    record(g, { kind: "turn", text: `${target.name}'s entire squad is eliminated.` }, now);
  }
}
