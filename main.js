(function () {
  // ---------- State Variables ----------
  let expectedWords = [];
  let lines = [];
  let wordSpans = [];
  let scrollOffset = 0;
  let maxScroll = 0;
  let pxPerWord = 1;
  let wpm = 140;
  let pxPerSecond = 60;
  let playing = false;
  let rafId = null;
  let lastFrameTime = null;
  let lastHighlightLine = -1;

  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recording = false;
  let recordingPaused = false;
  let recordTimerInterval = null;
  let recordElapsedMs = 0;
  let lastTimerTick = null;
  let currentTakeUrl = null;
  let currentFacingMode = 'user';

  // ---------- DOM Elements ----------
  const setupEl = document.getElementById('setup');
  const stageEl = document.getElementById('stage');
  const reviewEl = document.getElementById('review');
  const scriptInput = document.getElementById('scriptInput');
  const startBtn = document.getElementById('startBtn');
  const textFlow = document.getElementById('textFlow');
  const scrollWrap = document.getElementById('scrollWrap');
  const viewport = document.getElementById('viewport');
  const camera = document.getElementById('camera');
  const noCameraMsg = document.getElementById('noCameraMsg');
  const controls = document.getElementById('controls');
  const showBarBtn = document.getElementById('showBarBtn');
  const fileInput = document.getElementById('fileInput');
  const importStatus = document.getElementById('importStatus');
  const secureWarning = document.getElementById('secureWarning');
  const countdownEl = document.getElementById('countdown');
  const recBadge = document.getElementById('recBadge');
  const recTime = document.getElementById('recTime');
  const playBtn = document.getElementById('playBtn');
  const recordBtn = document.getElementById('recordBtn');
  const pauseRecBtn = document.getElementById('pauseRecBtn');
  const pauseRecIcon = document.getElementById('pauseRecIcon');
  const mirrorBtn = document.getElementById('mirrorBtn');
  const flashBtn = document.getElementById('flashBtn');
  const flipBtn = document.getElementById('flipBtn');
  const flashOverlay = document.getElementById('flashOverlay');

  if (!window.isSecureContext) {
    secureWarning.style.display = 'block';
    secureWarning.textContent = location.protocol === 'file:'
      ? '⚠ Camera/mic needs HTTPS or local server to record.'
      : '⚠ Security notice: Camera access requires HTTPS.';
  }

  // ---------- Script Logic ----------
  function loadScript(text) {
    expectedWords = text.split(/\s+/).filter(Boolean);
    textFlow.innerHTML = expectedWords.map((w, i) =>
      `<span class="word" data-i="${i}">${escapeHtml(w)}</span>`
    ).join(' ');
    wordSpans = Array.from(textFlow.querySelectorAll('.word'));
    wordSpans.forEach(span => {
      span.addEventListener('click', () => jumpToWord(parseInt(span.dataset.i, 10)));
    });
    scrollOffset = 0;
    requestAnimationFrame(() => { computeGeometry(); applyScroll(); });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ---------- Geometry & Scrolling ----------
  function computeGeometry() {
    if (!wordSpans.length) return;
    const vh = viewport.clientHeight;
    textFlow.style.paddingTop = (vh / 2) + 'px';
    textFlow.style.paddingBottom = (vh / 2) + 'px';

    lines = [];
    let curTop = null, start = 0;
    wordSpans.forEach((span, i) => {
      const top = Math.round(span.offsetTop);
      if (curTop === null) { curTop = top; start = i; }
      else if (top !== curTop) { lines.push({ start, end: i - 1, top: curTop }); curTop = top; start = i; }
    });
    lines.push({ start, end: wordSpans.length - 1, top: curTop });

    const totalHeight = textFlow.scrollHeight;
    const prevMax = maxScroll || 1;
    const prevFrac = scrollOffset / prevMax;
    maxScroll = Math.max(1, totalHeight - vh);
    scrollOffset = Math.min(maxScroll, prevFrac * maxScroll);
    pxPerWord = maxScroll / Math.max(1, expectedWords.length);
    updateSpeed();
  }

  function updateSpeed() { pxPerSecond = (wpm / 60) * pxPerWord; }

  function applyScroll() {
    scrollWrap.style.transform = `translateY(${-scrollOffset}px)`;
    const vh = viewport.clientHeight;
    const guideY = scrollOffset + vh / 2;
    let li = lines.findIndex(l => guideY < l.top + (lines[1] ? (lines[1].top - lines[0].top) : 40));
    if (li === -1) li = lines.length - 1;
    if (li !== lastHighlightLine) {
      lines.forEach((l, idx) => {
        for (let i = l.start; i <= l.end; i++) {
          wordSpans[i].classList.remove('past', 'now');
          if (idx < li) wordSpans[i].classList.add('past');
          else if (idx === li) wordSpans[i].classList.add('now');
        }
      });
      lastHighlightLine = li;
    }
  }

  function jumpToWord(i) {
    const span = wordSpans[i];
    if (!span) return;
    const vh = viewport.clientHeight;
    scrollOffset = Math.min(maxScroll, Math.max(0, span.offsetTop - vh / 2));
    applyScroll();
  }

  // ---------- Play / Pause Loop ----------
  function tick(ts) {
    if (!playing) return;
    if (lastFrameTime === null) lastFrameTime = ts;
    const dt = (ts - lastFrameTime) / 1000;
    lastFrameTime = ts;
    scrollOffset = Math.min(maxScroll, scrollOffset + pxPerSecond * dt);
    applyScroll();
    if (scrollOffset >= maxScroll) { pause(); return; }
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    playing = true;
    lastFrameTime = null;
    rafId = requestAnimationFrame(tick);
    updatePlayBtn();
  }

  function pause() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    updatePlayBtn();
  }

  function togglePlay() { playing ? pause() : play(); }

  function updatePlayBtn() {
    playBtn.innerHTML = playing
      ? `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
  }

  function nudge(px) {
    pause();
    scrollOffset = Math.min(maxScroll, Math.max(0, scrollOffset + px));
    applyScroll();
  }

  document.getElementById('nudgeBack').addEventListener('click', () => nudge(-parseFloat(getComputedStyle(textFlow).fontSize) * 2.2));
  document.getElementById('nudgeFwd').addEventListener('click', () => nudge(parseFloat(getComputedStyle(textFlow).fontSize) * 2.2));

  // Drag Scroll
  let dragging = false, dragStartY = 0, dragStartScroll = 0, wasPlaying = false;
  viewport.addEventListener('pointerdown', (e) => {
    dragging = true; dragStartY = e.clientY; dragStartScroll = scrollOffset;
    wasPlaying = playing; pause();
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = dragStartY - e.clientY;
    scrollOffset = Math.min(maxScroll, Math.max(0, dragStartScroll + dy));
    applyScroll();
  });
  viewport.addEventListener('pointerup', () => {
    dragging = false;
    if (wasPlaying) play();
  });

  // ---------- Sliders ----------
  document.getElementById('speedSlider').addEventListener('input', (e) => {
    wpm = parseInt(e.target.value, 10); updateSpeed();
  });
  document.getElementById('fontSlider').addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--font-size', e.target.value + 'px');
    requestAnimationFrame(computeGeometry);
  });
  document.getElementById('marginSlider').addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--margin-pct', e.target.value + '%');
    requestAnimationFrame(computeGeometry);
  });
  window.addEventListener('resize', () => requestAnimationFrame(computeGeometry));

  // ---------- Action Controls ----------
  playBtn.addEventListener('click', togglePlay);
  mirrorBtn.addEventListener('click', () => {
    camera.classList.toggle('mirrored');
    mirrorBtn.classList.toggle('on');
  });
  flashBtn.addEventListener('click', () => {
    flashOverlay.classList.toggle('active');
    flashBtn.classList.toggle('on');
  });
  flipBtn.addEventListener('click', () => {
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    startCamera();
  });

  document.getElementById('fsBtn').addEventListener('click', () => {
    if (!document.fullscreenElement) stageEl.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  document.getElementById('restartBtn').addEventListener('click', () => {
    pause(); scrollOffset = 0; applyScroll();
  });
  document.getElementById('hideBarBtn').addEventListener('click', () => {
    controls.classList.add('hidden-bar'); stageEl.classList.add('bars-hidden');
  });
  showBarBtn.addEventListener('click', () => {
    controls.classList.remove('hidden-bar'); stageEl.classList.remove('bars-hidden');
  });
  document.getElementById('backBtn').addEventListener('click', () => {
    pause(); stopCameraTracks();
    stageEl.classList.remove('active');
    setupEl.style.display = 'flex';
  });
  document.getElementById('reviewEditBtn').addEventListener('click', () => {
    reviewEl.classList.remove('active');
    setupEl.style.display = 'flex';
  });
  document.getElementById('retakeBtn').addEventListener('click', () => {
    reviewEl.classList.remove('active');
    stageEl.classList.add('active');
    scrollOffset = 0; applyScroll();
  });

  // Hotkeys
  window.addEventListener('keydown', (e) => {
    if (!stageEl.classList.contains('active')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.code === 'ArrowUp') { nudge(parseFloat(getComputedStyle(textFlow).fontSize) * 2.2); }
    else if (e.code === 'ArrowDown') { nudge(-parseFloat(getComputedStyle(textFlow).fontSize) * 2.2); }
    else if (e.key.toLowerCase() === 'r') { recordBtn.click(); }
  });

  // ---------- Camera Setup ----------
  async function startCamera() {
    stopCameraTracks();
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      });
      camera.srcObject = mediaStream;
      camera.classList.add('on');
      noCameraMsg.style.display = 'none';
    } catch (e) {
      noCameraMsg.style.display = 'flex';
      recordBtn.disabled = true;
      recordBtn.style.opacity = '0.4';
    }
  }

  function stopCameraTracks() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    camera.classList.remove('on');
  }

  // ---------- Recording Logic ----------
  function pickMimeType() {
    const candidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (const c of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  function runCountdown(n, cb) {
    countdownEl.classList.add('show');
    if (n <= 0) { countdownEl.classList.remove('show'); cb(); return; }
    countdownEl.textContent = n;
    setTimeout(() => runCountdown(n - 1, cb), 700);
  }

  function startRecording() {
    if (!mediaStream) return;
    recordedChunks = [];
    const mime = pickMimeType();
    try {
      mediaRecorder = new MediaRecorder(mediaStream, mime ? { mimeType: mime } : undefined);
    } catch (e) { return; }

    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = onRecordingStop;
    mediaRecorder.start();

    recording = true;
    recordingPaused = false;
    recordElapsedMs = 0;
    lastTimerTick = Date.now();

    recBadge.classList.add('show');
    recordBtn.classList.add('recording');
    pauseRecBtn.style.display = 'flex';
    updatePauseRecIcon();

    recordTimerInterval = setInterval(() => {
      if (!recordingPaused) {
        const now = Date.now();
        recordElapsedMs += (now - lastTimerTick);
        lastTimerTick = now;
        const s = Math.floor(recordElapsedMs / 1000);
        recTime.textContent = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
      } else {
        lastTimerTick = Date.now();
      }
    }, 250);
  }

  function pauseRecording() {
    if (!mediaRecorder || !recording) return;
    if (!recordingPaused) {
      mediaRecorder.pause();
      recordingPaused = true;
      pause();
    } else {
      mediaRecorder.resume();
      recordingPaused = false;
      lastTimerTick = Date.now();
      play();
    }
    updatePauseRecIcon();
  }

  function updatePauseRecIcon() {
    pauseRecIcon.innerHTML = recordingPaused
      ? `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
      : `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
  }

  function stopRecording() {
    if (mediaRecorder && recording) { mediaRecorder.stop(); }
    recording = false;
    recordingPaused = false;
    pause();
    clearInterval(recordTimerInterval);
    recBadge.classList.remove('show');
    recordBtn.classList.remove('recording');
    pauseRecBtn.style.display = 'none';
  }

  function onRecordingStop() {
    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
    if (currentTakeUrl) URL.revokeObjectURL(currentTakeUrl);
    currentTakeUrl = URL.createObjectURL(blob);
    const ext = (mediaRecorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
    document.getElementById('reviewVideo').src = currentTakeUrl;
    const dl = document.getElementById('downloadBtn');
    dl.href = currentTakeUrl;
    dl.download = 'snap-take.' + ext;
    stageEl.classList.remove('active');
    reviewEl.classList.add('active');
  }

  recordBtn.addEventListener('click', () => {
    if (recording) { stopRecording(); return; }
    if (!mediaStream) return;
    scrollOffset = 0; applyScroll();
    runCountdown(3, () => {
      startRecording();
      play();
    });
  });

  pauseRecBtn.addEventListener('click', pauseRecording);

  // ---------- Document Import ----------
  document.getElementById('importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    importStatus.textContent = 'Reading…';
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      let text = '';
      if (ext === 'txt') {
        text = await file.text();
      } else if (ext === 'docx') {
        const buf = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buf });
        text = result.value;
      } else if (ext === 'pdf') {
        const buf = await file.arrayBuffer();
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        let full = '';
        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          full += content.items.map(it => it.str).join(' ') + '\n';
        }
        text = full;
      }
      scriptInput.value = text.trim();
      importStatus.textContent = `Loaded ${file.name}`;
    } catch (err) {
      importStatus.textContent = 'Could not read file';
    }
  });

  // ---------- Launch Stage ----------
  startBtn.addEventListener('click', async () => {
    const text = scriptInput.value.trim();
    if (!text) return;
    loadScript(text);
    setupEl.style.display = 'none';
    stageEl.classList.add('active');
    await startCamera();
    requestAnimationFrame(computeGeometry);
  });
})();