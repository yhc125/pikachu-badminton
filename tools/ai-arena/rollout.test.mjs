import assert from "node:assert/strict";
import { test } from "node:test";
import { match, loadRolloutGame } from "../korean-shutout/load-game.mjs";
import { makeRollout } from "./rollout.mjs";
import { validatePolicy } from "./policy.mjs";

test("real-engine forecasts reject a net fault without changing the live game or its inputs", async () => {
  const { game, P1, step, pressed, held, keyDown, keyUp } = match;
  game.rng = 1;
  keyDown("Enter");
  keyUp("Enter");
  step(1 / 60);
  pressed.clear();
  assert.equal(game.server, P1);
  assert.equal(game.state, "serve");
  keyDown("ArrowLeft");
  keyDown("KeyK");
  keyUp("KeyK");
  const before = match.saveState(),
    heldBefore = [...held],
    pressedBefore = [...pressed],
    random = Math.random;
  const fork = await loadRolloutGame();
  assert.notEqual(fork.P1, P1);
  assert.equal(globalThis.__pika, match);
  const planner = await makeRollout(
    match,
    (engine) => ({
      prime(a) {
        for (const k of a.held) engine.keyDown(k);
        for (const k of a.pulses) {
          engine.keyDown(k);
          engine.keyUp(k);
        }
      },
      tick() {},
    }),
    () => 159,
    null,
  );
  const choose = planner.forSide(
    1,
    validatePolicy({ planner: "rollout", rolloutHorizon: 180 }),
    {},
  );
  const drop = { id: "drop", held: ["KeyS"], pulses: ["KeyF"] };
  const lob = { id: "lob", held: ["KeyA"], pulses: ["KeyF"] };
  assert.equal(choose("shot", [drop, lob]), lob);
  assert.equal(choose("shot", [lob, drop]), lob);
  assert.equal(planner.report[0].wins, 2);
  assert.equal(planner.report[0].losses, 2);
  assert.deepEqual(match.saveState(), before);
  assert.deepEqual([...held], heldBefore);
  assert.deepEqual([...pressed], pressedBefore);
  assert.equal(Math.random, random);
});
