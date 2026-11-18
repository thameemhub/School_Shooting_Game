import { alive } from "./character";
import { record } from "./history";
import { checkEnd } from "./win";
import type { Game } from "./types";
export function nextTurn(g: Game, now: number) {
  if (checkEnd(g, now)) return;
  do {
    g.active = (g.active + 1) % g.players.length;
    if (g.active === 0) g.round++;
  } while (!alive(g.players[g.active]));
  g.turn++;
  g.deadline = now + g.settings.turnSeconds * 1000;
  checkEnd(g, now);
}
export function timeout(game: Game, now = Date.now()): Game {
  if (game.status !== "playing" || now < game.deadline) return game;
  const g = structuredClone(game);
  record(
    g,
    {
      kind: "turn",
      text: `${g.players[g.active].name} ran out of time. Turn skipped.`,
    },
    now,
  );
  nextTurn(g, now);
  g.revision++;
  return g;
}
