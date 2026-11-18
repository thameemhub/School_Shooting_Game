import { alive, createPlayer } from "./character";
import { openNotebook } from "./development";
import { newId } from "./id";
import {
  DEFAULT_SETTINGS,
  type Action,
  type Game,
  type Player,
  type Settings,
} from "./types";
import { nextTurn } from "./turns";
import { shoot } from "./guns";
export { record } from "./history";
export { nextTurn, timeout } from "./turns";
export { ranking, checkEnd } from "./win";

export function normalizeSettings(input: Partial<Settings> = {}): Settings {
  const number = (key: keyof Settings, min: number, max: number) => {
    const v = input[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.floor(v)))
      : (DEFAULT_SETTINGS[key] as number);
  };
  return {
    pageMax: number("pageMax", 10, 100000),
    turnSeconds: number("turnSeconds", 5, 180),
    maxRounds: number("maxRounds", 10, 500),
    botDelay: number("botDelay", 200, 3000),
    disconnectSeconds: number("disconnectSeconds", 5, 120),
    matchmakingSeconds: number("matchmakingSeconds", 5, 120),
    difficulty: ["easy", "medium", "hard"].includes(input.difficulty || "")
      ? input.difficulty!
      : "medium",
  };
}
export function startGame(
  players: Player[],
  settings: Settings,
  id = newId(),
  now = Date.now(),
): Game {
  if (players.length < 2 || players.length > 6)
    throw new Error("A match needs 2–6 players.");
  const config = normalizeSettings(settings);
  return {
    schema: 3,
    id,
    players: players.map((p) => ({
      ...createPlayer(p.id, p.name, p.bot, p.avatar),
      connected: p.connected,
      ready: p.ready,
      disconnectedAt: p.disconnectedAt,
    })),
    settings: config,
    active: 0,
    turn: 1,
    round: 1,
    revision: 0,
    deadline: now + config.turnSeconds * 1000,
    status: "playing",
    history: [],
    eventCount: 0,
    winnerIds: [],
  };
}
// Pure transition: callers keep the original state when validation fails.
export function act(
  game: Game,
  actorId: string,
  action: Action,
  expectedRevision = game.revision,
  random = Math.random,
  now = Date.now(),
): Game {
  if (game.status !== "playing") throw new Error("The match has ended.");
  if (expectedRevision !== game.revision)
    throw new Error("That turn changed. Try again.");
  if (
    game.players[game.active].id !== actorId ||
    !alive(game.players[game.active])
  )
    throw new Error("Wait for your turn.");
  const g = structuredClone(game);
  const p = g.players[g.active];
  if (!action || typeof action !== "object") throw new Error("Unknown action.");
  if (action.type === "notebook") openNotebook(g, p, action.soldierId, action.guess, random, now);
  else if (action.type === "attack") {
    shoot(g, p, action.soldierId, action.target, action.targetSoldierId, action.part, now);
    nextTurn(g,now);
  } else throw new Error("Unknown action.");
  g.revision++;
  return g;
}
