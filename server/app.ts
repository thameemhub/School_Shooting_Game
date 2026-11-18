import express from "express";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Server, type Socket } from "socket.io";
import { RoomManager } from "./rooms";
import { PlayerManager, type Session } from "./players";
import { findPublicRoom } from "./matchmaking";
import { act, normalizeSettings, timeout } from "../shared/engine";
import { createPlayer } from "../shared/character";
import { botAction } from "../shared/bots";
import { DEFAULT_SETTINGS, NOTEBOOK_ANIMATION_MS, type Reply, type Room } from "../shared/types";
import { validateAvatar } from './avatars';

export function createGameServer() {
  const app = express();
  const http = createServer(app);
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const io = new Server(http, {
    maxHttpBufferSize: 65536,
    cors: allowedOrigin ? { origin: allowedOrigin.split(",") } : undefined,
  });
  const manager = new RoomManager();
  const players = new PlayerManager();
  const botDue = new Map<string, { revision: number; at: number }>();
  app.get("/health", (_req, res) =>
    res.json({ ok: true, rooms: manager.rooms.size }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("*", (_req, res) => res.sendFile(path.resolve("dist/index.html")));
  const broadcast = (r: Room) => io.to(r.code).emit("state", r);
  const requireRoom = (socket: Socket): { session: Session; room: Room } => {
    const session = players.sessions.get(socket.data.token);
    const room = session && manager.rooms.get(session.roomCode);
    if (!session || session.socketId !== socket.id || !room)
      throw new Error("Your session expired. Join a room again.");
    return { session, room };
  };
  const syncPresence = (r: Room, id: string, connected: boolean) => {
    for (const list of [r.players, r.game?.players || []]) {
      const p = list.find((p) => p.id === id);
      if (p) {
        p.connected = connected;
        p.disconnectedAt = connected ? undefined : Date.now();
      }
    }
  };
  const leave = (socket: Socket) => {
    const s = players.sessions.get(socket.data.token);
    if (!s || s.socketId !== socket.id) return;
    const r = manager.rooms.get(s.roomCode);
    socket.leave(s.roomCode);
    players.sessions.delete(s.token);
    socket.data.token = undefined;
    if (!r) return;
    if (r.game) {
      syncPresence(r, s.playerId, false);
      for (const list of [r.players, r.game.players]) {
        const p = list.find((p) => p.id === s.playerId);
        if (p) {
          p.bot = true;
          p.connected = false;
        }
      }
    } else r.players = r.players.filter((p) => p.id !== s.playerId);
    if (r.hostId === s.playerId)
      r.hostId =
        r.players.find((p) => !p.bot && p.connected)?.id ||
        r.players.find((p) => !p.bot)?.id ||
        "";
    if (!r.players.some((p) => !p.bot)) {
      manager.rooms.delete(r.code);
      players.removeRoom(r.code);
      botDue.delete(r.code);
    } else broadcast(r);
  };
  io.on("connection", (socket) => {
    let windowAt = Date.now();
    let requests = 0;
    socket.on("command", async (data: any, ack: (r: Reply) => void) => {
      if (typeof ack !== "function") return;
      try {
        if (Date.now() - windowAt > 10000) {
          windowAt = Date.now();
          requests = 0;
        }
        if (++requests > 50)
          throw new Error("Too many requests. Wait a moment.");
        if (!data || typeof data !== "object" || typeof data.type !== "string")
          throw new Error("Invalid request.");
        if (["create", "join", "quick"].includes(data.type)) {
          if (socket.data.token)
            throw new Error("Leave your current room first.");
          const name =
            typeof data.name === "string" ? data.name.trim().slice(0, 20) : "";
          if (!name) throw new Error("Enter a nickname.");
          // Reserve this socket across asynchronous image validation.
          if (socket.data.joining) throw new Error('A room request is already pending.');
          socket.data.joining=true;
          let avatar:string|undefined;
          try { avatar=await validateAvatar(data.avatar); } finally {socket.data.joining=false;}
          if (!socket.connected) return;
          const available =
            data.type === "quick"
              ? findPublicRoom(manager.rooms.values())
              : undefined;
          const result =
            data.type === "join"
              ? manager.join(String(data.code || ""), name)
              : available
                ? manager.join(available.code, name)
                : manager.create(
                    name,
                    data.type === "quick",
                    data.type === "quick"
                      ? DEFAULT_SETTINGS
                      : data.settings || {},
                  );
          result.player.avatar=avatar;
          const session = players.create(
            result.player.id,
            result.room.code,
            socket.id,
          );
          socket.data.token = session.token;
          await socket.join(result.room.code);
          ack({
            room: result.room,
            playerId: session.playerId,
            token: session.token,
          });
          broadcast(result.room);
          return;
        }
        if (data.type === "resume") {
          const s = players.sessions.get(String(data.token));
          const r = s && manager.rooms.get(s.roomCode);
          if (!s || !r)
            throw new Error("That room has expired. Start a new match.");
          if (s.socketId && s.socketId !== socket.id) {
            const old = io.sockets.sockets.get(s.socketId);
            old?.emit("replaced");
            old?.disconnect(true);
          }
          s.socketId = socket.id;
          socket.data.token = s.token;
          syncPresence(r, s.playerId, true);
          await socket.join(r.code);
          ack({ room: r, playerId: s.playerId, token: s.token });
          broadcast(r);
          return;
        }
        if (data.type === "leave") {
          leave(socket);
          ack({});
          return;
        }
        const { session: s, room: r } = requireRoom(socket);
        const host = () => {
          if (r.hostId !== s.playerId)
            throw new Error("Only the host can do that.");
        };
        if (data.type === 'profile') {
          const avatar=await validateAvatar(data.avatar);
          // The session may have left while decoding. Do not resurrect that seat.
          requireRoom(socket);
          for (const list of [r.players,r.game?.players||[]]) {
            const owner=list.find(p=>p.id===s.playerId);if(owner)owner.avatar=avatar;
          }
        } else if (data.type === "ready") {
          if (r.game) throw new Error("Match already started.");
          const p = r.players.find((p) => p.id === s.playerId)!;
          p.ready = !p.ready;
        } else if (data.type === "addBot" || data.type === "fillBots") {
          host();
          if (r.game || r.players.length >= 6)
            throw new Error("No open lobby seat.");
          if (data.type === "fillBots" && r.public && Date.now() < r.botOfferAt)
            throw new Error("Give matchmaking a little more time.");
          const count = data.type === "fillBots" ? 6 - r.players.length : 1;
          for (let i = 0; i < count; i++)
            r.players.push(
              createPlayer(
                randomUUID(),
                `Bot ${r.players.filter((p) => p.bot).length + 1}`,
                true,
              ),
            );
        } else if (data.type === "removeBot") {
          host();
          if (r.game) throw new Error("Match already started.");
          r.players = r.players.filter((p) => !(p.bot && p.id === data.id));
        } else if (data.type === "settings") {
          host();
          if (r.game) throw new Error("Settings are locked during a match.");
          r.settings = normalizeSettings(data.settings || {});
          r.botOfferAt = r.createdAt + r.settings.matchmakingSeconds * 1000;
        } else if (data.type === "start") {
          host();
          manager.start(r);
        } else if (data.type === "rematch") {
          host();
          if (r.game?.status !== "finished")
            throw new Error("Finish this match first.");
          r.game = null;
          for (const p of r.players) p.ready = p.bot;
        } else if (data.type === "action") {
          if (!r.game) throw new Error("Start the match first.");
          if (Date.now() >= r.game.deadline) {
            r.game = timeout(r.game);
            broadcast(r);
            throw new Error("Your turn timed out.");
          }
          if (!data.action || typeof data.revision !== "number")
            throw new Error("Invalid move.");
          r.game = act(r.game, s.playerId, data.action, data.revision);
        } else throw new Error("Unknown command.");
        if (
          r.public &&
          !r.game &&
          r.players.length >= 2 &&
          r.players.every((p) => p.ready || p.bot)
        )
          manager.start(r);
        broadcast(r);
        ack({});
      } catch (e) {
        ack({
          error: e instanceof Error ? e.message : "Something went wrong.",
        });
      }
    });
    socket.on("disconnect", () => {
      const s = players.sessions.get(socket.data.token);
      if (!s || s.socketId !== socket.id) return;
      s.socketId = null;
      const r = manager.rooms.get(s.roomCode);
      if (r) {
        syncPresence(r, s.playerId, false);
        broadcast(r);
      }
    });
  });
  const interval = setInterval(() => {
    const now = Date.now();
    for (const r of manager.rooms.values()) {
      const humans = r.players.filter((p) => !p.bot);
      if (
        humans.every((p) => !p.connected) &&
        humans.every((p) => now - (p.disconnectedAt || r.createdAt) > 300000)
      ) {
        manager.rooms.delete(r.code);
        players.removeRoom(r.code);
        botDue.delete(r.code);
        continue;
      }
      const host = r.players.find((p) => p.id === r.hostId);
      if (
        !host?.connected &&
        now - (host?.disconnectedAt || r.createdAt) >
          r.settings.disconnectSeconds * 1000
      ) {
        const successor = r.players.find((p) => !p.bot && p.connected);
        if (successor && successor.id !== r.hostId) {
          r.hostId = successor.id;
          broadcast(r);
        }
      }
      if (!r.game || r.game.status !== "playing") continue;
      const g = r.game;
      const p = g.players[g.active];
      const automated =
        p.bot ||
        (!p.connected &&
          now - (p.disconnectedAt || now) >=
            r.settings.disconnectSeconds * 1000);
      if (automated) {
        let due = botDue.get(r.code);
        if (!due || due.revision !== g.revision) {
          // Let every device finish the notebook animation before a bot moves.
          const watching = g.history.at(-1)?.kind === "notebook" ? NOTEBOOK_ANIMATION_MS : 0;
          due = { revision: g.revision, at: now + Math.max(r.settings.botDelay, watching) };
          botDue.set(r.code, due);
        }
        if (now >= due.at) {
          r.game = act(g, p.id, botAction(g));
          botDue.delete(r.code);
          broadcast(r);
          continue;
        }
      }
      if (now >= g.deadline) {
        r.game = timeout(g, now);
        broadcast(r);
      }
    }
  }, 100);
  return {
    app,
    http,
    io,
    manager,
    players,
    close: async () => {
      clearInterval(interval);
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
