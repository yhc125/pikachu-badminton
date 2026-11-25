import assert from "node:assert/strict";
import { test } from "node:test";
import { faceoffGate, replaySeeds } from "./faceoff.mjs";

test("faceoff requires a winning record plus a completed receiving win", () => {
  const games = [
    { side: 0, server: 1, score: [11, 0] },
    { side: 0, server: 2, score: [11, 9] },
    { side: 1, server: 1, score: [11, 4] },
    { side: 1, server: 2, score: [7, 11] },
  ];
  assert.deepEqual(faceoffGate(games), { receivingWins: 1, passed: true });
  games[1].timeout = true;
  assert.deepEqual(faceoffGate(games), { receivingWins: 0, passed: false });
  games[1].timeout = false;
  games[2].timeout = true;
  assert.deepEqual(faceoffGate(games), { receivingWins: 1, passed: false });
  assert.throws(() => faceoffGate(games.slice(1)), /four/);
});

test("seed selection avoids the training seeds and covers both first servers", () => {
  const seeds = replaySeeds((side, i) => (side ? 1728 + i : 1 + i));
  assert.deepEqual(seeds, [2, 1729]);
});
