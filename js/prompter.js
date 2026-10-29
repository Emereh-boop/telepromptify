// Scroll engine. Geometry, highlight and viewport-position logic are carried over from v1.
export function createPrompter({ viewport, wrap, flow, guide }, { onState, onEnd } = {}) {
  let words = [], spans = [], lines = [], off = 0, max = 0, pxWord = 1, wpm = 140, pps = 60;
  let playing = false, raf = 0, last = null, hl = -1;
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function load(text) {
    words = text.split(/\s+/).filter(Boolean);
    flow.innerHTML = words.map((w, i) => `<span class="word" data-i="${i}">${esc(w)}</span>`).join(' ');
    spans = [...flow.querySelectorAll('.word')];
    off = 0; hl = -1;
    requestAnimationFrame(() => { layout(); apply(); });
  }
  function layout() {
    if (!spans.length) return;
    const vh = viewport.clientHeight;
    flow.style.paddingTop = flow.style.paddingBottom = vh / 2 + 'px';
    lines = []; let cur = null, start = 0;
    spans.forEach((s, i) => {
      const top = Math.round(s.offsetTop);
      if (cur === null) { cur = top; start = i; }
      else if (top !== cur) { lines.push({ start, end: i - 1, top: cur }); cur = top; start = i; }
    });
    lines.push({ start, end: spans.length - 1, top: cur });
    const frac = off / (max || 1);
    max = Math.max(1, flow.scrollHeight - vh);
    off = Math.min(max, frac * max);
    pxWord = max / Math.max(1, words.length);
    speed();
  }
  const speed = () => { pps = (wpm / 60) * pxWord; };
  function apply() {
    wrap.style.transform = `translateY(${-off}px)`;
    const gy = off + viewport.clientHeight / 2;
    const lh = lines[1] ? lines[1].top - lines[0].top : 40;
    let li = lines.findIndex(l => gy < l.top + lh);
    if (li === -1) li = lines.length - 1;
    if (li === hl) return;
    lines.forEach((l, idx) => {
      for (let i = l.start; i <= l.end; i++) {
        spans[i].classList.toggle('past', idx < li);
        spans[i].classList.toggle('now', idx === li);
      }
    });
    hl = li;
  }
  function jump(i) {
    const s = spans[i]; if (!s) return;
    off = Math.min(max, Math.max(0, s.offsetTop - viewport.clientHeight / 2)); apply();
  }
  function position(scrolling) {
    viewport.classList.toggle('scrolling', scrolling);
    guide.classList.toggle('scrolling', scrolling);
    setTimeout(layout, 400);
  }
  function tick(ts) {
    if (!playing) return;
    if (last === null) last = ts;
    off = Math.min(max, off + pps * (ts - last) / 1000); last = ts;
    apply();
    if (off >= max) { pause(); onEnd && onEnd(); return; }
    raf = requestAnimationFrame(tick);
  }
  function play() { if (playing) return; playing = true; last = null; position(true); raf = requestAnimationFrame(tick); onState && onState(true); }
  function pause() { if (!playing) return; playing = false; cancelAnimationFrame(raf); position(false); onState && onState(false); }

  // drag to scrub; tap a word to jump
  let down = false, moved = false, y0 = 0, o0 = 0, was = false;
  viewport.addEventListener('pointerdown', e => { down = true; moved = false; y0 = e.clientY; o0 = off; was = playing; });
  viewport.addEventListener('pointermove', e => {
    if (!down) return;
    if (!moved && Math.abs(e.clientY - y0) < 6) return;
    if (!moved) { moved = true; if (playing) { playing = false; cancelAnimationFrame(raf); } viewport.setPointerCapture(e.pointerId); }
    off = Math.min(max, Math.max(0, o0 + y0 - e.clientY)); apply();
  });
  viewport.addEventListener('pointerup', () => { if (!down) return; down = false; if (moved && was) { playing = false; play(); } });
  flow.addEventListener('click', e => { const s = e.target.closest('.word'); if (s && !moved) jump(+s.dataset.i); });
  window.addEventListener('resize', () => requestAnimationFrame(layout));

  return {
    load, layout, play, pause, toggle: () => (playing ? pause() : play()),
    restart() { pause(); off = 0; apply(); },
    setWpm(v) { wpm = Math.max(70, Math.min(220, v)); speed(); return wpm; },
    isPlaying: () => playing
  };
}
