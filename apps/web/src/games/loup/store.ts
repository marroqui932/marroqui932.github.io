// Salle en ligne des Loups-Garous. L'hôte garde la partie complète, fait tourner
// les minuteurs du narrateur, et n'envoie à chacun que ce qu'il a le droit de voir.

import { create } from "zustand";
import {
  applyLoup,
  createLoup,
  DEFAULT_OPTIONS,
  eventsFor,
  MAX_PLAYERS,
  LoupError,
  viewFor,
  type PlayerId,
  type LoupAction,
  type LoupEvent,
  type LoupOptions,
  type LoupState,
} from "@3ajib/loup";
import { ClientNet, HostNet, newRoomCode, type ClientMsg, type HostMsg, type Lobby, type NetStatus, type Profile } from "../../net";
import { loadProfile, saveProfile } from "../../profile";
import { PLAYER_COLORS, TOKENS } from "../../tokens";
import { play } from "../../sound";

const SAVE_KEY = "3ajib:loup:salle";

type LoupMsg =
  | { t: "lobby"; lobby: Lobby }
  | { t: "state"; state: LoupState; events: LoupEvent[] }
  | { t: "error"; text: string }
  | { t: "rejected"; reason: string }
  | { t: "reset" };

interface HostSave {
  code: string;
  lobby: Lobby;
  full: LoupState | null;
}

export interface LoupNote {
  id: number;
  text: string;
  kind: "info" | "good" | "bad" | "error";
  at: number;
}

interface LoupStore {
  mode: "host" | "client" | null;
  me: PlayerId | null;
  lobby: Lobby | null;
  net: NetStatus | null;
  rejected: string | null;
  /** Ce que je vois de la partie. */
  view: LoupState | null;
  /** Derniers événements (pour les animations). */
  events: { seq: number; list: LoupEvent[] };
  notes: LoupNote[];

  hostRoom(profile: Profile): void;
  resumeHost(): boolean;
  joinRoom(code: string, profile: Profile): void;
  setOptions(o: Partial<LoupOptions>): void;
  /** Hôte : retour au salon (pour relancer une partie avec les mêmes joueurs). */
  backToLobby(): void;
  kick(id: PlayerId): void;
  start(): void;
  act(action: LoupAction): boolean;
  /** Hôte uniquement : agir pour un autre joueur (ex. le déclarer prêt s'il est absent). */
  actAs(playerId: PlayerId, action: LoupAction): boolean;
  quit(): void;
}

let host: HostNet | null = null;
let client: ClientNet | null = null;
/** Partie complète (seulement chez l'hôte). */
let full: LoupState | null = null;
let noteId = 0;
let stepTimer: ReturnType<typeof setTimeout> | null = null;
let scheduledStep = -1;
let seq = 0;

function save(code: string, lobby: Lobby) {
  try {
    if (full?.phase === "gameOver") localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ code, lobby, full } satisfies HostSave));
  } catch {
    /* rien */
  }
}

export function loadLoupHostSave(): HostSave | null {
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

const sendTo = (id: string, msg: LoupMsg) => host?.send(id, msg as unknown as HostMsg);
const broadcast = (msg: LoupMsg) => host?.broadcast(msg as unknown as HostMsg);

export const useLoup = create<LoupStore>((set, get) => {
  function note(text: string, kind: LoupNote["kind"] = "info") {
    set({ notes: [...get().notes, { id: ++noteId, text, kind, at: performance.now() / 1000 }].slice(-20) });
  }

  function receive(view: LoupState, events: LoupEvent[]) {
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
  function publish(events: LoupEvent[]) {
    if (!full) return;
    const lobby = get().lobby!;
    for (const p of lobby.players) {
      if (p.id === get().me) continue;
      sendTo(p.id, { t: "state", state: viewFor(full, p.id), events: eventsFor(events, p.id, full) });
    }
    receive(viewFor(full, get().me), eventsFor(events, get().me, full));
    save(lobby.code, lobby);
    schedule();
  }

  /** Le narrateur : quand le minuteur de l'étape expire, l'hôte passe à la suite. */
  function schedule() {
    if (!full || full.step.id === scheduledStep) return;
    if (stepTimer) clearTimeout(stepTimer);
    stepTimer = null;
    scheduledStep = full.step.id;
    if (full.phase === "gameOver" || full.step.ms <= 0) return;
    const id = full.step.id;
    stepTimer = setTimeout(() => {
      stepTimer = null;
      if (full && full.step.id === id) hostApply(get().me!, { type: "timeout", step: id });
    }, full.step.ms);
  }

  function hostApply(playerId: PlayerId, action: LoupAction): string | null {
    if (!full) return "La partie n'a pas commencé.";
    try {
      const r = applyLoup(full, playerId, action);
      full = r.state;
      publish(r.events);
      return null;
    } catch (e) {
      if (e instanceof LoupError) return e.message;
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
          if ((action as { type?: string }).type === "timeout") return; // seul l'hôte tient le chrono
          const err = hostApply(clientId, action as unknown as LoupAction);
          if (err) sendTo(clientId, { t: "error", text: err });
        },
        onDraft() {},
        onLeave(clientId) {
          setOnline(clientId, false);
        },
      },
      "loup",
    );
    host.start();
  }

  function teardown() {
    if (stepTimer) clearTimeout(stepTimer);
    stepTimer = null;
    scheduledStep = -1;
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
        options: { loup: { ...DEFAULT_OPTIONS } as unknown as Record<string, unknown> },
      };
      set({ mode: "host", me: clientId, lobby, view: null, rejected: null, notes: [] });
      save(code, lobby);
      startHostNet(code);
    },

    resumeHost() {
      const saved = loadLoupHostSave();
      if (!saved) return false;
      teardown();
      const { clientId } = loadProfile();
      full = saved.full;
      const lobby = { ...saved.lobby, players: saved.lobby.players.map((p) => ({ ...p, online: p.id === clientId })) };
      set({ mode: "host", me: clientId, lobby, view: full ? viewFor(full, clientId) : null, rejected: null, notes: [] });
      startHostNet(saved.code);
      schedule();
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
          const msg = raw as unknown as LoupMsg;
          if (msg.t === "lobby") set({ lobby: msg.lobby });
          else if (msg.t === "state") receive(msg.state, msg.events);
          else if (msg.t === "reset") set({ view: null, events: { seq: ++seq, list: [] } });
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
      lobbyUpdate({ ...lobby, options: { ...lobby.options, loup: { ...lobby.options.loup, ...o } } });
    },

    backToLobby() {
      if (get().mode !== "host") return;
      full = null;
      if (stepTimer) clearTimeout(stepTimer);
      scheduledStep = -1;
      broadcast({ t: "reset" });
      const lobby = get().lobby!;
      set({ view: null, events: { seq: ++seq, list: [] } });
      save(lobby.code, lobby);
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
        // On ne garde que les joueurs connectés.
        const players = lobby.players.filter((p) => p.online);
        full = createLoup(
          players.map(({ id, name, color, token }) => ({ id, name, color, token })),
          { ...DEFAULT_OPTIONS, ...((lobby.options.loup ?? {}) as Partial<LoupOptions>) },
        );
      } catch (e) {
        if (e instanceof LoupError) return note(`⚠️ ${e.message}`, "error");
        throw e;
      }
      scheduledStep = -1;
      publish([{ type: "phase", phase: "intro", day: 0 }]);
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

    actAs(playerId, action) {
      if (get().mode !== "host") return false;
      const err = hostApply(playerId, action);
      if (err) note(`⚠️ ${err}`, "error");
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
export function pushLoupNote(text: string, kind: LoupNote["kind"] = "info") {
  useLoup.setState((s) => ({ notes: [...s.notes, { id: ++noteId, text, kind, at: performance.now() / 1000 }].slice(-20) }));
}
