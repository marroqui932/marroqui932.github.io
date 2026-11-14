// Ambiance sonore des Loups-Garous, entièrement synthétisée :
// nuit (vent, grillons, chouette, bourdon grave), jour (oiseaux, nappe douce),
// effets (hurlement, cloche, glas, tir, battements de cœur…) et voix du narrateur.

import { getAudio, isMuted } from "../../sound";
import { isMusicOn } from "../../music";

type Mode = "night" | "day" | "off";

let out: GainNode | null = null;
let fx: GainNode | null = null;
let layers: { stop: () => void } | null = null;
let mode: Mode = "off";
let wanted: Mode = "off";
let chirps: ReturnType<typeof setInterval> | null = null;

function ctx() {
  const a = getAudio();
  if (!a) return null;
  if (!out) {
    out = a.createGain();
    out.gain.value = 0;
    out.connect(a.destination);
    fx = a.createGain();
    fx.gain.value = 0.42;
    fx.connect(a.destination);
  }
  return a;
}

function noiseBuffer(a: AudioContext, seconds = 2) {
  const b = a.createBuffer(1, a.sampleRate * seconds, a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Fond sonore de nuit ou de jour. */
function buildLayers(a: AudioContext, m: "night" | "day") {
  const nodes: AudioScheduledSourceNode[] = [];
  const bus = a.createGain();
  bus.gain.value = 1;
  bus.connect(out!);

  // Vent : bruit filtré dont le filtre ondule lentement.
  const wind = a.createBufferSource();
  wind.buffer = noiseBuffer(a, 4);
  wind.loop = true;
  const bp = a.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = m === "night" ? 420 : 900;
  bp.Q.value = 0.8;
  const lfo = a.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = a.createGain();
  lfoGain.gain.value = m === "night" ? 260 : 300;
  lfo.connect(lfoGain).connect(bp.frequency);
  const wg = a.createGain();
  wg.gain.value = m === "night" ? 0.16 : 0.05;
  wind.connect(bp).connect(wg).connect(bus);
  nodes.push(wind, lfo);

  // Nappe : accord grave et lent (ré mineur la nuit, fa majeur le jour).
  const chord = m === "night" ? [38, 45, 50, 53] : [53, 57, 60, 64];
  const pad = a.createGain();
  pad.gain.value = m === "night" ? 0.05 : 0.025;
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = m === "night" ? 500 : 1200;
  pad.connect(lp).connect(bus);
  chord.forEach((n, i) => {
    const o = a.createOscillator();
    o.type = i % 2 ? "triangle" : "sine";
    o.frequency.value = hz(n);
    o.detune.value = (i - 1.5) * 6;
    const g = a.createGain();
    g.gain.value = 0.6;
    const trem = a.createOscillator();
    trem.frequency.value = 0.05 + i * 0.03;
    const tg = a.createGain();
    tg.gain.value = 0.35;
    trem.connect(tg).connect(g.gain);
    o.connect(g).connect(pad);
    o.start();
    trem.start();
    nodes.push(o, trem);
  });
  wind.start();
  lfo.start();

  return {
    stop() {
      const t = a.currentTime;
      bus.gain.setTargetAtTime(0, t, 0.6);
      setTimeout(() => {
        for (const n of nodes) {
          try {
            n.stop();
          } catch {
            /* déjà arrêté */
          }
        }
        bus.disconnect();
      }, 3000);
    },
  };
}

/** Petits bruits aléatoires : grillons et chouette la nuit, oiseaux le jour. */
function critter() {
  const a = ctx();
  if (!a || !out || mode === "off") return;
  const t = a.currentTime + 0.05;
  if (mode === "night") {
    if (Math.random() < 0.18) return owl(a, t);
    // Grillon : quelques impulsions aiguës.
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) blip(a, out, f, t + i * 0.07, 0.03, 0.025);
  } else {
    // Oiseau : glissandi rapides.
    const base = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const o = a.createOscillator();
      const g = a.createGain();
      const s = t + i * 0.13;
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), s + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, s + 0.1);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.03, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0005, s + 0.11);
      o.connect(g).connect(out);
      o.start(s);
      o.stop(s + 0.12);
    }
  }
}

function blip(a: AudioContext, dest: AudioNode, f: number, t: number, dur: number, vol: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function owl(a: AudioContext, t: number) {
  for (const [d, len] of [
    [0, 0.25],
    [0.5, 0.6],
  ] as const) {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(390, t + d);
    o.frequency.linearRampToValueAtTime(350, t + d + len);
    g.gain.setValueAtTime(0, t + d);
    g.gain.linearRampToValueAtTime(0.05, t + d + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + len);
    o.connect(g).connect(out!);
    o.start(t + d);
    o.stop(t + d + len + 0.05);
  }
}

function apply() {
  const target: Mode = isMusicOn() ? wanted : "off";
  if (target === mode) return;
  const a = ctx();
  if (!a || !out) return;
  layers?.stop();
  layers = null;
  mode = target;
  if (chirps) clearInterval(chirps);
  chirps = null;
  if (target === "off") {
    out.gain.setTargetAtTime(0, a.currentTime, 0.4);
    return;
  }
  out.gain.setTargetAtTime(0.5, a.currentTime, 1.2);
  layers = buildLayers(a, target);
  chirps = setInterval(() => Math.random() < 0.55 && critter(), 1400);
}

export function setAmbience(m: Mode) {
  wanted = m;
  apply();
}

/** À rappeler quand l'option « musique » change. */
export function refreshAmbience() {
  apply();
}

// ── Effets ──────────────────────────────────────────────────

export type LoupSound = "howl" | "bell" | "death" | "shot" | "heartbeat" | "magic" | "love" | "vote" | "pop" | "victory" | "defeat" | "gasp";

export function sfx(name: LoupSound, delay = 0) {
  if (isMuted()) return;
  const a = ctx();
  if (!a || !fx) return;
  const t = a.currentTime + delay + 0.02;
  const env = (g: GainNode, peak: number, attack: number, decay: number, at = t) => {
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  };
  switch (name) {
    case "howl": {
      // Hurlement : montée, vibrato, longue descente ; deux loups légèrement décalés.
      for (const [base, d] of [
        [330, 0],
        [392, 0.7],
      ] as const) {
        const o = a.createOscillator();
        o.type = "sawtooth";
        const f = a.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 1300;
        const g = a.createGain();
        const s = t + d;
        o.frequency.setValueAtTime(base * 0.7, s);
        o.frequency.exponentialRampToValueAtTime(base * 1.5, s + 0.6);
        o.frequency.setValueAtTime(base * 1.5, s + 1.7);
        o.frequency.exponentialRampToValueAtTime(base * 0.9, s + 3);
        const vib = a.createOscillator();
        vib.frequency.value = 5.5;
        const vg = a.createGain();
        vg.gain.value = 9;
        vib.connect(vg).connect(o.frequency);
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.13, s + 0.5);
        g.gain.setValueAtTime(0.13, s + 1.9);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 3.1);
        o.connect(f).connect(g).connect(fx);
        o.start(s);
        vib.start(s);
        o.stop(s + 3.2);
        vib.stop(s + 3.2);
      }
      break;
    }
    case "bell": {
      // Cloche de l'église : partiels inharmoniques.
      for (const [ratio, vol, dec] of [
        [1, 0.22, 3.5],
        [2.0, 0.1, 2.5],
        [2.76, 0.08, 2],
        [5.4, 0.04, 1.2],
      ] as const) {
        for (const at of [t, t + 1.6]) {
          const o = a.createOscillator();
          const g = a.createGain();
          o.frequency.value = 220 * ratio;
          env(g, vol, 0.005, dec, at);
          o.connect(g).connect(fx);
          o.start(at);
          o.stop(at + dec + 0.1);
        }
      }
      break;
    }
    case "death": {
      // Glas grave + souffle.
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 2);
      env(g, 0.35, 0.01, 2.4);
      o.connect(g).connect(fx);
      o.start(t);
      o.stop(t + 2.5);
      const n = a.createBufferSource();
      n.buffer = noiseBuffer(a, 2);
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 300;
      const ng = a.createGain();
      env(ng, 0.2, 0.3, 1.5);
      n.connect(f).connect(ng).connect(fx);
      n.start(t);
      n.stop(t + 2);
      break;
    }
    case "shot": {
      const n = a.createBufferSource();
      n.buffer = noiseBuffer(a, 1);
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(4000, t);
      f.frequency.exponentialRampToValueAtTime(200, t + 0.5);
      const g = a.createGain();
      env(g, 0.9, 0.002, 0.6);
      n.connect(f).connect(g).connect(fx);
      n.start(t);
      n.stop(t + 0.8);
      const o = a.createOscillator();
      const og = a.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      env(og, 0.6, 0.002, 0.35);
      o.connect(og).connect(fx);
      o.start(t);
      o.stop(t + 0.4);
      break;
    }
    case "heartbeat": {
      for (let i = 0; i < 4; i++) {
        for (const [d, v] of [
          [0, 0.5],
          [0.22, 0.35],
        ] as const) {
          const at = t + i * 0.95 + d;
          const o = a.createOscillator();
          const g = a.createGain();
          o.frequency.setValueAtTime(70, at);
          o.frequency.exponentialRampToValueAtTime(40, at + 0.15);
          env(g, v, 0.01, 0.18, at);
          o.connect(g).connect(fx);
          o.start(at);
          o.stop(at + 0.25);
        }
      }
      break;
    }
    case "magic": {
      [72, 76, 79, 84, 88].forEach((n, i) => blip(a, fx!, hz(n), t + i * 0.07, 0.9, 0.06));
      break;
    }
    case "love": {
      [76, 79, 83, 88].forEach((n, i) => blip(a, fx!, hz(n), t + i * 0.11, 0.6, 0.07));
      break;
    }
    case "vote": {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = "square";
      o.frequency.value = 180;
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 900;
      env(g, 0.12, 0.003, 0.09);
      o.connect(f).connect(g).connect(fx);
      o.start(t);
      o.stop(t + 0.12);
      break;
    }
    case "pop":
      blip(a, fx, 880, t, 0.08, 0.05);
      break;
    case "gasp":
      [64, 60].forEach((n, i) => blip(a, fx!, hz(n), t + i * 0.12, 0.5, 0.08));
      break;
    case "victory":
      [60, 64, 67, 72, 76].forEach((n, i) => blip(a, fx!, hz(n), t + i * 0.12, 1.2, 0.09));
      break;
    case "defeat":
      [57, 53, 50, 45].forEach((n, i) => blip(a, fx!, hz(n), t + i * 0.25, 1.4, 0.09));
      break;
  }
}

// ── Le narrateur ────────────────────────────────────────────

const VOICE_KEY = "3ajib:loup:voix";
let voiceOn = (() => {
  try {
    return localStorage.getItem(VOICE_KEY) !== "0";
  } catch {
    return true;
  }
})();

export function isVoiceOn() {
  return voiceOn && typeof speechSynthesis !== "undefined";
}

export function setVoiceOn(on: boolean) {
  voiceOn = on;
  try {
    localStorage.setItem(VOICE_KEY, on ? "1" : "0");
  } catch {
    /* rien */
  }
  if (!on && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

function frenchVoice(): SpeechSynthesisVoice | null {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("fr"));
  // On préfère les voix naturelles quand le système en propose.
  return voices.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name)) ?? voices[0] ?? null;
}

export function narrate(text: string, interrupt = false) {
  if (!isVoiceOn() || isMuted()) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "fr-FR";
    const v = frenchVoice();
    if (v) u.voice = v;
    u.rate = 0.95;
    u.pitch = 0.85;
    u.volume = 0.9;
    speechSynthesis.speak(u);
  } catch {
    /* pas de synthèse vocale */
  }
}

export function stopNarration() {
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}
