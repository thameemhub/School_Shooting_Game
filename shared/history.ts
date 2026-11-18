import type { Game, GameEvent } from "./types";
export function record(
  g: Game,
  event: Omit<GameEvent, "id" | "time" | "turn">,
  now: number,
) {
  g.history.push({ ...event, id: ++g.eventCount, time: now, turn: g.turn });
}
