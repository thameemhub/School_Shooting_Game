import { randomBytes } from "node:crypto";
export type Session = {
  token: string;
  playerId: string;
  roomCode: string;
  socketId: string | null;
};
export class PlayerManager {
  sessions = new Map<string, Session>();
  create(playerId: string, roomCode: string, socketId: string) {
    const token = randomBytes(32).toString("hex");
    const session = { token, playerId, roomCode, socketId };
    this.sessions.set(token, session);
    return session;
  }
  removeRoom(code: string) {
    for (const [key, s] of this.sessions)
      if (s.roomCode === code) this.sessions.delete(key);
  }
}
