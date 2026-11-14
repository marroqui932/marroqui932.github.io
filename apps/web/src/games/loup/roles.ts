// Tout le texte des rôles et du narrateur (données uniquement).

import type { NightStep, RoleId } from "@3ajib/loup";

export interface RoleInfo {
  name: string;
  /** Avec article, pour les phrases (« il était la Voyante »). */
  the: string;
  emoji: string;
  color: string;
  camp: "loups" | "village";
  short: string;
  desc: string;
}

export const ROLES: Record<RoleId, RoleInfo> = {
  loup: {
    name: "Loup-Garou",
    the: "un Loup-Garou",
    emoji: "🐺",
    color: "#c8102e",
    camp: "loups",
    short: "Dévore un villageois chaque nuit",
    desc: "Chaque nuit, la meute se réveille et choisit une victime. Le jour, tu te fonds dans le village et tu accuses les autres.",
  },
  villageois: {
    name: "Villageois",
    the: "un simple Villageois",
    emoji: "🧑‍🌾",
    color: "#8a6a3b",
    camp: "village",
    short: "Aucun pouvoir, que ton flair",
    desc: "Pas de pouvoir, juste ton flair et ta voix. Écoute, observe, et fais tomber les loups au vote.",
  },
  voyante: {
    name: "Voyante",
    the: "la Voyante",
    emoji: "🔮",
    color: "#8b5cf6",
    camp: "village",
    short: "Découvre un rôle chaque nuit",
    desc: "Chaque nuit, tu sondes l'âme d'un joueur et tu découvres son vrai rôle. Aide le village… sans te faire repérer par les loups.",
  },
  sorciere: {
    name: "Sorcière",
    the: "la Sorcière",
    emoji: "🧪",
    color: "#16a37f",
    camp: "village",
    short: "Une potion de vie, une de mort",
    desc: "Tu vois la victime des loups. Ta potion de vie peut la sauver, ta potion de mort peut éliminer qui tu veux. Une seule fois chacune.",
  },
  chasseur: {
    name: "Chasseur",
    the: "le Chasseur",
    emoji: "🏹",
    color: "#b4652a",
    camp: "village",
    short: "Emporte quelqu'un en mourant",
    desc: "Quand tu meurs, de quelque façon que ce soit, tu tires une dernière fois et tu emportes quelqu'un avec toi.",
  },
  cupidon: {
    name: "Cupidon",
    the: "Cupidon",
    emoji: "💘",
    color: "#ff4f8b",
    camp: "village",
    short: "Lie deux amoureux",
    desc: "La première nuit, tu lies deux joueurs par l'amour. Si l'un meurt, l'autre meurt de chagrin. Un loup et un villageois amoureux gagnent ensemble, seuls contre tous.",
  },
  petiteFille: {
    name: "Petite Fille",
    the: "la Petite Fille",
    emoji: "👧",
    color: "#f59e0b",
    camp: "village",
    short: "Espionne les loups",
    desc: "Pendant que les loups chassent, tu peux entrouvrir les yeux : avec de la chance tu aperçois un loup… mais s'ils te surprennent, ils sauront qui tu es.",
  },
  salvateur: {
    name: "Salvateur",
    the: "le Salvateur",
    emoji: "🛡️",
    color: "#3a86ff",
    camp: "village",
    short: "Protège un joueur chaque nuit",
    desc: "Chaque nuit, tu protèges un joueur (toi compris) de l'attaque des loups. Jamais le même deux nuits de suite.",
  },
  ancien: {
    name: "Ancien",
    the: "l'Ancien",
    emoji: "👴",
    color: "#94a3b8",
    camp: "village",
    short: "Survit à une attaque des loups",
    desc: "Tu en as vu d'autres : tu survis à la première attaque des loups. La seconde te sera fatale.",
  },
  idiot: {
    name: "Idiot du village",
    the: "l'Idiot du village",
    emoji: "🃏",
    color: "#eab308",
    camp: "village",
    short: "Épargné par le vote",
    desc: "Si le village vote contre toi, tout le monde te reconnaît et on t'épargne… mais tu n'as plus le droit de voter.",
  },
  corbeau: {
    name: "Corbeau",
    the: "le Corbeau",
    emoji: "🪶",
    color: "#475569",
    camp: "village",
    short: "Accuse : +2 voix au vote",
    desc: "Chaque nuit, tu peux accuser un joueur : le lendemain, il commence le vote avec deux voix contre lui.",
  },
  bouc: {
    name: "Bouc émissaire",
    the: "le Bouc émissaire",
    emoji: "🐐",
    color: "#a16207",
    camp: "village",
    short: "Éliminé en cas d'égalité",
    desc: "Si le vote du village finit à égalité, c'est toi qu'on élimine. Fais en sorte que le village tranche.",
  },
};

export const NARRATION: Record<NightStep | "dusk", string> = {
  dusk: "La nuit tombe sur le village. Tout le monde ferme les yeux…",
  cupidon: "Cupidon se réveille et décoche ses flèches sur deux amoureux.",
  amoureux: "Les amoureux se réveillent, se reconnaissent… et se rendorment.",
  salvateur: "Le salvateur se réveille et choisit qui protéger cette nuit.",
  voyante: "La voyante se réveille et sonde l'âme d'un joueur.",
  loups: "Les loups-garous se réveillent, se reconnaissent et choisissent leur victime.",
  sorciere: "La sorcière se réveille. Elle voit la victime des loups… et prépare ses potions.",
  corbeau: "Le corbeau se réveille et désigne un suspect.",
};

/** Qui se réveille à chaque étape (pour l'écran des dormeurs). */
export const STEP_ROLE: Record<NightStep, RoleId | "amoureux"> = {
  cupidon: "cupidon",
  amoureux: "amoureux",
  salvateur: "salvateur",
  voyante: "voyante",
  loups: "loup",
  sorciere: "sorciere",
  corbeau: "corbeau",
};

export const CAUSES: Record<string, string> = {
  nuit: "retrouvé mort au petit matin",
  vote: "éliminé par le village",
  chasseur: "abattu par le chasseur",
  chagrin: "mort de chagrin",
  bouc: "sacrifié comme bouc émissaire",
  parti: "a quitté le village",
};
