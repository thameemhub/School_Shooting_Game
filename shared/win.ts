import { alive, canEverShoot, completed, ammunition } from "./character";
import { record } from "./history";
import type { Game, Player } from "./types";
export function ranking(g: Game): Player[] {
  return [...g.players].sort(
    (a, b) =>
      Number(alive(b)) - Number(alive(a)) ||
      b.score - a.score ||
      completed(b) - completed(a) ||
      ammunition(b) - ammunition(a) ||
      (b.eliminatedAt || 0) - (a.eliminatedAt || 0),
  );
}
function finish(g: Game, reason: string, now: number) {
  g.status = "finished";
  g.endReason = reason;
  const survivors = g.players.filter(alive);
  const sorted = ranking(g).filter(alive);
  const first = sorted[0];
  g.winnerIds =
    survivors.length === 1
      ? [survivors[0].id]
      : first
        ? sorted
            .filter(
              (p) =>
                p.score === first.score &&
                completed(p) === completed(first) &&
                ammunition(p) === ammunition(first),
            )
            .map((p) => p.id)
        : [];
  record(
    g,
    {
      kind: "end",
      text: `${reason} ${g.winnerIds.length > 1 ? "Shared victory" : "Winner"}: ${g.players
        .filter((p) => g.winnerIds.includes(p.id))
        .map((p) => p.name)
        .join(", ")}.`,
    },
    now,
  );
}
export function checkEnd(g: Game, now: number): boolean {
  if (g.players.filter(alive).length <= 1)
    finish(g, "Last squad standing.", now);
  else if (!g.players.some(canEverShoot))
    finish(
      g,
      "Stalemate: nobody can ever fire again. Ranked by score, intact parts, then ammunition.",
      now,
    );
  else if (g.round > g.settings.maxRounds)
    finish(
      g,
      "Round limit reached. Ranked by score, intact parts, then ammunition.",
      now,
    );
  return g.status === "finished";
}
