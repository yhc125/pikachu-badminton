import assert from "node:assert/strict";
import { execFile as execFileCb } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { baseline, bounds, validatePolicy } from "./policy.mjs";

const worker = fileURLToPath(new URL("./match.mjs", import.meta.url));
const execFile = promisify(execFileCb);
const native = ["unlimited:cpu", "korean"];
const opts = Object.fromEntries(
  process.argv.slice(3).map((arg) => {
    const m = /^--([a-z-]+)=(.+)$/.exec(arg);
    assert.ok(m, `Expected --name=value, got ${arg}`);
    return m.slice(1);
  }),
);
const command = process.argv[2] ?? "status";
const known = new Set([
  "dir",
  "generations",
  "candidates",
  "cases",
  "jobs",
  "left",
  "right",
  "game-seed",
  "cpu-seed",
  "max-ticks",
  "seed",
  "token",
]);
for (const k of Object.keys(opts)) assert.ok(known.has(k), `Unknown option: ${k}`);
const int = (key, fallback, lo = 1, hi = 10000) => {
  const n = Number(opts[key] ?? fallback);
  assert.ok(Number.isInteger(n) && n >= lo && n <= hi, `Invalid --${key}: ${n}`);
  return n;
};
const dir = resolve(opts.dir ?? ".ai-lab");
const maxTicks = int("max-ticks", 4800, 600, 30000);
const jobs = int("jobs", 4, 1, 16);
const root = new URL("../../", import.meta.url);
const revisionFiles = [
  "badminton/game.js",
  "badminton/detmath.js",
  "tools/korean-shutout/load-game.mjs",
  "tools/korean-shutout/pilot.mjs",
  "tools/ai-arena/match.mjs",
  "tools/ai-arena/policy.mjs",
  "tools/ai-arena/lab.mjs",
];
const hash = createHash("sha256").update(process.version);
for (const f of revisionFiles) hash.update(await readFile(new URL(f, root)));
const revision = hash.digest("hex").slice(0, 16);
const random = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const mixed = (...words) => createHash("sha256").update(words.join("|")).digest().readUInt32LE(0);
const choose = (rng, x) => x[Math.floor(rng() * x.length)];
const tidy = (x, k) =>
  +Math.max(bounds[k][0], Math.min(bounds[k][1], x)).toFixed(k === "zapLead" ? 2 : 0);
const rounds = (base, seed, total) => {
  const rng = random(seed),
    out = [];
  const already = new Set([JSON.stringify(base)]);
  while (out.length < total) {
    const v = { ...base };
    const count = 1 + Math.floor(rng() * 4);
    const keys = Object.keys(bounds);
    for (let j = 0; j < count; j++) {
      const k = keys.splice(Math.floor(rng() * keys.length), 1)[0];
      const [lo, hi] = bounds[k];
      v[k] =
        k === "zapLead" && rng() < 0.25
          ? null
          : tidy((v[k] ?? 0.22) + (rng() * 2 - 1) * (hi - lo) * 0.35, k);
    }
    const s = JSON.stringify(v);
    if (!already.has(s)) {
      already.add(s);
      out.push(validatePolicy(v));
    }
  }
  return out;
};
const loadPolicy = async (name) =>
  name == null || name === "baseline"
    ? baseline
    : native.includes(name)
      ? name
      : validatePolicy(JSON.parse(await readFile(name, "utf8")));
async function match(args) {
  const { stdout } = await execFile(
    process.execPath,
    [worker, JSON.stringify({ maxTicks, ...args })],
    { timeout: 90000 },
  );
  return JSON.parse(stdout);
}
async function runJobs(list, fn) {
  const results = new Array(list.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(jobs, list.length) }, async () => {
      while (next < list.length) {
        const i = next++;
        results[i] = await fn(list[i]);
      }
    }),
  );
  return results;
}
function makeCases(phase, generation, seed, size) {
  const rng = random(mixed(seed, phase, generation));
  // Changing stock CPU seeds affects decisions, but pilot-v-pilot uses diverse opponents,
  // because changing the engine seed alone typically changes only the first server.
  return Array.from({ length: size }, (_, i) => ({
    index: i,
    cpuSeed: 1 + Math.floor(rng() * 0xfffffffe),
    opponent:
      i % 3 === 0
        ? choose(rng, native)
        : rounds(
            validatePolicy({
              guardX: 95 + Math.round(rng() * 48),
              smashBonus: i % 3 === 1 ? -42 : 8,
              serveLob: i % 3 === 1 ? 40 : 0,
              serveDrop: i % 3 === 2 ? 42 : 0,
              zapLead: i % 2 ? 0.26 : 0.15,
            }),
            (rng() * 2 ** 32) >>> 0,
            1,
          )[0],
  }));
}
async function series(policy, cases) {
  const jobspec = [];
  for (const c of cases) {
    const sides = typeof c.opponent === "string" ? [0] : [0, 1];
    for (const side of sides) for (const gameSeed of [1, 1728]) jobspec.push({ c, side, gameSeed });
  }
  const records = await runJobs(jobspec, async ({ c, side, gameSeed }) => {
    const args = {
      left: side === 0 ? policy : c.opponent,
      right: side === 0 ? c.opponent : policy,
      gameSeed,
      cpuSeed: c.cpuSeed,
    };
    return {
      case: c.index,
      side,
      opponent: typeof c.opponent === "string" ? c.opponent : "pilot",
      args,
      ...(await match(args)),
    };
  });
  const n = records.length,
    totals = {
      wins: 0,
      losses: 0,
      timeouts: 0,
      points: 0,
      against: 0,
      zapFired: 0,
      zapHit: 0,
      tail: 0,
      dash: 0,
    };
  for (const r of records) {
    const side = r.side,
      ours = r.score[side],
      theirs = r.score[1 - side];
    totals.points += ours;
    totals.against += theirs;
    if (r.timeout) totals.timeouts++;
    else if (ours > theirs) totals.wins++;
    else totals.losses++;
    for (const k of ["zapFired", "zapHit", "tail", "dash"]) totals[k] += r.counts[side][k];
  }
  return {
    n,
    ...totals,
    rate: totals.wins / n,
    margin: (totals.points - totals.against) / n,
    records,
  };
}
const summary = ({ records: _, ...rest }) => rest;
// Timeouts are never wins. Their provisional scores are not used to select a policy.
const merit = (r) => r.rate - (0.25 * r.timeouts) / r.n;
const journal = async () => (await readdir(dir)).filter((k) => /^gen-\d{6}\.json$/.test(k)).sort();
const fromFile = async (p) => JSON.parse(await readFile(p, "utf8"));
const atomic = async (p, value) => {
  const tmp = `${p}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
  await rename(tmp, p);
};
async function latest() {
  const files = await journal();
  return files.length ? fromFile(join(dir, files.at(-1))) : null;
}
function gate(leader, candidate) {
  return (
    candidate.rate >= leader.rate + 0.1 - 1e-12 &&
    candidate.timeouts <= leader.timeouts &&
    candidate.wins >= candidate.losses
  );
}
if (command === "match") {
  const left = await loadPolicy(opts.left),
    right = await loadPolicy(opts.right ?? "unlimited:cpu");
  console.log(
    JSON.stringify(
      {
        revision,
        node: process.version,
        left,
        right,
        ...(await match({
          left,
          right,
          gameSeed: int("game-seed", 1728, 1, 0xffffffff),
          cpuSeed: int("cpu-seed", 1, 1, 0xffffffff),
        })),
      },
      null,
      2,
    ),
  );
} else if (command === "evolve") {
  await mkdir(dir, { recursive: true });
  const lock = join(dir, "evolve.lock");
  const fd = await open(lock, "wx");
  try {
    await fd.writeFile(`${process.pid}\n`);
    const prev = await latest();
    const setup = {
      seed: int("seed", 43271, 1, 0xffffffff),
      cases: int("cases", 4, 2, 30),
      candidates: int("candidates", 3, 1, 40),
      maxTicks,
    };
    if (prev) {
      assert.equal(prev.revision, revision, "Code/runtime changed; use a new --dir");
      assert.deepEqual(setup, prev.setup, "Run configuration changed; use a new --dir");
    }
    let champion = prev?.champion ?? baseline;
    const initial = (prev?.generation ?? 0) + 1;
    for (let g = initial; g < initial + int("generations", 2, 1, 1000); g++) {
      const trainCases = makeCases("train", g, setup.seed, setup.cases);
      const gateCases = makeCases("gate", g, setup.seed, setup.cases);
      const candidates = [
        champion,
        ...rounds(champion, mixed(setup.seed, "mutate", g), setup.candidates),
      ];
      const training = [];
      for (const policy of candidates)
        training.push({ policy, result: await series(policy, trainCases) });
      const best = training.slice(1).sort((a, b) => merit(b.result) - merit(a.result))[0];
      const improved = merit(best.result) > merit(training[0].result) + 1e-12;
      const records = {};
      let promoted = false;
      if (improved) {
        records.anchor = await series(champion, gateCases);
        records.challenger = await series(best.policy, gateCases);
        // Also play the incumbent head to head: both sides, both first servers.
        records.duel = await series(best.policy, [
          { index: 0, opponent: champion, cpuSeed: mixed(setup.seed, "duel", g) },
        ]);
        promoted =
          gate(records.anchor, records.challenger) &&
          records.duel.wins >= 3 &&
          records.duel.timeouts === 0;
      }
      const before = champion;
      if (promoted) champion = best.policy;
      const state = {
        gated: improved,
        generation: g,
        revision,
        node: process.version,
        setup,
        champion,
        before,
        promoted,
        trainCases,
        gateCases,
        training,
        records,
      };
      await atomic(join(dir, `gen-${String(g).padStart(6, "0")}.json`), state);
      await atomic(join(dir, "champion.json"), champion);
      console.log(
        JSON.stringify({
          generation: g,
          promoted,
          train: training.map((x) => summary(x.result)),
          gate: Object.fromEntries(Object.entries(records).map(([k, v]) => [k, summary(v)])),
          champion,
        }),
      );
    }
  } finally {
    await fd.close();
    await rm(lock, { force: true });
  }
} else if (command === "audit" || command === "status") {
  const state = await latest().catch((e) => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (command === "status")
    console.log(
      JSON.stringify(
        state
          ? {
              generation: state.generation,
              revision: state.revision,
              promoted: state.promoted,
              champion: state.champion,
              logs: dir,
            }
          : { generation: 0, champion: baseline, logs: dir },
        null,
        2,
      ),
    );
  else {
    assert.ok(state, "Run evolve first");
    assert.equal(state.revision, revision, "Code/runtime changed; start a new run");
    assert.equal(state.setup.maxTicks, maxTicks, "Use the training --max-ticks");
    const token = opts.token;
    assert.ok(
      token && /^[a-z0-9_-]{1,60}$/i.test(token),
      "Supply a fresh --token=name for this audit",
    );
    const auditPath = join(dir, `audit-${token}.json`);
    // Reserve this audit name once so it cannot silently become a training target.
    const fd = await open(auditPath, "wx");
    await fd.close();
    const cases = makeCases(`audit:${token}`, 0, state.setup.seed, int("cases", 6, 2, 30));
    const result = await series(state.champion, cases);
    await atomic(auditPath, {
      generation: state.generation,
      revision,
      champion: state.champion,
      cases,
      result,
    });
    console.log(JSON.stringify(summary(result), null, 2));
  }
} else throw Error("Commands: match, evolve, status, audit");
