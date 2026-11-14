import { useEffect, useMemo, useRef, useState } from "react";
import { canPlay, cardLabel, colorName, COLORS, topCard, type UnoCard, type UnoColor, type UnoEvent, type UnoState } from "@3ajib/uno";
import { inviteLink, normalizeCode, type Profile } from "../../net";
import { loadProfile, saveProfile } from "../../profile";
import { ProfileEditor } from "../../ui/Options";
import { TokenIcon } from "../../ui/TokenIcon";
import { TOKENS } from "../../tokens";
import { isMuted, play, setMuted } from "../../sound";
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
  const target = (lobby?.options as { targetScore?: number | null } | undefined)?.targetScore ?? 500;
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
                <input type="radio" checked={target === 500} onChange={() => setOptions({ targetScore: 500 })} />
                Officiel : le premier à 500 points
              </label>
              <label>
                <input type="radio" checked={target === 250} onChange={() => setOptions({ targetScore: 250 })} />
                Partie courte : 250 points
              </label>
              <label>
                <input type="radio" checked={target === null} onChange={() => setOptions({ targetScore: null })} />
                Une seule manche
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
      if (e.player !== me) pushUnoNote(`${name(e.player)} pose ${cardLabel(e.card)}`);
      break;
    case "drew":
      play("step");
      if (e.reason !== "pioche") pushUnoNote(`${name(e.player)} pioche ${e.count} carte${e.count > 1 ? "s" : ""} (${e.reason})`, e.player === me ? "bad" : "info");
      break;
    case "colorChosen":
      pushUnoNote(`Couleur demandée : ${colorName(e.color)}`);
      break;
    case "reversed":
      pushUnoNote("⇄ Le sens s'inverse !");
      break;
    case "skipped":
      pushUnoNote(e.player === me ? "⊘ Tu passes ton tour" : `⊘ ${name(e.player)} passe son tour`, e.player === me ? "bad" : "info");
      break;
    case "unoSaid":
      play("yourTurn");
      pushUnoNote(`📣 ${name(e.player)} : « UNO ! »`, "good");
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

function UnoTable({ view }: { view: UnoState }) {
  const me = useUno((s) => s.me);
  const mode = useUno((s) => s.mode);
  const lobby = useUno((s) => s.lobby);
  const act = useUno((s) => s.act);
  const quit = useUno((s) => s.quit);
  const [muted, setMutedState] = useState(isMuted());
  const [pendingWild, setPendingWild] = useState<UnoCard | null>(null);
  useEventFeedback(view);

  const myIndex = view.players.findIndex((p) => p.id === me);
  const mine = view.players[myIndex];
  const current = view.players[view.current]!;
  const myTurn = current.id === me && view.phase === "play";
  const top = topCard(view);
  // Les adversaires, dans l'ordre du jeu à partir de moi.
  const opponents = view.players.map((_, i) => view.players[(myIndex + 1 + i) % view.players.length]!).filter((p) => p.id !== me);
  const offline = (id: string) => lobby?.players.some((p) => p.id === id && !p.online);

  const playCard = (card: UnoCard) => {
    if (card.kind === "wild" || card.kind === "wild4") setPendingWild(card);
    else act({ type: "play", cardId: card.id });
  };

  const canSayUno = mine && !mine.saidUno && ((mine.hand.length === 2 && myTurn) || (mine.hand.length === 1 && view.unoTarget === me));

  return (
    <div className="uno-table">
      <div className="uno-top panel">
        <a className="btn small ghost" href="#/" onClick={() => quit()}>
          ← Hub
        </a>
        <span className="round">
          Manche <b>{view.round}</b>
          {view.options.targetScore ? ` · objectif ${view.options.targetScore} pts` : " · une seule manche"}
        </span>
        {lobby && <span className="round">Salle {lobby.code}</span>}
        <button
          className="btn small ghost"
          title={muted ? "Activer le son" : "Couper le son"}
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

      {/* Adversaires */}
      <div className="uno-opponents">
        {opponents.map((p) => {
          const isCur = p.id === current.id && view.phase !== "roundOver" && view.phase !== "gameOver";
          return (
            <div key={p.id} className={`opp ${isCur ? "current" : ""} ${p.left ? "left" : ""}`}>
              <div className="opp-head">
                <span className="avatar" style={{ background: p.color }}>
                  <TokenIcon token={p.token} />
                </span>
                <div>
                  <div className="opp-name">{p.name}</div>
                  <div className="opp-score">
                    {p.score} pts{offline(p.id) ? " · hors ligne" : ""}
                    {p.left ? " · parti" : ""}
                  </div>
                </div>
              </div>
              <div className="opp-fan">
                {Array.from({ length: Math.min(p.handCount, 12) }, (_, i) => (
                  <CardBack key={i} size="sm" style={{ transform: `rotate(${(i - Math.min(p.handCount, 12) / 2) * 5}deg)`, marginLeft: i ? -26 : 0 }} />
                ))}
                <span className="count">{p.handCount}</span>
              </div>
              {p.handCount === 1 && p.saidUno && <span className="uno-badge">UNO !</span>}
              {view.unoTarget === p.id && (
                <button className="btn small catch" onClick={() => act({ type: "catchUno", target: p.id })}>
                  🚨 Contre-UNO !
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Centre : pioche, défausse, couleur et sens */}
      <div className="uno-center">
        <div className={`direction ${view.direction === 1 ? "cw" : "ccw"}`} style={{ ["--c" as string]: CARD_COLORS[view.currentColor] }} aria-hidden />
        <button
          className={`draw-pile ${myTurn && !view.drawn ? "can" : ""}`}
          disabled={!myTurn || !!view.drawn}
          onClick={() => act({ type: "draw" })}
          title="Piocher une carte"
        >
          <CardBack size="lg" className="stack3" />
          <CardBack size="lg" className="stack2" />
          <CardBack size="lg" />
          <span className="pile-count">{view.drawCount}</span>
        </button>
        <div className="discard">
          {view.discard.slice(-3, -1).map((c, i) => (
            <CardFace key={c.id} card={c} size="lg" className={`under u${i}`} />
          ))}
          <CardFace key={top.id} card={top} size="lg" className="landing" />
        </div>
        <div className="color-chip" style={{ background: CARD_COLORS[view.currentColor] }}>
          {colorName(view.currentColor)}
        </div>
      </div>

      {/* Moi */}
      {mine && (
        <div className={`uno-me ${myTurn ? "my-turn" : ""}`}>
          <div className="me-bar">
            <span className="avatar" style={{ background: mine.color }}>
              <TokenIcon token={mine.token} />
            </span>
            <b>{mine.name}</b>
            <span className="opp-score">{mine.score} pts</span>
            <span className="turn-msg">
              {view.phase === "play" && (myTurn ? (view.drawn ? "Tu as pioché une carte jouable : pose-la ou garde-la." : "À toi ! Pose une carte ou pioche.") : `${current.name} joue…`)}
              {view.phase === "challenge" && (view.pendingWild4?.victim === me ? "" : `${current.name} décide pour le +4…`)}
              {view.phase === "startColor" && (current.id === me ? "" : `${current.name} choisit la couleur de départ…`)}
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
      {view.phase === "startColor" && current.id === me && (
        <ColorPicker title="Première carte : un joker ! Choisis la couleur" onPick={(color) => act({ type: "chooseColor", color })} />
      )}
      {view.phase === "challenge" && view.pendingWild4?.victim === me && <ChallengeBox view={view} />}
      {(view.phase === "roundOver" || view.phase === "gameOver") && view.roundResult && <RoundOver view={view} />}
      <Notes />
    </div>
  );
}

function Hand({ view, hand, myTurn, onPlay }: { view: UnoState; hand: UnoCard[]; myTurn: boolean; onPlay: (c: UnoCard) => void }) {
  // Main triée : par couleur puis par valeur, jokers à la fin.
  const sorted = useMemo(() => {
    const order = (c: UnoCard) => (c.color ? COLORS.indexOf(c.color) : 9) * 100 + (c.kind === "number" ? c.value! : 20 + ["skip", "reverse", "draw2", "wild", "wild4"].indexOf(c.kind));
    return [...hand].sort((a, b) => order(a) - order(b));
  }, [hand]);
  const known = useRef<Set<number>>(new Set());
  const fresh = new Set(sorted.filter((c) => !known.current.has(c.id)).map((c) => c.id));
  useEffect(() => {
    known.current = new Set(hand.map((c) => c.id));
  }, [hand]);
  const n = sorted.length;
  return (
    <div className="hand" style={{ ["--n" as string]: n }}>
      {sorted.map((c, i) => {
        const allowed = myTurn && canPlay(view, c) && (!view.drawn || view.drawn.cardId === c.id);
        const angle = n > 1 ? (i - (n - 1) / 2) * Math.min(5, 50 / n) : 0;
        return (
          <div key={c.id} className="hand-slot" style={{ ["--a" as string]: `${angle}deg`, zIndex: i }}>
            <CardFace
              card={c}
              size="lg"
              playable={allowed}
              className={`${fresh.has(c.id) && known.current.size ? "fresh" : ""} ${view.drawn?.cardId === c.id ? "just-drawn" : ""}`}
              onClick={allowed ? () => onPlay(c) : undefined}
              title={cardLabel(c)}
            />
          </div>
        );
      })}
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

function RoundOver({ view }: { view: UnoState }) {
  const act = useUno((s) => s.act);
  const quit = useUno((s) => s.quit);
  const r = view.roundResult!;
  const winner = view.players.find((p) => p.id === r.winner)!;
  const over = view.phase === "gameOver";
  const ranking = [...view.players].sort((a, b) => b.score - a.score);
  return (
    <div className="modal-bg">
      {over && <Confetti color={winner.color} />}
      <div className="panel modal round-over">
        <h2>{over ? `🏆 ${winner.name} gagne la partie !` : `🏁 ${winner.name} remporte la manche`}</h2>
        <p className="gain">+{r.points} points</p>
        <div className="leftovers">
          {r.hands.map((h) => {
            const p = view.players.find((pl) => pl.id === h.player)!;
            return (
              <div key={h.player} className="leftover">
                <span className="nm">
                  {p.name} <small>({h.points} pts)</small>
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
        <div className="setup-actions">
          {over ? (
            <a className="btn primary big" href="#/" onClick={() => quit()}>
              Retour au hub
            </a>
          ) : (
            <button className="btn primary big" onClick={() => act({ type: "nextRound" })}>
              Manche suivante
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
