import { toFilter, tint } from './grading.js';
let stream = null, track = null, rec = null, chunks = [], raf = 0;
const canvas = document.createElement('canvas');

export async function start({ facing, res }) {
  stop();
  const portrait = innerHeight > innerWidth;
  const long = res === 1080 ? 1920 : 1280, short = res === 1080 ? 1080 : 720;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: facing, width: { ideal: portrait ? short : long }, height: { ideal: portrait ? long : short } },
    audio: { echoCancellation: true, noiseSuppression: true }
  });
  track = stream.getVideoTracks()[0];
  return stream;
}
export function stop() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = track = null; }
export const hasStream = () => !!stream;
export const caps = () => (track && track.getCapabilities ? track.getCapabilities() : {});
export async function apply(c) { if (!track) return false; try { await track.applyConstraints({ advanced: [c] }); return true; } catch { return false; } }

export function startRecording(video, getLook, onDone) {
  let src = stream;
  const canBake = 'filter' in CanvasRenderingContext2D.prototype && canvas.captureStream;
  if (canBake && video.videoWidth) {
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const draw = () => {
      const l = getLook();
      ctx.filter = toFilter(l);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      ctx.filter = 'none';
      const t = tint(l);
      if (t) { ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = t; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalCompositeOperation = 'source-over'; }
      raf = requestAnimationFrame(draw);
    };
    draw();
    src = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...stream.getAudioTracks()]);
  }
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  rec = new MediaRecorder(src, mime ? { mimeType: mime } : undefined);
  chunks = [];
  rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => { cancelAnimationFrame(raf); const type = rec.mimeType || 'video/webm'; onDone(new Blob(chunks, { type }), type.includes('mp4') ? 'mp4' : 'webm'); };
  rec.start(1000);
}
export const pauseRec = () => rec && rec.state === 'recording' && rec.pause();
export const resumeRec = () => rec && rec.state === 'paused' && rec.resume();
export const stopRec = () => rec && rec.state !== 'inactive' && rec.stop();
