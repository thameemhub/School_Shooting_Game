import { memo, useId, type ReactNode } from "react";
import { alive } from "../../shared/character";
import { PARTS, type Part, type PartState, type Soldier as SoldierState } from "../../shared/types";

export type SoldierFx = "firing" | "hit" | "celebrate" | undefined;
const ACCENT: Record<SoldierState["role"], string> = {
  Assault: "#FCE34D",
  Scout: "#A9D6F5",
  Defense: "#F3B48F",
  Support: "#C9D4FF",
};
const OUTLINE = "#22305A";
// Where a cartoon damage badge appears for each destroyed part.
const DAMAGE: Record<Part, [number, number]> = { head: [86, 42], body: [107, 139], face: [128, 86], gun: [186, 112], bullets: [196, 98] };

/**
 * Modular 2D soldier built from five independent layers, in development order:
 * HEAD (head + helmet) → BODY (torso, arms, legs, uniform, boots) → FACE (photo or default face)
 * → GUN (in the front hand) → BULLETS (three rounds loaded into the gun).
 * A layer is drawn only when its part is unlocked; a destroyed part is drawn broken and greyed.
 * `highlight` marks the part that was just unlocked so it can glow.
 */
function SoldierArt({
  soldier,
  avatar,
  color = "#3F51B5",
  hero = false,
  fx,
  highlight,
}: {
  soldier: SoldierState;
  avatar?: string;
  color?: string;
  hero?: boolean;
  fx?: SoldierFx;
  highlight?: Part;
}) {
  const id = useId().replaceAll(":", "");
  const state = (n: Part): PartState => soldier.parts[n];
  const has = (n: Part) => state(n) === "completed";
  const lost = (n: Part) => state(n) === "eliminated";
  const dead = !alive(soldier), role = soldier.role, accent = ACCENT[role];
  const built = PARTS.filter(has).length;
  const pose = role === "Scout" ? "pose-scout" : role === "Defense" ? "pose-defense" : role === "Support" ? "pose-support" : "pose-assault";
  /** Wraps one part's artwork: visible only when unlocked (normal) or destroyed (broken). */
  const layer = (n: Part, enter: string, art: ReactNode, broken?: ReactNode, tag: string = n) => {
    const st = state(n);
    if (st === "available") return null;
    return (
      <g key={`${tag}:${st}`} data-part={tag} data-state={st} className={`soldier-part part-${n} ${st === "completed" ? enter : "part-broken"} ${highlight === n && st === "completed" ? "part-new" : ""}`}>
        {art}
        {st === "eliminated" && broken}
      </g>
    );
  };
  const crack = (d: string) => <path className="crack" d={d} fill="none" stroke="#E86A33" strokeWidth="3" />;
  return (
    <svg
      viewBox="0 0 220 235"
      className={`soldier-art ${pose} stage-${built} ${dead ? "soldier-defeated" : ""} ${hero ? "hero-soldier" : ""} ${fx ? `fx-${fx}` : ""}`}
      role="img"
      aria-label={`${role} soldier, ${built} of 5 parts built: ${PARTS.map((n) => `${n} ${state(n) === "completed" ? "unlocked" : state(n) === "eliminated" ? "destroyed" : "locked"}`).join(", ")}; ${soldier.ammo} bullets${dead ? "; defeated" : ""}`}
    >
      <defs>
        <clipPath id={`face-${id}`}>
          <ellipse cx="110" cy="80" rx="26" ry="27" />
        </clipPath>
        <linearGradient id={`shade-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <ellipse className="soldier-shadow" cx="111" cy="221" rx="62" ry="9" fill="#22305A22" />

      {/* Stage 0: a faint placeholder silhouette, nothing built yet. */}
      {built === 0 && !dead && (
        <g className="silhouette" data-part="placeholder" aria-hidden="true">
          <path
            d="M110 30q34 1 35 38l-3 8q-2 22-21 30v4q16 2 22 14l15 9 10 3-6 14-30-12 6 28-8 42h-22l-7-32-7 32H70l6-36-12 6q-12 0-10-12l9-30q6-16 22-20v-4q-19-8-21-30l-3-8q1-37 35-38z"
            fill="#3F51B5"
            opacity=".07"
            stroke="#3F51B5"
            strokeOpacity=".3"
            strokeWidth="2.5"
            strokeDasharray="7 7"
          />
          <text x="110" y="232" textAnchor="middle" fill="#5B6B95" fontSize="12" fontWeight="800">
            needs a head
          </text>
        </g>
      )}

      <g className="soldier-body" stroke={OUTLINE} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
        {/* BODY: backpack, legs, boots, torso, arms, gloves, belt, uniform details */}
        {layer(
          "body",
          "assemble",
          <>
            <rect x="58" y="112" width="36" height="58" rx="13" fill={accent} />
            <path d="M66 122v38" fill="none" opacity=".35" />
            {role === "Support" && <path d="M64 112V92" strokeWidth="3" />}
            {role === "Support" && <circle cx="64" cy="90" r="4" fill="#E86A33" />}
            <path className="leg-l" d="M86 161 80 204h24l9-36" fill={color} />
            <path className="leg-r" d="m113 168 9 36h24l-9-44" fill={color} />
            <path d="M78 196h27v18H70q-4-13 8-18m43 0h26l9 18h-35z" fill="#2A3552" />
            <path d="M90 107q20-10 39 0l12 58q-31 12-61 0z" fill={color} />
            <path d="M90 107q20-10 39 0l3 14q-22-7-45 0z" fill={`url(#shade-${id})`} stroke="none" />
            <path className="arm-back" d="M85 115q-15-3-22 19l-8 22 17 6 20-27" fill={color} />
            <path className="arm-front" d="M124 113q13 0 20 12l17 10-9 15-28-13" fill={color} />
            <circle cx="58" cy="164" r="9" fill="#2A3552" />
            <circle cx="160" cy="140" r="9" fill="#2A3552" />
            <path d="M85 156h53v12H83z" fill="#2A3552" />
            <rect x="104" y="155" width="13" height="14" rx="3" fill="#FCE34D" />
            <rect x="91" y="124" width="11" height="15" rx="2" fill={accent} strokeWidth="2" />
            <rect x="117" y="124" width="11" height="15" rx="2" fill={accent} strokeWidth="2" />
            {role === "Support" && <path d="M119 114h10m-5-5v10" stroke="#fff" strokeWidth="4" />}
            {role === "Defense" && <path d="m97 111 13-6 13 6-2 12-11 8-11-8z" fill={accent} strokeWidth="2.5" />}
            {role === "Scout" && <path d="m83 112 22 8 30-7-3 9-26 5-25-8" fill={accent} strokeWidth="2" />}
            {role === "Assault" && <path d="M95 141h30" stroke="#FCE34D" strokeWidth="4" />}
          </>,
          crack("M100 112l8 14-6 10 9 14-4 12"),
        )}

        {/* HEAD (1/2): neck and head. The face layer sits on it and the helmet shell above both. */}
        {layer(
          "head",
          "helmet-enter",
          <>
            <rect x="99" y="98" width="22" height="16" rx="8" fill="#E8B48A" />
            <ellipse cx="110" cy="80" rx="30" ry="31" fill="#F5CDA7" />
          </>,
        )}
        {/* FACE: the player's photo inside the helmet, or a friendly default face */}
        {layer(
          "face",
          "face-reveal",
          avatar && has("face") ? (
            <>
              <image href={avatar} x="84" y="53" width="52" height="54" preserveAspectRatio="xMidYMid slice" clipPath={`url(#face-${id})`} />
              <ellipse cx="110" cy="80" rx="26" ry="27" fill="none" stroke={OUTLINE} strokeWidth="2.5" />
            </>
          ) : has("face") ? (
            <g fill="none">
              <circle cx="99" cy="80" r="3.4" fill={OUTLINE} stroke="none" />
              <circle cx="121" cy="80" r="3.4" fill={OUTLINE} stroke="none" />
              <path d="M101 92q9 7 18 0" strokeWidth="3" />
              <circle cx="93" cy="90" r="4" fill="#F2A07B" stroke="none" opacity=".6" />
              <circle cx="127" cy="90" r="4" fill="#F2A07B" stroke="none" opacity=".6" />
            </g>
          ) : (
            // destroyed face: dizzy cartoon eyes
            <g fill="none" strokeWidth="3">
              <ellipse cx="110" cy="80" rx="26" ry="27" fill="#E7D3C2" strokeWidth="2.5" />
              <path d="m95 75 8 8m0-8-8 8m22-8 8 8m0-8-8 8M102 95q8-5 16 0" />
            </g>
          ),
        )}

        {/* HEAD (2/2): helmet shell, drawn over the face so the photo sits inside the helmet */}
        {layer(
          "head",
          "helmet-enter",
          <>
            <path d="M75 68q0-38 35-39 35 1 35 39l-10 6-2-12-47 1-3 12z" fill={color} />
            <path d="M80 60q4-24 30-26" fill="none" stroke="#ffffff70" strokeWidth="5" />
            <path d="M72 66q38-13 76 0l-1 9q-37-10-74 0z" fill={accent} />
            {role === "Assault" && <path d="m104 46 6-6 6 6-6 6z" fill="#FCE34D" strokeWidth="2" />}
            {role === "Scout" && (
              <g fill="#A9D6F5" strokeWidth="2.5">
                <rect x="85" y="45" width="21" height="12" rx="5" />
                <rect x="114" y="45" width="21" height="12" rx="5" />
                <path d="M106 51h8" />
              </g>
            )}
            {role === "Defense" && <path d="M82 72v16m56-16v16" stroke={accent} strokeWidth="9" />}
            {role === "Defense" && <path d="M82 72v16m56-16v16" strokeWidth="2" fill="none" />}
            {role === "Support" && (
              <g>
                <path d="M141 80v17h-13" fill="none" />
                <rect x="139" y="74" width="9" height="16" rx="3" fill={accent} />
              </g>
            )}
          </>,
          crack("M96 34l8 12-6 8 10 10"),
          "head-helmet",
        )}

        {/* GUN: held in the front glove */}
        {layer(
          "gun",
          "gun-equip gun",
          has("gun") ? (
            <>
              <path d="M156 120h43v12h-24l-5 20h-13l6-20h-7z" fill="#33435F" />
              <path d="M176 119v-6h17v6" fill="#7186A6" />
              <path d="M199 125h9" stroke="#2A3552" strokeWidth="6" />
              <path d="M169 134h9v7h-8" fill="none" strokeWidth="2" />
              <rect x="160" y="122" width="10" height="6" rx="2" fill={accent} strokeWidth="1.5" />
            </>
          ) : (
            <>
              <path d="m158 132 18-4 3 9-17 5z" fill="#8F9BB3" />
              <path d="m186 126 13 2-2 7-12-2z" fill="#8F9BB3" />
            </>
          ),
        )}

        {/* BULLETS: three rounds loaded into the gun's top clip (or a belt pouch if the gun is gone) */}
        {layer(
          "bullets",
          "ammo-load",
          (() => {
            const onGun = has("gun");
            const xs = onGun ? [178, 187, 196] : [93, 105, 117];
            const top = onGun ? 96 : 140;
            return (
              <g key={soldier.ammo}>
                {onGun && <rect x="174" y="110" width="30" height="7" rx="2" fill="#2A3552" strokeWidth="2" />}
                {xs.map((x, i) => {
                  const live = has("bullets") && i < soldier.ammo;
                  return (
                    <g key={i} className={`round ${live ? "live" : "spent"}`} strokeWidth="1.8">
                      <rect x={x} y={top + 5} width="7" height="11" rx="1.5" fill={live ? "#F2C14E" : "#D6DCE8"} />
                      <path d={`M${x} ${top + 6}q3.5-9 7 0z`} fill={live ? "#E86A33" : "#E5E9F1"} />
                    </g>
                  );
                })}
              </g>
            );
          })(),
        )}
      </g>

      {fx === "firing" && has("gun") && (
        <g className="muzzle-flash">
          <path d="m210 125 14-9-4 9 12 2-12 4 6 9-16-7z" fill="#FCE34D" stroke="#E86A33" strokeWidth="2" />
        </g>
      )}
      {(lost("gun") || lost("bullets")) && !dead && (
        <g className="smoke" fill="#B8C2D6" opacity=".7">
          <circle cx="182" cy="100" r="7" />
          <circle cx="190" cy="90" r="5" />
        </g>
      )}
      {PARTS.filter((n) => lost(n)).map((n) => {
        const [x, y] = DAMAGE[n];
        return (
          <g key={n} className="damage-pop" data-damage={n}>
            <circle cx={x} cy={y} r="11" fill="#FFF4DF" stroke="#E86A33" strokeWidth="2.5" />
            <path d={`m${x - 4} ${y - 4} 8 8m0-8-8 8`} stroke="#E86A33" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
      })}
      {fx === "hit" && (
        <g className="impact-burst">
          <path d="m110 40 12 26 26-10-14 24 26 12-28 4 6 28-20-20-20 20 4-28-28-4 26-12-14-24 26 10z" fill="#FCE34D" stroke="#E86A33" strokeWidth="3" strokeLinejoin="round" />
          <text x="110" y="92" textAnchor="middle" fontSize="20" fontWeight="900" fill="#E86A33">
            POW!
          </text>
        </g>
      )}
      {dead && (
        <g className="defeat-stars" fill="#FCE34D" stroke="#E86A33" strokeWidth="2">
          <path d="m82 30 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" />
          <path d="m140 22 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z" />
        </g>
      )}
    </svg>
  );
}
export default memo(SoldierArt);

/** Round portrait for headers and lobby seats: the player's photo inside a helmet rim. */
export function Avatar({ src, color = "#3F51B5", size = 40, label }: { src?: string; color?: string; size?: number; label?: string }) {
  return (
    <span className="avatar" style={{ width: size, height: size, borderColor: color }} aria-label={label} role={label ? "img" : undefined}>
      {src ? (
        <img src={src} alt="" />
      ) : (
        <svg viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="22" r="13" fill="#F5CDA7" />
          <path d="M6 20q0-15 14-15t14 15l-4 2-1-5H11l-1 5z" fill={color} />
          <circle cx="15.5" cy="23" r="1.8" fill="#22305A" />
          <circle cx="24.5" cy="23" r="1.8" fill="#22305A" />
          <path d="M16 28q4 3 8 0" stroke="#22305A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}
