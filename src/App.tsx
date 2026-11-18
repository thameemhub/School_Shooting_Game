import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { act, normalizeSettings, ranking, startGame } from "../shared/engine";
import { alive, completed, createPlayer, survivors } from "../shared/character";
import { botAction } from "../shared/bots";
import { newId } from "../shared/id";
import { NOTEBOOK_ANIMATION_MS, PARTS, PART_LABELS, type Action, type Game, type Room } from "../shared/types";
import Icon from "./components/Icon";
import Soldier, { Avatar } from "./components/Soldier";
import Arena, { TEAM_COLORS } from "./components/Arena";
import Modal from "./components/Modal";
import Introduction from "./components/Introduction";
import PhotoEditor from "./components/PhotoEditor";
import { DEFAULT_PREFERENCES, RuleFields, type Preferences } from "./components/Settings";
import { command, getSocket } from "./network";
import { audio, sound } from "./sound";

const BOT_NAMES = ["Sgt. Sprocket", "Captain Bolt", "Major Gizmo", "Private Pixel", "Corporal Chip"];
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browser storage may be unavailable or full. */
  }
}
// Matches saved before the squad upgrade have a different shape; ignore them safely.
const isSquadGame = (g: unknown): g is Game =>
  !!g && (g as Game).schema === 3 && Array.isArray((g as Game).players) && (g as Game).players.every((p) => Array.isArray(p.soldiers) && p.soldiers.length === 4);
// History is kept without photos: smaller storage and no lingering copies of faces.
const withoutPhotos = (g: Game): Game => ({ ...g, players: g.players.map((p) => ({ ...p, avatar: undefined })) });
const demoSquad = () => {
  const p = createPlayer("demo", "Demo");
  p.soldiers.forEach((s) => {
    PARTS.forEach((n) => (s.parts[n] = "completed"));
    s.ammo = 3;
  });
  return p;
};

function Toggle({ label, icon, on, onChange }: { label: string; icon: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="toggle-row" onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span>
        <Icon name={icon} />
        {label}
      </span>
      <i className={on ? "on" : ""} />
    </button>
  );
}
function Volume({ label, value, disabled, onChange }: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className="volume-row">
      <span>
        {label} <b>{value}%</b>
      </span>
      <input type="range" min="0" max="100" step="5" value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} style={{ "--fill": `${value}%` } as CSSProperties} />
    </label>
  );
}

export default function App() {
  const [prefs, setPrefs] = useState<Preferences>(() => {
    const stored = read<Partial<Preferences>>("showdown-preferences", {});
    return { ...DEFAULT_PREFERENCES, ...stored, rules: normalizeSettings(stored.rules) };
  });
  const [mode, setMode] = useState<"home" | "solo" | "local" | "online">("home");
  const [setup, setSetup] = useState<null | "solo" | "local" | "create" | "join" | "quick">(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const introContinuation=useRef<(() => void) | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [past, setPast] = useState<Game[]>(() => read<unknown[]>("showdown-history", []).filter(isSquadGame));
  const [viewPast, setViewPast] = useState<Game | null>(null);
  const [offline, setOffline] = useState<Game | null>(null);
  const [resumeOffline, setResumeOffline] = useState<{ game: Game; mode: "solo" | "local" } | null>(() => {
    const saved = read<{ game: unknown; mode: "solo" | "local" } | null>("showdown-offline", null);
    return saved && isSquadGame(saved.game) ? (saved as { game: Game; mode: "solo" | "local" }) : null;
  });
  const [room, setRoom] = useState<Room | null>(null);
  const [myId, setMyId] = useState("");
  const [connected, setConnected] = useState(false);
  const [code, setCode] = useState("");
  const [localPlayers, setLocalPlayers] = useState<{ name: string; avatar?: string }[]>([{ name: "Player 1" }, { name: "Player 2" }]);
  const [photoFor, setPhotoFor] = useState<null | "me" | number>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [logOpen, setLogOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const game = mode === "online" ? room?.game : offline;
  const active = game?.players[game.active];
  const canAct = !!game && game.status === "playing" && !active?.bot && (mode !== "online" || (active?.id === myId && connected));
  const token = useRef<string | null>(sessionStorage.getItem("showdown-token"));
  const pendingOffline = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    save("showdown-preferences", prefs);
    document.documentElement.dataset.theme = prefs.dark ? "dark" : "light";
    document.documentElement.dataset.motion = prefs.motion ? "full" : "reduced";
    audio.configure({ music: prefs.music, musicVolume: prefs.musicVolume, sfx: prefs.sound, sfxVolume: prefs.sfxVolume });
  }, [prefs]);
  // One continuous soundtrack: screens only change its intensity, never restart it.
  useEffect(() => audio.setScene(mode !== "home" && game ? "battle" : "menu"), [mode, !!game]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const s = getSocket();
    const resume = async () => {
      setConnected(true);
      if (token.current) {
        const resumingToken = token.current;
        try {
          const r = await command({ type: "resume", token: resumingToken });
          if (token.current !== resumingToken) return;
          setRoom(r.room!);
          setMyId(r.playerId!);
          setMode("online");
        } catch (e) {
          if (token.current !== resumingToken) return;
          setError((e as Error).message);
          token.current = null;
          sessionStorage.removeItem("showdown-token");
          setRoom(null);
          setMode("home");
        }
      }
    };
    s.on("connect", resume);
    s.on("disconnect", () => setConnected(false));
    s.on("state", (r: Room) => setRoom(r));
    s.on("replaced", () => {
      token.current = null;
      sessionStorage.removeItem("showdown-token");
      setRoom(null);
      setMode("home");
      setError("This seat was resumed in another tab.");
    });
    if (token.current) s.connect();
    return () => {
      s.off("connect");
      s.off("disconnect");
      s.off("state");
      s.off("replaced");
    };
  }, []);
  useEffect(() => {
    if (offline && mode !== "online" && mode !== "home") {
      const data = { game: offline, mode: mode as "solo" | "local" };
      save("showdown-offline", data);
      setResumeOffline(data);
    }
  }, [offline, mode]);
  useEffect(() => {
    if (!game || game.status !== "finished") return;
    setPast((old) => {
      if (old.some((g) => g.id === game.id)) return old;
      const next = [withoutPhotos(game), ...old].slice(0, 15);
      save("showdown-history", next);
      return next;
    });
  }, [game?.id, game?.status]);
  useEffect(() => {
    if (!offline || mode === "online" || mode === "home" || offline.status !== "playing" || !offline.players[offline.active].bot) return;
    const timer = setTimeout(
      () => setOffline((g) => (g && g.status === "playing" && g.players[g.active].bot ? act(g, g.players[g.active].id, botAction(g)) : g)),
      // Give everyone time to watch the notebook opening before the next bot moves.
      prefs.motion ? Math.max(offline.settings.botDelay, offline.history.at(-1)?.kind === "notebook" ? NOTEBOOK_ANIMATION_MS : 0) : 200,
    );
    return () => clearTimeout(timer);
  }, [offline, mode, prefs.motion]);
  useEffect(() => () => clearTimeout(pendingOffline.current), []);

  function finishIntro() {
    save("squad-intro-seen",true);setHelp(false);
    const next=introContinuation.current;introContinuation.current=null;next?.();
  }
  useEffect(()=>{
    if(mode==="online" && room && !room.game && !read("squad-intro-seen",false))setHelp(true);
  },[mode,room?.code]);

  async function send(data: object) {
    setBusy(true);
    setError("");
    try {
      await command(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function begin(afterIntro=false) {
    if (!afterIntro && !read("squad-intro-seen",false)) {
      introContinuation.current=()=>void begin(true);setHelp(true);return;
    }
    setError("");
    if (setup === "solo" || setup === "local") {
      abandonOnlineResume();
      const players =
        setup === "solo"
          ? [createPlayer(newId(), prefs.name || "You", false, prefs.avatar), ...Array.from({ length: prefs.botCount }, (_, i) => createPlayer(newId(), BOT_NAMES[i], true))]
          : localPlayers.map((p, i) => createPlayer(newId(), p.name || `Player ${i + 1}`, false, p.avatar));
      setOffline(startGame(players, normalizeSettings(prefs.rules)));
      setMode(setup);
      setSetup(null);
      return;
    }
    if (!prefs.name.trim()) {
      setError("Give your commander a nickname first.");
      return;
    }
    setBusy(true);
    try {
      const s = getSocket();
      if (!s.connected)
        await new Promise<void>((resolve, reject) => {
          const ok = () => {
            clearTimeout(timer);
            s.off("connect_error", fail);
            resolve();
          };
          const fail = () => {
            clearTimeout(timer);
            s.off("connect", ok);
            reject(new Error("Cannot reach the game server. Solo and local modes are still available."));
          };
          const timer = setTimeout(fail, 7000);
          s.once("connect", ok);
          s.once("connect_error", fail);
          s.connect();
        });
      const r = await command({ type: setup, name: prefs.name, code, settings: normalizeSettings(prefs.rules), avatar: prefs.avatar });
      token.current = r.token!;
      sessionStorage.setItem("showdown-token", r.token!);
      setRoom(r.room!);
      setMyId(r.playerId!);
      setMode("online");
      setSetup(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function abandonOnlineResume() {
    token.current = null;
    sessionStorage.removeItem("showdown-token");
    getSocket().disconnect();
    setRoom(null);
  }
  function move(action: Action) {
    if (!canAct || busy || !game) return;
    setError("");
    // Online, the server opens the page; offline the same engine runs locally.
    if (mode === "online") void send({ type: "action", action, revision: game.revision });
    else {
      try {
        setOffline(act(game, game.players[game.active].id, action));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }
  async function leave() {
    clearTimeout(pendingOffline.current);
    if (mode === "online") {
      try {
        await command({ type: "leave" });
      } catch {
        /* Reconnection token is intentionally discarded on leave. */
      }
      token.current = null;
      sessionStorage.removeItem("showdown-token");
      getSocket().disconnect();
      setRoom(null);
    }
    setMode("home");
    setOffline(null);
    setLeaveOpen(false);
    setError("");
  }
  async function savePhoto(photo?: string) {
    if (photoFor === "me") {
      // Online: the server re-encodes and shares the crop with your room only.
      if (mode === "online" && room) await command({ type: "profile", avatar: photo });
      const old = prefs.avatar;
      setPrefs((p) => ({ ...p, avatar: photo }));
      if (!photo && old) {
        // Also forget the face in this device's saved offline match.
        const strip = (g: Game): Game => ({ ...g, players: g.players.map((p) => (p.avatar === old ? { ...p, avatar: undefined } : p)) });
        setOffline((g) => (g ? strip(g) : g));
        setResumeOffline((r) => {
          const next = r ? { ...r, game: strip(r.game) } : r;
          save("showdown-offline", next);
          return next;
        });
      } else if (photo && offline && mode === "solo") setOffline((g) => g && { ...g, players: g.players.map((p) => (!p.bot ? { ...p, avatar: photo } : p)) });
    } else if (typeof photoFor === "number") {
      setLocalPlayers((list) => list.map((p, i) => (i === photoFor ? { ...p, avatar: photo } : p)));
    }
  }
  const setRule = (rules: Preferences["rules"]) => setPrefs((p) => ({ ...p, rules }));
  const host = room?.hostId === myId;
  const demo = demoSquad();
  const me = room?.players.find((p) => p.id === myId);

  const photoButton = (label = "Squad photo") => (
    <div className="photo-row">
      <Avatar src={prefs.avatar} size={56} />
      <div>
        <strong>{label}</strong>
        <small>{prefs.avatar ? "Your face is on all four soldiers." : "Add your face to every soldier helmet."}</small>
      </div>
      <button type="button" className="button secondary small" onClick={() => setPhotoFor("me")}>
        <Icon name="camera" size={16} /> {prefs.avatar ? "Change photo" : "Upload your photo"}
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => mode !== "home" && setLeaveOpen(true)} aria-label="Squad Showdown home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40">
              <path d="M6 24q0-18 14-18t14 18l-5 3-1-6H12l-1 6z" fill="#3F51B5" stroke="#22305A" strokeWidth="2.2" strokeLinejoin="round" />
              <path d="M5 22q15-6 30 0v4q-15-5-30 0z" fill="#FCE34D" stroke="#22305A" strokeWidth="2" strokeLinejoin="round" />
              <path d="m17 13 3-3 3 3-3 3z" fill="#FCE34D" />
            </svg>
          </span>
          <span className="brand-text">
            SQUAD<span>SHOWDOWN</span>
          </span>
        </button>
        <nav>
          <button className="text-button how-button" onClick={() => setHelp(true)}>
            How to play
          </button>
          <button className="icon-button" title={prefs.music ? "Mute music" : "Play music"} aria-label={prefs.music ? "Mute music" : "Play music"} onClick={() => setPrefs({ ...prefs, music: !prefs.music })}>
            <Icon name={prefs.music ? "music" : "music-off"} />
          </button>
          <button className="icon-button" title={prefs.sound ? "Mute sound effects" : "Enable sound effects"} aria-label={prefs.sound ? "Mute sound effects" : "Enable sound effects"} onClick={() => setPrefs({ ...prefs, sound: !prefs.sound })}>
            <Icon name={prefs.sound ? "sound" : "mute"} />
          </button>
          <button className="icon-button profile-button" title="Profile & settings" aria-label="Profile and settings" onClick={() => setSettingsOpen(true)}>
            <Avatar src={prefs.avatar} size={30} />
          </button>
        </nav>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}>
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {mode === "home" && (
        <main className="home">
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow pill-eyebrow">★ 6 COMMANDERS · 24 SOLDIERS</span>
              <h1>
                Build your squad.
                <br />
                <span className="hl">Outsmart the book.</span>
              </h1>
              <p>Pick a soldier, call your lucky number, open the notebook. Match the page’s last digit to build your squad piece by piece, then line up the perfect shot. Last squad standing wins.</p>
              <div className="hero-cta">
                <button className="button primary big" onClick={() => setSetup("solo")}>
                  Play solo <Icon name="arrow" />
                </button>
                <button className="button secondary big" onClick={() => setSetup("create")}>
                  <Icon name="users" /> Play with friends
                </button>
              </div>
              <div className="hero-meta">
                <span><Icon name="users" size={17} /> 2–6 players</span>
                <span><Icon name="globe" size={17} /> Online & offline</span>
                <span><Icon name="camera" size={17} /> Your face on your squad</span>
              </div>
            </div>
            <div className="hero-art">
              <div className="hero-sky" aria-hidden="true">
                <i className="cloud c1" />
                <i className="cloud c2" />
                <i className="cloud c3" />
              </div>
              <div className="hero-squad">
                {demo.soldiers.map((s, i) => (
                  <div key={s.id} className={`hero-member m${i}`}>
                    <Soldier soldier={s} avatar={prefs.avatar} color={TEAM_COLORS[0]} hero />
                    <span>{s.role}</span>
                  </div>
                ))}
              </div>
              <button className="hero-photo" onClick={() => setPhotoFor("me")}>
                <Icon name="camera" size={16} /> {prefs.avatar ? "Change your squad photo" : "UPLOAD YOUR PHOTO"}
              </button>
            </div>
          </section>
          <section className="play-section">
            <div className="section-title">
              <div>
                <span className="eyebrow">CHOOSE YOUR BATTLEFIELD</span>
                <h2>How will you deploy?</h2>
              </div>
              <button className="text-button" onClick={() => setHistoryOpen(true)}>
                <Icon name="history" size={17} /> Game history
              </button>
            </div>
            <div className="mode-grid">
              {(
                [
                  { type: "create", icon: "users", tag: "PRIVATE ROOM", title: "Play with friends", desc: "Share a six-letter code. Up to six squads in one room.", cta: "Create room", tone: "indigo" },
                  { type: "quick", icon: "globe", tag: "MATCHMAKING", title: "Play online", desc: "Jump into a public lobby and meet new rivals.", cta: "Quick match", tone: "sky" },
                  { type: "solo", icon: "bot", tag: "OFFLINE", title: "Solo vs bots", desc: "Take on up to five bot commanders with their own squads.", cta: "Play solo", tone: "yellow" },
                  { type: "local", icon: "users", tag: "PASS & PLAY", title: "Local multiplayer", desc: "One screen, 2–6 commanders, each with their own photo.", cta: "Play local", tone: "amber" },
                ] as const
              ).map((item) => (
                <article className={`mode-card tone-${item.tone}`} key={item.type}>
                  <span className="mode-icon"><Icon name={item.icon} size={26} /></span>
                  <span className="card-eyebrow">{item.tag}</span>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                  <button className="button primary" onClick={() => { setSetup(item.type); setError(""); }}>
                    {item.cta} <Icon name="arrow" size={18} />
                  </button>
                  {item.type === "create" && (
                    <button className="card-foot link" onClick={() => { setSetup("join"); setError(""); }}>
                      Have a code? Join a room →
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
          {resumeOffline?.game.status === "playing" && (
            <button className="resume-bar" onClick={() => { abandonOnlineResume(); setOffline(resumeOffline.game); setMode(resumeOffline.mode); }}>
              <Icon name="history" /> Your last offline battle is waiting. <strong>Resume round {resumeOffline.game.round} →</strong>
            </button>
          )}
          <section className="rules-strip">
            <div className="rules-intro">
              <span className="small-book"><Icon name="book" size={26} /></span>
              <div>
                <strong>Call it, then open the notebook.</strong>
                <span>Pick 1, 3, 5, 7 or 9. Match the page’s last digit to unlock the next part.</span>
              </div>
            </div>
            <div className="progression">
              {PARTS.map((n, i) => (
                <div key={n}>
                  <span className="rule-number">{i + 1}</span>
                  <small>{PART_LABELS[n]}</small>
                </div>
              ))}
            </div>
            <button className="text-button" onClick={() => setHelp(true)}>
              Learn the rules <Icon name="arrow" size={16} />
            </button>
          </section>
        </main>
      )}

      {mode === "online" && room && !room.game && (
        <main className="lobby page-content">
          <button className="text-button" onClick={() => setLeaveOpen(true)}>
            <Icon name="leave" size={16} /> Leave room
          </button>
          <div className="lobby-heading">
            <div>
              <span className="eyebrow">{room.public ? "ONLINE MATCHMAKING" : "PRIVATE LOBBY"}</span>
              <h1>{room.public ? "Rallying the squads…" : "Assemble your squads."}</h1>
              <p>{room.public ? "Ready up to start with the players here." : "Share the code. Each commander brings four soldiers."}</p>
            </div>
            <div className="room-code">
              <small>{room.public ? "PUBLIC ROOM" : "ROOM CODE"}</small>
              <strong>{room.code}</strong>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(room.code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setError("Copy unavailable. Select and copy the room code above.");
                  }
                }}
              >
                <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy code"}
              </button>
            </div>
          </div>
          <div className="lobby-layout">
            <section className="lobby-seats card">
              <div className="section-title">
                <h2>
                  Commanders <span className="count-badge">{room.players.length}/6</span>
                </h2>
                <span className="connection">
                  <span className={`status-dot ${connected ? "" : "red"}`} /> {connected ? "Connected" : "Reconnecting…"}
                </span>
              </div>
              <div className="seat-grid">
                {Array.from({ length: 6 }, (_, i) => {
                  const p = room.players[i];
                  return (
                    <div className={`seat ${!p ? "empty-seat" : ""} ${p?.ready || p?.bot || p?.id === room.hostId ? "is-ready" : ""}`} key={i} style={{ "--team": TEAM_COLORS[i] } as CSSProperties}>
                      {p ? <Avatar src={p.avatar} color={TEAM_COLORS[i]} size={46} /> : <span className="seat-plus"><Icon name="plus" /></span>}
                      <div>
                        <strong>
                          {p?.name || "Open seat"} {p?.id === myId && <small>(you)</small>}
                        </strong>
                        <small>
                          {!p ? "Waiting for a commander" : p.bot ? `${room.settings.difficulty[0].toUpperCase()}${room.settings.difficulty.slice(1)} bot` : !p.connected ? "Disconnected · seat reserved" : p.id === room.hostId ? "Room host" : p.ready ? "Ready for battle" : "Getting ready…"}
                        </small>
                      </div>
                      {p?.bot && host ? (
                        <button className="icon-button" title="Remove bot" aria-label={`Remove ${p.name}`} onClick={() => void send({ type: "removeBot", id: p.id })}>
                          <Icon name="close" size={16} />
                        </button>
                      ) : p?.id === room.hostId ? (
                        <span className="pill">HOST</span>
                      ) : p?.ready ? (
                        <Icon name="check" size={18} />
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="lobby-buttons">
                {host && (
                  <button disabled={busy || room.players.length === 6 || !connected} className="button secondary" onClick={() => void send({ type: "addBot" })}>
                    <Icon name="bot" /> Add bot
                  </button>
                )}
                {(!host || room.public) && (
                  <button className="button secondary" disabled={busy || !connected} onClick={() => void send({ type: "ready" })}>
                    <Icon name="check" /> {me?.ready ? "Not ready" : "I’m ready"}
                  </button>
                )}
                {host && (
                  <button disabled={busy || !connected || room.players.length < 2} className="button primary" onClick={() => void send({ type: "start" })}>
                    Start battle <Icon name="arrow" />
                  </button>
                )}
              </div>
              {room.public && (
                <p className="matchmaking-note">
                  <span className="status-dot" />
                  {now < room.botOfferAt
                    ? `Searching for players · bot fill available in ${Math.ceil((room.botOfferAt - now) / 1000)}s.`
                    : host
                      ? "Need more rivals? Add bots to the open seats, then start."
                      : "Waiting for the host to start or add bots."}{" "}
                  Ready players start automatically when at least two are here.
                </p>
              )}
              {room.public && host && now >= room.botOfferAt && room.players.length < 6 && (
                <button className="button secondary full" disabled={busy || !connected} onClick={() => void send({ type: "fillBots" })}>
                  <Icon name="bot" /> Fill remaining seats with bots
                </button>
              )}
            </section>
            <aside className="lobby-side">
              <section className="card">
                <span className="eyebrow">YOUR SQUAD</span>
                <div className="lobby-squad">
                  {demo.soldiers.map((s) => (
                    <Soldier key={s.id} soldier={s} avatar={me?.avatar} color={TEAM_COLORS[Math.max(0, room.players.findIndex((p) => p.id === myId))]} />
                  ))}
                </div>
                {photoButton("Your face, all four helmets")}
                <small className="muted">Your photo is shared only with players in this room and disappears when the room closes.</small>
              </section>
              <section className="card">
                <span className="eyebrow">HOUSE RULES</span>
                <p className="muted">{host ? "You’re the host. Set the pace before the first page turns." : "The host sets the rules for this battle."}</p>
                <RuleFields value={room.settings} disabled={!host || busy || !connected} onChange={(v) => void send({ type: "settings", settings: v })} />
              </section>
            </aside>
          </div>
        </main>
      )}

      {mode !== "home" && game && (
        <main className="page-content game-page">
          <div className="arena-heading">
            <div>
              <span className="eyebrow">
                {mode === "online" ? `${room?.public ? "PUBLIC" : "PRIVATE"} ROOM · ${room?.code}` : mode === "solo" ? "SOLO BATTLE · YOU VS THE BOTS" : "LOCAL BATTLE · PASS & PLAY"}
              </span>
              <h1>Battle arena</h1>
            </div>
            <div className="arena-meta">
              <span className="pill">ROUND {Math.min(game.round, game.settings.maxRounds)} <span className="muted">/ {game.settings.maxRounds}</span></span>
              <span className="pill">{game.players.filter(alive).length} SQUAD{game.players.filter(alive).length === 1 ? "" : "S"} · {game.players.reduce((n, p) => n + survivors(p), 0)} SOLDIERS</span>
              <span className="pill score-pill">BUILD +10 · HIT +20 · DEFEAT +50</span>
              <button className="icon-button" aria-label="Leave match" onClick={() => setLeaveOpen(true)}>
                <Icon name="leave" />
              </button>
            </div>
          </div>
          {mode === "online" && !connected && <div className="notice">Reconnecting… Your squad is safe. A bot will cover after {game.settings.disconnectSeconds} seconds.</div>}
          <Arena
            game={game}
            mode={mode}
            myId={myId}
            canAct={canAct}
            busy={busy}
            motion={prefs.motion && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches}
            now={now}
            host={host}
            onAction={move}
            onRematch={() => {
              if (mode === "online") void send({ type: "rematch" });
              else setOffline(startGame(game.players, game.settings));
            }}
            onStandings={() => setViewPast(game)}
            onPlayAgain={() => {
              const nextSetup = mode === "online" ? "create" : mode;
              void leave().then(() => setSetup(nextSetup as "create" | "solo" | "local"));
            }}
            onMenu={() => void leave()}
          />
          <section className="activity card">
            <button className="activity-toggle" onClick={() => setLogOpen(!logOpen)} aria-expanded={logOpen}>
              <span>
                <Icon name="history" size={18} /> Battle log <small>{game.history.length} events</small>
              </span>
              <Icon name="chevron" style={{ transform: logOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {logOpen && (
              <div className="activity-list" role="log" aria-live="polite">
                {game.history.length ? (
                  game.history.slice(-80).reverse().map((e) => (
                    <div className={`log-entry ${e.kind}`} key={e.id}>
                      <span>T{String(e.turn).padStart(2, "0")}</span>
                      <Icon name={e.kind === "shot" ? "target" : e.kind === "notebook" ? "book" : e.kind === "end" ? "trophy" : e.kind === "defeat" ? "close" : "check"} size={14} />
                      <p>{e.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="empty-log">The arena is ready. Open the first page.</p>
                )}
              </div>
            )}
          </section>
        </main>
      )}
      <footer>
        <span>SQUAD SHOWDOWN · A colorful game of luck & strategy.</span>
        <span>Original soundtrack synthesized in your browser.</span>
      </footer>

      {setup && (
        <Modal
          title={{ solo: "Solo battle", local: "Local multiplayer", create: "Create a private room", join: "Join a room", quick: "Online matchmaking" }[setup]}
          onClose={() => !busy && setSetup(null)}
        >
          <p className="modal-intro">
            {setup === "solo"
              ? "You and your squad against bot commanders. Works offline."
              : setup === "local"
                ? "One device, 2–6 commanders. Pass the screen after each turn."
                : setup === "quick"
                  ? "Join a real public lobby, then ready up with other players."
                  : "Every commander brings four soldiers. Choose your call sign."}
          </p>
          <form onSubmit={(e) => { e.preventDefault(); void begin(); }}>
            {setup !== "local" && (
              <>
                <label>
                  Your nickname
                  <input maxLength={20} placeholder="e.g. Captain Comet" value={prefs.name} onChange={(e) => setPrefs({ ...prefs, name: e.target.value })} />
                </label>
                {photoButton()}
              </>
            )}
            {setup === "join" && (
              <label>
                Six-character room code
                <input className="code-input" maxLength={6} placeholder="K7M2XP" required pattern="[A-Za-z0-9]{6}" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </label>
            )}
            {setup === "solo" && (
              <>
                <label>
                  Bot commanders <span className="value-label">{prefs.botCount}</span>
                  <input type="range" min="1" max="5" value={prefs.botCount} onChange={(e) => setPrefs({ ...prefs, botCount: Number(e.target.value) })} style={{ "--fill": `${((prefs.botCount - 1) / 4) * 100}%` } as CSSProperties} />
                </label>
                <div className="bot-picker" role="radiogroup" aria-label="Bot difficulty">
                  {(
                    [
                      ["easy", "Easy", "Rookies who roll the dice"],
                      ["medium", "Medium", "Sensible tacticians"],
                      ["hard", "Hard", "Ruthless finishers"],
                    ] as const
                  ).map(([v, label, desc]) => (
                    <button type="button" role="radio" aria-checked={prefs.rules.difficulty === v} key={v} className={prefs.rules.difficulty === v ? "chosen" : ""} onClick={() => setRule({ ...prefs.rules, difficulty: v })}>
                      <Icon name="bot" />
                      <strong>{label}</strong>
                      <small>{desc}</small>
                    </button>
                  ))}
                </div>
              </>
            )}
            {setup === "local" && (
              <>
                <div className="local-names">
                  {localPlayers.map((p, i) => (
                    <div className="local-player" key={i} style={{ "--team": TEAM_COLORS[i] } as CSSProperties}>
                      <button type="button" className="avatar-button" onClick={() => setPhotoFor(i)} aria-label={`Photo for player ${i + 1}`}>
                        <Avatar src={p.avatar} color={TEAM_COLORS[i]} size={44} />
                        <span><Icon name="camera" size={12} /></span>
                      </button>
                      <label>
                        Commander {i + 1}
                        <input maxLength={20} value={p.name} onChange={(e) => setLocalPlayers(localPlayers.map((s, j) => (i === j ? { ...s, name: e.target.value } : s)))} />
                      </label>
                    </div>
                  ))}
                </div>
                <div className="inline-actions">
                  <button type="button" className="text-button" disabled={localPlayers.length === 6} onClick={() => setLocalPlayers([...localPlayers, { name: `Player ${localPlayers.length + 1}` }])}>
                    <Icon name="plus" size={16} /> Add commander
                  </button>
                  <button type="button" className="text-button" disabled={localPlayers.length === 2} onClick={() => setLocalPlayers(localPlayers.slice(0, -1))}>
                    Remove last
                  </button>
                </div>
              </>
            )}
            {(setup === "create" || setup === "solo" || setup === "local") && (
              <details className="advanced">
                <summary>Match settings</summary>
                <RuleFields value={prefs.rules} onChange={setRule} />
              </details>
            )}
            {error && <p className="inline-error" role="alert">{error}</p>}
            <button className="button primary full" disabled={busy}>
              {busy ? "Connecting…" : setup === "join" ? "Join room" : setup === "create" ? "Create room" : setup === "quick" ? "Find a match" : "Deploy squads"}
              <Icon name="arrow" />
            </button>
          </form>
        </Modal>
      )}

      {photoFor !== null && (
        <Modal title={photoFor === "me" ? "Your squad photo" : `Photo for ${localPlayers[photoFor]?.name || "commander"}`} onClose={() => setPhotoFor(null)} wide>
          <PhotoEditor value={photoFor === "me" ? prefs.avatar : localPlayers[photoFor]?.avatar} onSave={savePhoto} onClose={() => setPhotoFor(null)} color={TEAM_COLORS[typeof photoFor === "number" ? photoFor : 0]} />
        </Modal>
      )}

      {settingsOpen && (
        <Modal
          title="Profile & settings"
          onClose={() => {
            setPrefs((p) => ({ ...p, rules: normalizeSettings(p.rules) }));
            setSettingsOpen(false);
          }}
          wide
        >
          <h3 className="settings-heading">Commander profile</h3>
          <label>
            Nickname
            <input maxLength={20} value={prefs.name} onChange={(e) => setPrefs({ ...prefs, name: e.target.value })} />
          </label>
          {photoButton()}
          <h3 className="settings-heading">Music & sound</h3>
          <div className="audio-grid">
            <Toggle label="Background music" icon="music" on={prefs.music} onChange={(music) => setPrefs({ ...prefs, music })} />
            <Volume label="Music volume" value={prefs.musicVolume} disabled={!prefs.music} onChange={(musicVolume) => setPrefs({ ...prefs, musicVolume })} />
            <Toggle label="Sound effects" icon="sound" on={prefs.sound} onChange={(sound) => setPrefs({ ...prefs, sound })} />
            <Volume label="Effects volume" value={prefs.sfxVolume} disabled={!prefs.sound} onChange={(sfxVolume) => { setPrefs({ ...prefs, sfxVolume }); sound("click"); }} />
          </div>
          <h3 className="settings-heading">Display</h3>
          <div className="toggle-grid">
            <Toggle label="Animations" icon="target" on={prefs.motion} onChange={(motion) => setPrefs({ ...prefs, motion })} />
            <Toggle label="Night mode" icon="moon" on={prefs.dark} onChange={(dark) => setPrefs({ ...prefs, dark })} />
          </div>
          <h3 className="settings-heading">Default match rules</h3>
          <p className="muted">Apply to new offline matches and private rooms. Active matches keep their current rules.</p>
          <RuleFields value={prefs.rules} onChange={setRule} />
          <button
            className="button primary full"
            onClick={() => {
              setPrefs((p) => ({ ...p, rules: normalizeSettings(p.rules) }));
              setSettingsOpen(false);
            }}
          >
            Done <Icon name="check" />
          </button>
        </Modal>
      )}

      {help && <Introduction motion={prefs.motion} onDone={finishIntro}/>}

      {(historyOpen || viewPast) && (
        <Modal title={viewPast ? "Final standings" : "Game history"} onClose={() => { setHistoryOpen(false); setViewPast(null); }} wide>
          {viewPast ? (
            <>
              <p className="modal-intro">{viewPast.endReason}</p>
              <div className="scoreboard">
                {ranking(viewPast).map((p, i) => (
                  <div key={p.id} className={viewPast.winnerIds.includes(p.id) ? "won" : ""}>
                    <span className="rank">{i + 1}</span>
                    <strong>
                      {p.name} {viewPast.winnerIds.includes(p.id) && <Icon name="trophy" size={16} />}
                    </strong>
                    <span>{survivors(p)}/4 standing</span>
                    <span>{p.shots} hits</span>
                    <span>{completed(p)} parts</span>
                    <b>{p.score} pts</b>
                  </div>
                ))}
              </div>
              <details className="advanced">
                <summary>Full battle log · {viewPast.history.length} events</summary>
                <div className="history-events">
                  {viewPast.history.map((e) => (
                    <p key={e.id}>
                      <b>T{e.turn}</b> {e.text}
                    </p>
                  ))}
                </div>
              </details>
              <button className="button secondary full" onClick={() => { setViewPast(null); setHistoryOpen(true); }}>
                All matches
              </button>
            </>
          ) : past.length ? (
            <>
              <div className="history-list">
                {past.map((g) => (
                  <button key={g.id} onClick={() => setViewPast(g)}>
                    <Icon name="trophy" />
                    <div>
                      <strong>{g.players.filter((p) => g.winnerIds.includes(p.id)).map((p) => p.name).join(" & ")} won</strong>
                      <small>
                        {g.players.length} squads · {Math.min(g.round, g.settings.maxRounds)} rounds · {new Date(g.history.at(-1)?.time || Date.now()).toLocaleDateString()}
                      </small>
                    </div>
                    <Icon name="arrow" />
                  </button>
                ))}
              </div>
              <button className="text-button" onClick={() => { setPast([]); save("showdown-history", null); }}>
                Clear history on this device
              </button>
            </>
          ) : (
            <div className="empty-history">
              <Icon name="history" size={40} />
              <h3>No battles yet.</h3>
              <p>Finish a match and your results will appear here.</p>
            </div>
          )}
        </Modal>
      )}

      {leaveOpen && (
        <Modal title={mode === "online" ? "Leave this battle?" : "Take a breather?"} onClose={() => setLeaveOpen(false)}>
          <p className="modal-intro">
            {mode === "online"
              ? "If a match is in progress, a bot will take over your squad. You won’t be able to rejoin this seat after leaving."
              : "Your offline match is saved on this device. Resume it from the main menu."}
          </p>
          <div className="inline-actions">
            <button className="button secondary" onClick={() => setLeaveOpen(false)}>Stay here</button>
            <button className="button primary" onClick={() => void leave()}>
              Main menu <Icon name="leave" />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
