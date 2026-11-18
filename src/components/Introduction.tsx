import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LUCKY_NUMBERS, PARTS, PART_LABELS } from "../../shared/types";
import { INTRO_SECONDS, INTRO_TITLES, introFrame } from "../tutorial";
import { sound } from "../sound";
import Soldier from "./Soldier";
import Notebook from "./Notebook";
import Modal from "./Modal";
import Icon from "./Icon";

export default function Introduction({
  onDone,
  motion = true,
}: {
  onDone: () => void;
  motion?: boolean;
}) {
  const [seconds, setSeconds] = useState(0),
    [playing, setPlaying] = useState(true),
    [run, setRun] = useState(0);
  const frame = introFrame(seconds),
    { scene, elapsed } = frame;
  const cue = useRef("");
  useEffect(() => {
    if (!playing || seconds >= INTRO_SECONDS) return;
    const timer = setInterval(
      () => setSeconds((t) => Math.min(INTRO_SECONDS, t + 0.1)),
      100,
    );
    return () => clearInterval(timer);
  }, [playing, seconds >= INTRO_SECONDS]);
  useEffect(() => {
    if (!playing) return;
    const stamp = `${run}:${scene}:${scene === 4 ? frame.built : 0}`;
    if (cue.current === stamp) return;
    cue.current = stamp;
    if (scene === 1) sound("click");
    else if (scene === 2) sound("open");
    else if (scene === 3) sound("match");
    else if (scene === 4) sound(frame.built === 5 ? "load" : "unlock");
    else if (scene === 5) sound("win");
    else if (scene === 6) sound("fire");
  }, [scene, frame.built, playing, run]);
  const replay = () => {
    setRun((r) => r + 1);
    setSeconds(0);
    setPlaying(true);
  };
  const captions = [
    "You command four soldiers. The game picks Soldier 1 for you. Tap another to switch.",
    "Pick 1, 3, 5, 7 or 9. That’s your lucky number.",
    "One notebook opening per turn. Watch the page land!",
    "Last digit equals your lucky number? MATCH! About half of all openings match, and a miss makes your next try a guaranteed match.",
    "Every match adds the next part automatically: HEAD → BODY → FACE → GUN → BULLETS.",
    "Soldier complete? The game moves straight on to the next soldier.",
    "Loaded soldiers can ATTACK: one bullet destroys one enemy body part. Last squad standing wins!",
  ];
  return (
    <Modal title="How to play" onClose={onDone} wide>
      <div
        className={`intro-film ${!playing ? "paused" : ""} ${motion ? "" : "still"}`}
        data-scene={scene}
      >
        <div className="intro-meta">
          <span>FIELD GUIDE · {scene + 1}/7</span>
          <span>
            {Math.floor(seconds)} / {INTRO_SECONDS} SEC
          </span>
        </div>
        <div
          className="intro-progress"
          role="progressbar"
          aria-label="Introduction progress"
          aria-valuemin={0}
          aria-valuemax={INTRO_SECONDS}
          aria-valuenow={Math.floor(seconds)}
        >
          <i style={{ width: `${(seconds / INTRO_SECONDS) * 100}%` }} />
        </div>
        <div className="intro-scene" key={`${run}:${scene}`}>
          <h3>{INTRO_TITLES[scene]}</h3>
          {scene === 0 && (
            <>
              <p className="intro-tagline">SQUAD SHOWDOWN · Choose. Match. Build. Battle.</p>
              <div className="intro-team">
                {frame.squad.map((s, i) => (
                  <div className={`intro-enter intro-pick ${i === 0 && elapsed >= 1.2 ? "picked" : ""}`} key={s.id} style={{ "--i": i } as CSSProperties}>
                    <Soldier soldier={s} />
                    <small>SOLDIER {i + 1}</small>
                  </div>
                ))}
              </div>
            </>
          )}
          {scene === 1 && (
            <>
              <div className="intro-selection">
                <Soldier soldier={frame.soldier} />
                <span>SOLDIER 1 · ASSAULT · NEXT: HEAD</span>
              </div>
              <div className="intro-numbers">
                {LUCKY_NUMBERS.map((n) => (
                  <span className={n === 3 && elapsed >= 1 ? "picked" : ""} key={n}>
                    {n}
                    {n === 3 && (
                      <svg className="intro-pointer" viewBox="0 0 28 36" aria-hidden="true">
                        <path d="m4 2 21 20-10 1-6 10z" fill="#fff" stroke="#22305a" strokeWidth="2" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            </>
          )}
          {scene === 2 && <Notebook event={frame.match} actor="You" soldier="Soldier 1 · Assault" animate={motion} />}
          {scene === 3 && (
            <div className="intro-digits">
              <div className="intro-compare ok">
                <span>
                  PAGE 28<mark>3</mark>
                </span>
                <b>3 = 3</b>
                <strong>MATCH!</strong>
              </div>
              <div className={`intro-compare no ${elapsed >= 1.5 ? "" : "later"}`}>
                <span>
                  PAGE 24<mark>7</mark>
                </span>
                <b>5 ≠ 7</b>
                <strong>NO MATCH</strong>
              </div>
              <p className={`intro-assist ${elapsed >= 2.5 ? "" : "later"}`}>Missed? Your next opening for that soldier is a GUARANTEED MATCH.</p>
            </div>
          )}
          {scene === 4 && (
            <div className="intro-development">
              <div className="intro-match">MATCH FOUND! · SOLDIER 1</div>
              <Soldier soldier={frame.soldier} highlight={PARTS[frame.built - 1]} />
              <strong key={frame.built} className="intro-unlock">
                {PART_LABELS[PARTS[frame.built - 1]].toUpperCase()} UNLOCKED!
              </strong>
              <div className="intro-stages">
                {PARTS.map((p, i) => (
                  <span key={p} className={i < frame.built ? "built" : ""}>
                    {i < frame.built ? "✓" : "○"} {PART_LABELS[p]}
                  </span>
                ))}
              </div>
              <small>Five matches build one soldier. No menus: the next part is added for you.</small>
            </div>
          )}
          {scene === 5 && (
            <>
              <strong className="intro-unlock intro-complete">SOLDIER 1 COMPLETE! NEXT: SOLDIER 2</strong>
              <div className="intro-team">
                {frame.squad.map((s, i) => (
                  <div className={`intro-pick ${i === 1 ? "picked" : ""}`} key={s.id}>
                    <Soldier soldier={s} highlight={i === 1 && elapsed >= 2 ? "head" : undefined} fx={i === 0 ? "celebrate" : undefined} />
                    <small>
                      SOLDIER {i + 1}
                      {i === 0 ? " ✓" : ""}
                    </small>
                  </div>
                ))}
              </div>
            </>
          )}
          {scene === 6 && (
            <>
              <div className="intro-duel">
                <div>
                  <Soldier soldier={frame.soldier} fx={elapsed >= 1.8 && elapsed < 2.4 ? "firing" : undefined} />
                  <small>YOU · {frame.soldier.ammo} BULLETS</small>
                </div>
                <div>
                  <Soldier soldier={frame.target} color="#E86A33" fx={elapsed >= 2.4 && elapsed < 3 ? "hit" : undefined} />
                  <small>OPPONENT · {elapsed >= 2.4 ? "GUN DESTROYED" : "GUN TARGETED"}</small>
                </div>
                {elapsed >= 1.8 && elapsed < 2.5 && <i className="intro-projectile" />}
              </div>
              <div className="intro-victory">
                <Icon name="trophy" size={30} />
                <strong>ELIMINATE ENEMY SQUADS TO WIN!</strong>
              </div>
            </>
          )}
        </div>
        <p className="intro-caption" aria-live="polite">
          {captions[scene]}
        </p>
        <div className="intro-controls">
          <button className="button secondary" onClick={replay}>
            Play intro
          </button>
          <button
            className="button secondary"
            disabled={seconds >= INTRO_SECONDS}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "Pause" : "Resume"}
          </button>
          <button className="text-button" onClick={onDone}>
            Skip intro
          </button>
        </div>
        <button className="button primary full" onClick={onDone}>
          Start game <Icon name="arrow" />
        </button>
        <small className="intro-footnote">
          {scene === 6
            ? "You’re ready, commander."
            : "Demo only · You can skip at any time."}
        </small>
      </div>
    </Modal>
  );
}
