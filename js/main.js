import * as store from './storage.js';
import { createPrompter } from './prompter.js';
import * as cam from './camera.js';
import { PRESETS, toFilter, tint } from './grading.js';
import { readFile } from './importer.js';

const $ = id => document.getElementById(id);
const state = store.load();
let wakeLock = null, takeUrl = null, recording = false, paused = false, timer = 0, elapsed = 0, tickAt = 0;

const prompter = createPrompter(
  { viewport: $('viewport'), wrap: $('scrollWrap'), flow: $('textFlow'), guide: $('guide') },
  { onState: p => $('playIcon').setAttribute('href', p ? '#i-pause' : '#i-play') }
);
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
const persist = () => store.save(state);

/* ---------- apply settings to the UI ---------- */
function applyAll() {
  const root = document.documentElement.style;
  root.setProperty('--font-size', state.font + 'px');
  root.setProperty('--margin-pct', state.margin + '%');
  root.setProperty('--dim-a', state.dim / 100);
  $('textFlow').classList.toggle('mirror', state.mirrorText);
  $('camera').classList.toggle('mirrored', state.mirrorPreview && state.facing === 'user');
  $('grid').classList.toggle('on', state.grid);
  $('camera').style.filter = toFilter(state.look);
  $('tint').style.background = tint(state.look) || 'transparent';
  $('wpmLabel').textContent = state.wpm;
  document.querySelectorAll('[data-key]').forEach(el => {
    const v = state[el.dataset.key];
    el.type === 'checkbox' ? (el.checked = v) : (el.value = v);
  });
  document.querySelectorAll('[data-look]').forEach(el => (el.value = state.look[el.dataset.look]));
  prompter.setWpm(state.wpm);
}
document.querySelectorAll('[data-key]').forEach(el =>
  el.addEventListener('input', async () => {
    const k = el.dataset.key;
    state[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' && isNaN(el.value) ? el.value : Number(el.value);
    applyAll(); persist();
    if (k === 'font' || k === 'margin') requestAnimationFrame(prompter.layout);
    if (k === 'facing' || k === 'res') await openCamera();
  })
);
document.querySelectorAll('[data-look]').forEach(el =>
  el.addEventListener('input', () => { state.look[el.dataset.look] = Number(el.value); $('preset').value = 'none'; applyAll(); persist(); })
);
$('preset').addEventListener('input', e => { state.look = { ...PRESETS[e.target.value] }; applyAll(); $('preset').value = e.target.value; persist(); });

/* ---------- camera ---------- */
async function openCamera() {
  try {
    $('camera').srcObject = await cam.start(state);
    $('noCamera').hidden = true; $('recordBtn').disabled = false; $('recordBtn').style.opacity = 1;
    const c = cam.caps();
    $('zoomRow').hidden = !c.zoom;
    if (c.zoom) { const z = $('zoom'); z.min = c.zoom.min; z.max = c.zoom.max; z.value = c.zoom.min; }
    $('torchRow').hidden = !c.torch;
    $('torch').checked = false;
  } catch {
    $('noCamera').hidden = false; $('recordBtn').disabled = true; $('recordBtn').style.opacity = .4;
  }
  applyAll();
}
$('zoom').addEventListener('input', e => cam.apply({ zoom: Number(e.target.value) }));
$('torch').addEventListener('input', e => cam.apply({ torch: e.target.checked }));
$('flipBtn').addEventListener('click', async () => { state.facing = state.facing === 'user' ? 'environment' : 'user'; persist(); await openCamera(); });

/* ---------- navigation ---------- */
async function enterStage() {
  const text = $('script').value.trim();
  if (!text) { $('status').textContent = 'Add a script to start.'; return; }
  prompter.load(text);
  show('stage');
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
  await openCamera();
  requestAnimationFrame(prompter.layout);
}
function leaveStage(to) {
  if (recording) stopRecording();
  prompter.restart(); cam.stop(); $('camera').srcObject = null;
  wakeLock?.release?.(); wakeLock = null;
  $('sheet').hidden = true;
  show(to);
}
$('startBtn').addEventListener('click', enterStage);
$('backBtn').addEventListener('click', () => leaveStage('editor'));
$('reviewEditBtn').addEventListener('click', () => show('editor'));
$('retakeBtn').addEventListener('click', enterStage);

/* ---------- editor ---------- */
const scriptEl = $('script');
function stats() {
  const n = scriptEl.value.split(/\s+/).filter(Boolean).length;
  const mins = n / state.wpm;
  $('stats').textContent = `${n} words · ${mins < 1 ? Math.round(mins * 60) + ' sec' : mins.toFixed(1) + ' min'}`;
}
scriptEl.value = state.script; stats();
scriptEl.addEventListener('input', () => { state.script = scriptEl.value; stats(); persist(); $('status').textContent = ''; });
$('clearBtn').addEventListener('click', () => { if (!scriptEl.value || confirm('Clear the script?')) { scriptEl.value = ''; state.script = ''; stats(); persist(); } });
$('importBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  $('status').textContent = 'Reading…';
  try { scriptEl.value = (await readFile(f)).trim(); state.script = scriptEl.value; stats(); persist(); $('status').textContent = `Loaded ${f.name}`; }
  catch (err) { $('status').textContent = err.message || 'Could not read file'; }
  e.target.value = '';
});
$('wipeBtn').addEventListener('click', async () => {
  if (!confirm('Delete your saved script and settings from this device?')) return;
  store.wipe();
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  location.reload();
});

/* ---------- playback + speed ---------- */
$('playBtn').addEventListener('click', prompter.toggle);
$('restartBtn').addEventListener('click', prompter.restart);
const bump = d => { state.wpm = prompter.setWpm(state.wpm + d); $('wpmLabel').textContent = state.wpm; persist(); };
$('speedUp').addEventListener('click', () => bump(10));
$('speedDown').addEventListener('click', () => bump(-10));
$('hideBtn').addEventListener('click', () => { $('controls').classList.add('away'); $('showBtn').hidden = false; });
$('showBtn').addEventListener('click', () => { $('controls').classList.remove('away'); $('showBtn').hidden = true; });

/* ---------- recording ---------- */
function countdown(n, done) {
  const el = $('countdown');
  if (n <= 0) { el.hidden = true; done(); return; }
  el.hidden = false; el.textContent = n;
  setTimeout(() => countdown(n - 1, done), 800);
}
const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function beginRecording() {
  cam.startRecording($('camera'), () => state.look, onTake);
  recording = true; paused = false; elapsed = 0; tickAt = Date.now();
  $('recBadge').hidden = false; $('recordBtn').classList.add('on'); $('pauseRecBtn').hidden = false;
  timer = setInterval(() => { const n = Date.now(); if (!paused) { elapsed += n - tickAt; $('recTime').textContent = fmt(elapsed); } tickAt = n; }, 250);
  prompter.play();
}
function stopRecording() {
  recording = false; clearInterval(timer); prompter.pause(); cam.stopRec();
  $('recBadge').hidden = true; $('recordBtn').classList.remove('on'); $('pauseRecBtn').hidden = true;
}
function onTake(blob, ext) {
  if (takeUrl) URL.revokeObjectURL(takeUrl);
  takeUrl = URL.createObjectURL(blob);
  $('reviewVideo').src = takeUrl;
  $('downloadBtn').href = takeUrl; $('downloadBtn').download = `Telepromptify-take-${Date.now()}.${ext}`;
  leaveStage('review');
}
$('recordBtn').addEventListener('click', () => {
  if (recording) { stopRecording(); return; }
  if (!cam.hasStream()) return;
  prompter.restart();
  countdown(state.countdown, beginRecording);
});
$('pauseRecBtn').addEventListener('click', () => {
  paused = !paused;
  if (paused) { cam.pauseRec(); prompter.pause(); } else { cam.resumeRec(); prompter.play(); }
  $('pauseIcon').setAttribute('href', paused ? '#i-play' : '#i-pause');
});

/* ---------- settings sheet ---------- */
$('settingsBtn').addEventListener('click', () => ($('sheet').hidden = !$('sheet').hidden));
$('sheetClose').addEventListener('click', () => ($('sheet').hidden = true));
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
  document.querySelectorAll('.pane').forEach(p => (p.hidden = p.dataset.pane !== t.dataset.tab));
}));

/* ---------- first-run notice + service worker ---------- */
if (!state.noticeAck) $('notice').showModal();
$('noticeOk').addEventListener('click', () => { state.noticeAck = true; persist(); $('notice').close(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
applyAll();
