import type { StatusStyle } from '../charts/status';

/** Status shown as swatch + glyph + text, so colour never stands alone. */
export function Pill({ style, text }: { style: StatusStyle; text?: string }) {
  return (
    <span className="pill">
      <span className="swatch" style={{ background: style.color }} aria-hidden />
      <span className="glyph" style={{ color: style.color }} aria-hidden>
        {style.glyph}
      </span>
      {text ?? style.label}
    </span>
  );
}
