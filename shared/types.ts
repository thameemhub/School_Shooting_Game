/** Development order. Every successful notebook match unlocks the next available part. */
export const PARTS = ["head", "body", "face", "gun", "bullets"] as const;
export type Part = (typeof PARTS)[number];
export const PART_LABELS: Record<Part, string> = { head: "Head", body: "Body", face: "Face", gun: "Gun", bullets: "Bullets" };
/** The only numbers a player may predict before opening the notebook. */
export const LUCKY_NUMBERS = [1, 3, 5, 7, 9] as const;
export type LuckyNumber = (typeof LUCKY_NUMBERS)[number];
/**
 * Assisted matching: a soldier's notebook opening matches with this probability, and a soldier
 * that missed its previous opening is guaranteed to match on its next one. Pages are then chosen
 * so their last digit agrees with the outcome (see assistedPage). Average: 1.5 turns per part.
 */
export const MATCH_CHANCE = 0.5;
export type PartState = "available" | "completed" | "eliminated";
export type Difficulty = "easy" | "medium" | "hard";
export type Settings = {
  pageMax: number;
  turnSeconds: number;
  maxRounds: number;
  botDelay: number;
  difficulty: Difficulty;
  disconnectSeconds: number;
  matchmakingSeconds: number;
};
export const DEFAULT_SETTINGS: Settings = {
  pageMax: 500,
  turnSeconds: 30,
  maxRounds: 150,
  botDelay: 1000,
  difficulty: "medium",
  disconnectSeconds: 15,
  matchmakingSeconds: 20,
};
/** Notebook animation (~1.9 s) plus reading time; automated turns wait this long after an opening. */
export const NOTEBOOK_ANIMATION_MS = 3000;
export const ROLES = ['Assault', 'Scout', 'Defense', 'Support'] as const;
export type Soldier = {
  id: string;
  role: typeof ROLES[number];
  parts: Record<Part, PartState>;
  ammo: number;
  /** Set after a missed notebook opening: this soldier's next opening is a guaranteed match. */
  assist?: boolean;
  eliminatedAt?: number;
};
export type Player = {
  id: string;
  name: string;
  bot: boolean;
  connected: boolean;
  ready: boolean;
  disconnectedAt?: number;
  soldiers: Soldier[];
  avatar?: string;
  score: number;
  shots: number;
  developments: number;
  eliminatedAt?: number;
};
export type GameEvent = {
  id: number;
  turn: number;
  time: number;
  text: string;
  kind: "notebook" | "shot" | "defeat" | "turn" | "end";
  actor?: string;
  target?: string;
  soldierId?: string;
  targetSoldierId?: string;
  part?: Part;
  page?: number;
  /** Notebook openings: the predicted number, the page's last digit, and the outcome. */
  guess?: LuckyNumber;
  digit?: number;
  match?: boolean;
  reload?: boolean;
  /** This match was guaranteed because the soldier missed its previous opening. */
  assisted?: boolean;
};
export type Game = {
  schema: 3;
  id: string;
  players: Player[];
  settings: Settings;
  active: number;
  turn: number;
  round: number;
  revision: number;
  deadline: number;
  status: "playing" | "finished";
  history: GameEvent[];
  eventCount: number;
  winnerIds: string[];
  endReason?: string;
};
export type Action =
  | { type: "notebook"; soldierId: string; guess: LuckyNumber }
  | { type: "attack"; soldierId: string; target: string; targetSoldierId: string; part: Part };
export type Room = {
  code: string;
  public: boolean;
  hostId: string;
  players: Player[];
  settings: Settings;
  game: Game | null;
  createdAt: number;
  botOfferAt: number;
};
export type Reply = {
  error?: string;
  room?: Room;
  playerId?: string;
  token?: string;
};
