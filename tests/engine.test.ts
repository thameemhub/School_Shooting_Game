import test from "node:test";
import assert from "node:assert/strict";
import { act, checkEnd, normalizeSettings, startGame, timeout } from "../shared/engine";
import { alive, canDevelop, canEverShoot, canShoot, createPlayer, developmentTarget, nextPart, survivors } from "../shared/character";
import { botAction } from "../shared/bots";
import { assistedPage, isOdd, lastDigit, randomPage } from "../shared/numbers";
import { DEFAULT_SETTINGS, LUCKY_NUMBERS, MATCH_CHANCE, PARTS, type Action, type Game, type LuckyNumber, type Part, type Soldier } from "../shared/types";

const game = (count = 2) =>
  startGame(
    Array.from({ length: count }, (_, i) => createPlayer(`p${i}`, `Player ${i}`)),
    DEFAULT_SETTINGS,
    "test",
    100,
  );
/**
 * A random source for the assisted draw: rolls a match when `n` ends in the lucky number, otherwise
 * a miss. (A soldier that missed last time matches regardless: that is the guarantee.)
 */
const page = (n: number, guess: number) => () => (lastDigit(n) === guess ? MATCH_CHANCE / 2 : (1 + MATCH_CHANCE) / 2);
const seeded = (seed: number) => () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 4294967296;
};
const run = (g: Game, action: Action, random = Math.random) => act(g, g.players[g.active].id, action, g.revision, random, 100);
const open = (g: Game, soldier: number, guess: number, pageNumber: number) =>
  run(g, { type: "notebook", soldierId: `${g.players[g.active].id}:${soldier}`, guess: guess as LuckyNumber }, page(pageNumber, guess));
const pass = (g: Game) => run(g, { type: "notebook", soldierId: developmentTarget(g.players[g.active])!.id, guess: 1 }, page(2, 1)); // opponent rolls a miss
const arm = (s: Soldier, ammo = 3) => {
  PARTS.forEach((n) => (s.parts[n] = "completed"));
  s.ammo = ammo;
};
const destroy = (s: Soldier) => PARTS.forEach((n) => (s.parts[n] = "eliminated"));
const attack = (g: Game, from: number, target: number, soldier: number, part: Part): Action => ({
  type: "attack",
  soldierId: `${g.players[g.active].id}:${from}`,
  target: `p${target}`,
  targetSoldierId: `p${target}:${soldier}`,
  part,
});
const lastEvent = (g: Game) => g.history[g.history.length - 1].kind === "notebook" ? g.history[g.history.length - 1] : g.history.findLast((e) => e.kind === "notebook")!;

test("page bounds, last digits and normalized settings", () => {
  assert.equal(randomPage(DEFAULT_SETTINGS, () => 0), 1);
  assert.equal(randomPage(DEFAULT_SETTINGS, () => 0.999999), 500);
  assert.equal(lastDigit(283), 3);
  assert.equal(isOdd(3), true);
  assert.equal(normalizeSettings({ pageMax: NaN }).pageMax, 500);
  assert.equal(normalizeSettings({ turnSeconds: 999 }).turnSeconds, 180);
  assert.deepEqual([...LUCKY_NUMBERS], [1, 3, 5, 7, 9]);
});

test("every player gets four distinct soldiers; six players field 24", () => {
  const g = game(6);
  const ids = g.players.flatMap((p) => p.soldiers.map((s) => s.id));
  assert.equal(new Set(ids).size, 24);
  assert.deepEqual(g.players[0].soldiers.map((s) => s.role), ["Assault", "Scout", "Defense", "Support"]);
  assert.equal(g.schema, 3);
});

test("only 1, 3, 5, 7 or 9 may be chosen, for one of your own soldiers, on your turn", () => {
  const g = game();
  for (const bad of [0, 2, 4, 11, -1, 3.5, "3", null, undefined])
    assert.throws(() => run(g, { type: "notebook", soldierId: "p0:0", guess: bad as LuckyNumber }), /lucky number/, String(bad));
  assert.throws(() => run(g, { type: "notebook", soldierId: "p1:0", guess: 3 }), /own soldiers/);
  assert.throws(() => run(g, { type: "notebook", soldierId: "nope", guess: 3 }), /own soldiers/);
  assert.throws(() => act(g, "p1", { type: "notebook", soldierId: "p1:0", guess: 3 }), /turn/);
  assert.throws(() => run(g, { type: "book" } as unknown as Action), /Unknown/);
});

test("assisted draw: ~50% matches, pages always agree with the verdict, every digit stays reachable", () => {
  const random = seeded(7);
  for (const pageMax of [10, 37, 500, 100000]) {
    const settings = { ...DEFAULT_SETTINGS, pageMax };
    let matches = 0;
    const digits = new Set<number>();
    for (let i = 0; i < 20000; i++) {
      const lucky = LUCKY_NUMBERS[i % 5];
      const { page: n, match } = assistedPage(settings, lucky, false, random);
      assert.ok(Number.isInteger(n) && n >= 1 && n <= pageMax, `page ${n} within 1..${pageMax}`);
      assert.equal(match, lastDigit(n) === lucky, "last digit consistent with the result");
      if (match) matches++;
      else digits.add(lastDigit(n));
    }
    assert.ok(Math.abs(matches / 20000 - MATCH_CHANCE) < 0.02, `match rate ${matches / 20000} ≈ 0.5 (pageMax ${pageMax})`);
    assert.equal(digits.size, 10, "misses land on even digits and other odd digits too");
    for (let i = 0; i < 2000; i++) {
      const lucky = LUCKY_NUMBERS[i % 5];
      const guaranteed = assistedPage(settings, lucky, true, random);
      assert.equal(guaranteed.match, true);
      assert.equal(lastDigit(guaranteed.page), lucky);
      assert.ok(guaranteed.page >= 1 && guaranteed.page <= pageMax);
    }
  }
  assert.deepEqual(assistedPage(DEFAULT_SETTINGS, 3, false, () => 0), { page: 3, match: true });
  assert.equal(assistedPage(DEFAULT_SETTINGS, 3, false, () => 0.9999999).match, false);
  assert.equal(assistedPage(DEFAULT_SETTINGS, 3, false, () => 1).page <= 500, true);
});

test("a mismatch unlocks nothing, ends the turn, and guarantees that soldier's next opening", () => {
  let g = game();
  g = open(g, 0, 7, 243);
  let e = lastEvent(g);
  assert.deepEqual([e.guess, e.match, e.part, e.assisted], [7, false, undefined, undefined]);
  assert.equal(e.digit, lastDigit(e.page!));
  assert.notEqual(e.digit, 7);
  assert.equal(g.players[0].soldiers[0].parts.head, "available");
  assert.equal(g.players[0].soldiers[0].assist, true, "next opening for this soldier is guaranteed");
  assert.equal(g.players[0].score, 0);
  assert.equal(g.active, 1, "one opening per turn");
  g = open(g, 0, 3, 284); // a miss roll for the opponent
  e = lastEvent(g);
  assert.equal(e.match, false);
  assert.equal(g.players[1].soldiers[0].parts.head, "available");
  assert.equal(g.active, 0, "no retries within a turn");
  // Even with a "miss" roll, the assisted soldier matches: page ends in the lucky number.
  g = open(g, 0, 5, 246);
  e = lastEvent(g);
  assert.deepEqual([e.match, e.assisted, e.part, e.digit], [true, true, "head", 5]);
  assert.equal(e.page! % 10, 5);
  assert.equal(g.players[0].soldiers[0].assist, false, "guarantee is used up");
  // The guarantee belongs to one soldier: a miss on soldier 0 does not help soldier 1.
  g = pass(g);
  g = open(g, 1, 1, 2);
  assert.equal(lastEvent(g).match, false);
  assert.equal(g.players[0].soldiers[1].parts.head, "available");
});

test("each exact match advances the chosen soldier one stage: head → body → face → gun → bullets", () => {
  let g = game();
  const script: [number, number, Part][] = [
    [5, 125, "head"],
    [9, 349, "body"],
    [1, 281, "face"],
    [7, 157, "gun"],
    [3, 493, "bullets"],
  ];
  for (const [guess, pageNumber, part] of script) {
    assert.equal(nextPart(g.players[0].soldiers[2]), part);
    g = open(g, 2, guess, pageNumber);
    const e = lastEvent(g);
    assert.equal(e.match, true);
    assert.equal(e.part, part);
    assert.equal(g.players[0].soldiers[2].parts[part], "completed");
    g = pass(g);
  }
  const p = g.players[0];
  assert.equal(p.soldiers[2].ammo, 3);
  assert.equal(canShoot(p.soldiers[2]), true);
  assert.equal(p.score, 50);
  assert.equal(p.developments, 5);
  assert.ok([0, 1, 3].every((i) => p.soldiers[i].parts.head === "available"), "other soldiers untouched");
});

test("the same lucky number can be reused; the number never chooses the part", () => {
  let g = game();
  g = pass(open(g, 1, 3, 13));
  g = pass(open(g, 1, 3, 3));
  assert.equal(g.players[0].soldiers[1].parts.head, "completed");
  assert.equal(g.players[0].soldiers[1].parts.body, "completed");
  g = open(g, 1, 3, 9);
  assert.equal(g.players[0].soldiers[1].parts.face, "available");
});

test("destroyed stages are skipped on later matches and never restored", () => {
  let g = game();
  const s = g.players[0].soldiers[0];
  s.parts.head = "eliminated";
  s.parts.face = "eliminated";
  g = pass(open(g, 0, 1, 1));
  assert.equal(g.players[0].soldiers[0].parts.body, "completed");
  g = pass(open(g, 0, 1, 1));
  assert.equal(g.players[0].soldiers[0].parts.gun, "completed");
  assert.equal(g.players[0].soldiers[0].parts.head, "eliminated");
  assert.equal(g.players[0].soldiers[0].parts.face, "eliminated");
  g = pass(open(g, 0, 1, 1));
  assert.equal(canShoot(g.players[0].soldiers[0]), true);
  // Destroying a built part does not reset progress.
  g.players[0].soldiers[0].parts.body = "eliminated";
  assert.equal(nextPart(g.players[0].soldiers[0]), undefined);
  assert.equal(canShoot(g.players[0].soldiers[0]), true);
});

test("reloads: a full soldier reloads to three on a match; full ammo or destroyed bullets cannot", () => {
  let g = game();
  arm(g.players[0].soldiers[0], 3);
  arm(g.players[0].soldiers[1], 1);
  assert.equal(canDevelop(g.players[0].soldiers[0]), false);
  assert.throws(() => open(g, 0, 1, 1), /cannot develop/);
  g = open(g, 1, 9, 9);
  assert.equal(lastEvent(g).reload, true);
  assert.equal(g.players[0].soldiers[1].ammo, 3);
  assert.equal(g.players[0].score, 0, "reloading never farms points");
  g = pass(g);
  g.players[0].soldiers[1].parts.bullets = "eliminated";
  g.players[0].soldiers[1].ammo = 0;
  assert.throws(() => open(g, 1, 1, 1), /cannot develop/);
  assert.equal(canShoot(g.players[0].soldiers[1]), false);
  assert.equal(canEverShoot(g.players[0].soldiers[1]), false);
});

test("a squad with nothing left to build or fire can still open the notebook to pass", () => {
  let g = game();
  const p = g.players[0];
  p.soldiers.forEach((s) => {
    PARTS.forEach((n) => (s.parts[n] = "completed"));
    s.parts.bullets = "eliminated";
  });
  destroy(p.soldiers[3]);
  assert.equal(p.soldiers.some(canDevelop), false);
  assert.equal(canShoot(p), false);
  assert.throws(() => open(g, 3, 1, 1), /defeated/);
  const action = botAction(g, () => 0.3);
  assert.equal(action.type, "notebook");
  g = open(g, 0, 1, 1);
  assert.equal(lastEvent(g).match, true);
  assert.equal(lastEvent(g).part, undefined);
  assert.equal(g.active, 1);
});

test("development auto-advances SOLDIER 1 → 2 → 3 → 4; a hand-picked soldier is kept", () => {
  let g = game();
  const p = () => g.players[0];
  assert.equal(developmentTarget(p())!.id, "p0:0");
  assert.equal(developmentTarget(p(), "p0:2")!.id, "p0:2", "manual choice respected");
  const order: string[] = [];
  let turns = 0;
  const random = seeded(99);
  while (p().soldiers.some((s) => nextPart(s)) && turns < 200) {
    const target = developmentTarget(p())!;
    if (order.at(-1) !== target.id) order.push(target.id);
    g = run(g, { type: "notebook", soldierId: target.id, guess: 7 }, random);
    turns++;
    g = pass(g);
  }
  assert.deepEqual(order, ["p0:0", "p0:1", "p0:2", "p0:3"]);
  assert.ok(p().soldiers.every((s) => PARTS.every((n) => s.parts[n] === "completed") && s.ammo === 3), "all four soldiers fully built and loaded");
  // 20 parts at 1–2 turns each: never more than 40 turns, typically ~30.
  assert.ok(turns >= 20 && turns <= 40, `${turns} turns for 20 parts`);
  assert.equal(p().score, 200);
  // Never two misses in a row on one soldier.
  for (const s of p().soldiers) {
    const results = g.history.filter((e) => e.kind === "notebook" && e.soldierId === s.id).map((e) => e.match);
    assert.ok(!results.some((m, i) => !m && results[i + 1] === false), `${s.id}: ${results}`);
  }
  // A hand-picked soldier with nothing left falls back to the squad order.
  g.players[0].soldiers[1].parts.head = "available";
  assert.equal(developmentTarget(g.players[0], "p0:3")!.id, "p0:1");
});

test("attacks name a shooter, opponent, surviving soldier and body part", () => {
  let g = game(3);
  assert.throws(() => run(g, attack(g, 0, 1, 0, "head")), /gun/);
  arm(g.players[0].soldiers[2]);
  arm(g.players[1].soldiers[0]);
  assert.throws(() => run(g, attack(g, 0, 1, 0, "head")), /gun/, "soldier 0 is not armed");
  assert.throws(() => run(g, { ...attack(g, 2, 2, 0, "head"), soldierId: "p1:0" } as Action), /gun/, "cannot fire an opponent's soldier");
  assert.throws(() => run(g, attack(g, 2, 0, 0, "head")), /opponent/);
  assert.throws(() => run(g, { ...attack(g, 2, 1, 0, "head"), targetSoldierId: "p2:0" } as Action), /surviving soldier/);
  assert.throws(() => run(g, { ...attack(g, 2, 1, 0, "head"), part: 5 } as unknown as Action), /cannot be targeted/);
  g = run(g, attack(g, 2, 1, 3, "face"));
  assert.equal(g.players[0].soldiers[2].ammo, 2);
  assert.equal(g.players[1].soldiers[3].parts.face, "eliminated");
  assert.equal(g.history.at(-1)!.part, "face");
  assert.equal(g.players[0].score, 20);
  assert.equal(g.active, 1);
  g.active = 0;
  assert.throws(() => run(g, attack(g, 2, 1, 3, "face")), /cannot be targeted/);
  assert.throws(() => act(g, "p0", attack(g, 2, 1, 3, "head"), g.revision - 1), /changed/);
});

test("destroyed gun cannot fire; destroyed bullets empty the soldier; a lost head does not stop a loaded gun", () => {
  let g = game();
  const s = g.players[0].soldiers[0];
  arm(s);
  arm(g.players[1].soldiers[2]);
  s.parts.head = "eliminated";
  assert.equal(canShoot(s), true);
  g = run(g, attack(g, 0, 1, 2, "bullets"));
  assert.equal(g.players[1].soldiers[2].ammo, 0);
  assert.equal(canShoot(g.players[1].soldiers[2]), false);
  g.active = 0;
  g.players[0].soldiers[0].parts.gun = "eliminated";
  assert.throws(() => run(g, attack(g, 0, 1, 0, "head")), /gun/);
});

test("a soldier falls after five hits; a player falls only when all four soldiers do", () => {
  let g = game(3);
  arm(g.players[0].soldiers[0]);
  const victim = g.players[1];
  victim.soldiers.slice(0, 3).forEach(destroy);
  PARTS.forEach((n) => (victim.soldiers[3].parts[n] = n === "face" ? "available" : "eliminated"));
  assert.equal(survivors(victim), 1);
  assert.throws(() => run(g, attack(g, 0, 1, 0, "head")), /surviving soldier/);
  g = run(g, attack(g, 0, 1, 3, "face"));
  assert.equal(alive(g.players[1]), false);
  assert.equal(g.players[0].score, 70);
  assert.equal(g.status, "playing");
  assert.equal(g.active, 2, "eliminated squads are skipped");
  g.active = 0;
  destroy(g.players[2].soldiers[0]);
  assert.equal(alive(g.players[2]), true, "one soldier down is not a player elimination");
  g.players[2].soldiers.slice(1).forEach(destroy);
  g.players[2].soldiers[3].parts.gun = "available";
  g = run(g, attack(g, 0, 2, 3, "gun"));
  assert.equal(g.status, "finished");
  assert.deepEqual(g.winnerIds, ["p0"]);
  assert.throws(() => open(g, 0, 1, 1), /ended/);
});

test("stalemates, ties and maximum rounds finish deterministically", () => {
  const g = game();
  g.players.forEach((p) => p.soldiers.forEach((s) => (s.parts.gun = "eliminated")));
  checkEnd(g, 100);
  assert.equal(g.status, "finished");
  assert.match(g.endReason!, /Stalemate/);
  assert.deepEqual(g.winnerIds, ["p0", "p1"]);
  const h = game();
  h.players[1].score = 20;
  h.round = h.settings.maxRounds + 1;
  checkEnd(h, 100);
  assert.deepEqual(h.winnerIds, ["p1"]);
  assert.match(h.endReason!, /Round limit/);
  // Destroyed heads no longer block anything: a soldier with gun & bullets left keeps the match alive.
  const k = game();
  k.players.forEach((p) => p.soldiers.forEach((s) => (s.parts.head = "eliminated")));
  assert.equal(checkEnd(k, 100), false);
});

test("timeouts skip once and rematches reset every soldier", () => {
  let g = game();
  arm(g.players[0].soldiers[1]);
  assert.equal(timeout(g, 100), g);
  g = timeout(g, g.deadline);
  assert.equal(g.active, 1);
  const fresh = startGame(g.players, g.settings);
  assert.equal(fresh.revision, 0);
  assert.equal(fresh.history.length, 0);
  assert.ok(fresh.players.every((p) => p.score === 0 && p.soldiers.every((s) => s.ammo === 0 && s.parts.head === "available")));
  assert.notEqual(fresh.id, g.id);
});

test("bots use the same assisted notebook rules and finish six-squad matches", () => {
  const random = seeded(42);
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    let g = game(6);
    g.settings.difficulty = difficulty;
    let moves = 0;
    while (g.status === "playing" && moves++ < 20000) {
      const action = botAction(g, random);
      if (action.type === "notebook") assert.ok(LUCKY_NUMBERS.includes(action.guess));
      g = act(g, g.players[g.active].id, action, g.revision, random);
      assert.ok(g.players.every((p) => p.soldiers.every((s) => s.ammo >= 0 && s.ammo <= 3)));
    }
    assert.equal(g.status, "finished", difficulty);
    const openings = g.history.filter((e) => e.kind === "notebook");
    assert.ok(openings.every((e) => e.match === (e.digit === e.guess) && e.page! >= 1 && e.page! <= 500));
    assert.ok(openings.every((e) => e.match || (!e.part && !e.reload)), "mismatches never unlock");
    const rate = openings.filter((e) => e.match).length / openings.length;
    // 50% per fresh attempt + guaranteed after a miss ⇒ two matches every three openings in the long run.
    assert.ok(rate > 0.58 && rate < 0.75, `${difficulty} match rate ${rate.toFixed(3)} ≈ 2/3`);
    const unassisted = openings.filter((e) => !e.assisted);
    const fresh = unassisted.filter((e) => e.match).length / unassisted.length;
    assert.ok(Math.abs(fresh - 0.5) < 0.06, `${difficulty} unassisted rate ${fresh.toFixed(3)} ≈ 1/2`);
    assert.ok(openings.every((e) => !e.assisted || e.match), "assisted openings always match");
    for (const s of g.players.flatMap((p) => p.soldiers)) {
      const results = openings.filter((e) => e.soldierId === s.id).map((e) => e.match);
      assert.ok(!results.some((m, i) => !m && results[i + 1] === false), "no soldier misses twice in a row");
    }
  }
});
