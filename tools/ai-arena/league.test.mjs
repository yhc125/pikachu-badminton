import assert from "node:assert/strict";
import { test } from "node:test";
import { fingerprint, reseed, schedule, standings } from "./league.mjs";

const roster = [
  { id: "alpha", policy: {} },
  { id: "bravo", policy: { planner: "rollout" } },
  { id: "charlie", policy: { serveDrop: 35 } },
];

test("each pair plays both seats with both first servers", () => {
  const games = schedule(roster, (a, b) => a.length + b.length);
  assert.equal(games.length, 12);
  for (const bot of roster) {
    assert.equal(games.filter((g) => g.left === bot.id).length, 4);
    assert.equal(games.filter((g) => g.right === bot.id).length, 4);
    assert.equal(
      games.filter((g) => (g.args.gameSeed === 1 ? g.left === bot.id : g.right === bot.id)).length,
      4,
    );
  }
  assert.equal(
    new Set(games.map((g) => `${g.left}|${g.right}|${g.args.gameSeed}`)).size,
    games.length,
  );
});

test("wins rank first, point difference breaks ties, timeout scores do not count", () => {
  const games = [
    { left: "alpha", right: "bravo", score: [11, 9] },
    { left: "bravo", right: "charlie", score: [11, 0] },
    { left: "alpha", right: "charlie", score: [0, 11] },
    { left: "alpha", right: "bravo", score: [10, 0], timeout: true },
  ];
  const table = standings(roster, games);
  assert.deepEqual(
    table.map(({ id, wins, pointDiff, draws }) => [id, wins, pointDiff, draws]),
    [
      ["bravo", 1, 9, 1],
      ["charlie", 1, 0, 0],
      ["alpha", 1, -9, 1],
    ],
  );
  const longWins = standings(roster, [
    ...games,
    { left: "alpha", right: "charlie", score: [11, 10] },
  ]);
  assert.equal(longWins[0].id, "alpha");
  assert.equal(
    standings(roster, []).every((r) => r.rank === 1),
    true,
  );
});

test("turnover retains leaders and avoids cloning active or archived strategies", () => {
  const table = standings(roster, [{ left: "bravo", right: "alpha", score: [11, 0] }]);
  const archive = [{ id: "retired", policy: { serveX: 110 } }];
  const candidates = [
    { parent: "bravo", policy: { planner: "rollout", zapLead: 0.25 } },
    { parent: "bravo", policy: { serveX: 110 } },
    { parent: "bravo", policy: { planner: "rollout", rolloutHorizon: 135 } },
  ];
  const next = reseed(roster, table, 2, archive, 1, candidates);
  assert.deepEqual(
    next.retained.map((x) => x.id),
    ["bravo", "charlie"],
  );
  assert.deepEqual(
    next.eliminated.map((x) => [x.id, x.eliminatedIn]),
    [["alpha", 1]],
  );
  assert.equal(next.entrants[0].id, "s0002-new-01");
  assert.equal(next.entrants[0].parent, "bravo");
  assert.equal(next.entrants[0].policy.rolloutHorizon, 135);
  assert.equal(fingerprint({ rolloutHorizon: 150 }), fingerprint({}));
});
