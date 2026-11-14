// Loups-Garous : accueil, salon (composition des rôles) et partie.

import { useEffect, useMemo, useState } from "react";
import { compositionError, compositionSize, DEFAULT_OPTIONS, MAX_PLAYERS, MIN_PLAYERS, ROLE_ORDER, suggestComposition, UNIQUE_ROLES, type LoupOptions, type RoleId } from "@3ajib/loup";
import { inviteLink, normalizeCode, type Profile } from "../../net";
import { loadProfile, saveProfile } from "../../profile";
import { ProfileEditor } from "../../ui/Options";
import { TokenIcon } from "../../ui/TokenIcon";
import "@fontsource/im-fell-english/400.css";
import "@fontsource/im-fell-english/400-italic.css";
import { LoupGame, RoleCard } from "./Game";
import { ROLES } from "./roles";
import { Fog, Sky, Village } from "./Scenery";
import { loadLoupHostSave, useLoup } from "./store";
import { setAmbience } from "./ambience";
import "./loup.css";

export function LoupApp() {
  const view = useLoup((s) => s.view);
  const mode = useLoup((s) => s.mode);
  if (view) return <LoupGame view={view} />;
  return (
    <div className="loup-scene night setup-scene">
      <Sky />
      <Village />
      <Fog />
      {mode ? <LoupLobby /> : <LoupHome />}
    </div>
  );
}

function useNightAmbience() {
  useEffect(() => {
    setAmbience("night");
    return () => setAmbience("off");
  }, []);
}

function Logo() {
  return (
    <h1 className="loup-logo">
      <span className="ll-moon" aria-hidden />
      <span className="ll-title">Loups-Garous</span>
      <span className="ll-sub">3ajib Games · la nuit tombe sur le village</span>
    </h1>
  );
}

function LoupHome() {
  const hostRoom = useLoup((s) => s.hostRoom);
  const resumeHost = useLoup((s) => s.resumeHost);
  const joinRoom = useLoup((s) => s.joinRoom);
  const quit = useLoup((s) => s.quit);
  const saved = useMemo(() => loadLoupHostSave(), []);
  const urlCode = useMemo(() => normalizeCode(new URLSearchParams(window.location.search).get("salle") ?? ""), []);
  const [profile, setProfile] = useState<Profile>(() => {
    const { name, color, token } = loadProfile();
    return { name, color, token };
  });
  const [code, setCode] = useState(urlCode || loadProfile().lastRoom || "");
  const nameOk = profile.name.trim().length > 0;
  useNightAmbience();

  useEffect(() => {
    const p = loadProfile();
    if (urlCode && p.name && p.lastRoom === urlCode) joinRoom(urlCode, { name: p.name, color: p.color, token: p.token });
  }, [urlCode, joinRoom]);

  const clean = () => ({ ...profile, name: profile.name.trim() });

  return (
    <div className="setup loup-setup">
      <div className="setup-card panel">
        <a className="back-hub" href="#/" onClick={() => quit()}>
          ← 3ajib Games
        </a>
        <Logo />
        <p className="loup-pitch">
          Chaque nuit, les loups-garous dévorent un villageois. Chaque jour, le village vote pour éliminer un suspect. Le narrateur, c'est l'ordinateur : tout le monde joue, personne ne mène.
        </p>
        <h2>Ton villageois</h2>
        <ProfileEditor
          profile={profile}
          onChange={(p) => {
            setProfile(p);
            saveProfile(p);
          }}
        />
        {!nameOk && <p className="hint-text">Choisis un pseudo pour continuer.</p>}
        <div className="online-grid">
          <div className="online-box">
            <h3>Rejoindre un village</h3>
            <p className="hint-text">Entre le code envoyé par ton pote.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="code-input" value={code} placeholder="CODE" onChange={(e) => setCode(normalizeCode(e.target.value))} aria-label="Code de la salle" />
              <button className="btn primary" disabled={!nameOk || code.length !== 5} onClick={() => joinRoom(code, clean())}>
                Rejoindre
              </button>
            </div>
          </div>
          <div className="online-box">
            <h3>Fonder un village</h3>
            <p className="hint-text">
              De {MIN_PLAYERS} à {MAX_PLAYERS} joueurs (idéal : 8 et plus). Ton navigateur fait le narrateur : garde l'onglet ouvert.
            </p>
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

function LoupLobby() {
  const { mode, me, lobby, net, rejected, quit, kick, start, setOptions } = useLoup();
  const [copied, setCopied] = useState(false);
  useNightAmbience();
  if (rejected) {
    return (
      <div className="setup loup-setup">
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
  const opts: LoupOptions = { ...DEFAULT_OPTIONS, ...((lobby?.options.loup ?? {}) as Partial<LoupOptions>) };
  const online = lobby?.players.filter((p) => p.online).length ?? 0;
  const auto = Object.keys(opts.roles).length === 0;
  const comp = auto ? suggestComposition(Math.max(MIN_PLAYERS, online)) : opts.roles;
  const err = compositionError(comp, online);
  const setCount = (r: RoleId, c: number) => {
    const next = { ...comp, [r]: Math.max(0, c) };
    if (!next[r]) delete next[r];
    setOptions({ roles: next });
  };
  return (
    <div className="setup loup-setup">
      <div className="setup-card panel wide">
        <h1 className="lobby-title">La place du village</h1>
        {lobby ? (
          <>
            <p className="subtitle">
              Code de la salle : <span className="room-code">{lobby.code}</span>
            </p>
            <div className="invite">
              <input readOnly value={inviteLink(lobby.code, "loup")} onFocus={(e) => e.target.select()} aria-label="Lien d'invitation" />
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteLink(lobby.code, "loup"));
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
            <div className="lobby-grid">
              <div>
                <h2>
                  Villageois ({lobby.players.length}/{MAX_PLAYERS})
                </h2>
                {lobby.players.map((p) => (
                  <div key={p.id} className="lobby-player">
                    <span className="avatar small" style={{ background: p.color }}>
                      <TokenIcon token={p.token} size={16} />
                    </span>
                    <b>{p.name}</b>
                    {p.host && <span className="tag">narrateur</span>}
                    {p.id === me && <span className="tag">toi</span>}
                    {!p.online && <span className="tag off">hors ligne</span>}
                    {isHost && !p.host && (
                      <button className="btn small ghost" style={{ marginLeft: "auto" }} onClick={() => kick(p.id)}>
                        Retirer
                      </button>
                    )}
                  </div>
                ))}
                <h2>Règles</h2>
                <fieldset disabled={!isHost} className="options loup-options">
                  <label>
                    <input type="checkbox" checked={opts.mayor} onChange={(e) => setOptions({ mayor: e.target.checked })} />
                    Élire un maire le premier jour (sa voix compte double)
                  </label>
                  <label>
                    <input type="checkbox" checked={opts.revealRoles} onChange={(e) => setOptions({ revealRoles: e.target.checked })} />
                    Dévoiler le rôle des morts
                  </label>
                  <label>
                    Durée du débat
                    <select value={opts.debateSeconds} onChange={(e) => setOptions({ debateSeconds: Number(e.target.value) })}>
                      <option value={120}>2 minutes</option>
                      <option value={180}>3 minutes</option>
                      <option value={300}>5 minutes</option>
                      <option value={480}>8 minutes</option>
                    </select>
                  </label>
                </fieldset>
              </div>
              <div>
                <h2 className="compo-head">
                  Les cartes
                  <span className={`compo-count ${err ? "bad" : "ok"}`}>
                    {compositionSize(comp)} / {online} joueurs
                  </span>
                </h2>
                <fieldset disabled={!isHost} className="options loup-options">
                  <label>
                    <input type="checkbox" checked={auto} onChange={(e) => setOptions({ roles: e.target.checked ? {} : suggestComposition(Math.max(MIN_PLAYERS, online)) })} />
                    Composition automatique selon le nombre de joueurs
                  </label>
                </fieldset>
                <div className="role-picker">
                  {ROLE_ORDER.map((r) => {
                    const c = comp[r] ?? 0;
                    const unique = UNIQUE_ROLES.includes(r);
                    return (
                      <div key={r} className={`role-tile ${c ? "on" : ""}`} title={ROLES[r].desc}>
                        <RoleCard role={r} size="sm" />
                        <div className="rt-text">
                          <b>{ROLES[r].name}</b>
                          <small>{ROLES[r].short}</small>
                        </div>
                        {isHost && !auto ? (
                          unique ? (
                            <button className={`btn small ${c ? "primary" : ""}`} onClick={() => setCount(r, c ? 0 : 1)}>
                              {c ? "Dans la partie" : "Ajouter"}
                            </button>
                          ) : (
                            <div className="stepper">
                              <button className="btn small" onClick={() => setCount(r, c - 1)} disabled={c === 0} aria-label={`Retirer un ${ROLES[r].name}`}>
                                −
                              </button>
                              <b>{c}</b>
                              <button className="btn small" onClick={() => setCount(r, c + 1)} aria-label={`Ajouter un ${ROLES[r].name}`}>
                                +
                              </button>
                            </div>
                          )
                        ) : (
                          <b className="rt-count">{c ? (unique ? "✓" : `×${c}`) : "—"}</b>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="setup-actions">
              {err && <span className="compo-error">{err}</span>}
              <button className="btn" onClick={quit}>
                Quitter
              </button>
              {isHost ? (
                <button className="btn primary big" disabled={!!err} onClick={start}>
                  {online < MIN_PLAYERS ? `En attente de villageois (${online}/${MIN_PLAYERS})…` : "La nuit tombe…"}
                </button>
              ) : (
                <span style={{ color: "var(--muted)" }}>Le narrateur va lancer la partie…</span>
              )}
            </div>
          </>
        ) : (
          <>
            <p>{net && net.kind !== "ready" && net.kind !== "connecting" ? net.detail : "Connexion au village…"}</p>
            <button className="btn" onClick={quit}>
              Annuler
            </button>
          </>
        )}
      </div>
    </div>
  );
}
