import { randomInt, randomUUID } from "node:crypto";
import { createPlayer } from "../shared/character";
import { normalizeSettings, startGame } from "../shared/engine";
import type { Room, Settings } from "../shared/types";
export class RoomManager {
  rooms = new Map<string, Room>();
  create(name: string, isPublic: boolean, settings: Partial<Settings>) {
    if (this.rooms.size >= 1000)
      throw new Error("The server is busy. Please try again later.");
    let code: string;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    do {
      code = Array.from(
        { length: 6 },
        () => alphabet[randomInt(alphabet.length)],
      ).join("");
    } while (this.rooms.has(code));
    const player = createPlayer(randomUUID(), name);
    const config = normalizeSettings(settings);
    const room: Room = {
      code,
      public: isPublic,
      hostId: player.id,
      players: [player],
      settings: config,
      game: null,
      createdAt: Date.now(),
      botOfferAt: Date.now() + config.matchmakingSeconds * 1000,
    };
    this.rooms.set(code, room);
    return { room, player };
  }
  join(code: string, name: string) {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error("Room not found. Check the six-character code.");
    if (room.game) throw new Error("This match has already started.");
    if (room.players.length >= 6) throw new Error("This room is full.");
    const player = createPlayer(randomUUID(), name);
    room.players.push(player);
    return { room, player };
  }
  start(room: Room) {
    if (room.game) throw new Error("The match has already started.");
    if (room.players.length < 2)
      throw new Error("Add a friend or a bot to start.");
    if (
      room.players.some(
        (p) => !p.bot && p.id !== room.hostId && (!p.ready || !p.connected),
      )
    )
      throw new Error("Wait for everyone to be connected and ready.");
    room.game = startGame(room.players, room.settings);
  }
}
