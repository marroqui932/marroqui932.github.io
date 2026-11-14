// Types du moteur Uno. Aucun lien avec l'affichage ni le réseau.

export type PlayerId = string;

export type UnoColor = "red" | "yellow" | "green" | "blue";
export const COLORS: UnoColor[] = ["red", "yellow", "green", "blue"];

export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

export interface UnoCard {
  id: number;
  kind: CardKind;
  /** null pour les jokers */
  color: UnoColor | null;
  /** 0 à 9 pour les cartes numérotées */
  value: number | null;
}

export interface UnoPlayer {
  id: PlayerId;
  name: string;
  color: string;
  token: string;
  hand: UnoCard[];
  /** Nombre de cartes en main (utile dans la vue des autres joueurs, où la main est cachée). */
  handCount: number;
  score: number;
  /** A annoncé « UNO ! » pour sa dernière carte. */
  saidUno: boolean;
  /** A quitté la partie. */
  left: boolean;
}

export interface UnoOptions {
  /** Score à atteindre pour gagner (500 dans les règles officielles), null = une seule manche. */
  targetScore: number | null;
}

export type UnoPhase =
  /** Le joueur courant joue ou pioche. */
  | "play"
  /** Première carte retournée = joker : le premier joueur choisit la couleur. */
  | "startColor"
  /** Un +4 vient d'être posé : la victime l'accepte ou le conteste. */
  | "challenge"
  | "roundOver"
  | "gameOver";

export interface PendingWild4 {
  by: PlayerId;
  victim: PlayerId;
  /** Le +4 était-il légal (aucune carte de la couleur demandée en main) ? Caché aux autres. */
  legal: boolean | null;
  /** Couleur demandée avant le +4 (celle qu'il fallait suivre). */
  colorBefore: UnoColor;
}

export interface RoundResult {
  winner: PlayerId;
  points: number;
  /** Cartes restantes de chaque perdant (révélées en fin de manche). */
  hands: { player: PlayerId; cards: UnoCard[]; points: number }[];
}

export interface UnoState {
  version: 1;
  game: "uno";
  options: UnoOptions;
  players: UnoPlayer[];
  drawPile: UnoCard[];
  /** Taille de la pioche (seule info visible dans la vue d'un joueur). */
  drawCount: number;
  /** Défausse : la carte du dessus est la dernière. */
  discard: UnoCard[];
  currentColor: UnoColor;
  /** 1 = sens des aiguilles d'une montre, −1 = sens inverse. */
  direction: 1 | -1;
  current: number;
  dealer: number;
  phase: UnoPhase;
  /** Carte piochée jouable : le joueur peut la poser tout de suite ou garder la main. */
  drawn: { player: PlayerId; cardId: number } | null;
  pendingWild4: PendingWild4 | null;
  /** Joueur à une carte qui n'a pas dit « UNO » : attrapable jusqu'à ce que le suivant agisse. */
  unoTarget: PlayerId | null;
  round: number;
  roundResult: RoundResult | null;
  winner: PlayerId | null;
  rng: number;
  log: { n: number; text: string }[];
  logCounter: number;
}

export type UnoAction =
  | { type: "play"; cardId: number; color?: UnoColor }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "chooseColor"; color: UnoColor }
  | { type: "sayUno" }
  | { type: "catchUno"; target: PlayerId }
  | { type: "acceptDraw4" }
  | { type: "challenge" }
  | { type: "nextRound" }
  | { type: "leave" };

export type UnoEvent =
  | { type: "roundStarted"; round: number; top: UnoCard }
  | { type: "turnStarted"; player: PlayerId }
  | { type: "cardPlayed"; player: PlayerId; card: UnoCard; color: UnoColor }
  /** cards : seulement dans la vue du joueur concerné */
  | { type: "drew"; player: PlayerId; count: number; reason: string; cards?: UnoCard[] }
  | { type: "skipped"; player: PlayerId }
  | { type: "reversed"; direction: 1 | -1 }
  | { type: "colorChosen"; player: PlayerId; color: UnoColor }
  | { type: "unoSaid"; player: PlayerId }
  | { type: "unoCaught"; by: PlayerId; target: PlayerId }
  | { type: "challenged"; by: PlayerId; target: PlayerId; success: boolean }
  | { type: "reshuffled" }
  | { type: "roundOver"; winner: PlayerId; points: number }
  | { type: "gameOver"; winner: PlayerId | null }
  | { type: "left"; player: PlayerId };

export interface NewPlayer {
  id: PlayerId;
  name: string;
  color: string;
  token: string;
}
