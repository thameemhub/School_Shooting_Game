import test from "node:test";
import assert from "node:assert/strict";
import React, { act as reactAct, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { act, startGame } from "../shared/engine";
import { createPlayer } from "../shared/character";
import { DEFAULT_SETTINGS, PARTS, type Game } from "../shared/types";
import Soldier from "../src/components/Soldier";
import Arena from "../src/components/Arena";
import Introduction from "../src/components/Introduction";
import { introFrame, INTRO_SECONDS } from "../src/tutorial";
import App from "../src/App";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const open = (g: Game, guess: 1 | 3 | 5 | 7 | 9, page: number) =>
  act(
    g,
    g.players[g.active].id,
    { type: "notebook", soldierId: g.players[g.active].soldiers[0].id, guess },
    g.revision,
    // Assisted draw: roll a match when `page` ends in the guess, otherwise a miss.
    () => (page % 10 === guess ? 0.25 : 0.75),
  );
const initial = () =>
  startGame(
    [createPlayer("p0", "Alpha"), createPlayer("p1", "Beta")],
    DEFAULT_SETTINGS,
  );
test("five successful notebook matches render every accumulated SVG layer and three loaded rounds", () => {
  let g = initial();
  const guesses = [3, 7, 1, 9, 5] as const;
  for (let i = 0; i < 5; i++) {
    g = open(g, guesses[i], 120 + guesses[i]);
    const markup = renderToStaticMarkup(
      <Soldier soldier={g.players[0].soldiers[0]} />,
    );
    for (const [j, part] of PARTS.entries())
      assert.equal(
        markup.includes(`data-part="${part}" data-state="completed"`),
        j <= i,
        `${part} at stage ${i + 1}`,
      );
    if (i === 4)
      assert.equal((markup.match(/class="round live"/g) || []).length, 3);
    g = open(g, 1, 122);
  }
});
test("each new layer paints visible pixels in its expected body region", async () => {
  let g = initial();
  const render = (game: Game) =>
    Buffer.from(
      renderToStaticMarkup(
        <Soldier soldier={game.players[0].soldiers[0]} />,
      ).replace(
        "<svg ",
        '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="235" ',
      ),
    );
  let previous = await sharp(render(g)).ensureAlpha().raw().toBuffer();
  const regions = [
    [70, 20, 80, 96],
    [40, 102, 120, 120],
    [84, 72, 52, 30],
    [150, 112, 60, 45],
    [172, 92, 36, 27],
  ];
  const images: Buffer[] = [];
  for (const [i, guess] of ([3, 7, 1, 9, 5] as const).entries()) {
    g = open(g, guess, 120 + guess);
    const svg = render(g),
      current = await sharp(svg).ensureAlpha().raw().toBuffer();
    const [x, y, w, h] = regions[i];
    let changed = 0;
    for (let py = y; py < y + h; py++)
      for (let px = x; px < x + w; px++) {
        const pos = (py * 220 + px) * 4;
        if (
          !current
            .subarray(pos, pos + 4)
            .equals(previous.subarray(pos, pos + 4))
        )
          changed++;
      }
    assert.ok(
      changed > 30,
      `${PARTS[i]} must paint pixels, not just increment progress`,
    );
    images.push(await sharp(svg).png().toBuffer());
    previous = current;
    g = open(g, 1, 122);
  }
  const labels = Buffer.from(
    `<svg width="1100" height="280"><rect width="1100" height="280" fill="#fff8ed"/>${PARTS.map((p, i) => `<text x="${i * 220 + 110}" y="265" text-anchor="middle" font-family="Arial" font-size="16" font-weight="bold" fill="#3f51b5">${i + 1}. ${p.toUpperCase()}</text>`).join("")}</svg>`,
  );
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/progression-verified.png",
    await sharp(labels)
      .composite(images.map((input, i) => ({ input, left: i * 220, top: 0 })))
      .png()
      .toBuffer(),
  );
});
test("restoring a two-stage soldier in StrictMode never leaves its body hidden by an animation timer", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  let g = initial();
  g = open(g, 3, 123);
  g = open(g, 1, 122);
  g = open(g, 7, 287);
  const root = createRoot(document.getElementById("root")!);
  const props = {
    mode: "local" as const,
    myId: "",
    canAct: true,
    busy: false,
    motion: true,
    now: Date.now(),
    host: true,
    onAction: () => {},
    onRematch: () => {},
    onStandings: () => {},
    onPlayAgain: () => {},
    onMenu: () => {},
  };
  try {
    await reactAct(async () =>
      root.render(
        <StrictMode>
          <Arena game={g} {...props} />
        </StrictMode>,
      ),
    );
    await reactAct(async () => {
      await new Promise((r) => setTimeout(r, 1800));
    });
    const card = document.querySelector('[data-soldier="p0:0"]')!;
    assert.ok(card.querySelector('[data-part="head"][data-state="completed"]'));
    assert.ok(
      card.querySelector('[data-part="body"][data-state="completed"]'),
      "BODY must remain rendered after the notebook reveal",
    );
  } finally {
    await reactAct(async () => root.unmount());
    dom.window.close();
  }
});
test("all five layers stay mounted through live updates, misses and soldier selection; a full soldier enables attack", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(document.getElementById("root")!);
  let g = initial();
  const render = () =>
    root.render(
      <Arena
        game={g}
        mode="local"
        myId=""
        canAct={true}
        busy={false}
        motion={true}
        now={Date.now()}
        host={true}
        onAction={() => {}}
        onRematch={() => {}}
        onStandings={() => {}}
        onPlayAgain={() => {}}
        onMenu={() => {}}
      />,
    );
  try {
    for (const [i, guess] of ([3, 7, 1, 9, 5] as const).entries()) {
      g = open(g, guess, 120 + guess);
      g = open(g, 1, 122);
      await reactAct(async () => render());
      const card = document.querySelector('[data-soldier="p0:0"]')!;
      for (const [j, part] of PARTS.entries())
        assert.equal(
          !!card.querySelector(`[data-part="${part}"][data-state="completed"]`),
          j <= i,
        );
      // Inspecting a different soldier cannot reset or conceal the developed soldier.
      await reactAct(async () => {
        (
          document.querySelector('[data-soldier="p0:1"]') as HTMLButtonElement
        ).click();
      });
      assert.ok(card.querySelector('[data-part="head"]'));
      if (i < 4) {
        g = open(g, 3, 247);
        g = open(g, 1, 122);
        await reactAct(async () => render());
      }
      assert.ok(
        document.querySelector(
          `[data-soldier="p0:0"] [data-part="${PARTS[i]}"][data-state="completed"]`,
        ),
      );
    }
    const attack = [
      ...document.querySelectorAll<HTMLButtonElement>(".attack-button"),
    ].find((b) => b.textContent?.includes("ATTACK"))!;
    assert.ok(attack, "ATTACK appears once a soldier is loaded");
    assert.equal(attack.disabled, false);
    assert.equal(
      document.querySelectorAll('[data-soldier="p0:0"] .round.live').length,
      3,
    );
  } finally {
    await reactAct(async () => root.unmount());
    dom.window.close();
  }
});
test("first match offers intro once; skip starts play and How to play replays it", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    sessionStorage: dom.window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  localStorage.setItem(
    "showdown-preferences",
    JSON.stringify({ sound: false, music: false, motion: false }),
  );
  let root = createRoot(document.getElementById("root")!);
  const button = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === name,
    )!;
  const setup = async () => {
    await reactAct(async () => button("Play solo").click());
    await reactAct(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new dom.window.Event("submit", { bubbles: true, cancelable: true }),
        );
    });
  };
  try {
    await reactAct(async () => root.render(<App />));
    await setup();
    assert.ok(document.querySelector(".intro-film"));
    assert.equal(
      document.querySelector(".arena"),
      null,
      "offline gameplay must wait until skip/start",
    );
    await reactAct(async () => button("Skip intro").click());
    assert.ok(document.querySelector(".arena"));
    assert.equal(localStorage.getItem("squad-intro-seen"), "true");
    await reactAct(async () => root.unmount());
    root = createRoot(document.getElementById("root")!);
    await reactAct(async () => root.render(<App />));
    await setup();
    assert.equal(document.querySelector(".intro-film"), null);
    assert.ok(document.querySelector(".arena"));
    await reactAct(async () => button("How to play").click());
    assert.ok(document.querySelector(".intro-film"));
  } finally {
    await reactAct(async () => root.unmount());
    dom.window.close();
  }
});
test("intro samples cover the seven steps, all five stages, the next soldier and an attack without modifying game state", () => {
  const g = initial(),
    original = structuredClone(g);
  assert.deepEqual([0, 4, 8, 12, 16, 26, 31].map((t) => introFrame(t).scene), [0, 1, 2, 3, 4, 5, 6]);
  for (let i = 0; i < 5; i++) {
    const f = introFrame(17 + i * 2);
    assert.equal(f.scene, 4);
    assert.equal(f.built, i + 1);
    const svg = renderToStaticMarkup(<Soldier soldier={f.soldier} />);
    assert.ok(svg.includes(`data-part="${PARTS[i]}" data-state="completed"`));
  }
  assert.equal(introFrame(8).match.match, true);
  assert.equal(introFrame(12).miss.match, false);
  const next = introFrame(29);
  assert.equal(next.squad[0].parts.bullets, "completed", "soldier 1 complete");
  assert.equal(next.squad[1].parts.head, "completed", "soldier 2 starts developing");
  assert.equal(introFrame(34).target.parts.gun, "eliminated");
  assert.equal(introFrame(34).soldier.ammo, 2);
  assert.equal(introFrame(INTRO_SECONDS).scene, 6);
  assert.deepEqual(g, original);
});
test("intro renders every step with SKIP INTRO and START GAME", () => {
  const markup = renderToStaticMarkup(<Introduction onDone={() => {}} motion={false} />);
  assert.ok(markup.includes("Skip intro") && markup.includes("Start game"));
  assert.ok(markup.includes("1 · Choose your soldier"));
});
test("intro pause/resume, replay, skip and start controls work", async (t) => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "http://localhost/",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const root = createRoot(document.getElementById("root")!);
  let done = 0;
  const button = (name: string) =>
    [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === name,
    )!;
  try {
    await reactAct(async () =>
      root.render(<Introduction onDone={() => done++} motion={false} />),
    );
    await reactAct(async () => t.mock.timers.tick(4500));
    assert.equal(
      document.querySelector(".intro-film")?.getAttribute("data-scene"),
      "1",
    );
    await reactAct(async () => button("Pause").click());
    const before = document
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow");
    await reactAct(async () => t.mock.timers.tick(10000));
    assert.equal(
      document
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow"),
      before,
    );
    await reactAct(async () => button("Resume").click());
    await reactAct(async () => t.mock.timers.tick(5000));
    assert.equal(
      document.querySelector(".intro-film")?.getAttribute("data-scene"),
      "2",
    );
    await reactAct(async () => t.mock.timers.tick(20000));
    assert.equal(
      document.querySelector(".intro-film")?.getAttribute("data-scene"),
      "5",
    );
    assert.ok(document.body.textContent?.includes("SOLDIER 1 COMPLETE! NEXT: SOLDIER 2"));
    await reactAct(async () => button("Play intro").click());
    assert.equal(
      document
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow"),
      "0",
    );
    await reactAct(async () => t.mock.timers.tick(41000));
    assert.equal(
      document.querySelector(".intro-film")?.getAttribute("data-scene"),
      "6",
    );
    await reactAct(async () => button("Skip intro").click());
    assert.equal(done, 1);
    await reactAct(async () => button("Start game").click());
    assert.equal(done, 2);
  } finally {
    await reactAct(async () => root.unmount());
    t.mock.timers.reset();
    dom.window.close();
  }
});
test("completing soldier 1 announces SOLDIER 1 COMPLETE! NEXT: SOLDIER 2 and auto-selects soldier 2", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById("root")!);
  let g = initial();
  const render = () =>
    root.render(
      <Arena game={g} mode="local" myId="" canAct={true} busy={false} motion={false} now={Date.now()} host={true}
        onAction={() => {}} onRematch={() => {}} onStandings={() => {}} onPlayAgain={() => {}} onMenu={() => {}} />,
    );
  try {
    await reactAct(async () => render());
    for (const guess of [3, 7, 1, 9, 5] as const) {
      g = open(g, guess, 120 + guess);
      await reactAct(async () => render());
      if (guess !== 5) {
        g = open(g, 1, 122);
        await reactAct(async () => render());
      }
    }
    await reactAct(async () => new Promise((r) => setTimeout(r, 20)));
    assert.match(document.querySelector(".complete-banner")?.textContent || "", /SOLDIER 1 COMPLETE! NEXT: SOLDIER 2/);
    // Opponent's turn passes; back on Alpha's turn the panel has moved on to soldier 2.
    g = open(g, 1, 122);
    await reactAct(async () => render());
    assert.match(document.querySelector(".dev-current")?.textContent || "", /SOLDIER 2 · SCOUT/);
    assert.match(document.querySelector(".dev-current")?.textContent || "", /NEXT: HEAD/);
  } finally {
    await reactAct(async () => root.unmount());
    dom.window.close();
  }
});
