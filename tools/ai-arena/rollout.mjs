import { createHash } from "node:crypto";
import { loadRolloutGame } from "../korean-shutout/load-game.mjs";

const DT = 1 / 60;
const MAX_PER_SIDE = 100;
const empty = () => ({
  decisions: 0,
  changed: 0,
  branches: 0,
  resolved: 0,
  wins: 0,
  losses: 0,
  byAction: {},
  comparisons: {},
});
const pilotConfig = (config) => ({ ...config, planner: "heuristic", zapLead: null });

function saveAi(engine) {
  const { lastBy, ...ai } = engine.ai;
  return { lastBy: lastBy?.id ?? 0, fields: structuredClone(ai) };
}
function restoreAi(engine, saved) {
  for (const k of Object.keys(engine.ai))
    if (k !== "lastBy" && !Object.hasOwn(saved.fields, k)) delete engine.ai[k];
  Object.assign(engine.ai, structuredClone(saved.fields), {
    lastBy: saved.lastBy === 1 ? engine.P1 : saved.lastBy === 2 ? engine.P2 : null,
  });
}
function commitment(action) {
  if (action.id === "dash" || action.id === "zap") return 1;
  if (action.id === "jump") return 0.35;
  return 0;
}

export async function makeRollout(live, makePilot, getRng, native) {
  const fork = await loadRolloutGame();
  const report = [empty(), empty()];
  // Continuation controllers are freshly planned, not a claim to predict unseen player/controller internals.
  function trial(state, cpuState, side, own, opp, action, seed, pending) {
    const random = Math.random;
    Math.random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    try {
      fork.toTitle(); // clears status FX, dust and marks before restoring gameplay
      fork.setAI(native ?? null);
      fork.loadState(state);
      fork.held.clear();
      fork.pressed.clear();
      if (native) restoreAi(fork, cpuState);
      const me = side === 1 ? fork.P1 : fork.P2;
      const us = makePilot(fork, side, pilotConfig(own));
      const them = native ? null : makePilot(fork, 3 - side, pilotConfig(opp));
      us.prime(action);
      if (pending) them?.prime(pending);
      else them?.tick();
      for (let i = 0; i < own.rolloutHorizon; i++) {
        fork.step(DT);
        fork.pressed.clear();
        if (fork.game.state === "point" || fork.game.state === "over") {
          return { value: fork.game.pointWinner === me ? 1 : -1, ticks: i + 1 };
        }
        us.tick();
        them?.tick();
      }
      // A bounded search has no evidence of a point yet. Treat it as unresolved,
      // not a positive reward for hitting a skill or delaying play.
      return { value: 0, ticks: own.rolloutHorizon };
    } finally {
      Math.random = random;
    }
  }
  return {
    report,
    forSide(side, own, opp) {
      const log = report[side - 1];
      return (kind, options) => {
        if (log.decisions >= MAX_PER_SIDE || live.game.freeze > 0 || live.game.state === "point")
          return options[0];
        const state = live.saveState(),
          cpuState = native ? saveAi(live) : null,
          seed = getRng();
        // 1P has already issued this frame’s inputs when 2P chooses. Use only that pending action;
        // otherwise the forecast has the opponent replan under the hypothetical action.
        const pending =
          side === 2
            ? {
                held: [...live.held].filter((k) => /^Key[ADWS]$/.test(k)),
                pulses: [...live.pressed].filter((k) => /^Key[ADWSFGH]$/.test(k)),
                ...(live.P1.act?.type === "basic"
                  ? { swing: [...live.held].find((k) => /^Key[ADS]$/.test(k)) ?? "" }
                  : {}),
              }
            : null;
        log.decisions++;
        let best = null;
        for (const action of options) {
          const result = trial(state, cpuState, side, own, opp, action, seed, pending);
          log.branches++;
          const c = (log.comparisons[kind] ??= { branches: 0, resolved: 0 });
          c.branches++;
          if (result.value !== 0) {
            log.resolved++;
            c.resolved++;
          }
          if (result.value > 0) log.wins++;
          if (result.value < 0) log.losses++;
          const next = { ...result, action };
          // Resolve point prediction first. When two actions are confirmed wins, take the
          // less committing one; for unresolved branches retain the heuristic's first pick.
          if (
            !best ||
            next.value > best.value ||
            (next.value === 1 && best.value === 1 && commitment(action) < commitment(best.action))
          )
            best = next;
        }
        if (log.samples === undefined) log.samples = [];
        if (log.samples.length < 8)
          log.samples.push({
            id: createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 12),
            t: +state.g.time.toFixed(3),
            kind,
            chosen: best.action.id,
          });
        if (best.action !== options[0]) log.changed++;
        log.byAction[best.action.id] = (log.byAction[best.action.id] ?? 0) + 1;
        return best.action;
      };
    },
  };
}
