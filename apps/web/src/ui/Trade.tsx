import { useEffect, useState, type JSX } from "react";
import { currentPlayer, groupHasBuildings, mortgageValue, type GameState, type Player, type TradeSide } from "@monopoly/engine";
import { money, useCanAct, useGame } from "../store";
import { TokenIcon } from "./TokenIcon";

const empty = (): TradeSide => ({ cash: 0, properties: [], jailCards: 0 });

export function TradeModal({ game, onClose }: { game: GameState; onClose: () => void }) {
  const dispatch = useGame((s) => s.dispatch);
  const me = useGame((s) => s.me);
  const alive = game.players.filter((p) => !p.bankrupt);
  // Peut proposer : le joueur dont c'est le tour, ou un joueur endetté.
  const proposers = alive.filter((p) => p.id === currentPlayer(game).id || game.debts.some((d) => d.debtor === p.id));
  const [fromId, setFromId] = useState(me ?? proposers[0]?.id ?? alive[0]!.id);
  const [toId, setToId] = useState(alive.find((p) => p.id !== fromId)!.id);
  const [give, setGive] = useState<TradeSide>(empty);
  const [take, setTake] = useState<TradeSide>(empty);

  const from = game.players.find((p) => p.id === fromId)!;
  const to = game.players.find((p) => p.id === toId)!;

  // En ligne : les autres voient l'échange se construire en direct.
  const setMyDraft = useGame((s) => s.setMyDraft);
  useEffect(() => {
    const id = setTimeout(() => setMyDraft({ to: toId, give, take }), 120);
    return () => clearTimeout(id);
  }, [toId, give, take, setMyDraft]);
  useEffect(() => () => setMyDraft(null), [setMyDraft]);

  const changeFrom = (id: string) => {
    setFromId(id);
    setGive(empty());
    if (id === toId) {
      setToId(alive.find((p) => p.id !== id)!.id);
      setTake(empty());
    }
  };

  const propose = () => {
    if (dispatch(fromId, { type: "proposeTrade", to: toId, give, take })) onClose();
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <h2>🤝 Proposer un échange</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          {me ? (
            <b>Vous</b>
          ) : (
            <select value={fromId} onChange={(e) => changeFrom(e.target.value)} aria-label="Qui propose">
              {proposers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <span>{me ? "proposez à" : "propose à"}</span>
          <select
            value={toId}
            onChange={(e) => {
              setToId(e.target.value);
              setTake(empty());
            }}
            aria-label="À qui"
          >
            {alive
              .filter((p) => p.id !== fromId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div className="trade-cols">
          <SideEditor game={game} owner={from} title={`${from.name} donne`} side={give} onChange={setGive} />
          <SideEditor game={game} owner={to} title={`${from.name} demande à ${to.name}`} side={take} onChange={setTake} />
        </div>
        <div className="setup-actions">
          <button className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" onClick={propose}>
            Envoyer la proposition
          </button>
        </div>
      </div>
    </div>
  );
}

function SideEditor({
  game,
  owner,
  title,
  side,
  onChange,
}: {
  game: GameState;
  owner: Player;
  title: string;
  side: TradeSide;
  onChange: (s: TradeSide) => void;
}) {
  const owned = Object.entries(game.properties)
    .filter(([, prop]) => prop.owner === owner.id)
    .map(([pos]) => Number(pos));
  const toggle = (pos: number) =>
    onChange({
      ...side,
      properties: side.properties.includes(pos) ? side.properties.filter((p) => p !== pos) : [...side.properties, pos],
    });
  return (
    <div className="trade-col">
      <h4>
        <span className="dot" style={{ background: owner.color }} />
        {title}
      </h4>
      <label>
        Argent
        <input
          type="number"
          min={0}
          max={owner.cash}
          value={side.cash || ""}
          placeholder="0"
          onChange={(e) => onChange({ ...side, cash: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
        />
        <span style={{ color: "var(--muted)" }}>/ {money(game, owner.cash)}</span>
      </label>
      {owner.jailCards.length > 0 && (
        <label>
          Cartes « Libéré de prison »
          <input
            type="number"
            min={0}
            max={owner.jailCards.length}
            value={side.jailCards || ""}
            placeholder="0"
            onChange={(e) => onChange({ ...side, jailCards: Math.max(0, Math.min(owner.jailCards.length, Math.floor(Number(e.target.value) || 0))) })}
          />
        </label>
      )}
      {owned.length === 0 && <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Aucune propriété.</div>}
      {owned.map((pos) => {
        const sq = game.theme.squares[pos]!;
        const built = groupHasBuildings(game, pos);
        const color = sq.kind === "street" ? game.theme.groupColors[sq.group] : "#6c757d";
        return (
          <label key={pos} title={built ? "Vendez d'abord les constructions du groupe" : ""} style={{ opacity: built ? 0.45 : 1 }}>
            <input type="checkbox" disabled={built} checked={side.properties.includes(pos)} onChange={() => toggle(pos)} />
            <span className="dot" style={{ background: color, borderRadius: 3 }} />
            <span style={{ flex: 1 }}>
              {sq.name}
              {game.properties[pos]!.mortgaged && <b style={{ color: "#c92a2a" }}> · hypothéquée</b>}
            </span>
            <span className="trade-val" title="Prix d'achat · valeur hypothécaire">
              {"price" in sq ? money(game, sq.price) : ""} · hyp. {money(game, mortgageValue(game, pos))}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function describe(game: GameState, side: TradeSide): string {
  const parts: string[] = [];
  if (side.cash > 0) parts.push(money(game, side.cash));
  for (const pos of side.properties) {
    const hyp = game.properties[pos]?.mortgaged ? "hypothéquée, " : "";
    parts.push(`${game.theme.squares[pos]!.name} (${hyp}hyp. ${money(game, mortgageValue(game, pos))})`);
  }
  if (side.jailCards > 0) parts.push(`${side.jailCards} carte(s) prison`);
  return parts.length ? parts.join(", ") : "rien";
}

export function TradeList({ game }: { game: GameState }) {
  const dispatch = useGame((s) => s.dispatch);
  const me = useGame((s) => s.me);
  const canAct = useCanAct();
  if (game.trades.length === 0) return null;
  return (
    <div className="panel trade-list">
      <h3>Échanges proposés</h3>
      {game.trades.map((t) => {
        const from = game.players.find((p) => p.id === t.from)!;
        const to = game.players.find((p) => p.id === t.to)!;
        return (
          <div key={t.id} className="trade-item">
            <b>{from.name}</b> → <b>{to.name}</b>
            <div>Donne : {describe(game, t.give)}</div>
            <div>Demande : {describe(game, t.take)}</div>
            <div className="btns">
              {canAct(to.id) && (
                <>
                  <button className="btn small ok" onClick={() => dispatch(to.id, { type: "acceptTrade", tradeId: t.id })}>
                    {me ? "Accepter" : `${to.name} accepte`}
                  </button>
                  <button className="btn small" onClick={() => dispatch(to.id, { type: "rejectTrade", tradeId: t.id })}>
                    Refuser
                  </button>
                </>
              )}
              {canAct(from.id) && (
                <button className="btn small ghost" onClick={() => dispatch(from.id, { type: "cancelTrade", tradeId: t.id })}>
                  Retirer
                </button>
              )}
              {!canAct(to.id) && !canAct(from.id) && <span style={{ color: "var(--muted)" }}>En attente de {to.name}…</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Ce que donne un côté de l'échange, en « cartes » lisibles. */
function SideItems({ game, side, live }: { game: GameState; side: TradeSide; live?: boolean }) {
  const items: JSX.Element[] = [];
  if (side.cash > 0) {
    items.push(
      <div key="cash" className="ts-cash">
        {money(game, side.cash)}
      </div>,
    );
  }
  for (const pos of side.properties) {
    const sq = game.theme.squares[pos]!;
    const color = sq.kind === "street" ? game.theme.groupColors[sq.group] : sq.kind === "railroad" ? "#343a40" : "#8d99ae";
    const mortgaged = game.properties[pos]?.mortgaged;
    items.push(
      <div key={pos} className={`ts-deed ${mortgaged ? "mortgaged" : ""}`}>
        <span className="band" style={{ background: color }} />
        <span className="nm">{sq.name}</span>
        <span className="val">
          {"price" in sq ? money(game, sq.price) : ""}
          {mortgaged ? " · hypothéquée" : ` · hyp. ${money(game, mortgageValue(game, pos))}`}
        </span>
      </div>,
    );
  }
  if (side.jailCards > 0) {
    items.push(
      <div key="jail" className="ts-deed">
        <span className="band" style={{ background: "#ffb347" }} />
        <span className="nm">🗝️ Libéré de prison ×{side.jailCards}</span>
      </div>,
    );
  }
  return <div className="ts-items">{items.length ? items : <div className="ts-empty">{live ? "rien pour l'instant" : "rien"}</div>}</div>;
}

/** Grande fenêtre d'échange au centre de l'écran. */
function TradeStage({
  game,
  fromId,
  toId,
  give,
  take,
  title,
  live,
  children,
}: {
  game: GameState;
  fromId: string;
  toId: string;
  give: TradeSide;
  take: TradeSide;
  title: string;
  live?: boolean;
  children?: React.ReactNode;
}) {
  const from = game.players.find((p) => p.id === fromId);
  const to = game.players.find((p) => p.id === toId);
  if (!from || !to) return null;
  const head = (p: Player) => (
    <div className="ts-who">
      <span className="avatar small" style={{ background: p.color }}>
        <TokenIcon token={p.token} size={16} />
      </span>
      <b>{p.name}</b>&nbsp;donne
    </div>
  );
  return (
    <div className={`trade-stage panel ${live ? "live" : ""}`}>
      <div className="ts-title">
        {live && <span className="pen">✍️</span>}
        {title}
      </div>
      <div className="ts-cols">
        <div className="ts-col">
          {head(from)}
          <SideItems game={game} side={give} live={live} />
        </div>
        <div className="ts-swap" aria-hidden>
          ⇄
        </div>
        <div className="ts-col">
          {head(to)}
          <SideItems game={game} side={take} live={live} />
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Au centre de l'écran : l'échange qu'un autre joueur est en train de préparer
 * (en direct), puis l'offre reçue avec les boutons pour répondre.
 */
export function TradeCenter({ game }: { game: GameState }) {
  const drafts = useGame((s) => s.drafts);
  const me = useGame((s) => s.me);
  const dispatch = useGame((s) => s.dispatch);
  const mode = useGame((s) => s.mode);

  // Une offre qui m'est adressée passe en priorité.
  const offer = mode !== "local" ? game.trades.find((t) => t.to === me) : undefined;
  if (offer) {
    const from = game.players.find((p) => p.id === offer.from);
    return (
      <div className="trade-center">
        <TradeStage game={game} fromId={offer.from} toId={offer.to} give={offer.give} take={offer.take} title={`${from?.name} te propose un échange`}>
          <div className="ts-actions">
            <button className="btn" onClick={() => dispatch(offer.to, { type: "rejectTrade", tradeId: offer.id })}>
              Refuser
            </button>
            <button className="btn ok big" onClick={() => dispatch(offer.to, { type: "acceptTrade", tradeId: offer.id })}>
              Accepter
            </button>
          </div>
        </TradeStage>
      </div>
    );
  }

  const entry = Object.entries(drafts).find(([from]) => from !== me);
  if (!entry) return null;
  const [fromId, d] = entry;
  const from = game.players.find((p) => p.id === fromId);
  const to = game.players.find((p) => p.id === d.to);
  if (!from || !to) return null;
  return (
    <div className="trade-center passive">
      <TradeStage
        game={game}
        fromId={fromId}
        toId={d.to}
        give={d.give}
        take={d.take}
        live
        title={`${from.name} prépare un échange avec ${to.id === me ? "toi" : to.name}…`}
      />
    </div>
  );
}
