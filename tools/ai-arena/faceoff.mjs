import assert from "node:assert/strict";

export function replaySeeds(draw) {
  return [0, 1].map((side) => {
    for (let i = 0; i < 64; i++) {
      const seed = draw(side, i);
      // The engine's first LCG draw chooses the first server. Avoid the standard league seeds.
      if (
        seed &&
        seed !== 1 &&
        seed !== 1728 &&
        (Math.imul(seed, 1664525) + 1013904223) >>> 31 === side
      )
        return seed;
    }
    throw Error("Could not generate a first-server seed");
  });
}

export function faceoffGate(records) {
  const slots = new Set(records.map(({ side, server }) => `${side}/${server}`));
  assert.equal(records.length, 4, "Expected four matches per opponent");
  for (const slot of ["0/1", "0/2", "1/1", "1/2"])
    assert.ok(slots.has(slot), `Missing faceoff slot ${slot}`);
  const winners = records.filter((r) => !r.timeout && r.score[r.side] > r.score[1 - r.side]);
  const receivingWins = winners.filter((r) => r.side + 1 !== r.server).length;
  return {
    receivingWins,
    passed: winners.length >= 3 && receivingWins > 0 && !records.some((r) => r.timeout),
  };
}
