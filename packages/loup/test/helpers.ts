import { applyLoup, createLoup, type LoupAction, type LoupState, type PlayerId, type RoleId } from "../src";

export const names = ["Ayman", "Karim", "Léa", "Sofiane", "Inès", "Yanis", "Nora", "Bilal", "Sarah", "Mehdi", "Lina", "Rayan"];

export function newGame(roles: RoleId[], opts: Record<string, unknown> = {}, seed = 42): LoupState {
  const comp: Partial<Record<RoleId, number>> = {};
  for (const r of roles) comp[r] = (comp[r] ?? 0) + 1;
  const s = createLoup(
    roles.map((_, i) => ({ id: `p${i}`, name: names[i]!, color: "#fff", token: "chapeau" })),
    { roles: comp, ...opts },
    seed,
  );
  // On remet les rôles dans l'ordre demandé pour des tests lisibles.
  s.players.forEach((p, i) => (p.role = roles[i]!));
  return s;
}

export function act(s: LoupState, id: PlayerId, a: LoupAction): LoupState {
  return applyLoup(s, id, a).state;
}
export function tick(s: LoupState): LoupState {
  return applyLoup(s, s.players[0]!.id, { type: "timeout", step: s.step.id }).state;
}
/** Avance jusqu'à l'étape de nuit (ou la phase) voulue. */
export function until(s: LoupState, pred: (s: LoupState) => boolean, max = 60): LoupState {
  for (let i = 0; i < max && !pred(s); i++) s = tick(s);
  if (!pred(s)) throw new Error(`Étape jamais atteinte (phase ${s.phase}, nuit ${s.night?.step})`);
  return s;
}
export const atStep = (step: string) => (s: LoupState) => s.phase === "night" && s.night?.step === step && !s.night.done;
