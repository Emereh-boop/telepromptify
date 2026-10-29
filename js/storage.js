const KEY = 'Telepromptify:v1';
export const defaults = {
  script: '', font: 46, margin: 10, dim: 35, countdown: 3, mirrorText: false, wpm: 140,
  facing: 'user', res: 720, mirrorPreview: true, grid: false,
  look: { b: 100, c: 100, s: 100, w: 0, g: 0 }, noticeAck: false
};
export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...defaults, ...s, look: { ...defaults.look, ...(s.look || {}) } };
  } catch { return structuredClone(defaults); }
}
let t;
export function save(state) {
  clearTimeout(t);
  t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }, 300);
}
export function wipe() { clearTimeout(t); try { localStorage.removeItem(KEY); } catch {} }
