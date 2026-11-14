// L'écran de jeu : la place du village, le ciel, le narrateur, les rôles et les actions.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isAwake, ROLE_ORDER, voteTally, type LoupAction, type LoupEvent, type LoupPlayer, type LoupState, type PlayerId, type RoleId } from "@3ajib/loup";
import { TokenIcon } from "../../ui/TokenIcon";
import { isMuted, setMuted } from "../../sound";
import { isMusicOn, setMusicOn } from "../../music";
import { isVoiceOn, narrate, refreshAmbience, setAmbience, setVoiceOn, sfx, stopNarration } from "./ambience";
import { CAUSES, NARRATION, ROLES, STEP_ROLE } from "./roles";
import { Campfire, Fog, Sky, Village } from "./Scenery";
import { pushLoupNote, useLoup } from "./store";

type Scene = "night" | "dawn" | "day";

const nameOf = (v: LoupState, id: PlayerId | null | undefined) => v.players.find((p) => p.id === id)?.name ?? "?";

/** Ligne du narrateur pour l'état courant (affichée et lue à voix haute). */
function narration(v: LoupState, me: PlayerId | null): { key: string; text: string; speech?: string } {
  const k = `${v.phase}:${v.day}`;
  switch (v.phase) {
    case "intro":
      return { key: k, text: "Bienvenue au village. Découvre ton rôle, et garde-le pour toi…" };
    case "night": {
      const st = v.night?.step;
      if (!st) return { key: `${k}:dusk`, text: v.day === 1 ? NARRATION.dusk : `Nuit ${v.day}. ${NARRATION.dusk}` };
      return { key: `${k}:${st}`, text: NARRATION[st] };
    }
    case "dawn": {
      const deaths = v.announce?.deaths ?? [];
      const said = deaths.map((id) => {
        const p = v.players.find((x) => x.id === id)!;
        return `${p.name} a été retrouvé mort.${p.role && p.revealed ? ` Il était ${ROLES[p.role].the}.` : ""}`;
      });
      return {
        key: k,
        text: deaths.length ? "Le jour se lève… et le village découvre l'horreur." : "Le jour se lève. Miracle : personne n'est mort cette nuit !",
        speech: deaths.length ? `Le jour se lève sur le village. ${said.join(" ")}` : undefined,
      };
    }
    case "mayorVote":
      return { key: k, text: "Le village doit élire son maire : sa voix comptera double." };
    case "vote":
      return {
        key: k,
        text: v.ravenTarget ? `Le village débat. Le corbeau accuse ${nameOf(v, v.ravenTarget)}… Qui sont les loups ?` : "Le village débat. Qui sont les loups ?",
      };
    case "verdict": {
      const a = v.announce;
      const dead = a?.deaths[0] ? v.players.find((p) => p.id === a.deaths[0]) : null;
      let text = "Le village n'a désigné personne.";
      if (a?.spared) text = `${nameOf(v, a.spared)} est l'idiot du village ! On l'épargne… mais il ne votera plus.`;
      else if (dead) text = `${a?.tie ? "Égalité ! Le bouc émissaire paie pour tout le monde : " : "Le village a tranché : "}${dead.name} est éliminé.${dead.role && dead.revealed ? ` Il était ${ROLES[dead.role].the}.` : ""}`;
      else if (a?.tie) text = "Égalité ! Le village n'arrive pas à se décider : personne n'est éliminé.";
      return { key: k, text };
    }
    case "hunter": {
      const h = nameOf(v, v.pending[0]?.player);
      return { key: `${k}:h:${v.pending[0]?.player}`, text: `${h}, le chasseur, rassemble ses dernières forces et vise…` };
    }
    case "successor":
      return { key: `${k}:s`, text: `${nameOf(v, v.pending[0]?.player)}, le maire, désigne son successeur avant de s'éteindre.` };
    case "gameOver": {
      const w = v.winner!;
      const won = !!me && w.players.includes(me);
      const t =
        w.camp === "loups"
          ? "Les loups-garous ont dévoré tout le village."
          : w.camp === "village"
            ? "Le village est enfin débarrassé des loups-garous !"
            : w.camp === "amoureux"
              ? "Les amoureux restent seuls au monde : l'amour a triomphé."
              : "Plus personne… le village est désert.";
      return { key: k, text: t, speech: `${t} ${won ? "Bravo, tu as gagné !" : ""}` };
    }
  }
}

// ── Écran de jeu ────────────────────────────────────────────

export function LoupGame({ view }: { view: LoupState }) {
  const me = useLoup((s) => s.me);
  const mode = useLoup((s) => s.mode);
  const act = useLoup((s) => s.act);
  const [sel, setSel] = useState<PlayerId[]>([]);
  const [save, setSave] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [sys, setSys] = useState<SysLine[]>([]);
  const causes = useRef<Record<PlayerId, string>>({});
  const meP = view.players.find((p) => p.id === me) ?? null;
  const n = view.night;
  const scene: Scene = view.phase === "night" || view.phase === "intro" ? "night" : view.phase === "dawn" ? "dawn" : "day";
  const awake = isAwake(view, me);
  const dead = !!meP && !meP.alive;
  const isWolf = meP?.role === "loup";
  const girlCanSpy = meP?.role === "petiteFille" && meP.alive && n?.step === "loups" && !n.spied;
  const asleep = view.phase === "night" && !!meP?.alive && !awake;
  const bloodMoon = view.phase === "night" && n?.step === "loups" && (isWolf || dead);

  useEffect(() => setSel([]), [view.step.id, view.phase]);
  useEffect(() => setSave(false), [view.phase, n?.step]);
  useFeedback(view, me, setSys, causes);

  useEffect(() => {
    setAmbience(scene === "night" ? "night" : "day");
  }, [scene]);
  useEffect(
    () => () => {
      setAmbience("off");
      stopNarration();
    },
    [],
  );

  const line = narration(view, me);
  useEffect(() => {
    narrate(line.speech ?? line.text, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line.key]);

  const t = targeting(view, me, sel, setSel, act);

  return (
    <div className={`loup-scene ${scene} ${bloodMoon ? "blood" : ""} ${asleep ? "asleep" : ""} ${dead ? "ghost" : ""}`} style={{ ["--role" as string]: meP?.role ? ROLES[meP.role].color : "#ffb347" }}>
      <Sky />
      <Village />
      <Fog />

      <TopBar view={view} onRoles={() => setShowRoles(true)} onChat={() => setChatOpen((o) => !o)} />

      <div className="loup-main">
        <aside className="loup-left">
          {meP?.role && <MyRole role={meP.role} dead={dead} onOpen={() => setShowRoles(true)} />}
          {view.phase === "gameOver" ? (
            <GameOver view={view} me={me} isHost={mode === "host"} />
          ) : (
            <ActionPanel view={view} me={me} meP={meP} sel={sel} setSel={setSel} save={save} setSave={setSave} />
          )}
        </aside>

        <section className="loup-center">
          <div className="narration" key={line.key}>
            <p>{line.text}</p>
          </div>
          <Square view={view} me={me} t={t} picked={sel} />
        </section>

        <aside className={`loup-right ${chatOpen ? "open" : ""}`}>
          <Chat view={view} me={me} sys={sys} />
        </aside>
      </div>

      {asleep && <Sleep view={view} canSpy={!!girlCanSpy} onSpy={() => act({ type: "spy" })} />}
      {view.phase === "intro" && meP?.role && <Intro view={view} role={meP.role} />}
      {(view.phase === "dawn" || view.phase === "verdict") && view.announce && <Reveal view={view} causes={causes.current} />}
      {showRoles && <RolesModal view={view} onClose={() => setShowRoles(false)} />}
      <Toasts />
    </div>
  );
}

// ── Ciblage : qui peut-on désigner, et que se passe-t-il au clic ──

interface Targeting {
  can: (p: LoupPlayer) => boolean;
  pick: (id: PlayerId) => void;
  tone: string;
}

function targeting(v: LoupState, me: PlayerId | null, sel: PlayerId[], setSel: (s: PlayerId[]) => void, act: (a: LoupAction) => boolean): Targeting | null {
  const meP = v.players.find((p) => p.id === me);
  if (!me || !meP) return null;
  const one = (id: PlayerId) => setSel(sel[0] === id ? [] : [id]);
  const n = v.night;
  if (v.phase === "night" && n?.step && n.actors.includes(me) && !n.done) {
    switch (n.step) {
      case "cupidon":
        return { tone: "love", can: (p) => p.alive, pick: (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-2)) };
      case "salvateur":
        return { tone: "shield", can: (p) => p.alive && p.id !== v.lastProtected, pick: one };
      case "voyante":
        return { tone: "magic", can: (p) => p.alive && p.id !== me, pick: one };
      case "loups":
        return { tone: "blood", can: (p) => p.alive && p.role !== "loup", pick: (id) => act({ type: "wolfVote", target: id }) };
      case "sorciere":
        return v.potions?.death ? { tone: "poison", can: (p) => p.alive, pick: one } : null;
      case "corbeau":
        return { tone: "raven", can: (p) => p.alive, pick: one };
      default:
        return null;
    }
  }
  if ((v.phase === "vote" || v.phase === "mayorVote") && meP.alive && meP.canVote) {
    return {
      tone: v.phase === "mayorVote" ? "crown" : "vote",
      can: (p) => p.alive && (v.phase === "mayorVote" || p.id !== me),
      pick: (id) => act({ type: "vote", target: v.votes[me] === id ? null : id }),
    };
  }
  if ((v.phase === "hunter" || v.phase === "successor") && v.pending[0]?.player === me) {
    return { tone: v.phase === "hunter" ? "shot" : "crown", can: (p) => p.alive && p.id !== me, pick: one };
  }
  return null;
}

// ── Barre du haut ───────────────────────────────────────────

function useCountdown(v: LoupState): number | null {
  const [now, setNow] = useState(() => Date.now());
  const started = useRef({ id: -1, at: 0 });
  if (started.current.id !== v.step.id) started.current = { id: v.step.id, at: Date.now() };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!v.step.ms || v.phase === "gameOver") return null;
  return Math.max(0, Math.ceil((started.current.at + v.step.ms - now) / 1000));
}

function TopBar({ view, onRoles, onChat }: { view: LoupState; onRoles: () => void; onChat: () => void }) {
  const quit = useLoup((s) => s.quit);
  const mode = useLoup((s) => s.mode);
  const lobby = useLoup((s) => s.lobby);
  const [muted, setM] = useState(isMuted());
  const [music, setMu] = useState(isMusicOn());
  const [voice, setV] = useState(isVoiceOn());
  const left = useCountdown(view);
  const night = view.phase === "night" || view.phase === "intro";
  const label = view.phase === "intro" ? "Le village" : view.phase === "gameOver" ? "Fin de partie" : night ? `Nuit ${view.day}` : `Jour ${view.day}`;
  return (
    <header className="loup-top">
      <a className="btn small ghost" href="#/" onClick={() => quit()}>
        ← Hub
      </a>
      <span className="phase-label">
        <span className="phase-icon">{night ? "🌙" : view.phase === "gameOver" ? "🏁" : "☀️"}</span>
        {label}
      </span>
      {left !== null && (
        <span className={`clock ${left <= 10 ? "hurry" : ""}`} title="Temps restant">
          ⏳ {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </span>
      )}
      {lobby && <span className="room">Salle {lobby.code}</span>}
      <span className="top-spacer" />
      <button className="btn small ghost" onClick={onRoles} title="Les rôles de la partie">
        📜<span className="lbl"> Rôles</span>
      </button>
      <button className="btn small ghost chat-toggle" onClick={onChat} title="La place du village">
        💬
      </button>
      <button
        className={`btn small ghost ${voice ? "" : "off"}`}
        title={voice ? "Couper le narrateur" : "Activer le narrateur"}
        onClick={() => {
          setVoiceOn(!voice);
          setV(!voice);
        }}
      >
        🗣️
      </button>
      <button
        className={`btn small ghost ${music ? "" : "off"}`}
        title={music ? "Couper l'ambiance" : "Activer l'ambiance"}
        onClick={() => {
          setMusicOn(!music);
          setMu(!music);
          refreshAmbience();
        }}
      >
        🎵
      </button>
      <button
        className="btn small ghost"
        title={muted ? "Activer les sons" : "Couper les sons"}
        onClick={() => {
          setMuted(!muted);
          setM(!muted);
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
    </header>
  );
}

// ── Mon rôle ────────────────────────────────────────────────

export function RoleCard({ role, size = "md", flipped = true }: { role: RoleId; size?: "sm" | "md" | "lg"; flipped?: boolean }) {
  const r = ROLES[role];
  return (
    <div className={`role-card ${size} ${flipped ? "flipped" : ""}`} style={{ ["--rc" as string]: r.color }}>
      <div className="rc-inner">
        <div className="rc-back">
          <span>🌕</span>
        </div>
        <div className="rc-front">
          <span className="rc-camp">{r.camp === "loups" ? "Camp des loups" : "Camp du village"}</span>
          <span className="rc-emoji">{r.emoji}</span>
          <span className="rc-name">{r.name}</span>
          {size !== "sm" && <span className="rc-short">{r.short}</span>}
        </div>
      </div>
    </div>
  );
}

function MyRole({ role, dead, onOpen }: { role: RoleId; dead: boolean; onOpen: () => void }) {
  return (
    <button className={`my-role panel ${dead ? "dead" : ""}`} onClick={onOpen} title="Voir les rôles de la partie">
      <RoleCard role={role} size="sm" />
      <div className="my-role-text">
        <span className="kicker">{dead ? "Tu étais" : "Ton rôle"}</span>
        <b>{ROLES[role].name}</b>
        <small>{ROLES[role].desc}</small>
      </div>
    </button>
  );
}

// ── Panneau d'action ────────────────────────────────────────

function ActionPanel({
  view: v,
  me,
  meP,
  sel,
  setSel,
  save,
  setSave,
}: {
  view: LoupState;
  me: PlayerId | null;
  meP: LoupPlayer | null;
  sel: PlayerId[];
  setSel: (s: PlayerId[]) => void;
  save: boolean;
  setSave: (b: boolean) => void;
}) {
  const act = useLoup((s) => s.act);
  const n = v.night;
  const name = (id: PlayerId | null | undefined) => nameOf(v, id);
  const box = (tone: string, title: string, body: ReactNode) => (
    <div className={`action panel tone-${tone}`}>
      <h3>{title}</h3>
      {body}
    </div>
  );
  if (!meP) return null;

  if (v.phase === "gameOver") return null;
  const lastWish = (v.phase === "hunter" || v.phase === "successor") && v.pending[0]?.player === me;
  if (!meP.alive && !lastWish) {
    return box(
      "ghost",
      "👻 Tu es mort",
      <p>Tu vois maintenant tous les rôles et tu peux parler avec les autres morts. Pas un mot aux vivants !</p>,
    );
  }

  if (v.phase === "intro") return box("info", "La nuit approche", <p>Mémorise ton rôle. Personne ne doit le connaître… sauf si ça t'arrange.</p>);

  if (v.phase === "night" && n?.step && n.actors.includes(me!)) {
    if (n.done && n.step !== "loups") {
      if (n.step === "voyante" && n.seen) {
        const r = ROLES[n.seen.role];
        return box(
          "magic",
          "🔮 Ta vision",
          <div className="vision">
            <RoleCard role={n.seen.role} size="sm" />
            <p>
              <b>{name(n.seen.target)}</b> est {r.the} !
            </p>
          </div>,
        );
      }
      return box("info", "C'est fait", <p>Rendors-toi vite avant qu'on te remarque…</p>);
    }
    switch (n.step) {
      case "cupidon":
        return box(
          "love",
          "💘 Choisis deux amoureux",
          <>
            <p>Clique sur deux joueurs (toi compris si tu veux). Ils seront liés jusqu'à la mort.</p>
            <div className="chosen">{sel.map((id) => <span key={id}>{name(id)}</span>)}</div>
            <button className="btn primary" disabled={sel.length !== 2} onClick={() => act({ type: "cupid", a: sel[0]!, b: sel[1]! })}>
              {sel.length === 2 ? `Unir ${name(sel[0])} et ${name(sel[1])}` : `Encore ${2 - sel.length} à choisir`}
            </button>
          </>,
        );
      case "amoureux": {
        const other = v.lovers?.find((id) => id !== me);
        return box(
          "love",
          "💘 Tu es amoureux !",
          <p>
            Ton cœur bat pour <b>{name(other)}</b>
            {other && v.players.find((p) => p.id === other)?.role ? `, ${ROLES[v.players.find((p) => p.id === other)!.role!].the}` : ""}. Si l'un de vous meurt, l'autre meurt de chagrin.
          </p>,
        );
      }
      case "salvateur":
        return box(
          "shield",
          "🛡️ Qui protèges-tu ?",
          <>
            <p>Clique sur un joueur. {v.lastProtected ? `Pas ${name(v.lastProtected)} : tu l'as protégé la nuit dernière.` : "Tu peux te protéger toi-même."}</p>
            <button className="btn primary" disabled={!sel[0]} onClick={() => act({ type: "protect", target: sel[0]! })}>
              {sel[0] ? `Protéger ${name(sel[0])}` : "Choisis un joueur"}
            </button>
          </>,
        );
      case "voyante":
        return box(
          "magic",
          "🔮 Qui veux-tu sonder ?",
          <>
            <p>Clique sur un joueur pour découvrir son vrai rôle.</p>
            <button className="btn primary" disabled={!sel[0]} onClick={() => act({ type: "see", target: sel[0]! })}>
              {sel[0] ? `Sonder ${name(sel[0])}` : "Choisis un joueur"}
            </button>
          </>,
        );
      case "loups": {
        const votes = Object.entries(n.wolfVotes);
        return box(
          "blood",
          n.done ? "🐺 La meute a choisi" : "🐺 Choisissez votre victime",
          <>
            {n.done ? (
              <p>
                Cette nuit, vous dévorez <b>{name(n.victim)}</b>. Rendormez-vous, l'air de rien…
              </p>
            ) : (
              <p>Clique sur un villageois. Il faut que toute la meute soit d'accord ; parlez-vous dans le chat.</p>
            )}
            <ul className="wolf-votes">
              {n.actors.map((w) => (
                <li key={w}>
                  {name(w)} {w === me && "(toi)"} → <b>{votes.find(([by]) => by === w) ? name(n.wolfVotes[w]) : "…"}</b>
                </li>
              ))}
            </ul>
          </>,
        );
      }
      case "sorciere": {
        const pot = v.potions!;
        return box(
          "poison",
          "🧪 Tes potions",
          <>
            <p>{n.victim ? <>Les loups ont attaqué <b>{name(n.victim)}</b>.</> : "Les loups n'ont attaqué personne cette nuit."}</p>
            {pot.life && n.victim && (
              <label className="potion life">
                <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
                <span>💚 Potion de vie : sauver {name(n.victim)}</span>
              </label>
            )}
            {!pot.life && <p className="used">💚 Potion de vie déjà utilisée</p>}
            {pot.death ? (
              <p className="potion death">☠️ Potion de mort : {sel[0] ? <b>empoisonner {name(sel[0])}</b> : "clique sur un joueur pour l'empoisonner (facultatif)"}</p>
            ) : (
              <p className="used">☠️ Potion de mort déjà utilisée</p>
            )}
            <button className="btn primary" onClick={() => act({ type: "potion", save, kill: sel[0] ?? null })}>
              {save || sel[0] ? "Verser les potions" : "Ne rien faire cette nuit"}
            </button>
          </>,
        );
      }
      case "corbeau":
        return box(
          "raven",
          "🪶 Qui accuses-tu ?",
          <>
            <p>Le joueur désigné commencera le vote de demain avec deux voix contre lui.</p>
            <div className="row">
              <button className="btn primary" disabled={!sel[0]} onClick={() => act({ type: "raven", target: sel[0]! })}>
                {sel[0] ? `Accuser ${name(sel[0])}` : "Choisis un joueur"}
              </button>
              <button className="btn ghost" onClick={() => act({ type: "raven", target: null })}>
                Personne
              </button>
            </div>
          </>,
        );
    }
  }

  if (v.phase === "night") {
    const who = n?.step ? STEP_ROLE[n.step] : null;
    return box("sleep", "💤 Tu dors", <p>{who ? `${who === "amoureux" ? "Les amoureux" : ROLES[who].name} ${who === "loup" ? "rôdent" : "agit"} dans l'ombre…` : "Le village s'endort."}</p>);
  }

  if (v.phase === "mayorVote" || v.phase === "vote") {
    const mine = v.votes[me!];
    const tally = voteTally(v);
    const voted = Object.keys(v.votes).length;
    const voters = v.players.filter((p) => p.alive && p.canVote).length;
    return box(
      v.phase === "mayorVote" ? "crown" : "vote",
      v.phase === "mayorVote" ? "🎖️ Élection du maire" : "⚖️ Le vote du village",
      <>
        {!meP.canVote ? (
          <p>Tu es l'idiot du village : tu ne votes plus, mais tu peux encore parler !</p>
        ) : (
          <p>{mine ? <>Tu votes pour <b>{name(mine)}</b>. Clique à nouveau pour retirer ton vote.</> : "Clique sur un joueur pour voter contre lui. Tu peux changer d'avis."}</p>
        )}
        <div className="vote-meter">
          <span style={{ width: `${(voted / Math.max(1, voters)) * 100}%` }} />
        </div>
        <small>
          {voted}/{voters} ont voté
          {v.phase === "vote" && v.mayor ? ` · la voix de ${name(v.mayor)} (maire) compte double` : ""}
        </small>
        {v.phase === "vote" && Object.keys(tally).length > 0 && (
          <ol className="tally">
            {Object.entries(tally)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([id, c]) => (
                <li key={id}>
                  {name(id)} <b>{c}</b>
                </li>
              ))}
          </ol>
        )}
      </>,
    );
  }

  if (v.phase === "hunter" || v.phase === "successor") {
    const mine = v.pending[0]?.player === me;
    if (v.phase === "hunter" && mine)
      return box(
        "shot",
        "🏹 Ton dernier tir",
        <>
          <p>Tu meurs… mais tu emportes quelqu'un avec toi. Clique sur ta cible.</p>
          <div className="row">
            <button className="btn primary" disabled={!sel[0]} onClick={() => act({ type: "shoot", target: sel[0]! })}>
              {sel[0] ? `Tirer sur ${name(sel[0])}` : "Choisis ta cible"}
            </button>
            <button className="btn ghost" onClick={() => act({ type: "shoot", target: null })}>
              Épargner tout le monde
            </button>
          </div>
        </>,
      );
    if (v.phase === "successor" && mine)
      return box(
        "crown",
        "🎖️ Ton successeur",
        <>
          <p>Avant de partir, désigne le nouveau maire.</p>
          <button className="btn primary" disabled={!sel[0]} onClick={() => act({ type: "successor", target: sel[0]! })}>
            {sel[0] ? `Nommer ${name(sel[0])}` : "Choisis un joueur"}
          </button>
        </>,
      );
    return box("info", "Silence…", <p>Tout le village retient son souffle.</p>);
  }
  if (v.phase === "dawn") return box("info", "☀️ Le jour se lève", <p>Le village se rassemble autour du feu…</p>);
  return box("info", "Le verdict", <p>Le sort en est jeté.</p>);
}

// ── La place du village ─────────────────────────────────────

function Square({ view: v, me, t, picked }: { view: LoupState; me: PlayerId | null; t: Targeting | null; picked: PlayerId[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const lobby = useLoup((s) => s.lobby);
  const events = useLoup((s) => s.events);
  const [bubbles, setBubbles] = useState<Record<PlayerId, { text: string; at: number; ch: string }>>({});
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  // Bulles de discussion au-dessus des joueurs.
  useEffect(() => {
    const msgs = events.list.filter((e): e is Extract<LoupEvent, { type: "chat" }> => e.type === "chat");
    if (!msgs.length) return;
    setBubbles((b) => {
      const nb = { ...b };
      for (const m of msgs) nb[m.msg.from] = { text: m.msg.text, at: Date.now(), ch: m.msg.channel };
      return nb;
    });
  }, [events]);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const myIdx = Math.max(0, v.players.findIndex((p) => p.id === me));
  const count = v.players.length;
  const small = count > 11;
  const pos = (i: number) => {
    const k = (i - myIdx + count) % count;
    const a = Math.PI / 2 + (k * 2 * Math.PI) / count;
    return { x: size.w / 2 + Math.cos(a) * (size.w / 2 - (small ? 50 : 64)), y: size.h / 2 + Math.sin(a) * (size.h / 2 - (small ? 52 : 66)) };
  };
  const posOf = (id: PlayerId) => pos(v.players.findIndex((p) => p.id === id));

  // Flèches : votes du jour, ou votes de la meute la nuit (pour les loups et les morts).
  const arrows: { from: PlayerId; to: PlayerId; color: string; wolf?: boolean }[] = [];
  if (v.phase === "vote" || v.phase === "mayorVote") for (const [by, to] of Object.entries(v.votes)) arrows.push({ from: by, to, color: v.players.find((p) => p.id === by)?.color ?? "#fff" });
  if (v.phase === "night" && v.night) for (const [by, to] of Object.entries(v.night.wolfVotes)) arrows.push({ from: by, to, color: "#ff2d4a", wolf: true });
  const tally = v.phase === "vote" || v.phase === "mayorVote" ? voteTally(v) : {};
  const knowLovers: PlayerId[] = v.lovers ?? [];
  const r = small ? 27 : 34;

  return (
    <div className="square" ref={ref}>
      <div className="plaza" />
      <Campfire />
      <svg className="arrows" width={size.w} height={size.h} aria-hidden>
        <defs>
          {arrows.map((a, i) => (
            <marker key={i} id={`ah${i}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={a.color} />
            </marker>
          ))}
        </defs>
        {arrows.map((a, i) => {
          const p = posOf(a.from);
          const q = posOf(a.to);
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const sx = p.x + (dx / d) * (r + 6);
          const sy = p.y + (dy / d) * (r + 6);
          const ex = q.x - (dx / d) * (r + 10);
          const ey = q.y - (dy / d) * (r + 10);
          const mx = (sx + ex) / 2 - (dy / d) * 30;
          const my = (sy + ey) / 2 + (dx / d) * 30;
          return <path key={`${a.from}-${a.to}`} className={`arrow ${a.wolf ? "wolf" : ""}`} d={`M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`} stroke={a.color} markerEnd={`url(#ah${i})`} />;
        })}
      </svg>
      {v.players.map((p, i) => {
        const { x, y } = pos(i);
        const b = bubbles[p.id];
        const canPick = !!t && t.can(p);
        const selected = isSelected(v, me, picked, p.id);
        const offline = !!lobby?.players.some((l) => l.id === p.id && !l.online);
        const wolfMark = v.night && Object.values(v.night.wolfVotes).filter((x) => x === p.id).length;
        return (
          <div
            key={p.id}
            className={`seat-l ${p.alive ? "" : "dead"} ${p.id === me ? "me" : ""} ${canPick ? `pickable tone-${t!.tone}` : ""} ${selected ? "selected" : ""} ${small ? "small" : ""}`}
            style={{ left: x, top: y }}
            onClick={canPick ? () => t!.pick(p.id) : undefined}
            role={canPick ? "button" : undefined}
            tabIndex={canPick ? 0 : undefined}
            onKeyDown={canPick ? (e) => (e.key === "Enter" || e.key === " ") && t!.pick(p.id) : undefined}
            data-seat={p.id}
          >
            {b && Date.now() - b.at < 5000 && (
              <div className={`bubble ch-${b.ch}`} key={b.at}>
                {b.text.length > 60 ? `${b.text.slice(0, 58)}…` : b.text}
              </div>
            )}
            <div className="medal" style={{ background: p.color }}>
              <TokenIcon token={p.token} size={small ? 24 : 30} />
              {!p.alive && <span className="tomb">🪦</span>}
              {p.role && (p.id !== me || !p.alive) && (
                <span className="role-pin" title={ROLES[p.role].name} style={{ background: ROLES[p.role].color }}>
                  {ROLES[p.role].emoji}
                </span>
              )}
              {v.mayor === p.id && (
                <span className="mayor-pin" title="Maire">
                  🎖️
                </span>
              )}
              {knowLovers.includes(p.id) && (
                <span className="love-pin" title="Amoureux">
                  💘
                </span>
              )}
              {(tally[p.id] ?? 0) > 0 && <span className="votes-pin">{tally[p.id]}</span>}
              {!!wolfMark && <span className="votes-pin wolf">🐺{wolfMark > 1 ? wolfMark : ""}</span>}
              {v.ravenTarget === p.id && v.phase !== "night" && (
                <span className="raven-pin" title="Accusé par le corbeau">
                  🪶
                </span>
              )}
            </div>
            <div className="plate">
              {p.name}
              {p.id === me && <small> (toi)</small>}
              {offline && <small className="off"> · absent</small>}
              {!p.canVote && p.alive && <small> · ne vote plus</small>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function isSelected(v: LoupState, me: PlayerId | null, picked: PlayerId[], id: PlayerId): boolean {
  if ((v.phase === "vote" || v.phase === "mayorVote") && me) return v.votes[me] === id;
  if (v.phase === "night" && v.night?.step === "loups" && me && v.night.wolfVotes[me]) return v.night.wolfVotes[me] === id;
  return picked.includes(id);
}

// ── Discussion ──────────────────────────────────────────────

interface SysLine {
  id: number;
  after: number;
  text: string;
}

function Chat({ view: v, me, sys }: { view: LoupState; me: PlayerId | null; sys: SysLine[] }) {
  const act = useLoup((s) => s.act);
  const [text, setText] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const meP = v.players.find((p) => p.id === me);
  const night = v.phase === "night";
  const channel = v.phase === "gameOver" ? "village" : !meP?.alive ? "morts" : night ? (meP.role === "loup" ? "loups" : null) : "village";
  const items = useMemo(() => {
    const out: ({ kind: "msg"; m: LoupState["chat"][number] } | { kind: "sys"; s: SysLine })[] = [];
    const bySys = [...sys];
    for (const m of v.chat) {
      while (bySys.length && bySys[0]!.after < m.id) out.push({ kind: "sys", s: bySys.shift()! });
      out.push({ kind: "msg", m });
    }
    for (const s of bySys) out.push({ kind: "sys", s });
    return out.slice(-150);
  }, [v.chat, sys]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [items.length]);
  const send = () => {
    if (!text.trim() || !channel) return;
    if (act({ type: "say", text })) setText("");
  };
  return (
    <div className="chat panel">
      <h3>La place du village</h3>
      <div className="chat-list" ref={list}>
        {items.length === 0 && <p className="chat-empty">Personne n'a encore rien dit…</p>}
        {items.map((it) =>
          it.kind === "sys" ? (
            <p key={`s${it.s.id}`} className="sys">
              {it.s.text}
            </p>
          ) : (
            <ChatLine key={`m${it.m.id}`} v={v} m={it.m} me={me} />
          ),
        )}
      </div>
      <form
        className={`chat-input ch-${channel ?? "none"}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          value={text}
          maxLength={240}
          disabled={!channel}
          onChange={(e) => setText(e.target.value)}
          placeholder={channel === "loups" ? "Murmure à la meute…" : channel === "morts" ? "Parle aux autres fantômes…" : channel ? "Parle au village…" : "Chut… le village dort 🤫"}
          aria-label="Message"
        />
        <button className="btn small primary" disabled={!channel || !text.trim()}>
          Dire
        </button>
      </form>
    </div>
  );
}

function ChatLine({ v, m, me }: { v: LoupState; m: LoupState["chat"][number]; me: PlayerId | null }) {
  const p = v.players.find((x) => x.id === m.from);
  return (
    <div className={`msg ch-${m.channel} ${m.from === me ? "mine" : ""}`}>
      <span className="avatar small" style={{ background: p?.color }}>
        <TokenIcon token={p?.token ?? "pawn"} size={13} />
      </span>
      <div>
        <b style={{ color: p?.color }}>{p?.name}</b>
        {m.channel === "loups" && <span className="ch-tag">🐺 meute</span>}
        {m.channel === "morts" && <span className="ch-tag">👻 au-delà</span>}
        <p>{m.text}</p>
      </div>
    </div>
  );
}

// ── Écrans par-dessus la place ──────────────────────────────

function Sleep({ view: v, canSpy, onSpy }: { view: LoupState; canSpy: boolean; onSpy: () => void }) {
  const st = v.night?.step;
  return (
    <div className="sleep" aria-live="polite">
      <div className="eyes">
        <span className="eye" />
        <span className="eye" />
      </div>
      <p className="zzz">
        <span>z</span>
        <span>z</span>
        <span>Z</span>
      </p>
      <p className="sleep-text">Tu dors…</p>
      <p className="sleep-line">{st ? NARRATION[st] : NARRATION.dusk}</p>
      {canSpy && (
        <button className="btn spy" onClick={onSpy}>
          👀 Entrouvrir les yeux
        </button>
      )}
      {v.night?.spied && <p className="sleep-line">Tu as déjà risqué un œil cette nuit…</p>}
    </div>
  );
}

function Intro({ view: v, role }: { view: LoupState; role: RoleId }) {
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFlip(true), 1300);
    return () => clearTimeout(t);
  }, []);
  const r = ROLES[role];
  return (
    <div className="overlay intro">
      <p className="intro-kicker">Le meneur distribue les cartes…</p>
      <RoleCard role={role} size="lg" flipped={flip} />
      <div className={`intro-text ${flip ? "show" : ""}`}>
        <h2>
          Tu es {r.the} {r.emoji}
        </h2>
        <p>{r.desc}</p>
        <p className="camp">{r.camp === "loups" ? "Tu gagnes quand il ne reste plus que des loups." : "Tu gagnes quand tous les loups-garous sont morts."}</p>
      </div>
      <Composition v={v} />
    </div>
  );
}

function Composition({ v }: { v: LoupState }) {
  return (
    <div className="compo">
      {ROLE_ORDER.filter((r) => (v.composition[r] ?? 0) > 0).map((r) => (
        <span key={r} className="compo-chip" style={{ ["--rc" as string]: ROLES[r].color }}>
          {ROLES[r].emoji} {ROLES[r].name}
          {(v.composition[r] ?? 0) > 1 && <b>×{v.composition[r]}</b>}
        </span>
      ))}
    </div>
  );
}

function Reveal({ view: v, causes }: { view: LoupState; causes: Record<PlayerId, string> }) {
  const a = v.announce!;
  const dawn = v.phase === "dawn";
  const line = narration(v, null).text;
  return (
    <div className={`overlay reveal ${dawn ? "is-dawn" : "is-verdict"}`}>
      <h2>{dawn ? `☀️ Jour ${v.day}` : "⚖️ Le verdict"}</h2>
      <p className="reveal-line">{line}</p>
      <div className="graves">
        {a.deaths.map((id, i) => {
          const p = v.players.find((x) => x.id === id)!;
          return (
            <div key={id} className="grave" style={{ animationDelay: `${0.6 + i * 1.3}s` }}>
              <div className="stone">
                <span className="avatar" style={{ background: p.color }}>
                  <TokenIcon token={p.token} size={26} />
                </span>
                <b>{p.name}</b>
                <small>{CAUSES[causes[id] ?? (dawn ? "nuit" : "vote")]}</small>
              </div>
              {p.role && <RoleCard role={p.role} size="sm" />}
            </div>
          );
        })}
        {a.spared && (
          <div className="grave spared">
            <div className="stone">
              <span className="avatar" style={{ background: v.players.find((p) => p.id === a.spared)?.color }}>
                🃏
              </span>
              <b>{nameOf(v, a.spared)}</b>
              <small>gracié</small>
            </div>
          </div>
        )}
        {!a.deaths.length && !a.spared && <div className="nobody">{dawn ? "🌅" : "🤷"}</div>}
      </div>
    </div>
  );
}

function GameOver({ view: v, me, isHost }: { view: LoupState; me: PlayerId | null; isHost: boolean }) {
  const back = useLoup((s) => s.backToLobby);
  const quit = useLoup((s) => s.quit);
  const w = v.winner!;
  const won = !!me && w.players.includes(me);
  const emoji = w.camp === "loups" ? "🐺" : w.camp === "village" ? "🏡" : w.camp === "amoureux" ? "💘" : "🕯️";
  const title = w.camp === "loups" ? "Les loups-garous gagnent" : w.camp === "village" ? "Le village gagne" : w.camp === "amoureux" ? "Les amoureux gagnent" : "Personne ne gagne";
  return (
    <div className={`gameover camp-${w.camp}`}>
      <div className="go-emoji">{emoji}</div>
      <h2>{title}</h2>
      <p className={won ? "won" : "lost"}>{won ? "Victoire ! Tu fais partie des gagnants." : "Perdu… ce sera pour la prochaine lune."}</p>
      <p className="go-names">{w.players.map((id) => nameOf(v, id)).join(" · ")}</p>
      <div className="row">
        <a className="btn" href="#/" onClick={() => quit()}>
          Retour au hub
        </a>
        {isHost ? (
          <button className="btn primary big" onClick={back}>
            Nouvelle partie
          </button>
        ) : (
          <span className="hint-text">L'hôte peut relancer une partie.</span>
        )}
      </div>
    </div>
  );
}

function RolesModal({ view: v, onClose }: { view: LoupState; onClose: () => void }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="panel modal roles-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Les rôles de la partie</h2>
        <div className="roles-grid">
          {ROLE_ORDER.filter((r) => (v.composition[r] ?? 0) > 0).map((r) => (
            <div key={r} className="role-row">
              <RoleCard role={r} size="sm" />
              <div>
                <b>
                  {ROLES[r].name}
                  {(v.composition[r] ?? 0) > 1 ? ` ×${v.composition[r]}` : ""}
                </b>
                <p>{ROLES[r].desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="setup-actions">
          <button className="btn primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const notes = useLoup((s) => s.notes);
  const [, tick] = useState(0);
  const now = performance.now() / 1000;
  const visible = notes.filter((n) => now - n.at < 4.5).slice(-3);
  useEffect(() => {
    if (!visible.length) return;
    const id = setTimeout(() => tick((x) => x + 1), 300);
    return () => clearTimeout(id);
  });
  return (
    <div className="loup-toasts">
      {visible.map((n) => (
        <div key={n.id} className={`toast ${n.kind}`}>
          {n.text}
        </div>
      ))}
    </div>
  );
}

// ── Sons, notifications, chronique ──────────────────────────

let sysId = 0;

function useFeedback(v: LoupState, me: PlayerId | null, setSys: (f: (s: SysLine[]) => SysLine[]) => void, causes: { current: Record<PlayerId, string> }) {
  const events = useLoup((s) => s.events);
  const last = useRef(events.seq);
  useEffect(() => {
    if (events.seq === last.current) return;
    last.current = events.seq;
    const name = (id: PlayerId | null | undefined) => (id === me ? "toi" : nameOf(v, id));
    const Name = (id: PlayerId | null | undefined) => (id === me ? "Tu" : nameOf(v, id));
    const after = v.chat[v.chat.length - 1]?.id ?? 0;
    const add = (text: string) => setSys((s) => [...s, { id: ++sysId, after, text }].slice(-80));
    let deaths = 0;
    for (const e of events.list) {
      switch (e.type) {
        case "phase":
          if (e.phase === "night") add(`🌙 Nuit ${e.day}`);
          if (e.phase === "dawn") {
            sfx("bell");
            add(`☀️ Jour ${e.day}`);
          }
          if (e.phase === "mayorVote") add("🎖️ Élection du maire");
          if (e.phase === "vote") add("⚖️ Le débat commence");
          break;
        case "nightStep":
          if (e.step === "loups") sfx("howl", 0.4);
          break;
        case "seen":
          sfx("magic");
          pushLoupNote(`🔮 ${nameOf(v, e.target)} est ${ROLES[e.role].the} !`, "good");
          break;
        case "inLove":
          sfx("love");
          if (me === e.a || me === e.b) pushLoupNote(`💘 Tu es amoureux de ${nameOf(v, me === e.a ? e.b : e.a)} !`, "good");
          else pushLoupNote(`💘 ${nameOf(v, e.a)} et ${nameOf(v, e.b)} sont désormais amoureux.`, "good");
          break;
        case "protected":
          pushLoupNote(`🛡️ Tu veilles sur ${name(e.target)} cette nuit.`);
          break;
        case "wolfVoted":
          sfx("vote");
          break;
        case "wolvesChose":
          pushLoupNote(e.target ? `🐺 La meute a choisi : ${nameOf(v, e.target)}` : "🐺 La meute n'a pas su se décider…", "bad");
          break;
        case "spied":
          if (e.caught) {
            sfx("gasp");
            pushLoupNote("😱 Les loups t'ont surprise ! Ils savent qui tu es…", "bad");
          } else if (e.wolf) {
            sfx("magic");
            pushLoupNote(`👀 Tu aperçois ${nameOf(v, e.wolf)}… c'est un loup-garou !`, "good");
          } else pushLoupNote("👀 Tu n'as rien vu… les loups étaient trop loin.");
          break;
        case "spotted":
          pushLoupNote(`👧 La petite fille vous espionne : c'est ${nameOf(v, e.girl)} !`, "bad");
          break;
        case "potion":
          sfx("magic");
          if (e.save) pushLoupNote("💚 Tu as versé ta potion de vie.", "good");
          if (e.kill) pushLoupNote(`☠️ Tu as empoisonné ${nameOf(v, e.kill)}.`, "bad");
          break;
        case "raven":
          if (e.to) pushLoupNote(e.target ? `🪶 Tu accuses ${nameOf(v, e.target)}.` : "🪶 Tu n'accuses personne cette nuit.");
          else if (e.target) {
            add(`🪶 Le corbeau accuse ${nameOf(v, e.target)} : +2 voix`);
            pushLoupNote(`🪶 Le corbeau accuse ${nameOf(v, e.target)} : il commence avec 2 voix contre lui`, "bad");
          }
          break;
        case "elderSurvived":
          if (e.player === me) pushLoupNote("👴 Les loups t'ont attaqué… mais tu as survécu !", "good");
          break;
        case "died":
          causes.current[e.player] = e.cause;
          sfx("death", 0.9 + deaths++ * 1.3);
          add(`☠️ ${nameOf(v, e.player)}${e.role ? ` (${ROLES[e.role].name})` : ""} : ${CAUSES[e.cause]}`);
          break;
        case "voted":
          sfx("vote");
          break;
        case "voteClosing":
          sfx("heartbeat");
          pushLoupNote("⏳ Tout le monde a voté : dernières secondes pour changer d'avis !");
          break;
        case "verdict":
          if (!e.target) add(e.tie ? "⚖️ Égalité : personne n'est éliminé" : "⚖️ Personne n'a été désigné");
          break;
        case "idiotSpared":
          add(`🃏 ${nameOf(v, e.player)} est l'idiot du village : épargné`);
          sfx("gasp");
          break;
        case "shot":
          if (e.target) sfx("shot");
          add(e.target ? `🏹 ${Name(e.by)} tire sur ${name(e.target)} !` : `🏹 ${Name(e.by)} n'a tiré sur personne`);
          break;
        case "mayor":
          sfx("magic");
          add(e.by === "vote" ? `🎖️ ${nameOf(v, e.player)} est élu maire` : `🎖️ ${nameOf(v, e.player)} devient maire`);
          pushLoupNote(`🎖️ ${e.player === me ? "Tu es" : `${nameOf(v, e.player)} est`} le nouveau maire !`, "good");
          break;
        case "chat":
          if (e.msg.from !== me) sfx("pop");
          break;
        case "gameOver":
          sfx(me && e.winner.players.includes(me) ? "victory" : "defeat", 0.3);
          add("🏁 Fin de la partie");
          break;
      }
    }
  }, [events, me, v, setSys, causes]);
}

