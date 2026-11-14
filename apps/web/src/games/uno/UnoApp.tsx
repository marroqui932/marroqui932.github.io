import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { canPlay, cardLabel, colorName, COLORS, topCard, type UnoCard, type UnoColor, type UnoEvent, type UnoState } from "@3ajib/uno";
import { inviteLink, normalizeCode, type Profile } from "../../net";
import { loadProfile, saveProfile } from "../../profile";
import { ProfileEditor } from "../../ui/Options";
import { TokenIcon } from "../../ui/TokenIcon";
import { TOKENS } from "../../tokens";
import { isMuted, play, setMuted } from "../../sound";
import { isMusicOn, setMusicOn, useMusicScreen } from "../../music";
import { CardBack, CardFace, CARD_COLORS } from "./Card";
import { loadUnoHostSave, pushUnoNote, useUno } from "./store";
import "./uno.css";

export function UnoApp() {
  const view = useUno((s) => s.view);
  const mode = useUno((s) => s.mode);
  if (view) return <UnoTable view={view} />;
  if (mode) return <UnoLobby />;
  return <UnoHome />;
}

function BackToHub() {
  const quit = useUno((s) => s.quit);
  return (
    <a
      className="back-hub"
      href="#/"
      onClick={() => {
        quit();
      }}
    >
      ← 3ajib Games
    </a>
  );
}

// ── Accueil du Uno ──────────────────────────────────────────

function UnoHome() {
  const hostRoom = useUno((s) => s.hostRoom);
  const resumeHost = useUno((s) => s.resumeHost);
  const joinRoom = useUno((s) => s.joinRoom);
  const saved = useMemo(() => loadUnoHostSave(), []);
  const urlCode = useMemo(() => normalizeCode(new URLSearchParams(window.location.search).get("salle") ?? ""), []);
  const [profile, setProfile] = useState<Profile>(() => {
    const { name, color, token } = loadProfile();
    return { name, color, token };
  });
  const [code, setCode] = useState(urlCode || loadProfile().lastRoom || "");
  const nameOk = profile.name.trim().length > 0;

  useEffect(() => {
    const p = loadProfile();
    if (urlCode && p.name && p.lastRoom === urlCode) joinRoom(urlCode, { name: p.name, color: p.color, token: p.token });
  }, [urlCode, joinRoom]);

  const clean = () => ({ ...profile, name: profile.name.trim() });

  return (
    <div className="setup uno-bg">
      <div className="setup-card panel">
        <BackToHub />
        <h1 className="logo">
          <span className="word uno-word">UNO</span>
          <span className="edition">3ajib Games · règles officielles</span>
        </h1>
        <h2>Votre joueur</h2>
        <ProfileEditor
          profile={profile}
          onChange={(p) => {
            setProfile(p);
            saveProfile(p);
          }}
        />
        {!nameOk && <p className="hint-text">Choisissez un pseudo pour continuer.</p>}
        <div className="online-grid">
          <div className="online-box">
            <h3>Rejoindre une salle</h3>
            <p className="hint-text">Entrez le code envoyé par votre pote.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="code-input" value={code} placeholder="CODE" onChange={(e) => setCode(normalizeCode(e.target.value))} aria-label="Code de la salle" />
              <button className="btn primary" disabled={!nameOk || code.length !== 5} onClick={() => joinRoom(code, clean())}>
                Rejoindre
              </button>
            </div>
          </div>
          <div className="online-box">
            <h3>Créer une salle</h3>
            <p className="hint-text">De 2 à 10 joueurs. Votre navigateur héberge la partie : gardez l'onglet ouvert.</p>
            <button className="btn primary" disabled={!nameOk} onClick={() => hostRoom(clean())}>
              Créer une salle
            </button>
            {saved && (
              <button className="btn" style={{ marginTop: 8 }} onClick={() => resumeHost()}>
                Rouvrir la salle {saved.code}
                {saved.full ? " (partie en cours)" : ""}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Salle d'attente ─────────────────────────────────────────

function UnoLobby() {
  const { mode, me, lobby, net, rejected, quit, kick, start, setOptions } = useUno();
  const [copied, setCopied] = useState(false);
  if (rejected) {
    return (
      <div className="setup uno-bg">
        <div className="setup-card panel">
          <h1>Oups</h1>
          <p>{rejected}</p>
          <button className="btn primary" onClick={quit}>
            Retour
          </button>
        </div>
      </div>
    );
  }
  const isHost = mode === "host";
  const target = (lobby?.options as { targetScore?: number | null } | undefined)?.targetScore ?? null;
  return (
    <div className="setup uno-bg">
      <div className="setup-card panel">
        <h1>Salle d'attente · Uno</h1>
        {lobby ? (
          <>
            <p className="subtitle">
              Code de la salle : <span className="room-code">{lobby.code}</span>
            </p>
            <div className="invite">
              <input readOnly value={inviteLink(lobby.code, "uno")} onFocus={(e) => e.target.select()} aria-label="Lien d'invitation" />
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink(lobby.code, "uno"));
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* le lien reste sélectionnable */
                  }
                }}
              >
                {copied ? "Copié ✓" : "Copier le lien"}
              </button>
            </div>
            <h2>Joueurs ({lobby.players.length}/10)</h2>
            {lobby.players.map((p) => (
              <div key={p.id} className="lobby-player">
                <span className="avatar small" style={{ background: p.color }}>
                  <TokenIcon token={p.token} size={16} />
                </span>
                <b>{p.name}</b>
                <span style={{ color: "var(--muted)" }}>{TOKENS.find((t) => t.id === p.token)?.label}</span>
                {p.host && <span className="tag">hôte</span>}
                {p.id === me && <span className="tag">vous</span>}
                {!p.online && <span className="tag off">hors ligne</span>}
                {isHost && !p.host && (
                  <button className="btn small ghost" style={{ marginLeft: "auto" }} onClick={() => kick(p.id)}>
                    Retirer
                  </button>
                )}
              </div>
            ))}
            <h2>Fin de partie</h2>
            <fieldset disabled={!isHost} className="options" style={{ border: 0, padding: 0, margin: 0 }}>
              <label>
                <input type="radio" checked={target === null} onChange={() => setOptions({ targetScore: null })} />
                Rapide : le premier qui n'a plus de cartes gagne, puis on relance
              </label>
              <label>
                <input type="radio" checked={target === 250} onChange={() => setOptions({ targetScore: 250 })} />
                En points : le premier à 250
              </label>
              <label>
                <input type="radio" checked={target === 500} onChange={() => setOptions({ targetScore: 500 })} />
                Officiel : le premier à 500 points
              </label>
            </fieldset>
            <div className="setup-actions">
              <button className="btn" onClick={quit}>
                Quitter
              </button>
              {isHost ? (
                <button className="btn primary big" disabled={lobby.players.length < 2} onClick={start}>
                  {lobby.players.length < 2 ? "En attente d'autres joueurs…" : "Lancer la partie"}
                </button>
              ) : (
                <span style={{ color: "var(--muted)" }}>L'hôte va lancer la partie…</span>
              )}
            </div>
          </>
        ) : (
          <>
            <p>{net && net.kind !== "ready" && net.kind !== "connecting" ? net.detail : "Connexion à la salle…"}</p>
            <button className="btn" onClick={quit}>
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── La table ────────────────────────────────────────────────

/** Rectangle de la carte que je viens de cliquer (pour la faire voler jusqu'à la défausse). */
let lastPlayedRect: DOMRect | null = null;

const seatRect = (id: string) => document.querySelector(`[data-seat="${id}"]`)?.getBoundingClientRect() ?? null;
const pileRect = () => document.querySelector("[data-pile]")?.getBoundingClientRect() ?? null;
const discardRect = () => document.querySelector("[data-discard]")?.getBoundingClientRect() ?? null;
const handRect = () => document.querySelector("[data-hand]")?.getBoundingClientRect() ?? null;

type Flight =
  | { id: number; kind: "card"; card: UnoCard; from: DOMRect; to: DOMRect; delay: number }
  | { id: number; kind: "back"; from: DOMRect; to: DOMRect; delay: number }
  | { id: number; kind: "stamp"; text: string; tone: "bad" | "good" | "info"; at: DOMRect; delay: number };

let flightId = 0;

/** Ordre des joueurs en partant de celui qui joue, dans le sens du jeu. */
function turnOrder(view: UnoState) {
  const n = view.players.length;
  const out: UnoState["players"] = [];
  for (let k = 0; k < n; k++) {
    const p = view.players[(((view.current + k * view.direction) % n) + n) % n]!;
    if (!p.left) out.push(p);
  }
  return out;
}

function UnoTable({ view }: { view: UnoState }) {
  const me = useUno((s) => s.me);
  const mode = useUno((s) => s.mode);
  const lobby = useUno((s) => s.lobby);
  const act = useUno((s) => s.act);
  const quit = useUno((s) => s.quit);
  const [muted, setMutedState] = useState(isMuted());
  const [music, setMusic] = useState(isMusicOn());
  const [pendingWild, setPendingWild] = useState<UnoCard | null>(null);
  useEventFeedback(view);
  useEffect(() => useMusicScreen(), []);

  const myIndex = Math.max(0, view.players.findIndex((p) => p.id === me));
  const mine = view.players.find((p) => p.id === me);
  const current = view.players[view.current]!;
  const playing = view.phase === "play" || view.phase === "challenge" || view.phase === "startColor";
  const myTurn = current.id === me && view.phase === "play";
  const top = topCard(view);
  // Autour de la table : moi en bas, puis les autres dans l'ordre du jeu (sens horaire).
  const others = view.players.map((_, i) => view.players[(myIndex + 1 + i) % view.players.length]!).filter((p) => p.id !== me);
  const offline = (id: string) => !!lobby?.players.some((p) => p.id === id && !p.online);

  const playCard = (card: UnoCard, el: HTMLElement | null) => {
    lastPlayedRect = el?.getBoundingClientRect() ?? null;
    if (card.kind === "wild" || card.kind === "wild4") setPendingWild(card);
    else act({ type: "play", cardId: card.id });
  };
  const canSayUno = !!mine && !mine.saidUno && ((mine.hand.length === 2 && myTurn) || (mine.hand.length === 1 && view.unoTarget === me));

  return (
    <div className={`uno-table ${myTurn ? "my-turn" : ""}`}>
      <div className="uno-top panel">
        <a className="btn small ghost" href="#/" onClick={() => quit()}>
          ← Hub
        </a>
        <span className="round">
          Manche <b>{view.round}</b>
          {view.options.targetScore ? ` · objectif ${view.options.targetScore} pts` : " · partie rapide"}
        </span>
        {lobby && <span className="round">Salle {lobby.code}</span>}
        <button
          className="btn small ghost"
          title={music ? "Couper la musique" : "Mettre la musique"}
          onClick={() => {
            setMusicOn(!music);
            setMusic(!music);
          }}
        >
          {music ? "🎵" : "🎵̸"}
        </button>
        <button
          className="btn small ghost"
          title={muted ? "Activer les sons" : "Couper les sons"}
          onClick={() => {
            setMuted(!muted);
            setMutedState(!muted);
          }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <button
          className="btn small ghost"
          onClick={() => {
            const msg = mode === "host" ? "Quitter ? La partie sera en pause pour tout le monde." : "Quitter la salle ? Vous pourrez revenir avec le même code.";
            if (confirm(msg)) quit();
          }}
        >
          Menu
        </button>
      </div>

      <TurnList view={view} me={me} offline={offline} />

      <div className="felt-wrap">
        <div className="felt">
          <span className="felt-logo" aria-hidden>
            3AJIB
          </span>
          {others.map((p, i) => {
            // Les adversaires s'étalent de la gauche (après moi) jusqu'à la droite, en passant par le haut.
            const a = Math.PI * (1 - (i + 1) / (others.length + 1));
            return (
              <Seat
                key={p.id}
                view={view}
                player={p}
                x={50 - Math.cos(a) * 54}
                y={50 - Math.sin(a) * 64}
                active={playing && p.id === current.id}
                offline={offline(p.id)}
              />
            );
          })}
          {mine && <Seat view={view} player={mine} x={50} y={108} active={playing && mine.id === current.id} offline={false} isMe />}

          <div className="table-center">
            <DirectionBadge direction={view.direction} />
            <button
              className={`draw-pile ${myTurn && !view.drawn ? "can" : ""}`}
              disabled={!myTurn || !!view.drawn}
              onClick={() => act({ type: "draw" })}
              title="Piocher une carte"
              data-pile
            >
              <CardBack size="lg" className="stack3" />
              <CardBack size="lg" className="stack2" />
              <CardBack size="lg" />
              <span className="pile-count">{view.drawCount} cartes</span>
            </button>
            <div className="discard" data-discard>
              {view.discard.slice(-3, -1).map((c, i) => (
                <CardFace key={c.id} card={c} size="lg" className={`under u${i}`} />
              ))}
              <CardFace key={top.id} card={top} size="lg" className="landing" />
            </div>
            <div className="color-chip" style={{ ["--cc" as string]: CARD_COLORS[view.currentColor] }}>
              <span className="swatch-dot" />
              {colorName(view.currentColor)}
            </div>
          </div>
        </div>
      </div>

      {mine && (
        <div className={`uno-me ${myTurn ? "my-turn" : ""}`}>
          <div className="me-bar">
            <span className="turn-msg">
              {view.phase === "play" && (myTurn ? (view.drawn ? "Tu as pioché une carte jouable : pose-la ou garde-la." : "À toi ! Pose une carte ou pioche.") : `${current.name} joue…`)}
              {view.phase === "challenge" && view.pendingWild4?.victim !== me && `${current.name} décide pour le +4…`}
              {view.phase === "startColor" && current.id !== me && `${current.name} choisit la couleur de départ…`}
            </span>
            {canSayUno && (
              <button className="btn uno-call" onClick={() => act({ type: "sayUno" })}>
                UNO !
              </button>
            )}
            {myTurn && view.drawn && (
              <button className="btn" onClick={() => act({ type: "pass" })}>
                Garder la carte
              </button>
            )}
          </div>
          <Hand view={view} hand={mine.hand} myTurn={myTurn} onPlay={playCard} />
        </div>
      )}

      {pendingWild && (
        <ColorPicker
          title={pendingWild.kind === "wild4" ? "Joker +4 : quelle couleur ?" : "Joker : quelle couleur ?"}
          onPick={(color) => {
            act({ type: "play", cardId: pendingWild.id, color });
            setPendingWild(null);
          }}
          onCancel={() => setPendingWild(null)}
        />
      )}
      {view.phase === "startColor" && current.id === me && <ColorPicker title="Première carte : un joker ! Choisis la couleur" onPick={(color) => act({ type: "chooseColor", color })} />}
      {view.phase === "challenge" && view.pendingWild4?.victim === me && <ChallengeBox view={view} />}
      {(view.phase === "roundOver" || view.phase === "gameOver") && view.roundResult && <RoundOver view={view} offline={offline} />}
      <FlyLayer view={view} />
      <TurnBanner />
      <Notes />
    </div>
  );
}

/** Liste à gauche : l'ordre du tour à partir de celui qui joue, et le sens. */
function TurnList({ view, me, offline }: { view: UnoState; me: string | null; offline: (id: string) => boolean }) {
  const order = turnOrder(view);
  const playing = view.phase === "play" || view.phase === "challenge" || view.phase === "startColor";
  return (
    <aside className="turn-list panel">
      <div className="tl-head">
        <span>Ordre du tour</span>
        <span className={`tl-dir ${view.direction === 1 ? "cw" : "ccw"}`} title={view.direction === 1 ? "Sens horaire" : "Sens inverse"}>
          {view.direction === 1 ? "↻ horaire" : "↺ inverse"}
        </span>
      </div>
      {order.map((p, i) => (
        <div key={p.id} className={`tl-row ${playing && i === 0 ? "now" : ""} ${playing && i === 1 ? "next" : ""}`}>
          <span className="avatar small" style={{ background: p.color }}>
            <TokenIcon token={p.token} size={15} />
          </span>
          <span className="tl-name">
            {p.name}
            {p.id === me && <small> (toi)</small>}
            {offline(p.id) && <small className="off"> · hors ligne</small>}
          </span>
          <span className="tl-cards" title="Cartes en main">
            🂠 {p.handCount}
          </span>
          {playing && i === 0 && <span className="tl-tag now">Joue</span>}
          {playing && i === 1 && <span className="tl-tag">Suivant</span>}
          {p.handCount === 1 && p.saidUno && <span className="tl-tag uno">UNO</span>}
          {view.options.targetScore !== null && <span className="tl-score">{p.score} pts</span>}
        </div>
      ))}
    </aside>
  );
}

function DirectionBadge({ direction }: { direction: 1 | -1 }) {
  return (
    <div key={direction} className={`dir-badge ${direction === 1 ? "cw" : "ccw"}`} title={direction === 1 ? "Sens horaire" : "Sens inverse"} aria-hidden>
      <svg viewBox="0 0 48 48" width="44" height="44">
        <path d="M24 6a18 18 0 1 1-15.6 9" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M2.5 13.5 8.6 15.4 10.7 9" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function Seat({
  view,
  player,
  x,
  y,
  active,
  offline,
  isMe,
}: {
  view: UnoState;
  player: UnoState["players"][number];
  x: number;
  y: number;
  active: boolean;
  offline: boolean;
  isMe?: boolean;
}) {
  const act = useUno((s) => s.act);
  const fan = Math.min(player.handCount, 9);
  return (
    <div className={`seat ${active ? "active" : ""} ${player.left ? "gone" : ""} ${isMe ? "me" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} data-seat={player.id}>
      {!isMe && fan > 0 && (
        <div className="seat-fan">
          {Array.from({ length: fan }, (_, i) => (
            <CardBack key={i} size="sm" style={{ transform: `rotate(${(i - (fan - 1) / 2) * 8}deg)`, marginLeft: i ? -24 : 0 }} />
          ))}
        </div>
      )}
      <div className="seat-avatar" style={{ background: player.color }}>
        <TokenIcon token={player.token} size={28} />
        {!isMe && <span className="seat-count">{player.handCount}</span>}
      </div>
      <div className="seat-name">
        {player.name}
        {isMe && " (toi)"}
        {offline && <small> · hors ligne</small>}
      </div>
      {active && <div className="seat-tag">{isMe ? "À toi !" : "Joue"}</div>}
      {player.handCount === 1 && player.saidUno && <span className="uno-badge">UNO !</span>}
      {view.unoTarget === player.id && !isMe && (
        <button className="btn small catch" onClick={() => act({ type: "catchUno", target: player.id })}>
          🚨 Contre-UNO !
        </button>
      )}
    </div>
  );
}

function Hand({ view, hand, myTurn, onPlay }: { view: UnoState; hand: UnoCard[]; myTurn: boolean; onPlay: (c: UnoCard, el: HTMLElement | null) => void }) {
  const sorted = useMemo(() => {
    const order = (c: UnoCard) => (c.color ? COLORS.indexOf(c.color) : 9) * 100 + (c.kind === "number" ? c.value! : 20 + ["skip", "reverse", "draw2", "wild", "wild4"].indexOf(c.kind));
    return [...hand].sort((a, b) => order(a) - order(b));
  }, [hand]);
  const known = useRef<Set<number> | null>(null);
  const fresh = known.current ? new Set(sorted.filter((c) => !known.current!.has(c.id)).map((c) => c.id)) : new Set<number>();
  useEffect(() => {
    known.current = new Set(hand.map((c) => c.id));
  }, [hand]);
  const n = sorted.length;
  return (
    <div className="hand" style={{ ["--n" as string]: n }} data-hand>
      {sorted.map((c, i) => {
        const allowed = myTurn && canPlay(view, c) && (!view.drawn || view.drawn.cardId === c.id);
        const angle = n > 1 ? (i - (n - 1) / 2) * Math.min(5, 50 / n) : 0;
        return (
          <div
            key={c.id}
            className="hand-slot"
            style={{ ["--a" as string]: `${angle}deg`, zIndex: i, animationDelay: fresh.has(c.id) ? `${0.35 + [...fresh].indexOf(c.id) * 0.09}s` : undefined }}
          >
            <CardFace
              card={c}
              size="lg"
              playable={allowed}
              className={`${fresh.has(c.id) ? "fresh" : ""} ${view.drawn?.cardId === c.id ? "just-drawn" : ""}`}
              onClick={allowed ? () => onPlay(c, document.querySelector(`[data-card="${c.id}"]`)) : undefined}
              title={cardLabel(c)}
              dataId={c.id}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Cartes qui volent (jouées, piochées) et tampons sur les sièges. */
function FlyLayer({ view }: { view: UnoState }) {
  const events = useUno((s) => s.events);
  const me = useUno((s) => s.me);
  const [flights, setFlights] = useState<Flight[]>([]);
  const last = useRef(events.seq);
  useLayoutEffect(() => {
    if (events.seq === last.current) return;
    last.current = events.seq;
    if (view.phase === "roundOver" || view.phase === "gameOver") return;
    const out: Flight[] = [];
    let delay = 0;
    const stamp = (player: string, text: string, tone: "bad" | "good" | "info", d = delay) => {
      const at = seatRect(player);
      if (at) out.push({ id: ++flightId, kind: "stamp", text, tone, at, delay: d });
    };
    for (const e of events.list) {
      if (e.type === "cardPlayed") {
        const to = discardRect();
        const from = e.player === me ? (lastPlayedRect ?? handRect()) : seatRect(e.player);
        if (from && to) out.push({ id: ++flightId, kind: "card", card: e.card, from, to, delay });
        lastPlayedRect = null;
        delay += 0.12;
      } else if (e.type === "drew") {
        const from = pileRect();
        const to = e.player === me ? handRect() : seatRect(e.player);
        if (from && to) {
          for (let k = 0; k < Math.min(e.count, 6); k++) out.push({ id: ++flightId, kind: "back", from, to, delay: delay + k * 0.09 });
        }
        if (e.reason !== "pioche") stamp(e.player, `+${e.count}`, "bad", delay + 0.2);
        delay += 0.1;
      } else if (e.type === "skipped") stamp(e.player, "⊘", "bad", delay + 0.25);
      else if (e.type === "unoSaid") stamp(e.player, "UNO !", "good");
    }
    if (out.length) setFlights((f) => [...f, ...out]);
  }, [events, me, view]);
  const done = (id: number) => setFlights((f) => f.filter((x) => x.id !== id));
  return (
    <div className="fly-layer" aria-hidden>
      {flights.map((f) => (
        <FlightView key={f.id} f={f} onDone={() => done(f.id)} />
      ))}
    </div>
  );
}

function FlightView({ f, onDone }: { f: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let anim: Animation;
    if (f.kind === "stamp") {
      anim = el.animate(
        [
          { transform: "translate(-50%, -50%) scale(2.2) rotate(-14deg)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1) rotate(-8deg)", opacity: 1, offset: 0.18 },
          { transform: "translate(-50%, -50%) scale(1) rotate(-8deg)", opacity: 1, offset: 0.8 },
          { transform: "translate(-50%, -70%) scale(0.9) rotate(-8deg)", opacity: 0 },
        ],
        { duration: 1300, delay: f.delay * 1000, fill: "both", easing: "cubic-bezier(.2,.9,.3,1.2)" },
      );
    } else {
      const dx = f.from.left + f.from.width / 2 - (f.to.left + f.to.width / 2);
      const dy = f.from.top + f.from.height / 2 - (f.to.top + f.to.height / 2);
      const spin = f.kind === "card" ? -25 + Math.random() * 20 : 12;
      anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(${f.kind === "back" ? 0.6 : 1})`, opacity: 1 },
          { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) rotate(${spin / 2}deg) scale(1.08)`, opacity: 1, offset: 0.5 },
          { transform: "translate(0, 0) rotate(-3deg) scale(1)", opacity: f.kind === "back" ? 0 : 1 },
        ],
        { duration: f.kind === "back" ? 420 : 380, delay: f.delay * 1000, fill: "both", easing: "cubic-bezier(.3,.7,.3,1)" },
      );
    }
    anim.onfinish = onDone;
    return () => anim.cancel();
  }, [f, onDone]);

  if (f.kind === "stamp") {
    return (
      <div ref={ref} className={`stamp ${f.tone}`} style={{ left: f.at.left + f.at.width / 2, top: f.at.top + f.at.height / 2 }}>
        {f.text}
      </div>
    );
  }
  const style = { left: f.to.left + f.to.width / 2 - 46, top: f.to.top + f.to.height / 2 - 68 };
  return (
    <div ref={ref} className="flight" style={style}>
      {f.kind === "card" ? <CardFace card={f.card} size="lg" /> : <CardBack size="lg" />}
    </div>
  );
}

/** Grande bannière quand c'est à moi. */
function TurnBanner() {
  const events = useUno((s) => s.events);
  const me = useUno((s) => s.me);
  const [show, setShow] = useState(0);
  const last = useRef(events.seq);
  useEffect(() => {
    if (events.seq === last.current) return;
    last.current = events.seq;
    if (events.list.some((e) => e.type === "turnStarted" && e.player === me)) {
      const id = Date.now();
      setShow(id);
      const t = setTimeout(() => setShow((s) => (s === id ? 0 : s)), 1100);
      return () => clearTimeout(t);
    }
  }, [events, me]);
  if (!show) return null;
  return (
    <div className="turn-banner" key={show}>
      À toi de jouer !
    </div>
  );
}

function ColorPicker({ title, onPick, onCancel }: { title: string; onPick: (c: UnoColor) => void; onCancel?: () => void }) {
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="panel modal color-picker" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <div className="colors">
          {COLORS.map((c) => (
            <button key={c} className="color-btn" style={{ background: CARD_COLORS[c] }} onClick={() => onPick(c)}>
              {colorName(c)}
            </button>
          ))}
        </div>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}

function ChallengeBox({ view }: { view: UnoState }) {
  const act = useUno((s) => s.act);
  const by = view.players.find((p) => p.id === view.pendingWild4?.by);
  return (
    <div className="modal-bg">
      <div className="panel modal challenge">
        <h2>{by?.name} te met un +4 !</h2>
        <p>
          Il n'a le droit de le poser que s'il n'avait <b>aucune carte {colorName(view.pendingWild4!.colorBefore)}</b>. Tu peux contester :
        </p>
        <ul>
          <li>s'il bluffait, c'est lui qui pioche 4 cartes et tu joues normalement ;</li>
          <li>s'il était dans son droit, tu pioches 6 cartes et tu passes ton tour.</li>
        </ul>
        <div className="setup-actions">
          <button className="btn" onClick={() => act({ type: "challenge" })}>
            🕵️ Contester
          </button>
          <button className="btn primary big" onClick={() => act({ type: "acceptDraw4" })}>
            Piocher 4 cartes
          </button>
        </div>
      </div>
    </div>
  );
}

function RoundOver({ view, offline }: { view: UnoState; offline: (id: string) => boolean }) {
  const act = useUno((s) => s.act);
  const actAs = useUno((s) => s.actAs);
  const me = useUno((s) => s.me);
  const mode = useUno((s) => s.mode);
  const r = view.roundResult!;
  const winner = view.players.find((p) => p.id === r.winner)!;
  const over = view.phase === "gameOver";
  const alive = view.players.filter((p) => !p.left);
  const iAmReady = !!me && view.ready.includes(me);
  const missing = alive.filter((p) => !view.ready.includes(p.id));
  const ranking = [...alive].sort((a, b) => b.score - a.score);
  return (
    <div className="modal-bg">
      {over && <Confetti color={winner.color} />}
      <div className="panel modal round-over">
        <div className="winner-avatar" style={{ background: winner.color }}>
          <TokenIcon token={winner.token} size={44} />
        </div>
        <h2>{over ? `🏆 ${winner.name} gagne !` : `🏁 ${winner.name} remporte la manche`}</h2>
        {view.options.targetScore !== null && <p className="gain">+{r.points} points</p>}
        <div className="leftovers">
          {r.hands.map((h) => {
            const p = view.players.find((pl) => pl.id === h.player)!;
            return (
              <div key={h.player} className="leftover">
                <span className="nm">
                  {p.name} <small>({h.cards.length} carte{h.cards.length > 1 ? "s" : ""})</small>
                </span>
                <span className="mini-cards">
                  {h.cards.map((c) => (
                    <CardFace key={c.id} card={c} size="sm" />
                  ))}
                </span>
              </div>
            );
          })}
        </div>
        {view.options.targetScore !== null && (
          <ol className="scores">
            {ranking.map((p) => (
              <li key={p.id}>
                <span className="avatar small" style={{ background: p.color }}>
                  <TokenIcon token={p.token} size={14} />
                </span>
                {p.name} — <b>{p.score}</b> pts
              </li>
            ))}
          </ol>
        )}
        <h3 className="ready-title">{over ? "On relance ?" : "Manche suivante ?"}</h3>
        <div className="ready-list">
          {alive.map((p) => {
            const ok = view.ready.includes(p.id);
            return (
              <div key={p.id} className={`ready-chip ${ok ? "ok" : ""}`}>
                <span className="avatar small" style={{ background: p.color }}>
                  <TokenIcon token={p.token} size={14} />
                </span>
                {p.name}
                <span className="state">{ok ? "Prêt ✓" : offline(p.id) ? "hors ligne" : "…"}</span>
              </div>
            );
          })}
        </div>
        <div className="setup-actions" style={{ justifyContent: "center" }}>
          <a className="btn" href="#/" onClick={() => useUno.getState().quit()}>
            Retour au hub
          </a>
          <button className="btn primary big" disabled={iAmReady} onClick={() => act({ type: "ready" })}>
            {iAmReady ? `En attente (${view.ready.length}/${alive.length})` : "Prêt !"}
          </button>
          {mode === "host" && iAmReady && missing.length > 0 && (
            <button className="btn small ghost" onClick={() => missing.forEach((p) => actAs(p.id, { type: "ready" }))} title="Pour ne pas attendre quelqu'un d'absent">
              Lancer sans attendre
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Confetti({ color }: { color: string }) {
  const bits = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 2.8 + Math.random() * 2,
        color: [CARD_COLORS.red, CARD_COLORS.yellow, CARD_COLORS.green, CARD_COLORS.blue, color][i % 5],
        size: 6 + Math.random() * 8,
      })),
    [color],
  );
  return (
    <div className="confetti" aria-hidden>
      {bits.map((c, i) => (
        <i key={i} style={{ left: `${c.left}%`, background: c.color, width: c.size, height: c.size * 0.45, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }} />
      ))}
    </div>
  );
}

// ── Sons et notifications ───────────────────────────────────

function useEventFeedback(view: UnoState) {
  const events = useUno((s) => s.events);
  const me = useUno((s) => s.me);
  const last = useRef(0);
  useEffect(() => {
    if (events.seq === last.current) return;
    last.current = events.seq;
    const name = (id: string) => (id === me ? "Tu" : (view.players.find((p) => p.id === id)?.name ?? "?"));
    for (const e of events.list) feedback(e, name, me);
  }, [events, me, view.players]);
}

function feedback(e: UnoEvent, name: (id: string) => string, me: string | null) {
  switch (e.type) {
    case "cardPlayed":
      play("card");
      break;
    case "drew":
      play("step");
      break;
    case "colorChosen":
      pushUnoNote(`🎨 Couleur demandée : ${colorName(e.color)}`);
      break;
    case "reversed":
      play("trade");
      pushUnoNote("⇄ Le sens s'inverse !");
      break;
    case "unoSaid":
      play("yourTurn");
      break;
    case "unoCaught":
      play("error");
      pushUnoNote(`🚨 ${name(e.by)} attrape ${name(e.target)} : +2 cartes !`, "bad");
      break;
    case "challenged":
      pushUnoNote(e.success ? `🕵️ Bluff démasqué ! ${name(e.target)} pioche 4 cartes` : `🕵️ Contestation ratée : ${name(e.by)} pioche 6 cartes`, "bad");
      break;
    case "turnStarted":
      if (e.player === me) play("yourTurn");
      break;
    case "roundOver":
      play("buy");
      break;
    case "reshuffled":
      pushUnoNote("La défausse est remélangée");
      break;
    default:
      break;
  }
}

function Notes() {
  const notes = useUno((s) => s.notes);
  const [, tick] = useState(0);
  const now = performance.now() / 1000;
  const visible = notes.filter((n) => now - n.at < 1.6).slice(-3);
  useEffect(() => {
    if (!visible.length) return;
    const id = setTimeout(() => tick((x) => x + 1), 200);
    return () => clearTimeout(id);
  });
  return (
    <div className="notes uno-notes">
      {visible.map((n) => (
        <div key={n.id} className={`note ${n.kind}`} style={{ animationDuration: "1.6s" }}>
          <span>{n.text}</span>
          <span className="timer" style={{ animationDuration: "1.6s" }} />
        </div>
      ))}
    </div>
  );
}
