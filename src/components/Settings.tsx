import { type Settings as Rules } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
export type Preferences = {
  name: string;
  /** Sound effects on/off (kept as `sound` so older saved preferences carry over). */
  sound: boolean;
  sfxVolume: number;
  music: boolean;
  musicVolume: number;
  motion: boolean;
  dark: boolean;
  botCount: number;
  rules: Rules;
  /** Cropped 160×160 JPEG data URL. Stays on this device unless you join an online room. */
  avatar?: string;
};
export const DEFAULT_PREFERENCES: Preferences = {
  name: "",
  sound: true,
  sfxVolume: 75,
  music: true,
  musicVolume: 50,
  motion: true,
  dark: false,
  botCount: 5,
  rules: DEFAULT_SETTINGS,
};
export function RuleFields({
  value,
  onChange,
  disabled = false,
}: {
  value: Rules;
  onChange: (v: Rules) => void;
  disabled?: boolean;
}) {
  const update = (key: keyof Rules, v: string) =>
    onChange({ ...value, [key]: key === "difficulty" ? v : Number(v) });
  return (
    <div className="fields-grid">
      <label>
        Bot difficulty
        <select
          disabled={disabled}
          value={value.difficulty}
          onChange={(e) => update("difficulty", e.target.value)}
        >
          <option value="easy">Easy · a little unpredictable</option>
          <option value="medium">Medium · a worthy opponent</option>
          <option value="hard">Hard · takes no chances</option>
        </select>
      </label>
      {(
        [
          ["pageMax", "Book pages (1 to)", "10", "100000"],
          ["turnSeconds", "Online turn timer · seconds", "5", "180"],
          ["maxRounds", "Maximum rounds", "10", "500"],
          ["botDelay", "Bot thinking time · ms", "200", "3000"],
          ["disconnectSeconds", "Disconnect takeover · seconds", "5", "120"],
          ["matchmakingSeconds", "Matchmaking wait · seconds", "5", "120"],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key}>
          {label}
          <input
            disabled={disabled}
            type="number"
            min={min}
            max={max}
            value={value[key]}
            onChange={(e) => update(key, e.target.value)}
          />
        </label>
      ))}
    </div>
  );
}
