import { useState } from "react";
import { normalizeCode, probeRoom, type Profile } from "../net";
import { loadProfile, saveProfile } from "../profile";
import { ProfileEditor } from "../ui/Options";
import { TokenIcon } from "../ui/TokenIcon";
import { CardFace } from "../games/uno/Card";
import "./hub.css";

interface GameInfo {
  id: string;
  name: string;
  tagline: string;
  players: string;
  cover: React.ReactNode;
}

const GAMES: GameInfo[] = [
  {
    id: "monopoly",
    name: "Monopoly",
    tagline: "3ajib Edition : du 145 Rue de Paris à Orly, règles classiques complètes.",
    players: "2 à 6 joueurs",
    cover: <img src={`${import.meta.env.BASE_URL}hub/monopoly.jpg`} alt="" />,
  },
  {
    id: "uno",
    name: "Uno",
    tagline: "Les règles officielles : +4 contestable, contre-UNO, partie en 500 points.",
    players: "2 à 10 joueurs",
    cover: (
      <div className="uno-cover" aria-hidden>
        <CardFace card={{ id: 1, kind: "number", color: "red", value: 7 }} size="lg" />
        <CardFace card={{ id: 2, kind: "reverse", color: "yellow", value: null }} size="lg" />
        <CardFace card={{ id: 3, kind: "wild4", color: null, value: null }} size="lg" />
        <CardFace card={{ id: 4, kind: "draw2", color: "green", value: null }} size="lg" />
        <CardFace card={{ id: 5, kind: "skip", color: "blue", value: null }} size="lg" />
      </div>
    ),
  },
];

export function Hub() {
  const [profile, setProfile] = useState<Profile>(() => {
    const { name, color, token } = loadProfile();
    return { name, color, token };
  });
  const [editing, setEditing] = useState(() => !loadProfile().name);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState<"idle" | "searching" | "notfound">("idle");

  const open = (id: string) => {
    window.location.hash = `#/${id}`;
  };

  /** Rejoindre avec un code : on demande à la salle quel jeu elle héberge. */
  const join = async () => {
    if (code.length !== 5 || !profile.name.trim()) return;
    setJoining("searching");
    const game = await probeRoom(code);
    if (!game) {
      setJoining("notfound");
      return;
    }
    saveProfile({ ...profile, name: profile.name.trim(), lastRoom: code });
    const url = new URL(window.location.href);
    url.searchParams.set("salle", code);
    url.hash = `#/${game}`;
    window.location.href = url.toString();
  };

  return (
    <div className="hub">
      <header className="hub-head">
        <h1 className="hub-logo">
          <span>3AJIB</span>
          <span className="games">GAMES</span>
        </h1>
        <button className="me-chip" onClick={() => setEditing((v) => !v)} title="Modifier mon profil">
          <span className="avatar" style={{ background: profile.color }}>
            <TokenIcon token={profile.token} />
          </span>
          <span>{profile.name || "Choisis ton pseudo"}</span>
          <span className="edit">✎</span>
        </button>
      </header>

      {editing && (
        <section className="panel hub-profile">
          <h2>Ton profil, pour tous les jeux</h2>
          <ProfileEditor
            profile={profile}
            onChange={(p) => {
              setProfile(p);
              saveProfile(p);
            }}
          />
          <div className="setup-actions">
            <button className="btn primary" disabled={!profile.name.trim()} onClick={() => setEditing(false)}>
              C'est bon
            </button>
          </div>
        </section>
      )}

      <section className="hub-join panel">
        <div>
          <h2>Un pote t'a envoyé un code ?</h2>
          <p className="hint-text">Il marche pour n'importe quel jeu : on t'emmène direct dans sa salle.</p>
        </div>
        <div className="join-row">
          <input
            className="code-input"
            value={code}
            placeholder="CODE"
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              setJoining("idle");
            }}
            onKeyDown={(e) => e.key === "Enter" && join()}
            aria-label="Code de la salle"
          />
          <button className="btn primary" disabled={code.length !== 5 || !profile.name.trim() || joining === "searching"} onClick={join}>
            {joining === "searching" ? "Recherche…" : "Rejoindre"}
          </button>
        </div>
        {joining === "notfound" && <p className="join-error">Salle introuvable : vérifie le code, et que l'hôte a bien l'onglet ouvert.</p>}
        {!profile.name.trim() && <p className="hint-text">Choisis d'abord ton pseudo (en haut à droite).</p>}
      </section>

      <h2 className="hub-title">Les jeux</h2>
      <section className="hub-games">
        {GAMES.map((g) => (
          <button key={g.id} className="game-card" onClick={() => open(g.id)}>
            <div className="cover">{g.cover}</div>
            <div className="info">
              <div className="name">{g.name}</div>
              <div className="tagline">{g.tagline}</div>
              <div className="meta">
                <span className="tag">{g.players}</span>
                <span className="play">Jouer</span>
              </div>
            </div>
          </button>
        ))}
        <div className="game-card soon" aria-hidden>
          <div className="cover soon-cover">?</div>
          <div className="info">
            <div className="name">Prochain jeu</div>
            <div className="tagline">Dis-moi ce que vous voulez y jouer.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
