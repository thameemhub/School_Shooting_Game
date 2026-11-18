import type { Room } from "../shared/types";
export function findPublicRoom(rooms: Iterable<Room>) {
  return [...rooms].find((r) => r.public && !r.game && r.players.length < 6);
}
