import assert from "node:assert/strict";
import { baseline, validatePolicy } from "./policy.mjs";

const idOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const gameSeeds = [1, 1728]; // verified first servers: physical 1P, then 2P

export function schedule(roster, seedForPair) {
  assert.ok(roster.length >= 2 && new Set(roster.map((e) => e.id)).size === roster.length);
  const fixtures = [];
  for (let i = 0; i < roster.length; i++)
    for (let j = i + 1; j < roster.length; j++) {
      const a = roster[i],
        b = roster[j],
        cpuSeed = seedForPair(a.id, b.id);
      for (const [left, right] of [
        [a, b],
        [b, a],
      ])
        for (const gameSeed of gameSeeds) {
          fixtures.push({
            left: left.id,
            right: right.id,
            args: { left: left.policy, right: right.policy, gameSeed, cpuSeed },
          });
        }
    }
  return fixtures;
}

export function standings(roster, games) {
  const rows = new Map(
    roster.map((e) => [
      e.id,
      {
        id: e.id,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDiff: 0,
      },
    ]),
  );
  for (const game of games) {
    const left = rows.get(game.left),
      right = rows.get(game.right);
    assert.ok(left && right && left !== right, "Unknown league entrant");
    left.played++;
    right.played++;
    if (game.timeout) {
      left.draws++;
      right.draws++;
      continue;
    }
    const [l, r] = game.score;
    assert.ok(
      Number.isInteger(l) &&
        Number.isInteger(r) &&
        l >= 0 &&
        r >= 0 &&
        Math.max(l, r) === 11 &&
        l !== r,
      "Expected a completed game to 11",
    );
    if (l > r) {
      left.wins++;
      right.losses++;
    } else {
      right.wins++;
      left.losses++;
    }
    left.pointsFor += l;
    left.pointsAgainst += r;
    right.pointsFor += r;
    right.pointsAgainst += l;
    left.pointDiff += l - r;
    right.pointDiff += r - l;
  }
  const sorted = [...rows.values()].sort(
    (a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff || idOrder(a.id, b.id),
  );
  let rank = 1;
  return sorted.map((r, i) => {
    if (i && (r.wins !== sorted[i - 1].wins || r.pointDiff !== sorted[i - 1].pointDiff))
      rank = i + 1;
    return { rank, ...r };
  });
}

// Compare effective parameters, not IDs, property order, or inactive knobs.
export function fingerprint(raw) {
  const p = validatePolicy(raw),
    rollout = p.planner === "rollout";
  const ordered = { ...baseline, planner: rollout ? "rollout" : "heuristic" };
  for (const k of Object.keys(ordered)) if (k !== "planner") ordered[k] = p[k];
  if (!ordered.rallyMix) ordered.mixSeed = baseline.mixSeed;
  if (rollout) {
    // Even when the live controller overrides shot biases, the continuation in
    // its rollout uses them, so they remain part of the effective policy.
    ordered.zapLead = null;
  } else {
    ordered.rolloutHorizon = baseline.rolloutHorizon;
    if (ordered.zapLead === null) ordered.zapDistance = baseline.zapDistance;
  }
  return JSON.stringify(ordered);
}

export function reseed(roster, table, keep, archive, season, variants) {
  assert.ok(keep >= 1 && keep < roster.length);
  const byId = new Map(roster.map((x) => [x.id, x]));
  const retained = table.slice(0, keep).map((r) => byId.get(r.id));
  const eliminated = table
    .slice(keep)
    .map((r) => ({ ...byId.get(r.id), eliminatedIn: season, standing: r }));
  const seen = new Set([...roster, ...archive].map((e) => fingerprint(e.policy)));
  const entrants = [];
  for (const v of variants) {
    const mark = fingerprint(v.policy);
    if (seen.has(mark)) continue;
    seen.add(mark);
    entrants.push({
      id: `s${String(season + 1).padStart(4, "0")}-new-${String(entrants.length + 1).padStart(2, "0")}`,
      parent: v.parent,
      policy: validatePolicy(v.policy),
    });
    if (entrants.length === roster.length - keep) break;
  }
  assert.equal(
    entrants.length,
    roster.length - keep,
    "Could not produce enough distinct challengers",
  );
  return { retained, eliminated, entrants, nextRoster: [...retained, ...entrants] };
}
