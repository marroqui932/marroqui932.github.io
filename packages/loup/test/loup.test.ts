import { describe, expect, it } from "vitest";
import { compositionError, createLoup, eventsFor, applyLoup, suggestComposition, viewFor, LoupError } from "../src";
import { act, atStep, newGame, tick, until } from "./helpers";

describe("composition", () => {
  it("propose une composition valide pour 4 à 18 joueurs", () => {
    for (let n = 4; n <= 18; n++) expect(compositionError(suggestComposition(n), n)).toBeNull();
  });
  it("refuse une composition incohérente", () => {
    expect(compositionError({ loup: 1, villageois: 2 }, 4)).toMatch(/3 cartes/);
    expect(compositionError({ villageois: 5 }, 5)).toMatch(/loup/);
    expect(compositionError({ loup: 3, villageois: 3 }, 6)).toMatch(/Trop de loups/);
    expect(() => createLoup([{ id: "a", name: "a", color: "", token: "" }], {})).toThrow(LoupError);
  });
  it("distribue exactement la composition", () => {
    const s = createLoup(
      Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: "", token: "" })),
      {},
      7,
    );
    const counts: Record<string, number> = {};
    for (const p of s.players) counts[p.role!] = (counts[p.role!] ?? 0) + 1;
    expect(counts).toEqual(suggestComposition(9));
  });
});

describe("la nuit", () => {
  it("les loups tuent leur victime à l'unanimité", () => {
    let s = newGame(["loup", "loup", "villageois", "villageois", "villageois", "voyante"]);
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p2" });
    expect(s.night!.done).toBe(false);
    s = act(s, "p1", { type: "wolfVote", target: "p3" });
    expect(s.night!.done).toBe(false);
    s = act(s, "p1", { type: "wolfVote", target: "p2" });
    expect(s.night!.done).toBe(true);
    s = until(s, (x) => x.phase === "dawn");
    expect(s.players[2]!.alive).toBe(false);
    expect(s.announce!.deaths).toEqual(["p2"]);
  });

  it("un loup ne peut pas dévorer un loup, et les dormeurs ne jouent pas", () => {
    let s = newGame(["loup", "loup", "villageois", "villageois", "villageois", "voyante"]);
    s = until(s, atStep("loups"));
    expect(() => act(s, "p0", { type: "wolfVote", target: "p1" })).toThrow(/loup/);
    expect(() => act(s, "p2", { type: "wolfVote", target: "p3" })).toThrow(/dormez/);
  });

  it("la voyante découvre un rôle, sans que les autres le voient", () => {
    let s = newGame(["loup", "voyante", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("voyante"));
    s = act(s, "p1", { type: "see", target: "p0" });
    expect(viewFor(s, "p1").players[0]!.role).toBe("loup");
    expect(viewFor(s, "p2").players[0]!.role).toBeNull();
    expect(viewFor(s, "p2").night!.seen).toBeNull();
  });

  it("le salvateur protège, mais pas deux fois la même personne", () => {
    let s = newGame(["loup", "salvateur", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("salvateur"));
    s = act(s, "p1", { type: "protect", target: "p2" });
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p2" });
    s = until(s, (x) => x.phase === "dawn");
    expect(s.players[2]!.alive).toBe(true);
    expect(s.announce!.deaths).toEqual([]);
    s = until(s, (x) => x.phase === "vote");
    s = until(s, atStep("salvateur"));
    expect(() => act(s, "p1", { type: "protect", target: "p2" })).toThrow(/deux nuits/);
  });

  it("la sorcière sauve puis empoisonne", () => {
    let s = newGame(["loup", "sorciere", "villageois", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p2" });
    s = until(s, atStep("sorciere"));
    expect(viewFor(s, "p1").night!.victim).toBe("p2");
    expect(viewFor(s, "p3").night!.victim).toBeNull();
    s = act(s, "p1", { type: "potion", save: true, kill: "p3" });
    s = until(s, (x) => x.phase === "dawn");
    expect(s.players[2]!.alive).toBe(true);
    expect(s.players[3]!.alive).toBe(false);
    expect(s.potions).toEqual({ life: false, death: false });
  });

  it("l'ancien survit à la première attaque", () => {
    let s = newGame(["loup", "ancien", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p1" });
    s = until(s, (x) => x.phase === "dawn");
    expect(s.players[1]!.alive).toBe(true);
    s = until(s, (x) => x.phase === "vote");
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p1" });
    s = until(s, (x) => x.phase === "dawn");
    expect(s.players[1]!.alive).toBe(false);
  });

  it("cupidon lie deux amoureux qui meurent ensemble", () => {
    let s = newGame(["loup", "cupidon", "villageois", "villageois", "villageois", "villageois"], { mayor: false });
    s = until(s, atStep("cupidon"));
    s = act(s, "p1", { type: "cupid", a: "p2", b: "p3" });
    expect(viewFor(s, "p2").players[3]!.role).toBe("villageois");
    expect(viewFor(s, "p4").lovers).toBeNull();
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p2" });
    s = until(s, (x) => x.phase === "dawn");
    expect(s.announce!.deaths.sort()).toEqual(["p2", "p3"]);
  });

  it("des amoureux de camps opposés gagnent seuls", () => {
    let s = newGame(["loup", "cupidon", "villageois", "villageois"], { mayor: false });
    s = until(s, atStep("cupidon"));
    s = act(s, "p1", { type: "cupid", a: "p0", b: "p2" });
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p1" });
    s = until(s, (x) => x.phase === "vote");
    s = act(s, "p0", { type: "vote", target: "p3" });
    s = act(s, "p2", { type: "vote", target: "p3" });
    s = until(s, (x) => x.phase === "gameOver");
    expect(s.winner!.camp).toBe("amoureux");
    expect(s.winner!.players.sort()).toEqual(["p0", "p1", "p2"]);
  });

  it("la petite fille espionne : vue, surprise ou rien", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      let s = newGame(["loup", "petiteFille", "villageois", "villageois", "villageois"], {}, seed);
      s = until(s, atStep("loups"));
      const r = applyLoup(s, "p1", { type: "spy" });
      const e = r.events.find((x) => x.type === "spied")!;
      seen.add(e.type === "spied" && e.caught ? "surprise" : e.type === "spied" && e.wolf ? "vu" : "rien");
      if (e.type === "spied" && e.caught) expect(viewFor(r.state, "p0").players[1]!.role).toBe("petiteFille");
      expect(() => applyLoup(r.state, "p1", { type: "spy" })).toThrow(/déjà/);
    }
    expect(seen).toEqual(new Set(["surprise", "vu", "rien"]));
  });
});

describe("le jour", () => {
  function toVote(roles: string[], opts = {}) {
    let s = newGame(roles as never, { mayor: false, ...opts });
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: s.players.find((p) => p.role !== "loup" && p.role !== "chasseur" && p.role !== "idiot" && p.role !== "bouc")!.id });
    return until(s, (x) => x.phase === "vote" || x.phase === "mayorVote");
  }

  it("le maire est élu et sa voix compte double", () => {
    let s = newGame(["loup", "villageois", "villageois", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p5" });
    s = until(s, (x) => x.phase === "mayorVote");
    for (const id of ["p0", "p1", "p2", "p3", "p4"]) s = act(s, id, { type: "vote", target: "p1" });
    expect(s.voteClosing).toBe(true);
    s = tick(s);
    expect(s.mayor).toBe("p1");
    expect(s.phase).toBe("vote");
    s = act(s, "p1", { type: "vote", target: "p0" });
    s = act(s, "p2", { type: "vote", target: "p3" });
    s = tick(s);
    expect(s.announce!.deaths).toEqual(["p0"]);
    s = tick(s);
    expect(s.winner!.camp).toBe("village");
  });

  it("le village élimine, le chasseur tire sa dernière balle", () => {
    let s = toVote(["loup", "chasseur", "villageois", "villageois", "villageois", "villageois"]);
    for (const id of ["p0", "p3", "p4", "p5"]) s = act(s, id, { type: "vote", target: "p1" });
    s = tick(s);
    expect(s.phase).toBe("verdict");
    s = tick(s);
    expect(s.phase).toBe("hunter");
    expect(() => act(s, "p3", { type: "shoot", target: "p0" })).toThrow();
    s = act(s, "p1", { type: "shoot", target: "p0" });
    expect(s.winner!.camp).toBe("village");
  });

  it("l'idiot du village est gracié mais ne vote plus", () => {
    let s = toVote(["loup", "idiot", "villageois", "villageois", "villageois", "villageois"]);
    for (const id of ["p0", "p3", "p4", "p5"]) s = act(s, id, { type: "vote", target: "p1" });
    s = tick(s);
    expect(s.players[1]!.alive).toBe(true);
    expect(s.players[1]!.revealed).toBe(true);
    expect(viewFor(s, "p3").players[1]!.role).toBe("idiot");
    s = until(s, (x) => x.phase === "vote");
    expect(() => act(s, "p1", { type: "vote", target: "p0" })).toThrow(/idiot/);
  });

  it("en cas d'égalité, le bouc émissaire est éliminé", () => {
    let s = toVote(["loup", "bouc", "villageois", "villageois", "villageois", "villageois"]);
    const alive = s.players.filter((p) => p.alive).map((p) => p.id);
    expect(alive).toContain("p1");
    s = act(s, alive[0]!, { type: "vote", target: alive[2]! });
    s = act(s, alive[2]!, { type: "vote", target: alive[0]! });
    s = tick(s);
    expect(s.announce!.tie).toBe(true);
    expect(s.announce!.deaths).toEqual(["p1"]);
  });

  it("égalité sans bouc : personne ne meurt", () => {
    let s = toVote(["loup", "villageois", "villageois", "villageois", "villageois", "villageois"]);
    s = act(s, "p0", { type: "vote", target: "p2" });
    s = act(s, "p2", { type: "vote", target: "p0" });
    s = tick(s);
    expect(s.announce).toEqual({ deaths: [], spared: null, tie: true });
  });

  it("le corbeau ajoute deux voix", () => {
    let s = newGame(["loup", "corbeau", "villageois", "villageois", "villageois", "villageois"], { mayor: false });
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p5" });
    s = until(s, atStep("corbeau"));
    expect(viewFor(s, "p2").ravenTarget).toBeNull();
    s = act(s, "p1", { type: "raven", target: "p0" });
    s = until(s, (x) => x.phase === "vote");
    s = act(s, "p3", { type: "vote", target: "p2" });
    s = tick(s);
    expect(s.announce!.deaths).toEqual(["p0"]);
  });

  it("le maire mort désigne son successeur", () => {
    let s = newGame(["loup", "villageois", "villageois", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p5" });
    s = until(s, (x) => x.phase === "mayorVote");
    s = act(s, "p2", { type: "vote", target: "p2" });
    s = tick(s);
    expect(s.mayor).toBe("p2");
    s = tick(s); // personne ne vote
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p2" });
    s = until(s, (x) => x.phase === "successor");
    s = act(s, "p2", { type: "successor", target: "p3" });
    expect(s.mayor).toBe("p3");
    expect(s.phase).toBe("vote");
  });
});

describe("secret et discussion", () => {
  it("chacun ne voit que son rôle (et les loups se connaissent)", () => {
    const s = newGame(["loup", "loup", "voyante", "villageois", "villageois", "villageois", "villageois"]);
    expect(viewFor(s, "p0").players.map((p) => p.role)).toEqual(["loup", "loup", null, null, null, null, null]);
    expect(viewFor(s, "p3").players.map((p) => p.role)).toEqual([null, null, null, "villageois", null, null, null]);
    expect(viewFor(s, "p3").rng).toBe(0);
  });

  it("la nuit, seuls les loups parlent, et entre eux", () => {
    let s = newGame(["loup", "loup", "villageois", "villageois", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("loups"));
    expect(() => act(s, "p2", { type: "say", text: "coucou" })).toThrow(/nuit/);
    const r = applyLoup(s, "p0", { type: "say", text: "on mange Léa ?" });
    expect(eventsFor(r.events, "p1", r.state)).toHaveLength(1);
    expect(eventsFor(r.events, "p2", r.state)).toHaveLength(0);
    expect(viewFor(r.state, "p2").chat).toHaveLength(0);
    expect(viewFor(r.state, "p1").chat).toHaveLength(1);
  });

  it("les morts voient tout et parlent entre eux", () => {
    let s = newGame(["loup", "villageois", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("loups"));
    s = act(s, "p0", { type: "wolfVote", target: "p1" });
    s = until(s, (x) => x.phase === "dawn");
    expect(viewFor(s, "p1").players[0]!.role).toBe("loup");
    const r = applyLoup(s, "p1", { type: "say", text: "c'est Ayman !" });
    expect(r.state.chat[0]!.channel).toBe("morts");
    expect(viewFor(r.state, "p2").chat).toHaveLength(0);
  });

  it("le minuteur d'une étape de nuit est caché aux dormeurs", () => {
    let s = newGame(["loup", "voyante", "villageois", "villageois", "villageois"]);
    s = until(s, atStep("voyante"));
    expect(viewFor(s, "p1").step.ms).toBeGreaterThan(0);
    expect(viewFor(s, "p2").step.ms).toBe(0);
  });
});
