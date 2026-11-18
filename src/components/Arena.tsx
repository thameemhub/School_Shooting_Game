import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { alive, canDevelop, canReload, canShoot, developmentTarget, nextPart, survivors } from "../../shared/character";
import {
  LUCKY_NUMBERS,
  PARTS,
  PART_LABELS,
  type Action,
  type Game,
  type GameEvent,
  type LuckyNumber,
  type Part,
  type Player,
  type Soldier as SoldierState,
} from "../../shared/types";
import Icon from "./Icon";
import Modal from "./Modal";
import Notebook from "./Notebook";
import Soldier, { Avatar, type SoldierFx } from "./Soldier";
import { sound } from "../sound";

export const TEAM_COLORS = ["#3F51B5", "#E86A33", "#1F9E8F", "#8E5CC9", "#D9A400", "#2D8FD5"];
const soldierNumber = (s: SoldierState) => Number(s.id.split(":").pop()) + 1;
const progress = (s: SoldierState) => PARTS.filter((n) => s.parts[n] === "completed").length;

type Attack = { shooter?: string; targetPlayer?: string; targetSoldier?: string; part?: Part };
type Shot = { key: number; x1: number; y1: number; x2: number; y2: number };
type Reveal = { soldierId: string; part: Part };

export function soldierStatus(s: SoldierState) {
  if (!alive(s)) return "Defeated";
  if (canShoot(s)) return `Ready to fire · ${s.ammo} bullet${s.ammo === 1 ? "" : "s"}`;
  if (s.parts.gun === "eliminated") return "Gun destroyed";
  if (s.parts.bullets === "eliminated") return "Bullets destroyed";
  if (canReload(s)) return "Out of bullets · a match reloads";
  const next = nextPart(s);
  return next ? `Next match unlocks ${PART_LABELS[next]}` : "Fully developed";
}

/** Five-stage development tracker: green ✓ unlocked, grey ○ locked, red ✕ destroyed. */
function Tracker({ s, pick, chosen, onPick, fresh }: { s: SoldierState; pick?: boolean; chosen?: Part; onPick?: (p: Part) => void; fresh?: Part }) {
  const next = nextPart(s);
  return (
    <ul className={`tracker ${pick ? "picking" : ""}`}>
      {PARTS.map((n) => {
        const st = s.parts[n];
        const targetable = pick && st !== "eliminated";
        const mark = st === "completed" ? "✓" : st === "eliminated" ? "✕" : "○";
        const word = st === "completed" ? "UNLOCKED" : st === "eliminated" ? "DESTROYED" : n === next ? "NEXT" : "LOCKED";
        const body = (
          <>
            <i>{mark}</i>
            <b>{PART_LABELS[n].toUpperCase()}</b>
            <em>{word}</em>
          </>
        );
        return (
          <li key={n} className={`${st} ${n === next ? "next" : ""} ${chosen === n ? "chosen" : ""} ${fresh === n ? "fresh" : ""}`}>
            {targetable ? (
              <button onClick={() => onPick?.(n)} aria-label={`Target ${PART_LABELS[n]} (${word.toLowerCase()})`}>
                {body}
              </button>
            ) : (
              <span>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
/** "PROGRESS: 2/5 · NEXT UNLOCK: FACE" line under a tracker. */
function NextUnlock({ s }: { s: SoldierState }) {
  const next = nextPart(s);
  return (
    <p className="next-unlock">
      <span>
        PROGRESS: <b>{progress(s)}/5</b>
      </span>
      <span>
        NEXT UNLOCK: <b>{!alive(s) ? "—" : canReload(s) ? "RELOAD" : next ? PART_LABELS[next].toUpperCase() : "COMPLETE"}</b>
      </span>
    </p>
  );
}

export default function Arena({
  game,
  mode,
  myId,
  canAct,
  busy,
  motion,
  now,
  host,
  onAction,
  onRematch,
  onStandings,
  onPlayAgain,
  onMenu,
}: {
  game: Game;
  mode: "solo" | "local" | "online";
  myId: string;
  canAct: boolean;
  busy: boolean;
  motion: boolean;
  now: number;
  host: boolean;
  onAction: (a: Action) => void;
  onRematch: () => void;
  onStandings: () => void;
  onPlayAgain: () => void;
  onMenu: () => void;
}) {
  const active = game.players[game.active];
  const viewerId = mode === "online" ? myId : mode === "solo" ? game.players.find((p) => !p.bot)?.id || "" : active.id;
  const viewer = game.players.find((p) => p.id === viewerId);
  const [focus, setFocus] = useState<string>(() => (viewer || active).soldiers.find(alive)?.id || active.soldiers[0].id);
  const [tab, setTab] = useState<"develop" | "attack">("develop");
  const [devSoldier, setDevSoldier] = useState<string>();
  const [lucky, setLucky] = useState<LuckyNumber>();
  const [opening, setOpening] = useState(false);
  const [attack, setAttack] = useState<Attack>({});
  const [fx, setFx] = useState<Record<string, SoldierFx>>({});
  const [shot, setShot] = useState<Shot | null>(null);
  // The part that was just added: glows on the soldier with an "X UNLOCKED!" callout.
  const [unlocked, setUnlocked] = useState<(Reveal & { key: number }) | null>(null);
  const [freshNotebook, setFreshNotebook] = useState(0);
  const [notebookFor, setNotebookFor] = useState<string | null>(null);
  const [playerTab, setPlayerTab] = useState(active.id);
  // "SOLDIER 1 COMPLETE! NEXT: SOLDIER 2" banner after a soldier's last part unlocks.
  const [complete, setComplete] = useState<{ key: number; text: string } | null>(null);
  // Soldiers each player picked by hand; kept while they still have parts to build.
  const picked = useRef<Record<string, string>>({});
  const seen = useRef({ game: "", id: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cards = useRef<HTMLDivElement>(null);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const colorOf = (id: string) => TEAM_COLORS[Math.max(0, game.players.findIndex((p) => p.id === id))];
  const ownerOf = (soldierId: string) => game.players.find((p) => p.soldiers.some((s) => s.id === soldierId));
  const findSoldier = (id?: string) => (id ? game.players.flatMap((p) => p.soldiers).find((s) => s.id === id) : undefined);
  // Render authoritative parts directly. Animation timers must never hide unlocked state.
  const focused = findSoldier(focus) || active.soldiers[0];
  const focusOwner = ownerOf(focused.id)!;
  const attacking = canAct && tab === "attack";
  const loaded = canAct ? active.soldiers.filter(canShoot) : [];
  const developable = active.soldiers.filter(canDevelop);
  // If nothing can develop, any surviving soldier may still open the notebook (a wasted turn).
  const devOptions = developable.length ? developable : active.soldiers.filter(alive);
  const lastNotebook = useMemo(() => game.history.findLast((e) => e.kind === "notebook"), [game.history.length, game.id]);

  // New turn: reset choices and focus the acting squad.
  useEffect(() => {
    setAttack({});
    setTab("develop");
    setLucky(undefined);
    setOpening(false);
    setPlayerTab(active.id);
    const mine = canAct ? active : viewer;
    const best = mine && developmentTarget(mine, picked.current[mine.id]);
    setDevSoldier(canAct ? best?.id : undefined);
    if (best) setFocus(best.id);
    if (canAct && mode === "online") sound("turn");
  }, [game.turn, game.id]);
  useEffect(() => setOpening(false), [game.revision]);
  useEffect(() => {
    if (!busy && opening) later(() => setOpening(false), 400);
  }, [busy]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Turn fresh history events into notebook playback, sounds and short-lived effects.
  useEffect(() => {
    const lastId = game.history.at(-1)?.id ?? 0;
    if (seen.current.game !== game.id) {
      const resumed = game.history.length > 3;
      seen.current = { game: game.id, id: resumed ? lastId : 0 };
      if (resumed) return;
    }
    const fresh = game.history.filter((e) => e.id > seen.current.id);
    seen.current.id = lastId;
    for (const e of fresh) {
      if (e.kind === "notebook") playNotebook(e);
      else if (e.kind === "shot") {
        sound("fire");
        later(() => sound("hit"), motion ? 320 : 40);
        if (e.soldierId && e.targetSoldierId) animateShot(e.soldierId, e.targetSoldierId);
      } else if (e.kind === "defeat") later(() => sound("defeat"), 450);
      else if (e.kind === "end") later(() => sound("win"), 900);
    }
  }, [game.history.length, game.id]);

  function playNotebook(e: GameEvent) {
    setFreshNotebook(e.id);
    const unlocked = e.match && (e.part || e.reload);
    const announce = (delay: number) => {
      if (!e.part || !e.soldierId) return;
      const key = e.id;
      later(() => setUnlocked({ soldierId: e.soldierId!, part: e.part!, key }), delay);
      later(() => setUnlocked((u) => (u?.key === key ? null : u)), delay + 2400);
    };
    if (!motion) {
      announce(0);
      announceComplete(e, 0);
      sound(e.match ? "match" : "miss");
      if (unlocked) later(() => sound(e.part === "bullets" || e.reload ? "load" : "unlock"), 250);
      return;
    }
    if (e.part && e.soldierId) {
      announce(0);
    }
    if (e.soldierId && ownerOf(e.soldierId)) later(() => setFocus((f) => (canAct ? f : e.soldierId!)), 0);
    announceComplete(e, motion ? 1900 : 0);
    sound("open");
    later(() => sound("flip"), 260);
    later(() => sound(e.match ? "match" : "miss"), 1450);
    if (unlocked) later(() => sound(e.part === "bullets" || e.reload ? "load" : "unlock"), 1750);
  }

  function announceComplete(e: GameEvent, delay: number) {
    const s = findSoldier(e.soldierId), owner = s && ownerOf(s.id);
    if (!e.part || !s || !owner || nextPart(s)) return;
    const next = developmentTarget(owner);
    const who = owner.id === viewerId && mode !== "local" ? "" : `${owner.name.toUpperCase()}: `;
    const text = `${who}SOLDIER ${soldierNumber(s)} COMPLETE! ${next && next.id !== s.id && nextPart(next) ? `NEXT: SOLDIER ${soldierNumber(next)}` : "SQUAD FULLY DEVELOPED!"}`;
    const key = e.id;
    later(() => setComplete({ key, text }), delay);
    later(() => setComplete((c) => (c?.key === key ? null : c)), delay + 3200);
  }

  function animateShot(from: string, to: string) {
    const flash = (patch: Record<string, SoldierFx>, ms: number) => {
      setFx((f) => ({ ...f, ...patch }));
      later(
        () =>
          setFx((f) => {
            const next = { ...f };
            for (const k of Object.keys(patch)) delete next[k];
            return next;
          }),
        ms,
      );
    };
    flash({ [from]: "firing" }, 420);
    if (!motion) return flash({ [to]: "hit" }, 500);
    const a = document.querySelector(`[data-soldier="${CSS.escape(from)}"]`)?.getBoundingClientRect();
    const b = document.querySelector(`[data-soldier="${CSS.escape(to)}"]`)?.getBoundingClientRect();
    if (a && b) {
      setShot({ key: Date.now(), x1: a.x + a.width * 0.85, y1: a.y + a.height * 0.5, x2: b.x + b.width / 2, y2: b.y + b.height * 0.45 });
      later(() => setShot(null), 700);
    }
    later(() => flash({ [to]: "hit" }, 600), 330);
  }

  function clickSoldier(owner: Player, s: SoldierState) {
    setFocus(s.id);
    if (!canAct) return;
    if (tab === "develop" && owner.id === active.id && devOptions.includes(s)) {
      setDevSoldier(s.id);
      picked.current[owner.id] = s.id;
      sound("click");
    } else if (tab === "attack") {
      if (owner.id === active.id && canShoot(s)) setAttack((a) => ({ ...a, shooter: s.id }));
      else if (owner.id !== active.id && alive(owner) && alive(s)) setAttack((a) => ({ ...a, targetPlayer: owner.id, targetSoldier: s.id, part: undefined }));
    }
  }
  function switchTab(next: "develop" | "attack") {
    sound("click");
    setTab(next);
    if (next === "attack") {
      const only = loaded.length === 1 ? loaded[0].id : undefined;
      setAttack({ shooter: only });
      if (only) setFocus(only);
    } else if (devSoldier) setFocus(devSoldier);
  }
  function openNotebook() {
    if (!devSoldier || !lucky || opening) return;
    setOpening(true);
    sound("open");
    onAction({ type: "notebook", soldierId: devSoldier, guess: lucky });
  }
  const fireReady = !!(attack.shooter && attack.targetPlayer && attack.targetSoldier && attack.part);
  const step = !attack.shooter ? 1 : !attack.targetSoldier ? 2 : !attack.part ? 3 : 4;
  const targeting = attacking && attack.targetSoldier === focused.id;
  const winners = game.status === "finished" ? new Set(game.winnerIds) : null;
  const seconds = Math.max(0, Math.ceil((game.deadline - now) / 1000));
  const nbActor = lastNotebook && game.players.find((p) => p.id === lastNotebook.actor);
  const nbSoldier = findSoldier(lastNotebook?.soldierId);
  const dev = findSoldier(devSoldier);

  const soldierClass = (owner: Player, s: SoldierState) => {
    const c = ["squad-slot"];
    if (s.id === focus) c.push("focused");
    if (!alive(s)) c.push("down");
    if (canAct && tab === "develop" && owner.id === active.id) c.push(s.id === devSoldier ? "is-dev" : devOptions.includes(s) ? "pickable" : "ineligible");
    if (attacking && owner.id === active.id && canShoot(s) && !attack.shooter) c.push("pickable");
    if (attacking && owner.id !== active.id && alive(s)) c.push("targetable");
    if (attacking && attack.shooter === s.id) c.push("is-shooter");
    if (attacking && attack.targetSoldier === s.id) c.push("is-target");
    return c.join(" ");
  };
  const nbModal = findSoldier(notebookFor || undefined);
  const nbModalOwner = nbModal && ownerOf(nbModal.id);

  return (
    <div className={`arena ${attacking ? "attack-mode" : ""}`}>
      <nav className="player-tabs" aria-label="Jump to a player">
        {game.players.map((p, i) => (
          <button
            key={p.id}
            className={`${p.id === playerTab ? "current" : ""} ${i === game.active && game.status === "playing" ? "turn" : ""} ${!alive(p) ? "out" : ""}`}
            style={{ "--team": TEAM_COLORS[i] } as CSSProperties}
            onClick={() => {
              setPlayerTab(p.id);
              cards.current?.querySelector(`[data-player="${CSS.escape(p.id)}"]`)?.scrollIntoView({ behavior: motion ? "smooth" : "auto", inline: "center", block: "nearest" });
            }}
          >
            <Avatar src={p.avatar} color={TEAM_COLORS[i]} size={24} />
            <span>{p.name}</span>
            <small>{survivors(p)}/4</small>
          </button>
        ))}
      </nav>
      <div className="arena-layout">
        <div className="squads-grid" ref={cards}>
          {game.players.map((p, i) => {
            const isTurn = i === game.active && game.status === "playing";
            const win = winners?.has(p.id);
            return (
              <article key={p.id} data-player={p.id} className={`squad-card ${isTurn ? "active" : ""} ${!alive(p) ? "eliminated" : ""} ${win ? "winner" : ""}`} style={{ "--team": TEAM_COLORS[i] } as CSSProperties}>
                <header className="squad-header">
                  <Avatar src={p.avatar} color={TEAM_COLORS[i]} size={42} label={`${p.name}'s photo`} />
                  <div className="squad-name">
                    <strong>
                      {p.name} {p.id === viewerId && mode !== "local" && <small>(you)</small>}
                    </strong>
                    <span>{!alive(p) ? "SQUAD ELIMINATED" : win ? "VICTORIOUS" : p.bot ? "BOT COMMANDER" : mode === "online" && !p.connected ? "RECONNECTING…" : isTurn ? "COMMANDING" : "COMMANDER"}</span>
                  </div>
                  <div className="squad-stats">
                    <b>
                      {p.score}
                      <small>PTS</small>
                    </b>
                    <span className="survivor-count" title={`${survivors(p)} of 4 soldiers standing`}>
                      <Icon name="shield" size={13} /> {survivors(p)}/4
                    </span>
                  </div>
                </header>
                {isTurn && <span className="turn-ribbon">{p.bot ? "THINKING…" : "YOUR MOVE"}</span>}
                <div className="squad-row">
                  {p.soldiers.map((raw) => {
                    const s = raw;
                    return (
                      <div className="slot-wrap" key={s.id}>
                        <button data-soldier={s.id} className={soldierClass(p, raw)} onClick={() => clickSoldier(p, raw)} aria-pressed={s.id === focus} aria-label={`${p.name}'s soldier ${soldierNumber(s)}, ${s.role}. ${progress(s)} of 5 developed. ${soldierStatus(s)}`}>
                          <Soldier soldier={s} avatar={p.avatar} color={TEAM_COLORS[i]} fx={win && alive(s) ? "celebrate" : fx[s.id]} highlight={unlocked?.soldierId === s.id ? unlocked.part : undefined} />
                          {unlocked?.soldierId === s.id && (
                            <span key={unlocked.key} className="unlock-callout" role="status">
                              {PART_LABELS[unlocked.part].toUpperCase()} UNLOCKED!
                            </span>
                          )}
                          <span className="slot-bar" aria-hidden="true">
                            {PARTS.map((n) => (
                              <i key={n} className={s.parts[n]} />
                            ))}
                          </span>
                          <span className="slot-meta">
                            <span>{s.role}</span>
                          </span>
                          {s.parts.bullets === "completed" && (
                            <span className="slot-ammo" aria-hidden="true">
                              {[0, 1, 2].map((n) => (
                                <i key={n} className={n < s.ammo ? "full" : ""} />
                              ))}
                            </span>
                          )}
                        </button>
                        <button className="slot-notebook" title={`Open ${s.role}'s notebook`} aria-label={`Open ${p.name}'s ${s.role} development notebook`} onClick={() => setNotebookFor(s.id)}>
                          <Icon name="book" size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="command-column">
          {game.status === "playing" ? (
            <section className={`command-panel ${canAct ? "my-turn" : ""}`} style={{ "--team": colorOf(active.id) } as CSSProperties}>
              <div className="command-top">
                <Avatar src={active.avatar} color={colorOf(active.id)} size={44} />
                <div>
                  <span className="eyebrow">{canAct ? "YOUR COMMAND" : active.bot ? "BOT IS PLANNING" : "STAND BY"}</span>
                  <h2>{canAct ? `${active.name}, your move` : `${active.name}’s turn`}</h2>
                </div>
                {mode === "online" && (
                  <div className={`turn-clock ${seconds <= 5 ? "urgent" : ""}`} aria-label={`${seconds} seconds left`}>
                    <Icon name="clock" size={16} />
                    {seconds}
                  </div>
                )}
              </div>
              <Notebook
                event={lastNotebook}
                actor={nbActor?.name}
                soldier={nbSoldier && `${nbSoldier.role} Soldier`}
                color={nbActor ? colorOf(nbActor.id) : undefined}
                animate={motion && lastNotebook?.id === freshNotebook}
                waiting={opening}
              />
              {complete && (
                <div key={complete.key} className="complete-banner" role="status">
                  {complete.text}
                </div>
              )}
              {canAct && (
                <div className="command-body">
                  {tab === "develop" ? (
                    <>
                      {dev && (
                        <div className="dev-current">
                          <div>
                            <span className="eyebrow">DEVELOPING</span>
                            <b>
                              SOLDIER {soldierNumber(dev)} · {dev.role.toUpperCase()}
                            </b>
                            <small>
                              {progress(dev)}/5 built · NEXT: <b>{canReload(dev) ? "RELOAD" : nextPart(dev) ? PART_LABELS[nextPart(dev)!].toUpperCase() : "—"}</b>
                            </small>
                          </div>
                          {devOptions.length > 1 && (
                            <button
                              className="text-button"
                              title="Develop a different soldier (or tap one in your squad)"
                              onClick={() => clickSoldier(active, devOptions[(devOptions.indexOf(dev) + 1) % devOptions.length])}
                            >
                              Switch
                            </button>
                          )}
                        </div>
                      )}
                      <div className="lucky-row" role="radiogroup" aria-label="Lucky number">
                        {LUCKY_NUMBERS.map((n) => (
                          <button
                            key={n}
                            role="radio"
                            aria-checked={lucky === n}
                            className={lucky === n ? "on" : ""}
                            onClick={() => {
                              setLucky(n);
                              sound("click");
                            }}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <button className="button primary open-notebook" disabled={!dev || !lucky || busy || opening} onClick={openNotebook}>
                        <Icon name="book" /> {opening ? "OPENING…" : lucky ? "OPEN NOTEBOOK" : "PICK A LUCKY NUMBER"}
                      </button>
                      {loaded.length > 0 && (
                        <button className="button danger attack-button" disabled={busy || opening} onClick={() => switchTab("attack")}>
                          <Icon name="target" /> ATTACK
                        </button>
                      )}
                      <p className={`hint ${dev?.assist ? "assist" : ""}`}>
                        {dev?.assist ? "GUARANTEED MATCH this turn!" : "50% chance to match. Miss, and your next try with this soldier is guaranteed."}
                      </p>
                    </>
                  ) : (
                    <>
                      <ol className="attack-steps">
                        <li className={step > 1 ? "done" : "now"}>
                          <b>1</b> Shooter{attack.shooter && <em>{findSoldier(attack.shooter)?.role}</em>}
                        </li>
                        <li className={step > 2 ? "done" : step === 2 ? "now" : ""}>
                          <b>2</b> Target
                          {attack.targetSoldier && (
                            <em>
                              {ownerOf(attack.targetSoldier)?.name} · {findSoldier(attack.targetSoldier)?.role}
                            </em>
                          )}
                        </li>
                        <li className={step > 3 ? "done" : step === 3 ? "now" : ""}>
                          <b>3</b> Body part{attack.part && <em>{PART_LABELS[attack.part]}</em>}
                        </li>
                      </ol>
                      <p className="hint">
                        {step === 1 ? "Tap one of your loaded soldiers." : step === 2 ? "Tap any surviving enemy soldier." : step === 3 ? "Pick the body part to knock out in the target’s tracker." : "Locked on. Fire when ready!"}
                      </p>
                      <div className="command-actions">
                        <button
                          className="button danger"
                          disabled={!fireReady || busy}
                          onClick={() => fireReady && onAction({ type: "attack", soldierId: attack.shooter!, target: attack.targetPlayer!, targetSoldierId: attack.targetSoldier!, part: attack.part! })}
                        >
                          <Icon name="target" /> Fire · 1 bullet
                        </button>
                        <button className="button ghost" onClick={() => switchTab("develop")}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {!canAct && <p className="hint waiting-hint">{mode === "online" ? "The arena updates live. Plan your next move." : "Watch the battle and plan ahead."}</p>}
            </section>
          ) : (
            <section className="victory-panel" style={{ "--team": colorOf(game.winnerIds[0] || "") } as CSSProperties}>
              {motion && (
                <div className="confetti" aria-hidden="true">
                  {Array.from({ length: 18 }, (_, i) => (
                    <i key={i} style={{ "--i": i } as CSSProperties} />
                  ))}
                </div>
              )}
              <Icon name="trophy" size={44} />
              <span className="eyebrow">{game.winnerIds.length > 1 ? "SHARED VICTORY" : "LAST SQUAD STANDING"}</span>
              <h2>
                {game.players.filter((p) => winners!.has(p.id)).map((p) => p.name).join(" & ")}{" "}
                {game.winnerIds.length > 1 || (game.winnerIds[0] === viewerId && viewer?.name === "You") ? "win!" : "wins!"}
              </h2>
              <div className="victory-faces">
                {game.players
                  .filter((p) => winners!.has(p.id))
                  .map((p) => (
                    <Avatar key={p.id} src={p.avatar} color={colorOf(p.id)} size={64} />
                  ))}
              </div>
              <p>{game.endReason}</p>
              <div className="victory-actions">
                <button className="button primary" disabled={mode === "online" && (!host || busy)} onClick={onRematch}>
                  Rematch <Icon name="arrow" />
                </button>
                <button className="button secondary" onClick={onStandings}>
                  Standings & history
                </button>
                <button className="button ghost" onClick={onPlayAgain}>
                  New match
                </button>
                <button className="button ghost" onClick={onMenu}>
                  Main menu
                </button>
              </div>
              {mode === "online" && !host && <small>Waiting for the host to start a rematch.</small>}
            </section>
          )}

          <section className={`focus-panel ${targeting ? "targeting" : ""}`} style={{ "--team": colorOf(focusOwner.id) } as CSSProperties}>
            <header>
              <div>
                <span className="eyebrow">
                  {focusOwner.name.toUpperCase()} · SOLDIER {soldierNumber(focused)}
                </span>
                <h3>{focused.role} Soldier</h3>
              </div>
              <span className={`status-chip ${!alive(focused) ? "down" : canShoot(focused) ? "armed" : ""}`}>{soldierStatus(focused)}</span>
            </header>
            <div className="focus-body">
              <div className="focus-stage">
                <Soldier soldier={focused} avatar={focusOwner.avatar} color={colorOf(focusOwner.id)} fx={winners?.has(focusOwner.id) && alive(focused) ? "celebrate" : fx[focused.id]} highlight={unlocked?.soldierId === focused.id ? unlocked.part : undefined} hero />
                {unlocked?.soldierId === focused.id && (
                  <span key={unlocked.key} className="unlock-callout big">
                    MATCH FOUND! <b>{PART_LABELS[unlocked.part].toUpperCase()} UNLOCKED!</b>
                  </span>
                )}
              </div>
              <div className="focus-notes">
                <span className="tracker-title">
                  <Icon name="book" size={14} /> {targeting ? "PICK A BODY PART" : `SOLDIER ${soldierNumber(focused)} — DEVELOPMENT`}
                </span>
                <Tracker
                  s={focused}
                  pick={targeting}
                  chosen={targeting ? attack.part : undefined}
                  fresh={unlocked?.soldierId === focused.id ? unlocked.part : undefined}
                  onPick={(part) => {
                    sound("click");
                    setAttack((a) => ({ ...a, part }));
                  }}
                />
                <NextUnlock s={focused} />
                <div className="focus-ammo">
                  <span>AMMO</span>
                  {[0, 1, 2].map((n) => (
                    <i key={n} className={n < focused.ammo ? "full" : focused.parts.bullets === "eliminated" ? "gone" : ""} />
                  ))}
                </div>
                <button className="text-button" onClick={() => setNotebookFor(focused.id)}>
                  <Icon name="book" size={15} /> Open soldier notebook
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
      {shot && (
        <svg key={shot.key} className="shot-overlay" aria-hidden="true">
          <line className="bullet-trail" x1={shot.x1} y1={shot.y1} x2={shot.x2} y2={shot.y2} />
          <g>
            <animateMotion dur=".32s" fill="freeze" rotate="auto" path={`M${shot.x1},${shot.y1} L${shot.x2},${shot.y2}`} />
            <rect x="-10" y="-4" width="20" height="8" rx="4" fill="#FCE34D" stroke="#E86A33" strokeWidth="2" />
          </g>
          <circle className="hit-ring" cx={shot.x2} cy={shot.y2} r="28" />
        </svg>
      )}
      {nbModal && nbModalOwner && (
        <Modal title={`${nbModalOwner.name}’s ${nbModal.role} Soldier`} onClose={() => setNotebookFor(null)} wide>
          <SoldierNotebook game={game} soldier={nbModal} owner={nbModalOwner} color={colorOf(nbModalOwner.id)} />
        </Modal>
      )}
    </div>
  );
}

/** A soldier's personal notebook: tracker, latest opening and full progress history. */
function SoldierNotebook({ game, soldier, owner, color }: { game: Game; soldier: SoldierState; owner: Player; color: string }) {
  const history = game.history.filter((e) => (e.kind === "notebook" && e.soldierId === soldier.id) || ((e.kind === "shot" || e.kind === "defeat") && e.targetSoldierId === soldier.id));
  const last = history.findLast((e) => e.kind === "notebook");
  const next = nextPart(soldier);
  const name = (id?: string) => game.players.find((p) => p.id === id)?.name || "Someone";
  return (
    <div className="soldier-notebook" style={{ "--team": color } as CSSProperties}>
      <div className="sn-paper">
        <div className="sn-top">
          <div className="sn-art">
            <Soldier soldier={soldier} avatar={owner.avatar} color={color} hero />
          </div>
          <div>
            <span className="eyebrow">
              SOLDIER {soldierNumber(soldier)} · {soldier.role.toUpperCase()}
            </span>
            <h3>Development notebook</h3>
            <Tracker s={soldier} />
            <NextUnlock s={soldier} />
            {last ? (
              <p className={`sn-line sn-last ${last.match ? "ok" : "no"}`}>
                <b>Last opening:</b> lucky {last.guess} · page {last.page} → {last.digit} · {last.match ? "MATCH" : "NO MATCH"}
              </p>
            ) : (
              <p className="sn-line muted">No notebook openings yet.</p>
            )}
          </div>
        </div>
        <h4>Progress history</h4>
        {history.length ? (
          <ol className="sn-history">
            {history
              .slice()
              .reverse()
              .map((e) => (
                <li key={e.id} className={e.kind === "notebook" ? (e.match ? "ok" : "no") : "hit"}>
                  <span>T{e.turn}</span>
                  {e.kind === "notebook" ? (
                    <p>
                      Lucky <b>{e.guess}</b> · page <b>{e.page}</b> → <b>{e.digit}</b> · {e.match ? (e.part ? `MATCH — ${PART_LABELS[e.part]} unlocked` : e.reload ? "MATCH — reloaded" : "MATCH") : "no match"}
                    </p>
                  ) : e.kind === "shot" ? (
                    <p>
                      Hit by {name(e.actor)}: <b>{e.part && PART_LABELS[e.part]}</b> destroyed
                    </p>
                  ) : (
                    <p>Defeated by {name(e.actor)}</p>
                  )}
                </li>
              ))}
          </ol>
        ) : (
          <p className="muted">Nothing has happened to this soldier yet.</p>
        )}
      </div>
    </div>
  );
}
