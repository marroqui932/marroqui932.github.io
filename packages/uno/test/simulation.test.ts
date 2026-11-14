// Des centaines de parties jouées au hasard : aucune carte ne doit apparaître ni disparaître.
import { describe, expect, it } from "vitest";
import { applyUno, canPlay, createUno, UnoError, COLORS } from "../src";
import type { UnoAction, UnoState } from "../src";

const holder = { rng: 0 };
function r() {
  holder.rng = (holder.rng * 1103515245 + 12345) & 0x7fffffff;
  return holder.rng / 0x7fffffff;
}
const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;

function check(s: UnoState) {
  const ids = [...s.drawPile, ...s.discard, ...s.players.flatMap((p) => p.hand)].map((c) => c.id);
  expect(ids.length).toBe(108);
  expect(new Set(ids).size).toBe(108);
  for (const p of s.players) expect(p.handCount).toBe(p.hand.length);
  if (s.phase === "play") expect(s.players[s.current]!.left).toBe(false);
}

function move(s: UnoState): [string, UnoAction] {
  const cur = s.players[s.current]!;
  if (s.phase === "roundOver") return [pick(s.players.filter((p) => !p.left && !s.ready.includes(p.id))).id, { type: "ready" }];
  if (s.phase === "startColor") return [cur.id, { type: "chooseColor", color: pick(COLORS) }];
  if (s.phase === "challenge") return [cur.id, r() < 0.3 ? { type: "challenge" } : { type: "acceptDraw4" }];
  if (s.unoTarget && r() < 0.3) {
    const other = pick(s.players.filter((p) => p.id !== s.unoTarget && !p.left));
    return [other.id, { type: "catchUno", target: s.unoTarget }];
  }
  if (cur.hand.length === 2 && r() < 0.6) return [cur.id, { type: "sayUno" }];
  const playable = cur.hand.filter((c) => canPlay(s, c) && (!s.drawn || s.drawn.cardId === c.id));
  if (playable.length && r() < 0.9) {
    const c = pick(playable);
    return [cur.id, { type: "play", cardId: c.id, color: c.color ? undefined : pick(COLORS) }];
  }
  if (s.drawn) return [cur.id, { type: "pass" }];
  if (r() < 0.002) return [cur.id, { type: "leave" }];
  return [cur.id, { type: "draw" }];
}

describe("simulation Uno", () => {
  it("300 parties sans perte ni création de carte", () => {
    let finished = 0;
    for (let g = 0; g < 300; g++) {
      holder.rng = g + 1;
      let s = createUno(
        Array.from({ length: 2 + (g % 6) }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: "#000", token: "pawn" })),
        { targetScore: g % 3 === 0 ? null : 200 },
        g,
      );
      check(s);
      for (let step = 0; step < 4000 && s.phase !== "gameOver"; step++) {
        const [who, a] = move(s);
        try {
          s = applyUno(s, who, a).state;
        } catch (e) {
          if (!(e instanceof UnoError)) throw e;
          continue;
        }
        check(s);
      }
      if (s.phase === "gameOver") finished++;
    }
    expect(finished).toBeGreaterThan(240);
  }, 120_000);
});
