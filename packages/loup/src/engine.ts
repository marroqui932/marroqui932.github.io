// Moteur des Loups-Garous : le narrateur, c'est lui.
// Chaque étape a un minuteur ; l'hôte renvoie `timeout` quand il expire.

import type {
  ChatMsg,
  DeathCause,
  LoupAction,
  LoupEvent,
  LoupOptions,
  LoupPlayer,
  LoupState,
  NightState,
  NightStep,
  PlayerId,
  RoleId,
  Winner,
} from "./types";

export class LoupError extends Error {}

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 18;

export const ROLE_ORDER: RoleId[] = ["loup", "villageois", "voyante", "sorciere", "chasseur", "cupidon", "petiteFille", "salvateur", "ancien", "idiot", "corbeau", "bouc"];
/** Rôles qu'on ne peut avoir qu'en un seul exemplaire. */
export const UNIQUE_ROLES: RoleId[] = ["voyante", "sorciere", "chasseur", "cupidon", "petiteFille", "salvateur", "ancien", "idiot", "corbeau", "bouc"];
export const NIGHT_ORDER: NightStep[] = ["cupidon", "amoureux", "salvateur", "voyante", "loups", "sorciere", "corbeau"];

export const DEFAULT_OPTIONS: LoupOptions = { roles: {}, mayor: true, debateSeconds: 180, revealRoles: true };

/** Durées (ms). */
export const DURATIONS = {
  intro: 15000,
  dusk: 6000,
  cupidon: 45000,
  amoureux: 9000,
  salvateur: 40000,
  voyante: 40000,
  loups: 75000,
  sorciere: 45000,
  corbeau: 35000,
  hunter: 40000,
  successor: 40000,
  mayorVote: 90000,
  verdict: 8000,
  voteClosing: 10000,
  mayorClosing: 6000,
};

export const campOf = (role: RoleId | null): "loups" | "village" => (role === "loup" ? "loups" : "village");

/** Composition conseillée selon le nombre de joueurs. */
export function suggestComposition(n: number): Partial<Record<RoleId, number>> {
  const wolves = n <= 6 ? 1 : n <= 11 ? 2 : n <= 15 ? 3 : 4;
  const specials: RoleId[] = ["voyante", "sorciere", "chasseur", "cupidon", "salvateur", "petiteFille", "ancien", "idiot", "corbeau", "bouc"];
  const out: Partial<Record<RoleId, number>> = { loup: wolves };
  let left = n - wolves;
  // On garde toujours au moins un simple villageois à partir de 6 joueurs.
  const keep = n >= 6 ? 1 : 0;
  for (const r of specials) {
    if (left <= keep) break;
    out[r] = 1;
    left--;
  }
  if (left > 0) out.villageois = left;
  return out;
}

export function compositionSize(c: Partial<Record<RoleId, number>>): number {
  return Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
}

/** Vérifie une composition ; renvoie un message d'erreur ou `null`. */
export function compositionError(c: Partial<Record<RoleId, number>>, players: number): string | null {
  if (players < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
  if (players > MAX_PLAYERS) return `${MAX_PLAYERS} joueurs maximum.`;
  const size = compositionSize(c);
  if (size !== players) return `La composition compte ${size} carte${size > 1 ? "s" : ""} pour ${players} joueurs.`;
  if (!c.loup) return "Il faut au moins un loup-garou.";
  if (c.loup >= players - c.loup) return "Trop de loups : ils doivent être moins nombreux que les villageois.";
  for (const r of UNIQUE_ROLES) if ((c[r] ?? 0) > 1) return "Chaque rôle spécial n'existe qu'en un exemplaire.";
  return null;
}

// ── Hasard déterministe ─────────────────────────────────────

function rand(s: { rng: number }): number {
  let a = (s.rng + 0x6d2b79f5) | 0;
  s.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s: { rng: number }, lo: number, hi: number) => Math.round(lo + rand(s) * (hi - lo));
function pick<T>(s: { rng: number }, items: T[]): T | undefined {
  return items.length ? items[Math.floor(rand(s) * items.length)] : undefined;
}
function shuffle<T>(s: { rng: number }, items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── Création ────────────────────────────────────────────────

export interface NewPlayer {
  id: PlayerId;
  name: string;
  color: string;
  token: string;
}

export function createLoup(players: NewPlayer[], options: Partial<LoupOptions> = {}, seed = Date.now()): LoupState {
  const opts: LoupOptions = { ...DEFAULT_OPTIONS, ...options };
  const composition = Object.keys(opts.roles).length ? opts.roles : suggestComposition(players.length);
  const err = compositionError(composition, players.length);
  if (err) throw new LoupError(err);
  const s: LoupState = {
    players: [],
    options: { ...opts, roles: composition },
    composition,
    phase: "intro",
    step: { id: 0, ms: 0 },
    day: 0,
    night: null,
    lovers: null,
    mayor: null,
    potions: { life: true, death: true },
    lastProtected: null,
    elderHit: false,
    ravenTarget: null,
    votes: {},
    voteClosing: false,
    pending: [],
    resume: "night",
    knowledge: {},
    announce: null,
    chat: [],
    winner: null,
    rng: seed >>> 0 || 1,
  };
  const deck: RoleId[] = [];
  for (const r of ROLE_ORDER) for (let i = 0; i < (composition[r] ?? 0); i++) deck.push(r);
  const roles = shuffle(s, deck);
  s.players = players.map((p, i) => ({ ...p, role: roles[i]!, alive: true, revealed: false, canVote: true, left: false }));
  for (const p of s.players) s.knowledge[p.id] = {};
  timer(s, DURATIONS.intro);
  return s;
}

// ── Outils ──────────────────────────────────────────────────

const clone = <T>(x: T): T => structuredClone(x);

function timer(s: LoupState, ms: number) {
  s.step = { id: s.step.id + 1, ms };
}

const byId = (s: LoupState, id: PlayerId | null | undefined) => (id ? s.players.find((p) => p.id === id) : undefined);
const alive = (s: LoupState) => s.players.filter((p) => p.alive);
const withRole = (s: LoupState, r: RoleId) => s.players.filter((p) => p.role === r);
const aliveWith = (s: LoupState, r: RoleId) => alive(s).filter((p) => p.role === r);
const wolfIds = (s: LoupState) => withRole(s, "loup").map((p) => p.id);
const deadIds = (s: LoupState) => s.players.filter((p) => !p.alive).map((p) => p.id);

function mustBeAlive(s: LoupState, id: PlayerId | null | undefined, what = "Ce joueur"): LoupPlayer {
  const p = byId(s, id);
  if (!p) throw new LoupError("Joueur inconnu.");
  if (!p.alive) throw new LoupError(`${what} est déjà mort.`);
  return p;
}

function learn(s: LoupState, who: PlayerId, about: PlayerId) {
  const p = byId(s, about);
  if (p?.role) s.knowledge[who] = { ...s.knowledge[who], [about]: p.role };
}

/** Tue un joueur et déclenche les conséquences (amoureux, chasseur, maire). */
function kill(s: LoupState, id: PlayerId, cause: DeathCause, ev: LoupEvent[]) {
  const p = byId(s, id);
  if (!p || !p.alive) return;
  p.alive = false;
  if (s.options.revealRoles || cause === "parti") p.revealed = true;
  ev.push({ type: "died", player: id, cause: cause === "loups" || cause === "poison" ? "nuit" : cause, role: p.revealed ? p.role : null });
  if (p.role === "chasseur" && cause !== "parti") s.pending.push({ kind: "hunter", player: id });
  if (s.mayor === id) s.pending.push({ kind: "successor", player: id });
  if (s.lovers?.includes(id)) {
    const other = s.lovers[0] === id ? s.lovers[1] : s.lovers[0];
    kill(s, other, "chagrin", ev);
  }
}

function checkWin(s: LoupState): Winner | null {
  const living = alive(s);
  if (!living.length) return { camp: "personne", players: [] };
  const [a, b] = s.lovers ?? [];
  const la = byId(s, a);
  const lb = byId(s, b);
  if (la && lb && la.alive && lb.alive && campOf(la.role) !== campOf(lb.role) && living.length === 2) {
    return { camp: "amoureux", players: [la.id, lb.id, ...withRole(s, "cupidon").map((p) => p.id)] };
  }
  const wolves = living.filter((p) => p.role === "loup").length;
  if (wolves === 0) return { camp: "village", players: s.players.filter((p) => p.role !== "loup").map((p) => p.id) };
  if (wolves === living.length) return { camp: "loups", players: wolfIds(s) };
  return null;
}

function endGame(s: LoupState, w: Winner, ev: LoupEvent[]) {
  s.winner = w;
  s.phase = "gameOver";
  s.night = null;
  for (const p of s.players) p.revealed = true;
  timer(s, 0);
  ev.push({ type: "phase", phase: "gameOver", day: s.day }, { type: "gameOver", winner: w });
}

// ── Enchaînement des phases ─────────────────────────────────

function beginNight(s: LoupState, ev: LoupEvent[]) {
  s.day++;
  s.phase = "night";
  s.votes = {};
  s.voteClosing = false;
  s.ravenTarget = null;
  s.announce = null;
  const present = (r: RoleId) => (s.composition[r] ?? 0) > 0;
  const queue = NIGHT_ORDER.filter((st) => {
    if (st === "cupidon" || st === "amoureux") return s.day === 1 && present("cupidon");
    if (st === "loups") return true;
    return present(st);
  });
  s.night = { step: null, queue, actors: [], done: false, protectedId: null, seen: null, wolfVotes: {}, victim: null, saved: false, poisoned: null, spied: false };
  timer(s, DURATIONS.dusk);
  ev.push({ type: "phase", phase: "night", day: s.day });
}

function nextNightStep(s: LoupState, ev: LoupEvent[]) {
  const n = s.night!;
  const step = n.queue.shift();
  if (!step) return endNight(s, ev);
  n.step = step;
  n.done = false;
  let actors: PlayerId[] = [];
  if (step === "amoureux") actors = s.lovers ? [...s.lovers].filter((id) => byId(s, id)?.alive) : [];
  else if (step === "loups") actors = aliveWith(s, "loup").map((p) => p.id);
  else if (step === "sorciere") actors = s.potions && (s.potions.life || s.potions.death) ? aliveWith(s, "sorciere").map((p) => p.id) : [];
  else actors = aliveWith(s, step).map((p) => p.id);
  n.actors = actors;
  ev.push({ type: "nightStep", step });
  if (step === "amoureux") timer(s, DURATIONS.amoureux);
  else if (!actors.length) timer(s, between(s, 7000, 15000)); // étape fantôme : le rôle est mort ou absent
  else timer(s, DURATIONS[step]);
}

/** L'action d'une étape de nuit est faite : petite pause pour ne rien trahir, puis on enchaîne. */
function stepDone(s: LoupState) {
  s.night!.done = true;
  timer(s, between(s, 2500, 4500));
}

/** Fin de l'étape de nuit (minuteur écoulé) : action par défaut si besoin. */
function closeNightStep(s: LoupState, ev: LoupEvent[]) {
  const n = s.night!;
  if (n.step === "cupidon" && !s.lovers && n.actors.length) {
    const pool = shuffle(s, alive(s).map((p) => p.id));
    setLovers(s, n.actors[0]!, pool[0]!, pool[1]!, ev);
  }
  if (n.step === "salvateur" && !n.done) s.lastProtected = null;
  if (n.step === "loups" && !n.done) resolveWolves(s, ev, true);
  nextNightStep(s, ev);
}

function setLovers(s: LoupState, cupid: PlayerId, a: PlayerId, b: PlayerId, ev: LoupEvent[]) {
  s.lovers = [a, b];
  learn(s, a, b);
  learn(s, b, a);
  ev.push({ type: "inLove", a, b, to: [cupid, a, b] });
}

function resolveWolves(s: LoupState, ev: LoupEvent[], forced: boolean) {
  const n = s.night!;
  const wolves = n.actors.filter((id) => byId(s, id)?.alive);
  const votes = wolves.map((w) => n.wolfVotes[w]).filter((t): t is PlayerId => !!t);
  if (!forced && (votes.length < wolves.length || new Set(votes).size !== 1)) return false;
  const tally = new Map<PlayerId, number>();
  for (const t of votes) tally.set(t, (tally.get(t) ?? 0) + 1);
  const max = Math.max(0, ...tally.values());
  const top = [...tally].filter(([, c]) => c === max).map(([id]) => id);
  n.victim = pick(s, top) ?? null;
  ev.push({ type: "wolvesChose", target: n.victim, to: [...wolfIds(s), ...deadIds(s)] });
  return true;
}

function endNight(s: LoupState, ev: LoupEvent[]) {
  const n = s.night!;
  const deaths: PlayerId[] = [];
  const before = new Set(alive(s).map((p) => p.id));
  const victim = byId(s, n.victim);
  if (victim && victim.alive && !n.saved && n.protectedId !== victim.id) {
    if (victim.role === "ancien" && !s.elderHit) {
      s.elderHit = true;
      ev.push({ type: "elderSurvived", player: victim.id, to: [victim.id, ...deadIds(s)] });
    } else kill(s, victim.id, "loups", ev);
  }
  if (n.poisoned) kill(s, n.poisoned, "poison", ev);
  for (const id of before) if (!byId(s, id)!.alive) deaths.push(id);
  s.night = null;
  s.phase = "dawn";
  s.announce = { deaths, spared: null, tie: false };
  s.resume = "day";
  ev.push({ type: "phase", phase: "dawn", day: s.day }, { type: "dawn", deaths });
  timer(s, 7000 + 3500 * deaths.length);
}

/** Après des morts : chasseur, successeur, victoire, puis on reprend. */
function afterDeaths(s: LoupState, ev: LoupEvent[]) {
  const w = checkWin(s);
  // Le chasseur tire même si la partie semble finie : son tir peut tout changer.
  const next = s.pending[0];
  if (next && !(w && next.kind === "successor")) {
    s.phase = next.kind;
    ev.push({ type: "phase", phase: next.kind, day: s.day });
    timer(s, next.kind === "hunter" ? DURATIONS.hunter : DURATIONS.successor);
    return;
  }
  if (w) return endGame(s, w, ev);
  s.pending = [];
  if (s.resume === "night") return beginNight(s, ev);
  beginDay(s, ev);
}

function beginDay(s: LoupState, ev: LoupEvent[]) {
  s.votes = {};
  s.voteClosing = false;
  s.announce = null;
  if (s.day === 1 && s.options.mayor && !s.mayor) {
    s.phase = "mayorVote";
    timer(s, DURATIONS.mayorVote);
  } else {
    s.phase = "vote";
    timer(s, s.options.debateSeconds * 1000);
  }
  ev.push({ type: "phase", phase: s.phase, day: s.day });
}

const voters = (s: LoupState) => alive(s).filter((p) => p.canVote);

function tally(s: LoupState, withWeights: boolean): Map<PlayerId, number> {
  const t = new Map<PlayerId, number>();
  for (const [by, target] of Object.entries(s.votes)) {
    if (!byId(s, by)?.alive || !byId(s, target)?.alive) continue;
    t.set(target, (t.get(target) ?? 0) + (withWeights && s.mayor === by ? 2 : 1));
  }
  if (withWeights && s.ravenTarget && byId(s, s.ravenTarget)?.alive) t.set(s.ravenTarget, (t.get(s.ravenTarget) ?? 0) + 2);
  return t;
}

/** Décompte public des voix (avec maire et corbeau). */
export function voteTally(s: LoupState): Record<PlayerId, number> {
  return Object.fromEntries(tally(s, s.phase === "vote"));
}

function resolveMayor(s: LoupState, ev: LoupEvent[]) {
  const t = tally(s, false);
  const max = Math.max(0, ...t.values());
  const top = max ? [...t].filter(([, c]) => c === max).map(([id]) => id) : alive(s).map((p) => p.id);
  const m = pick(s, top)!;
  s.mayor = m;
  ev.push({ type: "mayor", player: m, by: "vote" });
  s.votes = {};
  s.voteClosing = false;
  s.phase = "vote";
  timer(s, s.options.debateSeconds * 1000);
  ev.push({ type: "phase", phase: "vote", day: s.day });
}

function resolveVote(s: LoupState, ev: LoupEvent[]) {
  const t = tally(s, true);
  const max = Math.max(0, ...t.values());
  const top = [...t].filter(([, c]) => c === max).map(([id]) => id);
  const before = new Set(alive(s).map((p) => p.id));
  let target: PlayerId | null = null;
  let tie = false;
  let spared: PlayerId | null = null;
  if (top.length === 1) target = top[0]!;
  else if (top.length > 1) {
    tie = true;
    const bouc = aliveWith(s, "bouc")[0];
    if (bouc) target = bouc.id;
  }
  ev.push({ type: "verdict", target, tie });
  if (target) {
    const p = byId(s, target)!;
    if (p.role === "idiot" && !p.revealed) {
      p.revealed = true;
      p.canVote = false;
      spared = p.id;
      ev.push({ type: "idiotSpared", player: p.id });
    } else kill(s, target, tie ? "bouc" : "vote", ev);
  }
  const deaths = [...before].filter((id) => !byId(s, id)!.alive);
  s.announce = { deaths, spared, tie };
  s.phase = "verdict";
  s.resume = "night";
  ev.push({ type: "phase", phase: "verdict", day: s.day });
  timer(s, DURATIONS.verdict + 2500 * Math.max(0, deaths.length - 1));
}

function maybeCloseVote(s: LoupState, ev: LoupEvent[]) {
  if (s.voteClosing) return;
  const eligible = voters(s);
  if (eligible.length && eligible.every((p) => s.votes[p.id] && byId(s, s.votes[p.id])?.alive)) {
    s.voteClosing = true;
    timer(s, s.phase === "mayorVote" ? DURATIONS.mayorClosing : DURATIONS.voteClosing);
    ev.push({ type: "voteClosing" });
  }
}

// ── Discussion ──────────────────────────────────────────────

function channelFor(s: LoupState, p: LoupPlayer): ChatMsg["channel"] {
  if (s.phase === "gameOver") return "village";
  if (!p.alive) return "morts";
  if (s.phase === "night") {
    if (p.role === "loup") return "loups";
    throw new LoupError("Chut… c'est la nuit, le village dort.");
  }
  return "village";
}

function chatAudience(s: LoupState, c: ChatMsg["channel"]): PlayerId[] | undefined {
  if (c === "village" || s.phase === "gameOver") return undefined;
  if (c === "loups") return [...wolfIds(s), ...deadIds(s)];
  return deadIds(s);
}

// ── Actions ─────────────────────────────────────────────────

export function applyLoup(state: LoupState, playerId: PlayerId, action: LoupAction): { state: LoupState; events: LoupEvent[] } {
  const s = clone(state);
  const ev: LoupEvent[] = [];
  const me = byId(s, playerId);
  if (!me) throw new LoupError("Vous ne faites pas partie de cette partie.");

  if (action.type === "say") {
    const text = action.text.trim().slice(0, 240);
    if (!text) throw new LoupError("Message vide.");
    const channel = channelFor(s, me);
    const msg: ChatMsg = { id: (s.chat[s.chat.length - 1]?.id ?? 0) + 1, from: me.id, channel, text };
    s.chat = [...s.chat, msg].slice(-200);
    ev.push({ type: "chat", msg, to: chatAudience(s, channel) });
    return { state: s, events: ev };
  }

  if (action.type === "leave") {
    if (me.left) return { state: s, events: ev };
    me.left = true;
    if (s.phase === "gameOver") return { state: s, events: ev };
    kill(s, me.id, "parti", ev);
    if (s.phase === "night" || s.phase === "dawn" || s.phase === "verdict" || s.phase === "intro") {
      // Les morts seront traitées à la fin de l'étape en cours.
      const w = checkWin(s);
      if (w) endGame(s, w, ev);
    } else if (s.phase === "vote" || s.phase === "mayorVote") {
      delete s.votes[me.id];
      maybeCloseVote(s, ev);
      const w = checkWin(s);
      if (w) endGame(s, w, ev);
    }
    return { state: s, events: ev };
  }

  if (s.phase === "gameOver") throw new LoupError("La partie est terminée.");

  if (action.type === "timeout") {
    if (action.step !== s.step.id) return { state: s, events: ev }; // minuteur périmé
    onTimeout(s, ev);
    return { state: s, events: ev };
  }

  switch (s.phase) {
    case "night":
      nightAction(s, me, action, ev);
      break;
    case "mayorVote":
    case "vote": {
      if (action.type !== "vote") throw new LoupError("Ce n'est pas le moment.");
      if (!me.alive) throw new LoupError("Les morts ne votent pas.");
      if (!me.canVote) throw new LoupError("L'idiot du village ne vote plus.");
      if (action.target === null) delete s.votes[me.id];
      else {
        const t = mustBeAlive(s, action.target, "Ce joueur");
        if (s.phase === "vote" && t.id === me.id) throw new LoupError("Vous ne pouvez pas voter contre vous-même.");
        s.votes[me.id] = t.id;
      }
      ev.push({ type: "voted", by: me.id, target: action.target });
      maybeCloseVote(s, ev);
      break;
    }
    case "hunter": {
      const p = s.pending[0]!;
      if (action.type !== "shoot") throw new LoupError("Le chasseur doit tirer.");
      if (p.player !== me.id) throw new LoupError("Ce n'est pas à vous de tirer.");
      if (action.target !== null) mustBeAlive(s, action.target, "Ce joueur");
      s.pending.shift();
      ev.push({ type: "shot", by: me.id, target: action.target });
      if (action.target) kill(s, action.target, "chasseur", ev);
      afterDeaths(s, ev);
      break;
    }
    case "successor": {
      const p = s.pending[0]!;
      if (action.type !== "successor") throw new LoupError("Le maire doit désigner son successeur.");
      if (p.player !== me.id) throw new LoupError("Ce n'est pas à vous de choisir.");
      const t = mustBeAlive(s, action.target, "Ce joueur");
      s.pending.shift();
      s.mayor = t.id;
      ev.push({ type: "mayor", player: t.id, by: "successor" });
      afterDeaths(s, ev);
      break;
    }
    default:
      throw new LoupError("Ce n'est pas le moment.");
  }
  return { state: s, events: ev };
}

function nightAction(s: LoupState, me: LoupPlayer, action: LoupAction, ev: LoupEvent[]) {
  const n = s.night!;
  // La petite fille espionne pendant que les loups choisissent.
  if (action.type === "spy") {
    if (me.role !== "petiteFille" || !me.alive) throw new LoupError("Seule la petite fille peut espionner.");
    if (n.step !== "loups") throw new LoupError("Les loups ne sont pas réveillés.");
    if (n.spied) throw new LoupError("Vous avez déjà espionné cette nuit.");
    n.spied = true;
    const r = rand(s);
    const wolves = aliveWith(s, "loup").filter((w) => !s.knowledge[me.id]?.[w.id]);
    if (r < 0.2) {
      learnAll(s, wolfIds(s), me.id);
      ev.push({ type: "spied", wolf: null, caught: true, to: [me.id] }, { type: "spotted", girl: me.id, to: [...wolfIds(s), ...deadIds(s)] });
    } else if (r < 0.65 && wolves.length) {
      const w = pick(s, wolves)!;
      learn(s, me.id, w.id);
      ev.push({ type: "spied", wolf: w.id, to: [me.id, ...deadIds(s)] });
    } else ev.push({ type: "spied", wolf: null, to: [me.id] });
    return;
  }
  if (!n.step || !n.actors.includes(me.id)) throw new LoupError("Vous dormez… ce n'est pas votre tour.");
  if (n.done && n.step !== "loups") throw new LoupError("Vous avez déjà agi cette nuit.");
  switch (n.step) {
    case "cupidon": {
      if (action.type !== "cupid") throw new LoupError("Cupidon doit choisir deux amoureux.");
      mustBeAlive(s, action.a);
      mustBeAlive(s, action.b);
      if (action.a === action.b) throw new LoupError("Il faut deux joueurs différents.");
      setLovers(s, me.id, action.a, action.b, ev);
      stepDone(s);
      return;
    }
    case "salvateur": {
      if (action.type !== "protect") throw new LoupError("Le salvateur doit protéger quelqu'un.");
      const t = mustBeAlive(s, action.target);
      if (t.id === s.lastProtected) throw new LoupError("Impossible de protéger la même personne deux nuits de suite.");
      n.protectedId = t.id;
      s.lastProtected = t.id;
      ev.push({ type: "protected", target: t.id, to: [me.id, ...deadIds(s)] });
      stepDone(s);
      return;
    }
    case "voyante": {
      if (action.type !== "see") throw new LoupError("La voyante doit sonder un joueur.");
      const t = mustBeAlive(s, action.target);
      if (t.id === me.id) throw new LoupError("Vous connaissez déjà votre rôle.");
      learn(s, me.id, t.id);
      n.seen = { target: t.id, role: t.role! };
      ev.push({ type: "seen", target: t.id, role: t.role!, to: [me.id, ...deadIds(s)] });
      stepDone(s);
      return;
    }
    case "loups": {
      if (action.type !== "wolfVote") throw new LoupError("Les loups doivent choisir une victime.");
      if (n.done) throw new LoupError("La meute a déjà choisi.");
      const t = mustBeAlive(s, action.target);
      if (t.role === "loup") throw new LoupError("Un loup ne dévore pas un autre loup.");
      n.wolfVotes[me.id] = t.id;
      ev.push({ type: "wolfVoted", by: me.id, target: t.id, to: [...wolfIds(s), ...deadIds(s)] });
      if (resolveWolves(s, ev, false)) stepDone(s);
      return;
    }
    case "sorciere": {
      if (action.type !== "potion") throw new LoupError("La sorcière doit décider.");
      const pot = s.potions!;
      if (action.save && (!pot.life || !n.victim)) throw new LoupError("Impossible d'utiliser la potion de vie.");
      if (action.kill) {
        if (!pot.death) throw new LoupError("La potion de mort est déjà utilisée.");
        mustBeAlive(s, action.kill);
      }
      if (action.save) {
        pot.life = false;
        n.saved = true;
      }
      if (action.kill) {
        pot.death = false;
        n.poisoned = action.kill;
      }
      ev.push({ type: "potion", save: action.save, kill: action.kill, to: [me.id, ...deadIds(s)] });
      stepDone(s);
      return;
    }
    case "corbeau": {
      if (action.type !== "raven") throw new LoupError("Le corbeau doit désigner quelqu'un (ou personne).");
      if (action.target) mustBeAlive(s, action.target);
      s.ravenTarget = action.target;
      ev.push({ type: "raven", target: action.target, to: [me.id, ...deadIds(s)] });
      stepDone(s);
      return;
    }
    case "amoureux":
      throw new LoupError("Les amoureux se découvrent… rien à faire.");
  }
}

function learnAll(s: LoupState, who: PlayerId[], about: PlayerId) {
  for (const w of who) learn(s, w, about);
}

function onTimeout(s: LoupState, ev: LoupEvent[]) {
  switch (s.phase) {
    case "intro":
      return beginNight(s, ev);
    case "night":
      if (!s.night!.step) return nextNightStep(s, ev);
      return closeNightStep(s, ev);
    case "dawn":
      if (s.ravenTarget && byId(s, s.ravenTarget)?.alive) ev.push({ type: "raven", target: s.ravenTarget });
      return afterDeaths(s, ev);
    case "verdict":
      return afterDeaths(s, ev);
    case "mayorVote":
      return resolveMayor(s, ev);
    case "vote":
      return resolveVote(s, ev);
    case "hunter": {
      const p = s.pending.shift()!;
      ev.push({ type: "shot", by: p.player, target: null });
      return afterDeaths(s, ev);
    }
    case "successor": {
      s.pending.shift();
      const m = pick(s, alive(s))!;
      s.mayor = m.id;
      ev.push({ type: "mayor", player: m.id, by: "successor" });
      return afterDeaths(s, ev);
    }
    default:
      return;
  }
}

// ── Vues privées ────────────────────────────────────────────

/** Le joueur voit-il tout (mort ou partie finie) ? */
export function isOmniscient(s: LoupState, id: PlayerId | null): boolean {
  const me = byId(s, id);
  return s.phase === "gameOver" || (!!me && !me.alive);
}

export function viewFor(s: LoupState, id: PlayerId | null): LoupState {
  const v = clone(s);
  v.rng = 0;
  const me = byId(s, id);
  if (isOmniscient(s, id)) return v;
  const role = me?.role ?? null;
  const known = (id && s.knowledge[id]) || {};
  v.players = s.players.map((p) => ({
    ...p,
    role: p.id === id || p.revealed || known[p.id] || (role === "loup" && p.role === "loup") ? p.role : null,
  }));
  v.knowledge = id ? { [id]: known } : {};
  if (!(id && s.lovers?.includes(id)) && role !== "cupidon") v.lovers = null;
  if (role !== "sorciere") v.potions = null;
  if (role !== "salvateur") v.lastProtected = null;
  v.elderHit = false;
  if (s.phase === "night" && role !== "corbeau") v.ravenTarget = null;
  v.pending = s.pending.map((p) => ({ ...p }));
  if (s.night) {
    const n = s.night;
    const acting = !!id && n.actors.includes(id);
    const isWolf = role === "loup";
    v.night = {
      step: n.step,
      queue: [],
      actors: acting || (isWolf && n.step === "loups") ? n.actors : [],
      done: acting ? n.done : false,
      protectedId: role === "salvateur" ? n.protectedId : null,
      seen: role === "voyante" ? n.seen : null,
      wolfVotes: isWolf ? n.wolfVotes : {},
      victim: isWolf || (role === "sorciere" && (n.step === "sorciere" || n.step === "corbeau")) ? n.victim : null,
      saved: role === "sorciere" ? n.saved : false,
      poisoned: role === "sorciere" ? n.poisoned : null,
      spied: role === "petiteFille" ? n.spied : false,
    };
    // Le minuteur d'une étape de nuit trahirait les rôles absents : seuls les réveillés le voient.
    if (!acting && !(role === "petiteFille" && n.step === "loups")) v.step = { id: s.step.id, ms: 0 };
  }
  v.chat = s.chat.filter((m) => m.channel === "village" || (m.channel === "loups" && role === "loup"));
  return v;
}

export function eventsFor(events: LoupEvent[], id: PlayerId | null, s: LoupState): LoupEvent[] {
  if (isOmniscient(s, id)) return events;
  return events.filter((e) => !e.to || (!!id && e.to.includes(id)));
}

/** Ce que le joueur peut faire en ce moment (pour l'interface). */
export function isAwake(v: LoupState, id: PlayerId | null): boolean {
  return !!id && !!v.night && v.night.actors.includes(id);
}
