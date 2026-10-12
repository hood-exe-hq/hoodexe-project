/**
 * The tray balloon's chime: two soft sine notes made with Web Audio, so it's an original sound with no file to
 * load. Browsers only allow audio after the visitor has clicked or pressed a key, so the audio context is created
 * on that first gesture (unlockBalloonSound); until then, and while the tab is hidden, balloons pop up silently.
 */

/** Two balloons in quick succession (a callout and a trade) chime once. */
const MIN_GAP_MS = 2_000;
const VOLUME = 0.12;
/** A rising fifth, short and quiet: noticeable, not alarming. */
const NOTES = [
  { hz: 880, at: 0, length: 0.22 },
  { hz: 1_318.5, at: 0.09, length: 0.35 },
];

let ctx: AudioContext | null = null;
let last = -Infinity;

/** Call from a user gesture (or listen for one): creates or resumes the audio context. */
export function unlockBalloonSound() {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  } catch {
    // No audio on this device; balloons stay silent.
  }
}

/** Plays the chime if audio is unlocked, the tab is visible and the last chime wasn't just now. */
export function playBalloonSound(now = Date.now()) {
  if (!ctx || ctx.state !== 'running' || document.visibilityState !== 'visible') return;
  if (now - last < MIN_GAP_MS) return;
  last = now;
  const start = ctx.currentTime + 0.01;
  for (const n of NOTES) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = n.hz;
    // A quick fade-in avoids a click; the exponential tail sounds like a struck bell.
    gain.gain.setValueAtTime(0.0001, start + n.at);
    gain.gain.exponentialRampToValueAtTime(VOLUME, start + n.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + n.at);
    osc.stop(start + n.at + n.length + 0.05);
  }
}
