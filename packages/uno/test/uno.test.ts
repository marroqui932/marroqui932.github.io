import { describe, expect, it } from "vitest";
import { applyUno, buildDeck, canPlay, cardPoints, createUno, eventsFor, topCard, viewFor, UnoError } from "../src";
import type { UnoCard, UnoColor, UnoState, UnoAction } from "../src";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}`, color: "#000", token: "pawn" }));

function card(kind: UnoCard["kind"], color: UnoColor | null, value: number | null = null, id = 1000 + Math.floor(Math.random() * 100000)): UnoCard {
  return { id, kind, color, value };
}

/** Partie maîtrisée : on impose les mains et la carte du dessus. */
function setup(n: number, hands: UnoCard[][], top: UnoCard, current = 0): UnoState {
  const s = createUno(players(n), { targetScore: 500 }, 1);
  s.players.forEach((p, i) => {
    p.hand = hands[i] ?? [];
    p.handCount = p.hand.length;
    p.saidUno = false;
  });
  s.discard = [top];
  s.currentColor = top.color ?? "red";
  s.current = current;
  s.direction = 1;
  s.phase = "play";
  s.drawn = null;
  s.unoTarget = null;
  s.drawPile = buildDeck().map((c) => ({ ...c, id: c.id + 5000 }));
  s.drawCount = s.drawPile.length;
  return s;
}

const act = (s: UnoState, id: string, a: UnoAction) => applyUno(s, id, a).state;

describe("paquet et distribution", () => {
  it("108 cartes conformes", () => {
    const d = buildDeck();
    expect(d).toHaveLength(108);
    expect(d.filter((c) => c.kind === "wild")).toHaveLength(4);
    expect(d.filter((c) => c.kind === "wild4")).toHaveLength(4);
    expect(d.filter((c) => c.kind === "number" && c.value === 0)).toHaveLength(4);
    expect(d.filter((c) => c.kind === "number" && c.value === 7)).toHaveLength(8);
    expect(d.filter((c) => c.kind === "draw2")).toHaveLength(8);
  });

  it("7 cartes chacun, pas de +4 en première carte", () => {
    for (let seed = 1; seed < 200; seed++) {
      const s = createUno(players(4), {}, seed);
      // 7 cartes chacun (9 pour le premier joueur si la première carte est un +2).
      expect(s.players.every((p) => p.hand.length === 7 || (topCard(s).kind === "draw2" && p.hand.length === 9))).toBe(true);
      expect(topCard(s).kind).not.toBe("wild4");
      const inHands = s.players.reduce((n, p) => n + p.hand.length, 0);
      expect(s.drawPile.length + s.discard.length + inHands).toBe(108);
    }
  });
});

describe("poser une carte", () => {
  it("même couleur, même chiffre ou même symbole", () => {
    const s = setup(2, [[], []], card("number", "red", 5));
    expect(canPlay(s, card("number", "red", 1))).toBe(true);
    expect(canPlay(s, card("number", "blue", 5))).toBe(true);
    expect(canPlay(s, card("number", "blue", 6))).toBe(false);
    expect(canPlay(s, card("skip", "blue"))).toBe(false);
    expect(canPlay(s, card("wild", null))).toBe(true);
    const s2 = setup(2, [[], []], card("skip", "red"));
    expect(canPlay(s2, card("skip", "green"))).toBe(true);
  });

  it("refuse une carte qui ne va pas, et hors de son tour", () => {
    const bad = card("number", "blue", 3, 1);
    const s = setup(2, [[bad, card("number", "red", 1, 2)], [card("number", "red", 2, 3)]], card("number", "red", 5));
    expect(() => act(s, "p0", { type: "play", cardId: 1 })).toThrow(UnoError);
    expect(() => act(s, "p1", { type: "play", cardId: 3 })).toThrow("pas votre tour");
  });

  it("Passe ton tour, Inversion, +2", () => {
    let s = setup(3, [[card("skip", "red", null, 1), card("number", "red", 1, 9)], [card("number", "red", 2, 2)], [card("number", "red", 3, 3)]], card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.current).toBe(2);

    s = setup(3, [[card("reverse", "red", null, 1), card("number", "red", 1, 9)], [], []], card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.direction).toBe(-1);
    expect(s.current).toBe(2);

    s = setup(3, [[card("draw2", "red", null, 1), card("number", "red", 1, 9)], [card("number", "blue", 1, 2)], []], card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.players[1]!.hand).toHaveLength(3);
    expect(s.current).toBe(2);
  });

  it("à deux joueurs, l'inversion fait rejouer", () => {
    let s = setup(2, [[card("reverse", "red", null, 1), card("number", "red", 1, 9)], [card("number", "red", 2, 2)]], card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.current).toBe(0);
  });

  it("le joker demande une couleur", () => {
    let s = setup(2, [[card("wild", null, null, 1), card("number", "red", 1, 9)], [card("number", "red", 2, 2)]], card("number", "red", 5));
    expect(() => act(s, "p0", { type: "play", cardId: 1 })).toThrow("couleur");
    s = act(s, "p0", { type: "play", cardId: 1, color: "green" });
    expect(s.currentColor).toBe("green");
    expect(s.current).toBe(1);
  });
});

describe("piocher", () => {
  it("une carte ; si elle est jouable on peut la poser ou passer", () => {
    let s = setup(2, [[card("number", "blue", 1, 1)], [card("number", "blue", 2, 2)]], card("number", "red", 5));
    s.drawPile.push(card("number", "red", 7, 77));
    s = act(s, "p0", { type: "draw" });
    expect(s.drawn).toEqual({ player: "p0", cardId: 77 });
    expect(() => act(s, "p0", { type: "play", cardId: 1 })).toThrow("piocher");
    expect(() => act(s, "p0", { type: "draw" })).toThrow("déjà pioché");
    const passed = act(s, "p0", { type: "pass" });
    expect(passed.current).toBe(1);
    const played = act(s, "p0", { type: "play", cardId: 77 });
    expect(topCard(played).id).toBe(77);
  });

  it("carte non jouable : le tour passe", () => {
    let s = setup(2, [[card("number", "blue", 1, 1)], [card("number", "blue", 2, 2)]], card("number", "red", 5));
    s.drawPile.push(card("number", "green", 7, 77));
    s = act(s, "p0", { type: "draw" });
    expect(s.drawn).toBeNull();
    expect(s.current).toBe(1);
  });

  it("pioche vide : la défausse est remélangée", () => {
    let s = setup(2, [[card("number", "blue", 1, 1)], [card("number", "blue", 2, 2)]], card("number", "red", 5));
    s.drawPile = [];
    s.discard = [card("number", "green", 3, 50), card("number", "green", 4, 51), card("number", "red", 5, 52)];
    s = applyUno(s, "p0", { type: "draw" }).state;
    expect(s.discard.map((c) => c.id)).toEqual([52]);
    expect(s.players[0]!.hand).toHaveLength(2);
  });
});

describe("+4 et contestation", () => {
  const hands = () => [
    [card("wild4", null, null, 1), card("number", "red", 1, 2), card("number", "blue", 4, 3)],
    [card("number", "blue", 2, 4)],
    [card("number", "green", 2, 5)],
  ];

  it("accepter : +4 et on passe son tour", () => {
    let s = setup(3, hands(), card("number", "green", 5));
    s = act(s, "p0", { type: "play", cardId: 1, color: "blue" });
    expect(s.phase).toBe("challenge");
    s = act(s, "p1", { type: "acceptDraw4" });
    expect(s.players[1]!.hand).toHaveLength(5);
    expect(s.current).toBe(2);
  });

  it("contester un bluff : le poseur pioche 4", () => {
    let s = setup(3, hands(), card("number", "red", 5)); // p0 avait du rouge : +4 illégal
    s = act(s, "p0", { type: "play", cardId: 1, color: "blue" });
    s = act(s, "p1", { type: "challenge" });
    expect(s.players[0]!.hand).toHaveLength(6);
    expect(s.players[1]!.hand).toHaveLength(1);
    expect(s.current).toBe(1);
  });

  it("contester à tort : la victime pioche 6", () => {
    let s = setup(3, hands(), card("number", "green", 5)); // pas de vert chez p0 : +4 légal
    s = act(s, "p0", { type: "play", cardId: 1, color: "blue" });
    s = act(s, "p1", { type: "challenge" });
    expect(s.players[1]!.hand).toHaveLength(7);
    expect(s.current).toBe(2);
  });

  it("la légalité du +4 reste cachée aux joueurs", () => {
    let s = setup(3, hands(), card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1, color: "blue" });
    expect(viewFor(s, "p1").pendingWild4!.legal).toBeNull();
  });
});

describe("UNO", () => {
  it("oublié : attrapé avant que le suivant joue, +2", () => {
    let s = setup(3, [[card("number", "red", 1, 1), card("number", "red", 2, 2)], [card("number", "red", 3, 3)], [card("number", "red", 4, 4)]], card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.unoTarget).toBe("p0");
    s = act(s, "p2", { type: "catchUno", target: "p0" });
    expect(s.players[0]!.hand).toHaveLength(3);
  });

  it("trop tard une fois que le suivant a joué", () => {
    let s = setup(3, [[card("number", "red", 1, 1), card("number", "red", 2, 2)], [card("number", "red", 3, 3), card("number", "red", 8, 8)], []], card("number", "red", 5));
    s = act(s, "p0", { type: "play", cardId: 1 });
    s = act(s, "p1", { type: "play", cardId: 3 });
    expect(() => act(s, "p2", { type: "catchUno", target: "p0" })).toThrow("Trop tard");
  });

  it("dit à temps : impossible d'être attrapé", () => {
    let s = setup(3, [[card("number", "red", 1, 1), card("number", "red", 2, 2)], [], []], card("number", "red", 5));
    s = act(s, "p0", { type: "sayUno" });
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.unoTarget).toBeNull();
    expect(() => act(s, "p1", { type: "catchUno", target: "p0" })).toThrow();
  });
});

describe("fin de manche et score", () => {
  it("le gagnant marque les cartes des autres", () => {
    let s = setup(
      3,
      [[card("number", "red", 1, 1)], [card("number", "blue", 7, 2), card("skip", "green", null, 3)], [card("wild4", null, null, 4)]],
      card("number", "red", 5),
    );
    s.players[0]!.saidUno = true;
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.phase).toBe("roundOver");
    expect(s.players[0]!.score).toBe(7 + 20 + 50);
    s = act(s, "p1", { type: "ready" });
    expect(s.phase).toBe("roundOver");
    s = act(s, "p0", { type: "ready" });
    s = act(s, "p2", { type: "ready" });
    expect(s.round).toBe(2);
    expect(s.players.every((p) => p.hand.length === 7)).toBe(true);
  });

  it("une seule manche par défaut, puis nouvelle partie quand tous sont prêts", () => {
    let s = createUno(players(2), {}, 4);
    expect(s.options.targetScore).toBeNull();
    s.players[0]!.hand = [card("number", "red", 1, 1)];
    s.players[0]!.handCount = 1;
    s.players[0]!.saidUno = true;
    s.discard = [card("number", "red", 5, 2)];
    s.currentColor = "red";
    s.current = 0;
    s.phase = "play";
    s.drawn = null;
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.phase).toBe("gameOver");
    s = act(s, "p0", { type: "ready" });
    expect(s.ready).toEqual(["p0"]);
    s = act(s, "p1", { type: "ready" });
    expect(s.phase).toBe("play");
    expect(s.players.every((p) => p.score === 0)).toBe(true);
    expect(s.ready).toEqual([]);
  });

  it("partie gagnée à 500 points", () => {
    let s = setup(2, [[card("number", "red", 1, 1)], [card("wild", null, null, 2)]], card("number", "red", 5));
    s.options.targetScore = 500;
    s.players[0]!.score = 460;
    s.players[0]!.saidUno = true;
    s = act(s, "p0", { type: "play", cardId: 1 });
    expect(s.phase).toBe("gameOver");
    expect(s.winner).toBe("p0");
  });

  it("valeurs officielles", () => {
    expect(cardPoints(card("number", "red", 9))).toBe(9);
    expect(cardPoints(card("draw2", "red"))).toBe(20);
    expect(cardPoints(card("wild4", null))).toBe(50);
  });
});

describe("vues privées", () => {
  it("on ne voit que sa main et pas la pioche", () => {
    const s = createUno(players(3), {}, 3);
    const v = viewFor(s, "p1");
    expect(v.players[1]!.hand).toHaveLength(7);
    expect(v.players[0]!.hand).toHaveLength(0);
    expect(v.players[0]!.handCount).toBe(7);
    expect(v.drawPile).toHaveLength(0);
    const r = applyUno(setup(2, [[card("number", "blue", 1, 1)], []], card("number", "red", 5)), "p0", { type: "draw" });
    const seen = eventsFor(r.events, "p1").find((e) => e.type === "drew");
    expect(seen && "cards" in seen ? seen.cards : undefined).toBeUndefined();
  });
});
