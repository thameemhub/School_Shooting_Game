import { io, type Socket } from "socket.io-client";
import type { Reply } from "../shared/types";
let socket: Socket | null = null;
export function getSocket() {
  return (socket ||= io(import.meta.env?.VITE_SERVER_URL || undefined, {
    autoConnect: false,
  }));
}
export function command(data: object): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    if (!s.connected) {
      reject(
        new Error(
          "Cannot reach the game server. Check your connection and try again.",
        ),
      );
      return;
    }
    s.timeout(8000).emit(
      "command",
      data,
      (err: Error | null, result: Reply) => {
        if (err)
          reject(
            new Error(
              "The server did not reply. Reconnect before trying again.",
            ),
          );
        else if (result.error) reject(new Error(result.error));
        else resolve(result);
      },
    );
  });
}
