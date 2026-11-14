// Types du moteur Loups-Garous. Le moteur est pur : il ne connaît ni le DOM ni le réseau.
// L'hôte garde l'état complet et n'envoie à chaque joueur que sa vue (`viewFor`).

export type PlayerId = string;

export type RoleId =
  | "loup"
  | "villageois"
  | "voyante"
  | "sorciere"
  | "chasseur"
  | "cupidon"
  | "petiteFille"
  | "salvateur"
  | "ancien"
  | "idiot"
  | "corbeau"
  | "bouc";

export type Camp = "loups" | "village";

/** Étapes de la nuit, dans l'ordre où le narrateur les appelle. */
export type NightStep = "cupidon" | "amoureux" | "salvateur" | "voyante" | "loups" | "sorciere" | "corbeau";

export type Phase =
  | "intro" // chacun découvre son rôle
  | "night"
  | "dawn" // annonce des morts de la nuit
  | "hunter" // le chasseur mort tire sa dernière balle
  | "successor" // le maire mort désigne son successeur
  | "mayorVote" // élection du maire (premier jour)
  | "vote" // débat et vote du village
  | "verdict" // annonce du résultat du vote
  | "gameOver";

export type DeathCause = "loups" | "poison" | "vote" | "chasseur" | "chagrin" | "bouc" | "parti";
/** Ce qui est annoncé publiquement : la cause exacte d'une mort de nuit reste secrète. */
export type PublicCause = Exclude<DeathCause, "loups" | "poison"> | "nuit";

export interface LoupPlayer {
  id: PlayerId;
  name: string;
  color: string;
  token: string;
  /** `null` dans une vue quand le joueur ne connaît pas ce rôle. */
  role: RoleId | null;
  alive: boolean;
  /** Rôle dévoilé à tout le monde (mort, idiot gracié…). */
  revealed: boolean;
  /** L'idiot du village gracié ne vote plus. */
  canVote: boolean;
  left: boolean;
}

export interface LoupOptions {
  /** Composition : nombre de cartes par rôle (la somme = nombre de joueurs). */
  roles: Partial<Record<RoleId, number>>;
  /** Élection d'un maire le premier jour (sa voix compte double). */
  mayor: boolean;
  /** Durée du débat, en secondes. */
  debateSeconds: number;
  /** Dévoiler le rôle des morts. */
  revealRoles: boolean;
}

export interface NightState {
  /** `null` : le village s'endort (courte pause avant la première étape). */
  step: NightStep | null;
  /** Étapes restantes cette nuit. */
  queue: NightStep[];
  /** Joueurs réveillés à cette étape (vide : étape « fantôme » pour ne rien trahir). */
  actors: PlayerId[];
  /** L'action de l'étape est faite : on attend juste la fin du minuteur. */
  done: boolean;
  protectedId: PlayerId | null;
  seen: { target: PlayerId; role: RoleId } | null;
  wolfVotes: Record<PlayerId, PlayerId>;
  victim: PlayerId | null;
  saved: boolean;
  poisoned: PlayerId | null;
  spied: boolean;
}

export interface Pending {
  kind: "hunter" | "successor";
  player: PlayerId;
}

export interface ChatMsg {
  id: number;
  from: PlayerId;
  channel: "village" | "loups" | "morts";
  text: string;
}

export interface Winner {
  camp: "loups" | "village" | "amoureux" | "personne";
  players: PlayerId[];
}

export interface LoupState {
  players: LoupPlayer[];
  options: LoupOptions;
  /** Composition publique de la partie. */
  composition: Partial<Record<RoleId, number>>;
  phase: Phase;
  /** Minuteur de l'étape en cours : l'hôte envoie `timeout` à la fin. `ms` vaut 0 si on ne doit pas le voir. */
  step: { id: number; ms: number };
  /** Numéro de la nuit / du jour en cours. */
  day: number;
  night: NightState | null;
  lovers: [PlayerId, PlayerId] | null;
  mayor: PlayerId | null;
  potions: { life: boolean; death: boolean } | null;
  lastProtected: PlayerId | null;
  elderHit: boolean;
  /** Joueur désigné par le corbeau : il commence le vote avec 2 voix. */
  ravenTarget: PlayerId | null;
  votes: Record<PlayerId, PlayerId>;
  /** Tout le monde a voté : le vote se clôt bientôt. */
  voteClosing: boolean;
  pending: Pending[];
  resume: "day" | "night";
  /** Ce qu'a appris chaque joueur sur les autres. */
  knowledge: Record<PlayerId, Record<PlayerId, RoleId>>;
  /** Dernier résultat annoncé (aube ou vote). */
  announce: { deaths: PlayerId[]; spared: PlayerId | null; tie: boolean } | null;
  chat: ChatMsg[];
  winner: Winner | null;
  rng: number;
}

export type LoupAction =
  | { type: "timeout"; step: number }
  | { type: "cupid"; a: PlayerId; b: PlayerId }
  | { type: "protect"; target: PlayerId }
  | { type: "see"; target: PlayerId }
  | { type: "wolfVote"; target: PlayerId }
  | { type: "spy" }
  | { type: "potion"; save: boolean; kill: PlayerId | null }
  | { type: "raven"; target: PlayerId | null }
  | { type: "vote"; target: PlayerId | null }
  | { type: "shoot"; target: PlayerId | null }
  | { type: "successor"; target: PlayerId }
  | { type: "say"; text: string }
  | { type: "leave" };

type Ev =
  | { type: "phase"; phase: Phase; day: number }
  | { type: "nightStep"; step: NightStep }
  | { type: "inLove"; a: PlayerId; b: PlayerId }
  | { type: "seen"; target: PlayerId; role: RoleId }
  | { type: "protected"; target: PlayerId }
  | { type: "wolfVoted"; by: PlayerId; target: PlayerId }
  | { type: "wolvesChose"; target: PlayerId | null }
  | { type: "spied"; wolf: PlayerId | null; caught?: boolean }
  | { type: "spotted"; girl: PlayerId }
  | { type: "potion"; save: boolean; kill: PlayerId | null }
  | { type: "raven"; target: PlayerId | null }
  | { type: "elderSurvived"; player: PlayerId }
  | { type: "died"; player: PlayerId; cause: PublicCause; role: RoleId | null }
  | { type: "dawn"; deaths: PlayerId[] }
  | { type: "voted"; by: PlayerId; target: PlayerId | null }
  | { type: "voteClosing" }
  | { type: "verdict"; target: PlayerId | null; tie: boolean }
  | { type: "idiotSpared"; player: PlayerId }
  | { type: "shot"; by: PlayerId; target: PlayerId | null }
  | { type: "mayor"; player: PlayerId; by: "vote" | "successor" }
  | { type: "chat"; msg: ChatMsg }
  | { type: "gameOver"; winner: Winner };

/** Un événement ; `to` limite les destinataires (absent = public). */
export type LoupEvent = Ev & { to?: PlayerId[] };
