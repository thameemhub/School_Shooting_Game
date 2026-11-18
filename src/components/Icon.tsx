import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  arrow: "M5 12h14m-6-6 6 6-6 6",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  copy: "M9 9h11v11H9zM15 5V3H3v12h2",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m3 3a4 4 0 0 1 3 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  globe:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18",
  bot: "M5 8h14v12H5zM12 8V4m-2 0h4M8 12v2m8-2v2M9 17h6M2 11v6m20-6v6",
  book: "M12 5v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2z",
  target:
    "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 1v4m0 14v4M1 12h4m14 0h4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  sound: "M11 4 5 9H2v6h3l6 5zM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  mute: "M11 4 5 9H2v6h3l6 5zM16 9l6 6m0-6-6 6",
  trophy:
    "M7 3h10v6a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-5 1h10",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 6v6l4 2",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2",
  wifi: "M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0m-11 4a6 6 0 0 1 8 0m-4 4h.01",
  leave: "M9 4H3v16h6m6-13 5 5-5 5M8 12h12",
  moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12",
  shield: "M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z",
  chevron: "m6 9 6 6 6-6",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0m11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  "music-off": "M9 18V9m0-4 11-2v9M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 3l18 18",
};
export default function Icon({
  name,
  size = 20,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name] || paths.target} />
    </svg>
  );
}
