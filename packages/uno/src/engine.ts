// Moteur Uno — règles officielles (Mattel) :
// 108 cartes, 7 cartes chacun, on suit la couleur, le chiffre ou le symbole ;
// Passe, Inversion, +2, Joker, +4 (posable seulement sans carte de la couleur
// demandée, contestable) ; une seule carte piochée, jouable tout de suite ;
// « UNO ! » obligatoire à l'avant-dernière carte (sinon +2 si on se fait
// attraper) ; le gagnant marque les cartes des autres, partie en 500 points.

import type {
  NewPlayer,
  PlayerId,
  UnoAction,
  UnoCard,
  UnoColor,
  UnoEvent,
  UnoOptions,
  UnoPlayer,
  UnoState,
} from "./types";
import { COLORS } from "./types";

export class UnoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnoError";
  }
}

function fail(message: string): never {
  throw new UnoError(message);
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const HAND_SIZE = 7;
export const DEFAULT_OPTIONS: UnoOptions = { targetScore: 500 };

const COLOR_NAMES: Record<UnoColor, string> = { red: "rouge", yellow: "jaune", green: "vert", blue: "bleu" };

export function colorName(c: UnoColor) {
  return COLOR_NAMES[c];
}

export function cardLabel(card: UnoCard): string {
  const col = card.color ? ` ${COLOR_NAMES[card.color]}` : "";
  switch (card.kind) {
    case "number":
      return `${card.value}${col}`;
    case "skip":
      return `Passe ton tour${col}`;
    case "reverse":
      return `Inversion${col}`;
    case "draw2":
      return `+2${col}`;
    case "wild":
      return "Joker";
    case "wild4":
      return "Joker +4";
  }
}

/** Valeur d'une carte en fin de manche. */
export function cardPoints(card: UnoCard): number {
  if (card.kind === "number") return card.value!;
  if (card.kind === "wild" || card.kind === "wild4") return 50;
  return 20;
}

// ── Hasard déterministe ─────────────────────────────────────

function rand(s: { rng: number }): number {
  let a = (s.rng + 0x6d2b79f5) | 0;
  s.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle<T>(s: { rng: number }, items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Le paquet officiel de 108 cartes. */
export function buildDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  let id = 0;
  for (const color of COLORS) {
    deck.push({ id: id++, kind: "number", color, value: 0 });
    for (let n = 1; n <= 9; n++) {
      for (let k = 0; k < 2; k++) deck.push({ id: id++, kind: "number", color, value: n });
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      for (let k = 0; k < 2; k++) deck.push({ id: id++, kind, color, value: null });
    }
  }
  for (let k = 0; k < 4; k++) deck.push({ id: id++, kind: "wild", color: null, value: null });
  for (let k = 0; k < 4; k++) deck.push({ id: id++, kind: "wild4", color: null, value: null });
  return deck;
}

// ── Création ────────────────────────────────────────────────

export function createUno(players: NewPlayer[], options: Partial<UnoOptions> = {}, seed = Date.now()): UnoState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) fail(`Il faut entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs.`);
  if (new Set(players.map((p) => p.id)).size !== players.length) fail("Identifiants de joueurs en double.");
  const s: UnoState = {
    version: 1,
    game: "uno",
    options: { ...DEFAULT_OPTIONS, ...options },
    players: players.map((p) => ({ ...p, hand: [], handCount: 0, score: 0, saidUno: false, left: false })),
    drawPile: [],
    drawCount: 0,
    discard: [],
    currentColor: "red",
    direction: 1,
    current: 0,
    dealer: 0,
    phase: "play",
    drawn: null,
    pendingWild4: null,
    unoTarget: null,
    round: 0,
    roundResult: null,
    winner: null,
    rng: seed | 0,
    log: [],
    logCounter: 0,
  };
  // Le donneur est tiré au sort.
  s.dealer = Math.floor(rand(s) * players.length);
  const c: Ctx = { s, events: [] };
  startRound(c);
  return s;
}

// ── Contexte ────────────────────────────────────────────────

interface Ctx {
  s: UnoState;
  events: UnoEvent[];
}

function log(c: Ctx, text: string) {
  c.s.logCounter++;
  c.s.log.push({ n: c.s.logCounter, text });
  if (c.s.log.length > 200) c.s.log.splice(0, c.s.log.length - 200);
}

function player(s: UnoState, id: PlayerId): UnoPlayer | undefined {
  return s.players.find((p) => p.id === id);
}

export function topCard(s: UnoState): UnoCard {
  return s.discard[s.discard.length - 1]!;
}

function activeCount(s: UnoState) {
  return s.players.filter((p) => !p.left).length;
}

/** Index du joueur `steps` places plus loin dans le sens du jeu (en sautant ceux qui sont partis). */
function nextIndex(s: UnoState, from: number, steps = 1): number {
  const n = s.players.length;
  let i = from;
  let moved = 0;
  while (moved < steps) {
    i = (((i + s.direction) % n) + n) % n;
    if (!s.players[i]!.left) moved++;
    if (i === from && moved === 0) break;
  }
  return i;
}

function sync(p: UnoPlayer) {
  p.handCount = p.hand.length;
  if (p.hand.length !== 1) p.saidUno = false;
}

function drawCards(c: Ctx, p: UnoPlayer, count: number, reason: string): UnoCard[] {
  const s = c.s;
  const got: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (s.drawPile.length === 0) {
      // Pioche vide : on remélange la défausse (sauf la carte du dessus).
      const top = s.discard.pop()!;
      if (s.discard.length === 0) {
        s.discard.push(top);
        break;
      }
      s.drawPile = shuffle(s, s.discard);
      s.discard = [top];
      c.events.push({ type: "reshuffled" });
      log(c, "La pioche est vide : la défausse est remélangée.");
    }
    got.push(s.drawPile.pop()!);
  }
  p.hand.push(...got);
  sync(p);
  s.drawCount = s.drawPile.length;
  c.events.push({ type: "drew", player: p.id, count: got.length, reason, cards: got });
  return got;
}

// ── Manches ─────────────────────────────────────────────────

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.roundResult = null;
  s.direction = 1;
  s.drawn = null;
  s.pendingWild4 = null;
  s.unoTarget = null;
  for (const p of s.players) {
    p.hand = [];
    p.saidUno = false;
  }
  s.drawPile = shuffle(s, buildDeck());
  s.discard = [];
  // Distribution : 7 cartes chacun, en commençant à gauche du donneur.
  for (let k = 0; k < HAND_SIZE; k++) {
    let i = s.dealer;
    for (let n = 0; n < s.players.length; n++) {
      i = (i + 1) % s.players.length;
      const p = s.players[i]!;
      if (!p.left) p.hand.push(s.drawPile.pop()!);
    }
  }
  s.players.forEach(sync);
  // Première carte : un +4 retourné repart dans le paquet.
  let top = s.drawPile.pop()!;
  while (top.kind === "wild4") {
    s.drawPile.unshift(top);
    s.drawPile = shuffle(s, s.drawPile);
    top = s.drawPile.pop()!;
  }
  s.discard.push(top);
  s.drawCount = s.drawPile.length;
  c.events.push({ type: "roundStarted", round: s.round, top });
  log(c, `Manche ${s.round} : ${s.players[s.dealer]!.name} distribue. Première carte : ${cardLabel(top)}.`);

  // Le joueur à gauche du donneur commence ; la première carte peut agir sur lui.
  const first = nextIndex(s, s.dealer);
  s.phase = "play";
  s.current = first;
  if (top.color) s.currentColor = top.color;
  switch (top.kind) {
    case "skip": {
      const skipped = s.players[first]!;
      c.events.push({ type: "skipped", player: skipped.id });
      log(c, `${skipped.name} passe son tour.`);
      s.current = nextIndex(s, first);
      break;
    }
    case "reverse":
      // Le sens s'inverse et c'est le donneur qui commence.
      s.direction = -1;
      c.events.push({ type: "reversed", direction: -1 });
      s.current = s.dealer;
      break;
    case "draw2": {
      const victim = s.players[first]!;
      drawCards(c, victim, 2, "+2");
      log(c, `${victim.name} pioche 2 cartes et passe son tour.`);
      s.current = nextIndex(s, first);
      break;
    }
    case "wild":
      s.phase = "startColor";
      log(c, `${s.players[first]!.name} choisit la couleur de départ.`);
      break;
    default:
      break;
  }
  if (s.phase === "play") turnStarted(c);
}

function turnStarted(c: Ctx) {
  const p = c.s.players[c.s.current]!;
  c.events.push({ type: "turnStarted", player: p.id });
}

function endRound(c: Ctx, winner: UnoPlayer) {
  const s = c.s;
  const hands = s.players
    .filter((p) => p.id !== winner.id && !p.left)
    .map((p) => ({ player: p.id, cards: p.hand.slice(), points: p.hand.reduce((sum, card) => sum + cardPoints(card), 0) }));
  const points = hands.reduce((sum, h) => sum + h.points, 0);
  winner.score += points;
  s.roundResult = { winner: winner.id, points, hands };
  s.unoTarget = null;
  s.drawn = null;
  c.events.push({ type: "roundOver", winner: winner.id, points });
  log(c, `🏁 ${winner.name} n'a plus de cartes et marque ${points} points (total : ${winner.score}).`);
  const target = s.options.targetScore;
  if (target === null || winner.score >= target) {
    s.phase = "gameOver";
    s.winner = winner.id;
    c.events.push({ type: "gameOver", winner: winner.id });
    log(c, `🏆 ${winner.name} gagne la partie !`);
  } else {
    s.phase = "roundOver";
  }
}

// ── Point d'entrée ──────────────────────────────────────────

export function canPlay(s: UnoState, card: UnoCard): boolean {
  if (card.kind === "wild" || card.kind === "wild4") return true;
  const top = topCard(s);
  if (card.color === s.currentColor) return true;
  if (card.kind === "number") return top.kind === "number" && top.value === card.value;
  return card.kind === top.kind;
}

export function applyUno(state: UnoState, playerId: PlayerId, action: UnoAction): { state: UnoState; events: UnoEvent[] } {
  const s = structuredClone(state);
  const c: Ctx = { s, events: [] };
  const p = player(s, playerId);
  if (!p) fail("Joueur inconnu.");
  if (p.left) fail("Vous avez quitté la partie.");
  if (s.phase === "gameOver" && action.type !== "leave") fail("La partie est terminée.");

  const isCurrent = s.players[s.current]!.id === p.id;
  // Dès que le joueur suivant agit, il est trop tard pour attraper l'oubli du « UNO ».
  const closesUnoWindow = ["play", "draw", "pass", "chooseColor", "acceptDraw4", "challenge"].includes(action.type);
  if (closesUnoWindow && s.unoTarget && s.unoTarget !== p.id) s.unoTarget = null;

  switch (action.type) {
    case "play": {
      if (s.phase !== "play") fail("Ce n'est pas le moment de jouer.");
      if (!isCurrent) fail("Ce n'est pas votre tour.");
      const idx = p.hand.findIndex((card) => card.id === action.cardId);
      if (idx < 0) fail("Vous n'avez pas cette carte.");
      if (s.drawn && s.drawn.cardId !== action.cardId) fail("Vous ne pouvez jouer que la carte que vous venez de piocher.");
      const card = p.hand[idx]!;
      if (!canPlay(s, card)) fail("Cette carte ne se pose pas : même couleur, même chiffre ou même symbole.");
      const wild = card.kind === "wild" || card.kind === "wild4";
      if (wild && !action.color) fail("Choisissez une couleur.");
      // Le +4 n'est permis que sans carte de la couleur demandée (on peut bluffer, mais gare à la contestation).
      const legal = card.kind === "wild4" ? !p.hand.some((h) => h.id !== card.id && h.color === s.currentColor) : null;
      const colorBefore = s.currentColor;

      p.hand.splice(idx, 1);
      sync(p);
      s.discard.push(card);
      s.drawn = null;
      s.currentColor = wild ? action.color! : card.color!;
      c.events.push({ type: "cardPlayed", player: p.id, card, color: s.currentColor });
      log(c, `${p.name} pose ${cardLabel(card)}${wild ? ` et demande du ${COLOR_NAMES[s.currentColor]}` : ""}.`);
      if (wild) c.events.push({ type: "colorChosen", player: p.id, color: s.currentColor });

      if (p.hand.length === 1 && !p.saidUno) s.unoTarget = p.id;

      const n = activeCount(s);
      const next = nextIndex(s, s.current);
      if (p.hand.length === 0) {
        // Dernière carte : le +2 ou le +4 s'appliquent quand même au suivant (pour les points).
        if (card.kind === "draw2") drawCards(c, s.players[next]!, 2, "+2");
        if (card.kind === "wild4") drawCards(c, s.players[next]!, 4, "+4");
        endRound(c, p);
        break;
      }

      switch (card.kind) {
        case "skip": {
          c.events.push({ type: "skipped", player: s.players[next]!.id });
          log(c, `${s.players[next]!.name} passe son tour.`);
          s.current = nextIndex(s, s.current, 2);
          break;
        }
        case "reverse":
          s.direction = s.direction === 1 ? -1 : 1;
          c.events.push({ type: "reversed", direction: s.direction });
          log(c, "Le sens du jeu s'inverse.");
          // À deux joueurs, l'inversion agit comme un « Passe ton tour ».
          s.current = n === 2 ? s.current : nextIndex(s, s.current);
          break;
        case "draw2": {
          const victim = s.players[next]!;
          drawCards(c, victim, 2, "+2");
          c.events.push({ type: "skipped", player: victim.id });
          log(c, `${victim.name} pioche 2 cartes et passe son tour.`);
          s.current = nextIndex(s, s.current, 2);
          break;
        }
        case "wild4":
          s.pendingWild4 = { by: p.id, victim: s.players[next]!.id, legal, colorBefore };
          s.phase = "challenge";
          s.current = next;
          log(c, `${s.players[next]!.name} doit piocher 4 cartes… ou contester.`);
          return { state: s, events: c.events };
        default:
          s.current = next;
      }
      turnStarted(c);
      break;
    }

    case "draw": {
      if (s.phase !== "play") fail("Ce n'est pas le moment de piocher.");
      if (!isCurrent) fail("Ce n'est pas votre tour.");
      if (s.drawn) fail("Vous avez déjà pioché : jouez la carte ou passez.");
      const [card] = drawCards(c, p, 1, "pioche");
      log(c, `${p.name} pioche une carte.`);
      if (card && canPlay(s, card)) {
        s.drawn = { player: p.id, cardId: card.id };
      } else {
        s.current = nextIndex(s, s.current);
        turnStarted(c);
      }
      break;
    }

    case "pass": {
      if (!isCurrent || !s.drawn) fail("Vous ne pouvez passer qu'après avoir pioché une carte jouable.");
      s.drawn = null;
      log(c, `${p.name} garde sa carte.`);
      s.current = nextIndex(s, s.current);
      turnStarted(c);
      break;
    }

    case "chooseColor": {
      if (s.phase !== "startColor" || !isCurrent) fail("Ce n'est pas à vous de choisir la couleur.");
      if (!COLORS.includes(action.color)) fail("Couleur inconnue.");
      s.currentColor = action.color;
      s.phase = "play";
      c.events.push({ type: "colorChosen", player: p.id, color: action.color });
      log(c, `${p.name} choisit le ${COLOR_NAMES[action.color]}.`);
      turnStarted(c);
      break;
    }

    case "sayUno": {
      const ok = (p.hand.length === 2 && isCurrent && s.phase === "play") || (p.hand.length === 1 && !p.saidUno);
      if (!ok) fail("On dit « UNO » quand il ne reste qu'une carte à jouer.");
      p.saidUno = true;
      if (s.unoTarget === p.id) s.unoTarget = null;
      c.events.push({ type: "unoSaid", player: p.id });
      log(c, `${p.name} : « UNO ! »`);
      break;
    }

    case "catchUno": {
      const target = player(s, action.target);
      if (!target || target.id === p.id) fail("Joueur invalide.");
      if (s.unoTarget !== target.id || target.hand.length !== 1 || target.saidUno) fail("Trop tard, ou il avait bien dit « UNO ».");
      s.unoTarget = null;
      drawCards(c, target, 2, "UNO oublié");
      c.events.push({ type: "unoCaught", by: p.id, target: target.id });
      log(c, `${p.name} attrape ${target.name} qui n'a pas dit « UNO » : +2 cartes !`);
      break;
    }

    case "acceptDraw4":
    case "challenge": {
      const pw = s.pendingWild4;
      if (s.phase !== "challenge" || !pw || pw.victim !== p.id) fail("Rien à contester.");
      const offender = player(s, pw.by)!;
      s.pendingWild4 = null;
      s.phase = "play";
      if (action.type === "acceptDraw4") {
        drawCards(c, p, 4, "+4");
        c.events.push({ type: "skipped", player: p.id });
        log(c, `${p.name} pioche 4 cartes et passe son tour.`);
        s.current = nextIndex(s, s.current);
      } else if (!pw.legal) {
        // Bluff démasqué : le poseur pioche 4, la victime joue normalement.
        drawCards(c, offender, 4, "+4 contesté");
        c.events.push({ type: "challenged", by: p.id, target: offender.id, success: true });
        log(c, `${p.name} conteste : ${offender.name} avait du ${COLOR_NAMES[pw.colorBefore]} ! Il pioche 4 cartes.`);
      } else {
        drawCards(c, p, 6, "contestation perdue");
        c.events.push({ type: "challenged", by: p.id, target: offender.id, success: false });
        c.events.push({ type: "skipped", player: p.id });
        log(c, `${p.name} conteste à tort : il pioche 6 cartes et passe son tour.`);
        s.current = nextIndex(s, s.current);
      }
      turnStarted(c);
      break;
    }

    case "nextRound": {
      if (s.phase !== "roundOver") fail("La manche n'est pas finie.");
      s.dealer = nextIndex(s, s.dealer);
      startRound(c);
      break;
    }

    case "leave": {
      p.left = true;
      s.drawPile.unshift(...p.hand);
      p.hand = [];
      sync(p);
      s.drawCount = s.drawPile.length;
      if (s.unoTarget === p.id) s.unoTarget = null;
      c.events.push({ type: "left", player: p.id });
      log(c, `${p.name} quitte la partie.`);
      const alive = s.players.filter((pl) => !pl.left);
      if (alive.length === 1 && s.phase !== "gameOver") {
        s.phase = "gameOver";
        s.winner = alive[0]!.id;
        c.events.push({ type: "gameOver", winner: s.winner });
        log(c, `🏆 ${alive[0]!.name} gagne la partie (les autres sont partis).`);
        break;
      }
      if (s.pendingWild4 && (s.pendingWild4.victim === p.id || s.pendingWild4.by === p.id)) {
        s.pendingWild4 = null;
        s.phase = "play";
      }
      if (s.players[s.current]!.id === p.id && (s.phase === "play" || s.phase === "startColor")) {
        s.drawn = null;
        s.current = nextIndex(s, s.current);
        if (s.phase === "startColor") s.phase = "play";
        turnStarted(c);
      }
      if (s.players[s.dealer]!.left) s.dealer = nextIndex(s, s.dealer);
      break;
    }

    default: {
      const never: never = action;
      fail(`Action inconnue : ${JSON.stringify(never)}`);
    }
  }
  return { state: s, events: c.events };
}

// ── Vues privées ────────────────────────────────────────────

/** Ce qu'un joueur a le droit de voir : sa main, le nombre de cartes des autres, rien de la pioche. */
export function viewFor(s: UnoState, playerId: PlayerId | null): UnoState {
  return {
    ...s,
    drawPile: [],
    players: s.players.map((p) => ({ ...p, hand: p.id === playerId ? p.hand : [] })),
    pendingWild4: s.pendingWild4 ? { ...s.pendingWild4, legal: null } : null,
  };
}

/** Les cartes piochées ne sont montrées qu'à celui qui les pioche. */
export function eventsFor(events: UnoEvent[], playerId: PlayerId | null): UnoEvent[] {
  return events.map((e) => (e.type === "drew" && e.player !== playerId ? { ...e, cards: undefined } : e));
}
