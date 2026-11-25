import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { validatePolicy } from "./policy.mjs";

const worker = fileURLToPath(new URL("./match.mjs", import.meta.url));
const match = (args) =>
  JSON.parse(execFileSync(process.execPath, [worker, JSON.stringify(args)], { encoding: "utf8" }));

test("policy config rejects bad values and unknown fields", () => {
  assert.throws(() => validatePolicy({ ownCourt: false }), /Unknown/);
  assert.throws(() => validatePolicy({ zapLead: 3 }), /Invalid/);
  assert.equal(validatePolicy({}).zapLead, null);
});

test("identical seeds give identical scores and skill counters against stock CPU", () => {
  const args = { left: {}, right: "unlimited:cpu", gameSeed: 1728, cpuSeed: 1, maxTicks: 3600 };
  const first = match(args),
    second = match(args);
  assert.deepEqual(second, first);
  assert.equal(first.timeout, false);
  assert.equal(first.server, 2);
  assert.deepEqual(first.power, [1, 1]);
  assert.ok(first.counts[0].tail > 0 && first.counts[0].dash > 0);
  assert.ok(first.counts[1].zapFired > 0);
});

test("mirrored pilots can independently serve and rally without crossing", () => {
  for (const gameSeed of [1, 1728]) {
    const { server, timeout, crossed, counts } = match({
      left: {},
      right: {},
      gameSeed,
      cpuSeed: 5,
      maxTicks: 600,
    });
    assert.equal(server, gameSeed === 1 ? 1 : 2);
    assert.equal(timeout, true);
    assert.deepEqual(crossed, [false, false]);
    assert.ok(counts.every((c) => c.shots > 0 && c.tail > 0));
  }
});
