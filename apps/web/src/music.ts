// Petite musique d'ambiance lo-fi, synthétisée à la volée (aucun fichier).
// Accords Am7 – Dm7 – G7 – Cmaj7, basse ronde, kick et charleston feutrés.

import { getAudio } from "./sound";

const KEY = "3ajib:musique";
const BPM = 78;
const BEAT = 60 / BPM;

const CHORDS = [
  { notes: [57, 60, 64, 67], bass: 45 },
  { notes: [57, 60, 62, 65], bass: 38 },
  { notes: [55, 59, 62, 65], bass: 43 },
  { notes: [55, 59, 60, 64], bass: 36 },
];
const PENTA = [69, 72, 74, 76, 79, 81];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

let enabled = (() => {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
})();

let out: GainNode | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nextTime = 0;
let step = 0; // en croches
let users = 0;

export function isMusicOn() {
  return enabled;
}

export function setMusicOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* rien */
  }
  if (on && users > 0) startLoop();
  else stopLoop();
}

/** Un écran qui veut de la musique l'active ; elle s'arrête quand plus personne n'en veut. */
export function useMusicScreen(): () => void {
  users++;
  if (enabled) startLoop();
  return () => {
    users = Math.max(0, users - 1);
    if (users === 0) stopLoop();
  };
}

function startLoop() {
  if (timer) return;
  const a = getAudio();
  if (!a) return;
  out = a.createGain();
  out.gain.value = 0;
  // Un peu de chaleur : passe-bas général.
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  out.connect(lp).connect(a.destination);
  out.gain.linearRampToValueAtTime(0.16, a.currentTime + 2.5);
  nextTime = a.currentTime + 0.1;
  step = 0;
  timer = setInterval(() => schedule(a), 60);
  // Le navigateur peut avoir suspendu l'audio jusqu'au premier clic.
  if (a.state === "suspended") void a.resume().catch(() => {});
}

function stopLoop() {
  if (timer) clearInterval(timer);
  timer = null;
  const a = getAudio();
  if (a && out) {
    const g = out;
    g.gain.cancelScheduledValues(a.currentTime);
    g.gain.setTargetAtTime(0, a.currentTime, 0.4);
    setTimeout(() => g.disconnect(), 2500);
  }
  out = null;
}

function schedule(a: AudioContext) {
  if (!out || a.state !== "running") {
    nextTime = Math.max(nextTime, a.currentTime + 0.05);
    return;
  }
  while (nextTime < a.currentTime + 0.25) {
    playStep(a, step, nextTime);
    // Croches légèrement swinguées.
    nextTime += (step % 2 === 0 ? 0.56 : 0.44) * BEAT;
    step = (step + 1) % 32;
  }
}

function playStep(a: AudioContext, s: number, t: number) {
  const bar = Math.floor(s / 8);
  const chord = CHORDS[bar]!;
  const beatInBar = s % 8;
  if (beatInBar === 0) pad(a, chord.notes, t, BEAT * 4);
  if (beatInBar === 0 || beatInBar === 5) bass(a, chord.bass, t, BEAT * 1.2);
  if (beatInBar === 0 || beatInBar === 4) kick(a, t);
  if (beatInBar === 2 || beatInBar === 6) snare(a, t);
  hat(a, t, s % 2 === 0 ? 0.05 : 0.025);
  if (Math.random() < 0.18) pluck(a, PENTA[Math.floor(Math.random() * PENTA.length)]!, t);
}

function env(a: AudioContext, t: number, attack: number, hold: number, release: number, peak: number) {
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  g.connect(out!);
  return g;
}

function pad(a: AudioContext, notes: number[], t: number, dur: number) {
  for (const n of notes) {
    const o = a.createOscillator();
    o.type = "triangle";
    o.frequency.value = hz(n);
    o.detune.value = (Math.random() - 0.5) * 12;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    const g = env(a, t, 0.5, dur - 1, 0.9, 0.05);
    o.connect(f).connect(g);
    o.start(t);
    o.stop(t + dur + 0.5);
  }
}

function bass(a: AudioContext, n: number, t: number, dur: number) {
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.value = hz(n);
  const g = env(a, t, 0.02, dur * 0.5, dur * 0.5, 0.35);
  o.connect(g);
  o.start(t);
  o.stop(t + dur + 0.1);
}

function kick(a: AudioContext, t: number) {
  const o = a.createOscillator();
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  const g = env(a, t, 0.005, 0.02, 0.25, 0.5);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.35);
}

function noiseBuffer(a: AudioContext, dur: number) {
  const len = Math.floor(a.sampleRate * dur);
  const b = a.createBuffer(1, len, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

let snareBuf: AudioBuffer | null = null;
let hatBuf: AudioBuffer | null = null;

function snare(a: AudioContext, t: number) {
  snareBuf ??= noiseBuffer(a, 0.2);
  const src = a.createBufferSource();
  src.buffer = snareBuf;
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1800;
  const g = env(a, t, 0.003, 0.01, 0.14, 0.12);
  src.connect(f).connect(g);
  src.start(t);
}

function hat(a: AudioContext, t: number, vol: number) {
  hatBuf ??= noiseBuffer(a, 0.05);
  const src = a.createBufferSource();
  src.buffer = hatBuf;
  const f = a.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 7000;
  const g = env(a, t, 0.002, 0.005, 0.04, vol);
  src.connect(f).connect(g);
  src.start(t);
}

function pluck(a: AudioContext, n: number, t: number) {
  const o = a.createOscillator();
  o.type = "sine";
  o.frequency.value = hz(n);
  const g = env(a, t, 0.01, 0.05, 0.6, 0.06);
  o.connect(g);
  o.start(t);
  o.stop(t + 0.8);
}
