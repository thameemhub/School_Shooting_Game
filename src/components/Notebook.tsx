import type { CSSProperties } from "react";
import { PART_LABELS, type GameEvent } from "../../shared/types";

/**
 * The shared development notebook. Given the latest notebook opening it plays:
 * cover opens → pages flip → lands on the page → last digit highlighted → lucky number and digit
 * slide together → green match / red mismatch → result banner. Pure CSS timeline keyed by event id.
 */
export default function Notebook({
  event,
  actor,
  soldier,
  color = "#3F51B5",
  animate,
  waiting = false,
}: {
  event?: GameEvent;
  actor?: string;
  soldier?: string;
  color?: string;
  animate: boolean;
  waiting?: boolean;
}) {
  if (!event || waiting) {
    return (
      <div className={`notebook closed ${waiting ? "waiting" : ""}`} style={{ "--team": color } as CSSProperties} aria-live="polite">
        <div className="nb-closed-cover">
          <span className="nb-label">
            <small>SQUAD SHOWDOWN</small>
            DEVELOPMENT NOTEBOOK
          </span>
          <span className="nb-sticker">1 · 3 · 5 · 7 · 9</span>
          <span className="nb-band" />
        </div>
        <p className="nb-caption">{waiting ? "Opening the notebook…" : "Pick a lucky number, then open the notebook."}</p>
      </div>
    );
  }
  const page = String(event.page);
  const head = page.slice(0, -1), last = page.slice(-1);
  const result = event.match
    ? event.part
      ? `MATCH FOUND! ${PART_LABELS[event.part].toUpperCase()} UNLOCKED!`
      : event.reload
        ? "MATCH FOUND! RELOADED TO 3 BULLETS!"
        : "MATCH — NOTHING LEFT TO UNLOCK"
    : "NO MATCH — NEXT TRY IS A GUARANTEED MATCH!";
  return (
    <div
      key={event.id}
      className={`notebook open ${animate ? "play" : "static"} ${event.match ? "is-match" : "is-miss"}`}
      style={{ "--team": color } as CSSProperties}
      role="group"
      aria-label={`${actor ?? "A player"} chose ${event.guess}. Page ${event.page}, last digit ${event.digit}. ${result}`}
    >
      <div className="nb-who">
        <b>{actor}</b> · {soldier}
      </div>
      <div className="nb-spread">
        <div className="nb-page nb-left">
          <small>LUCKY NUMBER</small>
          <span className="nb-guess">{event.guess}</span>
          <em>chosen before opening</em>
        </div>
        <div className="nb-rings" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="nb-page nb-right">
          <small>PAGE OPENED</small>
          <span className="nb-pageno">
            {head}
            <mark>{last}</mark>
          </span>
          <em>last digit: {event.digit}</em>
          <span className="nb-folio">— {event.page} —</span>
        </div>
        <div className="nb-leaves" aria-hidden="true">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <div className="nb-cover" aria-hidden="true">
          <span>DEVELOPMENT NOTEBOOK</span>
        </div>
      </div>
      <div className="nb-compare" aria-hidden="true">
        <span className="chip mine">{event.guess}</span>
        <span className="verdict">{event.match ? "=" : "≠"}</span>
        <span className="chip theirs">{event.digit}</span>
        <strong>{event.match ? (event.assisted ? "GUARANTEED MATCH!" : "PERFECT MATCH!") : "NO MATCH!"}</strong>
      </div>
      <div className="nb-result">{result}</div>
    </div>
  );
}
