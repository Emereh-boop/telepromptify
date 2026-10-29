export const PRESETS = {
  none: { b: 100, c: 100, s: 100, w: 0, g: 0 },
  natural: { b: 103, c: 105, s: 108, w: 5, g: 0 },
  warm: { b: 104, c: 104, s: 112, w: 35, g: 0 },
  cool: { b: 100, c: 106, s: 96, w: -35, g: 0 },
  cinematic: { b: 96, c: 122, s: 88, w: -12, g: 0 },
  mono: { b: 100, c: 115, s: 0, w: 0, g: 1 }
};
export const toFilter = l => `brightness(${l.b}%) contrast(${l.c}%) saturate(${l.s}%) grayscale(${l.g})`;
// Warmth is a soft-light colour wash (same maths in preview and in the recording canvas)
export function tint(l) {
  if (!l.w) return null;
  const a = (Math.abs(l.w) / 100) * 0.45;
  return l.w > 0 ? `rgba(255,150,40,${a})` : `rgba(60,140,255,${a})`;
}
