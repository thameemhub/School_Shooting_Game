import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Soldier from "./Soldier";
import Icon from "./Icon";
import { createPlayer } from "../../shared/character";
import { PARTS } from "../../shared/types";

const OUT = 160; // finished portrait: 160×160 JPEG, roughly 6–14 KB
const ACCEPT = ["image/jpeg", "image/png", "image/webp"];

/**
 * Local photo cropper. The original file never leaves the device: it is decoded in the
 * browser, cropped to a small square portrait, and only that portrait is saved or shared.
 */
export default function PhotoEditor({ value, onSave, onClose, color = "#3F51B5" }: { value?: string; onSave: (photo?: string) => Promise<void> | void; onClose: () => void; color?: string }) {
  const [source, setSource] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [crop, setCrop] = useState(value);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  useEffect(() => () => void generation.current++, []);
  const geometry = () => {
    const w = source!.naturalWidth, h = source!.naturalHeight;
    const size = Math.min(w, h) / zoom;
    return { size, freeX: w - size, freeY: h - size };
  };
  useEffect(() => {
    if (!source || !canvas.current) return;
    const { size, freeX, freeY } = geometry();
    const c = canvas.current;
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#F5CDA7";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, (freeX * (x + 100)) / 200, (freeY * (y + 100)) / 200, size, size, 0, 0, OUT, OUT);
    setCrop(c.toDataURL("image/jpeg", 0.82));
  }, [source, zoom, x, y]);

  async function load(file?: File) {
    if (!file) return;
    setError("");
    const request = ++generation.current;
    if (!ACCEPT.includes(file.type)) return setError("Choose a JPG, JPEG, PNG or WEBP photo.");
    if (file.size > 8 * 1024 * 1024) return setError("Choose a photo smaller than 8 MB.");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (request !== generation.current) return;
      if (Math.min(img.naturalWidth, img.naturalHeight) < 64 || Math.max(img.naturalWidth, img.naturalHeight) > 8192 || img.naturalWidth * img.naturalHeight > 32_000_000)
        throw new Error("Photo dimensions must be 64–8192 pixels per side, up to 32 megapixels.");
      setSource(img);
      setZoom(1.4);
      setX(0);
      setY(-20);
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith("Photo") ? e.message : "That photo could not be opened. Try another file.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const clamp = (v: number) => Math.max(-100, Math.min(100, v));
  // Drag so the photo follows the pointer exactly.
  function pan(dx: number, dy: number) {
    if (!source || !drag.current || !stage.current) return;
    const { size, freeX, freeY } = geometry();
    const perPixel = size / stage.current.clientWidth;
    if (freeX > 0) setX(clamp(drag.current.panX - (dx * perPixel * 200) / freeX));
    if (freeY > 0) setY(clamp(drag.current.panY - (dy * perPixel * 200) / freeY));
  }
  const preview = useMemo(() => {
    const p = createPlayer("photo-preview", "Preview");
    p.soldiers.forEach((s) => {
      PARTS.forEach((n) => (s.parts[n] = "completed"));
      s.ammo = 3;
    });
    return p;
  }, []);
  async function commit(photo?: string) {
    setBusy(true);
    setError("");
    try {
      await onSave(photo);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="photo-editor">
      <p className="modal-intro">
        Put your face inside every helmet of your squad. Cropping happens on this device; only the small finished portrait is saved, and it is shared only with the players in your online room. No face recognition, no public gallery.
      </p>
      <div className="crop-layout">
        <div className="crop-column">
          <div
            ref={stage}
            className={`crop-stage ${source ? "has-photo" : ""}`}
            onPointerDown={(e) => {
              if (!source) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, panX: x, panY: y };
            }}
            onPointerMove={(e) => drag.current && pan(e.clientX - drag.current.x, e.clientY - drag.current.y)}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => source && setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY * 0.002)))}
          >
            {source ? <canvas ref={canvas} aria-label="Cropped face preview" /> : crop ? <img src={crop} alt="Your current squad photo" /> : (
              <label className="crop-empty">
                <Icon name="camera" size={34} />
                <span>Choose a photo to begin</span>
                <input type="file" accept={ACCEPT.join(",")} onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            )}
            <div className="crop-mask" aria-hidden="true" />
          </div>
          <label className="photo-upload button secondary">
            <Icon name="camera" size={16} /> {crop ? "CHANGE PHOTO" : "UPLOAD YOUR PHOTO"}
            <input type="file" accept={ACCEPT.join(",")} onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <small className="muted">JPG, JPEG, PNG or WEBP · up to 8 MB · at least 64 × 64 px</small>
        </div>
        <div className="crop-side">
          {source ? (
            <div className="crop-controls">
              <label>
                Zoom
                <input type="range" min="1" max="4" step=".01" value={zoom} style={{ "--fill": `${((zoom - 1) / 3) * 100}%` } as CSSProperties} onChange={(e) => setZoom(Number(e.target.value))} />
              </label>
              <label>
                Left / right
                <input type="range" min="-100" max="100" value={x} style={{ "--fill": `${(x + 100) / 2}%` } as CSSProperties} onChange={(e) => setX(Number(e.target.value))} />
              </label>
              <label>
                Up / down
                <input type="range" min="-100" max="100" value={y} style={{ "--fill": `${(y + 100) / 2}%` } as CSSProperties} onChange={(e) => setY(Number(e.target.value))} />
              </label>
              <small>Drag the photo or scroll to zoom. Keep your face inside the circle.</small>
            </div>
          ) : (
            <p className="muted crop-tip">Tip: a well-lit, front-facing photo works best. Any shape or size is fine; you'll position it next.</p>
          )}
          <div className="photo-squad-preview" aria-label="Preview of your squad">
            {preview.soldiers.map((s) => (
              <div key={s.id}>
                <Soldier soldier={s} avatar={crop} color={color} />
                <span>{s.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="inline-actions photo-actions">
        {value && (
          <button className="button ghost danger-text" disabled={busy} onClick={() => void commit(undefined)}>
            <Icon name="close" size={16} /> Remove photo
          </button>
        )}
        <span className="spacer" />
        <button className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={!crop || crop === value || busy} onClick={() => void commit(crop)}>
          {busy ? "Saving…" : "Use this face"}
        </button>
      </div>
    </div>
  );
}
