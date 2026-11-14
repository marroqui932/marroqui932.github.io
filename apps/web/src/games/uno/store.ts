// Salle en ligne du Uno. L'hôte garde la partie complète et n'envoie à chacun
// que ce qu'il a le droit de voir (sa main, le nombre de cartes des autres).

import { create } from "zustand";
import {
  applyUno,
  createUno,
  eventsFor,
  MAX_PLAYERS,
  UnoError,
  viewFor,
  type PlayerId,
  type UnoAction,
  type UnoEvent,
  type UnoOptions,
  type UnoState,
} from "@3ajib/uno";
import { ClientNet, HostNet, newRoomCode, type ClientMsg, type HostMsg, type Lobby, type NetStatus, type Profile } from "../../net";
import { loadProfile, saveProfile } from "../../profile";
import { PLAYER_COLORS, TOKENS } from "../../tokens";
import { play } from "../../sound";

const SAVE_KEY = "3ajib:uno:salle";

type UnoMsg =
  | { t: "lobby"; lobby: Lobby }
  | { t: "state"; state: UnoState; events: UnoEvent[] }
  | { t: "error"; text: string }
  | { t: "rejected"; reason: string };

interface HostSave {
  code: string;
  lobby: Lobby;
  full: UnoState | null;
}

export interface UnoNote {
  id: number;
  text: string;
  kind: "info" | "good" | "bad" | "error";
  at: number;
}

interface UnoStore {
  mode: "host" | "client" | null;
  me: PlayerId | null;
  lobby: Lobby | null;
  net: NetStatus | null;
  rejected: string | null;
  /** Ce que je vois de la partie. */
  view: UnoState | null;
  /** Derniers événements (pour les animations). */
  events: { seq: number; list: UnoEvent[] };
  notes: UnoNote[];

  hostRoom(profile: Profile): void;
  resumeHost(): boolean;
  joinRoom(code: string, profile: Profile): void;
  setOptions(o: Partial<UnoOptions>): void;
  kick(id: PlayerId): void;
  start(): void;
  act(action: UnoAction): boolean;
  quit(): void;
}

let host: HostNet | null = null;
let client: ClientNet | null = null;
/** Partie complète (seulement chez l'hôte). */
let full: UnoState | null = null;
let noteId = 0;
let seq = 0;

function save(code: string, lobby: Lobby) {
  try {
    if (full?.phase === "gameOver") localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ code, lobby, full } satisfies HostSave));
  } catch {
    /* rien */
  }
}

export function loadUnoHostSave(): HostSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as HostSave) : null;
  } catch {
    return null;
  }
}

function setUrlRoom(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set("salle", code);
    else url.searchParams.delete("salle");
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* rien */
  }
}

const sendTo = (id: string, msg: UnoMsg) => host?.send(id, msg as unknown as HostMsg);
const broadcast = (msg: UnoMsg) => host?.broadcast(msg as unknown as HostMsg);

export const useUno = create<UnoStore>((set, get) => {
  function note(text: string, kind: UnoNote["kind"] = "info") {
    set({ notes: [...get().notes, { id: ++noteId, text, kind, at: performance.now() / 1000 }].slice(-20) });
  }

  function receive(view: UnoState, events: UnoEvent[]) {
    set({ view, events: { seq: ++seq, list: events } });
  }

  // ── Hôte ──

  function lobbyUpdate(lobby: Lobby) {
    set({ lobby });
    broadcast({ t: "lobby", lobby });
    save(lobby.code, lobby);
  }

  function setOnline(id: string, online: boolean) {
    const lobby = get().lobby;
    if (!lobby) return;
    lobbyUpdate({ ...lobby, players: lobby.players.map((p) => (p.id === id ? { ...p, online } : p)) });
  }

  /** Envoie à chacun sa vue de la partie. */
  function publish(events: UnoEvent[]) {
    if (!full) return;
    const lobby = get().lobby!;
    for (const p of lobby.players) {
      if (p.id === get().me) continue;
      sendTo(p.id, { t: "state", state: viewFor(full, p.id), events: eventsFor(events, p.id) });
    }
    receive(viewFor(full, get().me), eventsFor(events, get().me));
    save(lobby.code, lobby);
  }

  function hostApply(playerId: PlayerId, action: UnoAction): string | null {
    if (!full) return "La partie n'a pas commencé.";
    try {
      const r = applyUno(full, playerId, action);
      full = r.state;
      publish(r.events);
      return null;
    } catch (e) {
      if (e instanceof UnoError) return e.message;
      throw e;
    }
  }

  function startHostNet(code: string) {
    host = new HostNet(
      code,
      {
        onStatus: (net) => set({ net }),
        onHello(clientId, profile) {
          const { lobby } = get();
          if (!lobby || !host) return;
          if (full) {
            if (!full.players.some((p) => p.id === clientId)) {
              host.kick(clientId, "La partie a déjà commencé sans vous.");
              return;
            }
            setOnline(clientId, true);
            sendTo(clientId, { t: "lobby", lobby: get().lobby! });
            sendTo(clientId, { t: "state", state: viewFor(full, clientId), events: [] });
            return;
          }
          const existing = lobby.players.find((p) => p.id === clientId);
          if (!existing && lobby.players.length >= MAX_PLAYERS) {
            host.kick(clientId, `La salle est pleine (${MAX_PLAYERS} joueurs maximum).`);
            return;
          }
          const others = lobby.players.filter((p) => p.id !== clientId);
          const color = others.some((p) => p.color === profile.color)
            ? (PLAYER_COLORS.find((c) => !others.some((p) => p.color === c.value))?.value ?? profile.color)
            : profile.color;
          const token = others.some((p) => p.token === profile.token)
            ? (TOKENS.find((t) => !others.some((p) => p.token === t.id))?.id ?? profile.token)
            : profile.token;
          const pl = { id: clientId, name: (profile.name || "Invité").slice(0, 16), color, token, online: true, host: false };
          lobbyUpdate({ ...lobby, players: existing ? lobby.players.map((p) => (p.id === clientId ? pl : p)) : [...lobby.players, pl] });
        },
        onAction(clientId, action) {
          const err = hostApply(clientId, action as unknown as UnoAction);
          if (err) sendTo(clientId, { t: "error", text: err });
        },
        onDraft() {},
        onLeave(clientId) {
          setOnline(clientId, false);
        },
      },
      "uno",
    );
    host.start();
  }

  function teardown() {
    host?.destroy();
    client?.destroy();
    host = null;
    client = null;
  }

  return {
    mode: null,
    me: null,
    lobby: null,
    net: null,
    rejected: null,
    view: null,
    events: { seq: 0, list: [] },
    notes: [],

    hostRoom(profile) {
      teardown();
      full = null;
      const { clientId } = loadProfile();
      const code = newRoomCode();
      const lobby: Lobby = {
        code,
        players: [{ id: clientId, ...profile, name: profile.name || "Hôte", online: true, host: true }],
        options: { targetScore: 500 },
      };
      set({ mode: "host", me: clientId, lobby, view: null, rejected: null, notes: [] });
      save(code, lobby);
      startHostNet(code);
    },

    resumeHost() {
      const saved = loadUnoHostSave();
      if (!saved) return false;
      teardown();
      const { clientId } = loadProfile();
      full = saved.full;
      const lobby = { ...saved.lobby, players: saved.lobby.players.map((p) => ({ ...p, online: p.id === clientId })) };
      set({ mode: "host", me: clientId, lobby, view: full ? viewFor(full, clientId) : null, rejected: null, notes: [] });
      startHostNet(saved.code);
      return true;
    },

    joinRoom(code, profile) {
      teardown();
      full = null;
      const { clientId } = loadProfile();
      saveProfile({ ...profile, lastRoom: code });
      setUrlRoom(code);
      set({ mode: "client", me: clientId, lobby: null, view: null, rejected: null, net: { kind: "connecting" }, notes: [] });
      client = new ClientNet(code, clientId, profile, {
        onStatus: (net) => set({ net }),
        onMessage(raw) {
          const msg = raw as unknown as UnoMsg;
          if (msg.t === "lobby") set({ lobby: msg.lobby });
          else if (msg.t === "state") receive(msg.state, msg.events);
          else if (msg.t === "error") {
            play("error");
            note(`⚠️ ${msg.text}`, "error");
          } else if (msg.t === "rejected") set({ rejected: msg.reason });
        },
      });
      client.start();
    },

    setOptions(o) {
      const lobby = get().lobby;
      if (get().mode !== "host" || !lobby) return;
      lobbyUpdate({ ...lobby, options: { ...lobby.options, ...o } });
    },

    kick(id) {
      const lobby = get().lobby;
      if (get().mode !== "host" || !lobby || full) return;
      host?.kick(id, "L'hôte vous a retiré de la salle.");
      lobbyUpdate({ ...lobby, players: lobby.players.filter((p) => p.id !== id) });
    },

    start() {
      const lobby = get().lobby;
      if (get().mode !== "host" || !lobby) return;
      try {
        full = createUno(
          lobby.players.map(({ id, name, color, token }) => ({ id, name, color, token })),
          { targetScore: (lobby.options as { targetScore?: number | null }).targetScore ?? 500 },
        );
      } catch (e) {
        if (e instanceof UnoError) return note(`⚠️ ${e.message}`, "error");
        throw e;
      }
      publish([{ type: "roundStarted", round: 1, top: full.discard[full.discard.length - 1]! }, { type: "turnStarted", player: full.players[full.current]!.id }]);
    },

    act(action) {
      const { mode, me } = get();
      if (!me) return false;
      if (mode === "client") {
        if (!client?.send({ t: "action", action } as unknown as ClientMsg)) {
          note("⚠️ Pas de connexion avec l'hôte.", "error");
          return false;
        }
        return true;
      }
      const err = hostApply(me, action);
      if (err) {
        play("error");
        note(`⚠️ ${err}`, "error");
      }
      return !err;
    },

    quit() {
      teardown();
      full = null;
      setUrlRoom(null);
      if (get().mode === "client") saveProfile({ lastRoom: "" });
      set({ mode: null, me: null, lobby: null, view: null, net: null, rejected: null, notes: [] });
    },
  };
});

/** Notification locale (utilisée par l'interface pour les événements de jeu). */
export function pushUnoNote(text: string, kind: UnoNote["kind"] = "info") {
  useUno.setState((s) => ({ notes: [...s.notes, { id: ++noteId, text, kind, at: performance.now() / 1000 }].slice(-20) }));
}
