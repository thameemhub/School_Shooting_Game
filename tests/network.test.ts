import test from "node:test";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { createGameServer } from "../server/app";
import { PARTS, type Reply, type Room } from "../shared/types";
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Soldier from '../src/components/Soldier';
import { canShoot, developmentTarget, nextPart } from '../shared/character';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function fixture() {
  const server = createGameServer();
  await new Promise<void>((r) => server.http.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
  const sockets: Socket[] = [];
  async function connect() {
    const s = io(url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(s);
    await new Promise<void>((r, j) => {
      s.once("connect", r);
      s.once("connect_error", j);
    });
    return s;
  }
  return {
    server,
    connect,
    close: async () => {
      sockets.forEach((s) => s.disconnect());
      await server.close();
    },
  };
}
const send = (s: Socket, data: object) =>
  new Promise<Reply>((resolve, reject) =>
    s
      .timeout(2000)
      .emit("command", data, (error: Error | null, r: Reply) =>
        error ? reject(error) : resolve(r),
      ),
  );

test('five matches on the same online soldier synchronize all five visible layers and loaded gun',async()=>{
  const f=await fixture();const originalRandom=Math.random;
  try{
    const a=await f.connect(),b=await f.connect();
    const joined=await send(a,{type:'create',name:'Alpha'});await send(b,{type:'join',code:joined.room!.code,name:'Beta'});await send(b,{type:'ready'});await send(a,{type:'start'});
    const room=f.server.manager.rooms.get(joined.room!.code)!;let peer:Room|undefined;
    b.on('state',(r:Room)=>peer=r);
    for(const [i,guess] of ([3,7,1,9,5] as const).entries()){
      Math.random=()=>0.25; // assisted draw: match roll
      const result=await send(a,{type:'action',revision:room.game!.revision,action:{type:'notebook',soldierId:room.game!.players[0].soldiers[0].id,guess}});
      assert.equal(result.error,undefined);await wait(15);
      const s=peer!.game!.players[0].soldiers[0];
      assert.equal(s.parts[PARTS[i]],'completed');
      const svg=renderToStaticMarkup(createElement(Soldier,{soldier:s}));
      for(let j=0;j<=i;j++)assert.ok(svg.includes(`data-part="${PARTS[j]}" data-state="completed"`));
      Math.random=()=>0.75; // assisted draw: miss roll (alternates with guaranteed matches)
      await send(b,{type:'action',revision:room.game!.revision,action:{type:'notebook',soldierId:room.game!.players[1].soldiers[0].id,guess:1}});
    }
    assert.equal(canShoot(room.game!.players[0].soldiers[0]),true);
    assert.equal(room.game!.players[0].soldiers[0].ammo,3);
  }finally{Math.random=originalRandom;await f.close();}
});
test("six independent clients share state; authority, capacity, shots and reconnects", async () => {
  const f = await fixture();
  try {
    const clients = await Promise.all(
      Array.from({ length: 7 }, () => f.connect()),
    );
    const host = await send(clients[0], { type: "create", name: "Host" });
    assert.ok(host.room);
    const code = host.room.code;
    const ids = [host.playerId!];
    for (let i = 1; i < 6; i++) {
      const joined = await send(clients[i], {
        type: "join",
        code,
        name: `Guest ${i}`,
      });
      assert.equal(joined.error, undefined);
      ids.push(joined.playerId!);
    }
    assert.match(
      (await send(clients[6], { type: "join", code, name: "Extra" })).error!,
      /full/,
    );
    assert.match((await send(clients[1], { type: "start" })).error!, /host/);
    assert.match(
      (
        await send(clients[1], {
          type: "settings",
          settings: { turnSeconds: 5 },
        })
      ).error!,
      /host/,
    );
    assert.match(
      (await send(clients[6], { type: "join", code: "BADBAD", name: "Extra" }))
        .error!,
      /not found/,
    );
    for (let i = 1; i < 6; i++) await send(clients[i], { type: "ready" });
    const snapshots: Room[] = [];
    clients
      .slice(0, 6)
      .forEach((s, i) => s.on("state", (r: Room) => (snapshots[i] = r)));
    assert.equal((await send(clients[0], { type: "start" })).error, undefined);
    await wait(30);
    assert.equal(snapshots.length, 6);
    snapshots.forEach((r) => assert.deepEqual(r.game, snapshots[0].game));
    assert.match(
      (await send(clients[6], { type: "join", code, name: "Extra" })).error!,
      /already started/,
    );
    assert.match(
      (
        await send(clients[1], {
          type: "action",
          revision: 0,
          action: { type: "notebook", soldierId: "x", guess: 3 },
          playerId: ids[0],
        })
      ).error!,
      /turn/,
    );
    // Seed a loaded fixture on the server; clients cannot supply or alter this state.
    const room = f.server.manager.rooms.get(code)!;
    const g = room.game!;
    assert.equal(g.players.flatMap((p) => p.soldiers).length, 24);
    PARTS.forEach((n) => (g.players[0].soldiers[1].parts[n] = "completed"));
    g.players[0].soldiers[1].ammo = 3;
    // A client cannot fire someone else's soldier.
    assert.match(
      (
        await send(clients[0], {
          type: "action",
          revision: 0,
          action: { type: "attack", soldierId: g.players[1].soldiers[0].id, target: ids[2], targetSoldierId: g.players[2].soldiers[0].id, part: "head" },
        })
      ).error!,
      /gun/,
    );
    const payload = {
      type: "action",
      revision: 0,
      action: { type: "attack", soldierId: g.players[0].soldiers[1].id, target: ids[1], targetSoldierId: g.players[1].soldiers[2].id, part: "face" },
      ammo: 999,
    };
    const responses = await Promise.all([
      send(clients[0], payload),
      send(clients[0], payload),
    ]);
    assert.equal(responses.filter((r) => !r.error).length, 1);
    await wait(30);
    assert.equal(room.game!.players[0].soldiers[1].ammo, 2);
    assert.equal(room.game!.players[1].soldiers[2].parts.face, "eliminated");
    assert.equal(room.game!.players[1].soldiers[1].parts.face, "available");
    assert.equal(room.game!.revision, 1);
    snapshots.forEach((r) =>
      assert.deepEqual(r.game, JSON.parse(JSON.stringify(room.game))),
    );
    clients[0].disconnect();
    await wait(30);
    assert.equal(room.players[0].connected, false);
    const resumed = await f.connect();
    const restored = await send(resumed, { type: "resume", token: host.token });
    assert.equal(restored.playerId, ids[0]);
    assert.equal(restored.room!.game!.revision, 1);
    assert.equal(restored.room!.players[0].connected, true);
    assert.equal(restored.room!.game!.players[1].soldiers[2].parts.face, "eliminated", "reconnect restores squad state");
    // Notebook openings: the server generates the page; client-supplied results are ignored.
    assert.equal(room.game!.active, 1);
    const mine = room.game!.players[1].soldiers[0].id;
    const notebook = (extra: object) => send(clients[1], { type: "action", revision: room.game!.revision, ...extra });
    assert.match((await notebook({ action: { type: "notebook", soldierId: mine, guess: 4 } })).error!, /lucky number/);
    assert.match((await notebook({ action: { type: "notebook", soldierId: room.game!.players[2].soldiers[0].id, guess: 3 } })).error!, /own soldiers/);
    const realRandom = Math.random;
    Math.random = () => 0.8; // the server's assisted draw rolls a miss
    let forged: Reply;
    try {
      forged = await notebook({ action: { type: "notebook", soldierId: mine, guess: 3, page: 283, digit: 3, match: true }, page: 283 });
    } finally {
      Math.random = realRandom;
    }
    assert.equal(forged.error, undefined);
    await wait(30);
    const opened = room.game!.history.at(-1)!;
    assert.deepEqual([opened.kind, opened.guess, opened.match], ["notebook", 3, false]);
    assert.notEqual(opened.page, 283, "client-sent page ignored");
    assert.equal(opened.digit, opened.page! % 10);
    assert.notEqual(opened.digit, 3);
    assert.equal(room.game!.players[1].soldiers[0].assist, true, "server records the guarantee");
    assert.equal(room.game!.players[1].soldiers[0].parts.head, "available", "a forged match unlocks nothing");
    assert.equal(room.game!.active, 2, "one opening per turn");
    snapshots.slice(1).forEach((r) => assert.deepEqual(r.game!.history.at(-1), JSON.parse(JSON.stringify(opened)), "every device sees the same notebook result"));
    // A genuine match unlocks the head on every device.
    Math.random = () => 0.005; // match roll → page 3
    try {
      await send(clients[2], { type: "action", revision: room.game!.revision, action: { type: "notebook", soldierId: room.game!.players[2].soldiers[1].id, guess: 3 } });
    } finally {
      Math.random = realRandom;
    }
    await wait(30);
    assert.equal(room.game!.history.at(-1)!.part, "head");
    snapshots.slice(1).forEach((r) => assert.equal(r.game!.players[2].soldiers[1].parts.head, "completed"));
    assert.match(
      (await send(clients[6], { type: "resume", token: "forged" })).error!,
      /expired/,
    );
  } finally {
    await f.close();
  }
});
test("public matchmaking pools strangers, starts ready seats, and supports bots", async () => {
  const f = await fixture();
  try {
    const a = await f.connect(),
      b = await f.connect();
    const first = await send(a, { type: "quick", name: "Alpha" });
    const second = await send(b, { type: "quick", name: "Beta" });
    assert.equal(first.room!.code, second.room!.code);
    await send(a, { type: "ready" });
    await send(b, { type: "ready" });
    const r = f.server.manager.rooms.get(first.room!.code)!;
    assert.equal(r.game!.status, "playing");
    await send(a, { type: "leave" });
    assert.equal(r.players[0].bot, true);
    assert.equal(r.hostId, second.playerId);
    await send(b, { type: "leave" });
    assert.equal(f.server.manager.rooms.size, 0);
    const c = await f.connect();
    const privateRoom = await send(c, {
      type: "create",
      name: "Bot host",
      settings: { botDelay: 200 },
    });
    await send(c, { type: "addBot" });
    await send(c, { type: "start" });
    const botRoom = f.server.manager.rooms.get(privateRoom.room!.code)!;
    botRoom.game!.active = 1;
    await wait(800);
    assert.ok(botRoom.game!.revision > 0);
  } finally {
    await f.close();
  }
});
test("disconnect takeover, turn timeout, host transfer, rematch and room cleanup", async () => {
  const f = await fixture();
  try {
    const a = await f.connect(),
      b = await f.connect();
    const first = await send(a, {
      type: "create",
      name: "Alpha",
      settings: { botDelay: 200, disconnectSeconds: 5 },
    });
    const second = await send(b, {
      type: "join",
      code: first.room!.code,
      name: "Beta",
    });
    await send(b, { type: "ready" });
    await send(a, { type: "start" });
    const r = f.server.manager.rooms.get(first.room!.code)!;
    a.disconnect();
    await wait(30);
    r.players[0].disconnectedAt = Date.now() - 10000;
    r.game!.players[0].disconnectedAt = Date.now() - 10000;
    await wait(700);
    assert.ok(r.game!.revision > 0);
    assert.equal(r.hostId, second.playerId);
    r.game!.active = 1;
    r.game!.deadline = Date.now() - 1;
    const revision = r.game!.revision;
    await wait(180);
    assert.ok(r.game!.revision > revision);
    r.game!.status = "finished";
    assert.equal((await send(b, { type: "rematch" })).error, undefined);
    assert.equal(r.game, null);
    assert.equal(r.players[1].ready, false);
    b.disconnect();
    await wait(30);
    r.players.forEach((p) => (p.disconnectedAt = Date.now() - 400000));
    await wait(160);
    assert.equal(f.server.manager.rooms.size, 0);
    assert.equal(f.server.players.sessions.size, 0);
  } finally {
    await f.close();
  }
});

test("player photos are validated, re-encoded and synchronized to the room", async () => {
  const f = await fixture();
  try {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp({ create: { width: 160, height: 160, channels: 3, background: "#e8b48a" } }).jpeg().toBuffer();
    const photo = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    const a = await f.connect(), b = await f.connect();
    assert.match((await send(a, { type: "create", name: "Pic", avatar: "data:image/svg+xml;base64,PHN2Zz4=" })).error!, /JPEG/);
    const host = await send(a, { type: "create", name: "Pic", avatar: photo });
    assert.match(host.room!.players[0].avatar!, /^data:image\/jpeg;base64,/);
    const states: Room[] = [];
    b.on("state", (r: Room) => states.push(r));
    await send(b, { type: "join", code: host.room!.code, name: "Friend" });
    await send(b, { type: "ready" });
    await send(a, { type: "start" });
    await wait(30);
    const last = () => states[states.length - 1];
    assert.ok(last().game!.players[0].avatar, "photo carries into the match");
    assert.equal(last().game!.players[1].avatar, undefined);
    await send(b, { type: "profile", avatar: photo });
    await wait(30);
    assert.ok(last().game!.players[1].avatar);
    await send(a, { type: "profile", avatar: null });
    await wait(30);
    assert.equal(last().game!.players[0].avatar, undefined, "photos can be removed mid-match");
  } finally {
    await f.close();
  }
});

test("server-validated assisted matching: two online squads develop SOLDIER 1 → 4 with ~50% fresh matches and guaranteed retries", async () => {
  const f = await fixture();
  try {
    const a = await f.connect(), b = await f.connect();
    const joined = await send(a, { type: "create", name: "Alpha" });
    await send(b, { type: "join", code: joined.room!.code, name: "Beta" });
    await send(b, { type: "ready" });
    await send(a, { type: "start" });
    const room = f.server.manager.rooms.get(joined.room!.code)!;
    const clients = [a, b];
    const order: string[][] = [[], []];
    let moves = 0;
    while (room.game!.players.some((p) => p.soldiers.some((s) => nextPart(s))) && moves++ < 200) {
      const g = room.game!, i = g.active, me = g.players[i];
      const target = developmentTarget(me)!;
      if (nextPart(target) && order[i].at(-1) !== target.id) order[i].push(target.id);
      // Forged outcome fields are ignored: only soldier and lucky number are read by the server.
      const r = await send(clients[i], { type: "action", revision: g.revision, action: { type: "notebook", soldierId: target.id, guess: 9, match: true, assisted: true, page: 9 } });
      assert.equal(r.error, undefined);
    }
    const g = room.game!;
    assert.equal(g.status, "playing");
    assert.deepEqual(order[0], ["0", "1", "2", "3"].map((n) => `${g.players[0].id}:${n}`));
    assert.deepEqual(order[1], ["0", "1", "2", "3"].map((n) => `${g.players[1].id}:${n}`));
    assert.ok(g.players.every((p) => p.soldiers.every((s) => canShoot(s) && s.ammo === 3)), "all eight soldiers complete");
    const openings = g.history.filter((e) => e.kind === "notebook");
    assert.ok(openings.length >= 40 && openings.length <= 80, `${openings.length} openings for 40 parts`);
    assert.ok(openings.every((e) => e.digit === e.page! % 10 && e.match === (e.digit === e.guess) && e.page! >= 1 && e.page! <= g.settings.pageMax));
    assert.ok(openings.every((e) => !e.assisted || e.match));
    assert.ok(openings.every((e) => e.digit! % 2 === 1), "server never opens an even page");
    for (const s of g.players.flatMap((p) => p.soldiers)) {
      const results = openings.filter((e) => e.soldierId === s.id).map((e) => e.match);
      assert.ok(!results.some((m, i) => !m && results[i + 1] === false), "never two misses in a row");
    }
    const fresh = openings.filter((e) => !e.assisted);
    const rate = fresh.filter((e) => e.match).length / fresh.length;
    assert.ok(rate > 0.2 && rate < 0.8, `fresh match rate ${rate}`);
  } finally {
    await f.close();
  }
});
