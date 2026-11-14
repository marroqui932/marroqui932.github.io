import { describe, expect, it } from "vitest";
import { applyLoup, createLoup, LoupError, suggestComposition, viewFor, type LoupAction, type LoupState, type PlayerId } from "../src";

function rnd(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

function candidates(s: LoupState, r: () => number): [PlayerId, LoupAction][] {
  const alive = s.players.filter((p) => p.alive);
  const any = (ex: PlayerId[] = []) => {
    const pool = alive.filter((p) => !ex.includes(p.id));
    return (pool[Math.floor(r() * pool.length)] ?? alive[0]!).id;
  };
  const out: [PlayerId, LoupAction][] = [];
  if (s.phase === "night" && s.night?.step && !s.night.done) {
    for (const id of s.night.actors) {
      switch (s.night.step) {
        case "cupidon":
          out.push([id, { type: "cupid", a: alive[0]!.id, b: alive[1 + Math.floor(r() * (alive.length - 1))]!.id }]);
          break;
        case "salvateur":
          out.push([id, { type: "protect", target: any([s.lastProtected ?? ""]) }]);
          break;
        case "voyante":
          out.push([id, { type: "see", target: any([id]) }]);
          break;
        case "loups": {
          const prey = alive.filter((p) => p.role !== "loup");
          const first = Object.values(s.night.wolfVotes)[0];
          out.push([id, { type: "wolfVote", target: first && r() < 0.7 ? first : prey[Math.floor(r() * prey.length)]!.id }]);
          break;
        }
        case "sorciere":
          out.push([id, { type: "potion", save: !!s.potions?.life && !!s.night.victim && r() < 0.5, kill: s.potions?.death && r() < 0.3 ? any() : null }]);
          break;
        case "corbeau":
          out.push([id, { type: "raven", target: r() < 0.7 ? any() : null }]);
          break;
      }
    }
    if (s.night.step === "loups") for (const g of alive.filter((p) => p.role === "petiteFille")) if (!s.night.spied) out.push([g.id, { type: "spy" }]);
  }
  if (s.phase === "vote" || s.phase === "mayorVote") for (const p of alive) if (p.canVote && r() < 0.5) out.push([p.id, { type: "vote", target: any([p.id]) }]);
  if (s.phase === "hunter") out.push([s.pending[0]!.player, { type: "shoot", target: r() < 0.8 ? any() : null }]);
  if (s.phase === "successor") out.push([s.pending[0]!.player, { type: "successor", target: any() }]);
  return out;
}

describe("simulation de parties", () => {
  it("300 parties aléatoires se terminent sans erreur ni fuite", () => {
    const camps: Record<string, number> = {};
    for (let g = 0; g < 300; g++) {
      const r = rnd(g + 1);
      const n = 4 + (g % 12);
      let s = createLoup(
        Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: "", token: "" })),
        { roles: suggestComposition(n), mayor: g % 3 !== 0, revealRoles: g % 5 !== 0 },
        g * 7 + 3,
      );
      let steps = 0;
      while (s.phase !== "gameOver") {
        if (++steps > 4000) throw new Error(`Partie ${g} bloquée en phase ${s.phase}`);
        const c = candidates(s, r);
        let res;
        if (c.length && r() > 0.2) {
          const [id, a] = c[Math.floor(r() * c.length)]!;
          try {
            res = applyLoup(s, id, a);
          } catch (e) {
            if (!(e instanceof LoupError)) throw e;
            continue;
          }
        } else if (r() < 0.003 && s.players.some((p) => p.alive)) {
          const p = s.players.filter((x) => x.alive)[0]!;
          res = applyLoup(s, p.id, { type: "leave" });
        } else res = applyLoup(s, "p0", { type: "timeout", step: s.step.id });
        s = res.state;
        // Aucune fuite : un vivant ne voit que les rôles qu'il a le droit de connaître.
        for (const p of steps % 7 ? [] : s.players) {
          if (!p.alive || s.phase === "gameOver") continue;
          const v = viewFor(s, p.id);
          v.players.forEach((q, i) => {
            if (!q.role) return;
            const ok = q.id === p.id || s.players[i]!.revealed || s.knowledge[p.id]?.[q.id] || (p.role === "loup" && q.role === "loup");
            expect(ok, `${p.role} voit ${q.role}`).toBeTruthy();
          });
        }
      }
      expect(s.winner).not.toBeNull();
      const living = s.players.filter((p) => p.alive);
      if (s.winner!.camp === "village") expect(living.every((p) => p.role !== "loup")).toBe(true);
      if (s.winner!.camp === "loups") expect(living.every((p) => p.role === "loup")).toBe(true);
      camps[s.winner!.camp] = (camps[s.winner!.camp] ?? 0) + 1;
    }
    expect(camps.village).toBeGreaterThan(10);
    expect(camps.loups).toBeGreaterThan(10);
  }, 60000);
});
