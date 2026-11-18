// Squad Showdown audio. Everything here is synthesized in the browser with the Web Audio API:
// the soundtrack is an original composition written for this project (no samples, no
// third-party recordings), so it ships with the game under the project's own terms.
export type AudioPrefs = { music: boolean; musicVolume: number; sfx: boolean; sfxVolume: number };
export type Cue = "open" | "flip" | "match" | "miss" | "unlock" | "load" | "fire" | "hit" | "defeat" | "win" | "click" | "turn";
export type Scene = "menu" | "battle";

const BPM = 108;
const STEP = 60 / BPM / 4; // sixteenth notes
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
// Original 16-bar form: A A' B A''. Chords as MIDI roots + quality; one chord per bar.
const CHORDS: [number, "maj" | "min"][] = [
  [60, "maj"], [57, "min"], [65, "maj"], [67, "maj"],
  [60, "maj"], [64, "min"], [65, "maj"], [67, "maj"],
  [62, "min"], [67, "maj"], [64, "min"], [69, "min"],
  [65, "maj"], [67, "maj"], [60, "maj"], [67, "maj"],
];
// Melody: one entry per eighth note per bar (8 per bar); 0 = rest. Original line.
const MELODY: number[][] = [
  [72, 0, 76, 79, 0, 76, 74, 72], [69, 0, 72, 76, 0, 74, 72, 0],
  [77, 0, 76, 74, 72, 0, 74, 76], [74, 0, 0, 71, 72, 74, 0, 0],
  [72, 0, 76, 79, 0, 81, 79, 76], [76, 0, 79, 76, 74, 0, 71, 0],
  [72, 74, 77, 0, 76, 74, 72, 0], [74, 0, 79, 0, 78, 79, 0, 0],
  [74, 0, 77, 81, 0, 79, 77, 0], [79, 0, 77, 74, 71, 0, 74, 0],
  [76, 0, 79, 83, 0, 81, 79, 0], [81, 0, 79, 76, 72, 0, 76, 0],
  [77, 76, 77, 81, 0, 79, 77, 76], [74, 0, 76, 77, 79, 0, 83, 0],
  [84, 0, 79, 76, 0, 72, 76, 79], [74, 0, 71, 0, 67, 0, 0, 0],
];

class AudioEngine {
  ctx: AudioContext | null = null;
  musicBus: GainNode | null = null;
  sfxBus: GainNode | null = null;
  battleBus: GainNode | null = null;
  prefs: AudioPrefs = { music: true, musicVolume: 55, sfx: true, sfxVolume: 75 };
  scene: Scene = "menu";
  step = 0;
  nextTime = 0;
  timer: ReturnType<typeof setInterval> | null = null;
  noise: AudioBuffer | null = null;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.battleBus = this.ctx.createGain();
        this.battleBus.connect(this.musicBus);
        this.musicBus.connect(this.ctx.destination);
        this.sfxBus.connect(this.ctx.destination);
        const len = this.ctx.sampleRate * 0.5;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.apply();
        this.setScene(this.scene);
      }
      if (this.ctx.state === "suspended" && !document.hidden) void this.ctx.resume();
      this.ensureLoop();
    } catch {
      /* Audio is optional. */
    }
  }
  configure(prefs: AudioPrefs) {
    this.prefs = prefs;
    this.apply();
    this.ensureLoop();
  }
  private level = (v: number) => (Math.max(0, Math.min(100, v)) / 100) ** 2;
  private apply() {
    if (!this.ctx || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.prefs.music ? this.level(this.prefs.musicVolume) * 0.5 : 0, t, 0.08);
    this.sfxBus.gain.setTargetAtTime(this.prefs.sfx ? this.level(this.prefs.sfxVolume) * 0.9 : 0, t, 0.02);
  }
  /** Changing scene only fades the percussion layer; the song never restarts. */
  setScene(scene: Scene) {
    this.scene = scene;
    if (this.ctx && this.battleBus)
      this.battleBus.gain.setTargetAtTime(scene === "battle" ? 1 : 0, this.ctx.currentTime, 0.6);
  }
  private ensureLoop() {
    if (!this.ctx) return;
    if (this.prefs.music && !this.timer) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 25);
    } else if (!this.prefs.music && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  private schedule() {
    const ctx = this.ctx!;
    if (ctx.state !== "running") return;
    // Recover gracefully after the tab was throttled.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % (16 * 16);
    }
  }
  private playStep(step: number, t: number) {
    const bar = Math.floor(step / 16), s = step % 16;
    const [root, quality] = CHORDS[bar];
    const third = quality === "maj" ? 4 : 3;
    const chord = [root, root + third, root + 7];
    const music = this.musicBus!, battle = this.battleBus!;
    // Bass: bouncy root/fifth.
    if (s % 4 === 0) this.tone(music, "triangle", midi(root - 24 + (s === 8 ? 7 : 0)), t, STEP * 3, 0.32);
    // Plucky arpeggio.
    if (s % 2 === 0) this.tone(music, "square", midi(chord[(s / 2) % 3] + (s >= 8 ? 12 : 0)), t, STEP * 0.9, 0.035, 2600);
    // Lead melody on eighths.
    if (s % 2 === 0) {
      const note = MELODY[bar][s / 2];
      if (note) this.tone(music, "triangle", midi(note), t, STEP * 1.8, 0.14);
    }
    // Soft pad on each bar.
    if (s === 0) chord.forEach((n) => this.tone(music, "sine", midi(n - 12), t, STEP * 15, 0.045));
    // Battle percussion layer.
    if (s % 4 === 0) this.kick(battle, t);
    if (s === 4 || s === 12) this.hiss(battle, t, 0.12, 0.16, 1800);
    if (s % 2 === 1) this.hiss(battle, t, 0.03, 0.05, 7000);
  }
  private tone(bus: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, vol: number, cutoff?: number, endFreq?: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = cutoff;
      osc.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
  private kick(bus: AudioNode, t: number) {
    this.tone(bus, "sine", 140, t, 0.16, 0.4, undefined, 45);
  }
  private hiss(bus: AudioNode, t: number, dur: number, vol: number, freq: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = freq > 4000 ? "highpass" : "bandpass";
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  play(cue: Cue) {
    if (!this.ctx || !this.prefs.sfx || this.ctx.state !== "running") return;
    const bus = this.sfxBus!, t = this.ctx.currentTime + 0.01;
    const notes = (list: number[], gap: number, type: OscillatorType = "triangle", vol = 0.25, len = 0.18) =>
      list.forEach((n, i) => this.tone(bus, type, midi(n), t + i * gap, len, vol));
    switch (cue) {
      case "open": // notebook cover: soft thump + paper swish
        this.tone(bus, "sine", 180, t, 0.12, 0.3, undefined, 90);
        this.hiss(bus, t + 0.04, 0.22, 0.3, 2000);
        break;
      case "flip": // rapid page flutter
        for (let i = 0; i < 9; i++) this.hiss(bus, t + i * 0.085, 0.06, 0.28 - i * 0.015, 2800 + (i % 3) * 700);
        break;
      case "match": // bright two-step chime
        notes([79, 84, 88], 0.09, "sine", 0.22, 0.4);
        this.tone(bus, "triangle", midi(96), t + 0.3, 0.5, 0.06);
        break;
      case "miss": // gentle "nope" buzz
        this.tone(bus, "square", 220, t, 0.16, 0.07, 1200, 180);
        this.tone(bus, "square", 175, t + 0.18, 0.28, 0.07, 1200, 130);
        break;
      case "unlock": // bright rising sparkle
        notes([72, 76, 79, 84], 0.06, "triangle", 0.22, 0.22);
        this.tone(bus, "sine", midi(96), t + 0.24, 0.3, 0.06);
        break;
      case "load": // three magazine clicks and a ping
        [0, 0.09, 0.18].forEach((d) => this.hiss(bus, t + d, 0.04, 0.5, 5200));
        this.tone(bus, "square", midi(88), t + 0.3, 0.12, 0.06, 4000);
        break;
      case "fire": // arcade "pew"
        this.tone(bus, "square", 1100, t, 0.18, 0.12, 3000, 160);
        this.hiss(bus, t, 0.08, 0.4, 1200);
        break;
      case "hit": // cartoon bonk
        this.tone(bus, "sine", 320, t, 0.18, 0.3, undefined, 90);
        this.hiss(bus, t, 0.06, 0.3, 900);
        break;
      case "defeat": // descending wobble
        notes([67, 63, 60, 55], 0.1, "square", 0.08, 0.16);
        this.tone(bus, "sine", 200, t + 0.4, 0.4, 0.2, undefined, 60);
        break;
      case "win": // short victory fanfare
        notes([67, 72, 76, 79], 0.11, "square", 0.08, 0.2);
        notes([84], 0, "triangle", 0.25, 0.7);
        [72, 76, 79].forEach((n) => this.tone(bus, "triangle", midi(n), t + 0.44, 0.8, 0.12));
        break;
      case "turn":
        notes([79, 84], 0.08, "sine", 0.12, 0.14);
        break;
      case "click":
        this.tone(bus, "sine", 880, t, 0.05, 0.08);
        break;
    }
  }
  pauseForHidden(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }
}

export const audio = new AudioEngine();
if (typeof window !== "undefined") {
  const unlock = () => audio.unlock();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", () => audio.pauseForHidden(document.hidden));
}
export const sound = (cue: Cue) => audio.play(cue);
