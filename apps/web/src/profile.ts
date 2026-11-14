// Profil commun à tous les jeux : pseudo, couleur, pion, identifiant de l'appareil.

import type { Profile } from "./net";
import { PLAYER_COLORS, TOKENS } from "./tokens";

const KEY = "3ajib:profil";
const OLD_KEY = "monopoly-iso:profil";

export type StoredProfile = Profile & { clientId: string; lastRoom?: string };

function read(key: string): StoredProfile | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as StoredProfile) : null;
  } catch {
    return null;
  }
}

function write(p: StoredProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* stockage indisponible */
  }
}

export function loadProfile(): StoredProfile {
  const saved = read(KEY) ?? read(OLD_KEY);
  if (saved?.clientId) return saved;
  const p: StoredProfile = {
    clientId: `c-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`,
    name: "",
    color: PLAYER_COLORS[Math.floor(Math.random() * 6)]!.value,
    token: TOKENS[Math.floor(Math.random() * TOKENS.length)]!.id,
  };
  write(p);
  return p;
}

export function saveProfile(p: Partial<StoredProfile>) {
  write({ ...loadProfile(), ...p });
}
