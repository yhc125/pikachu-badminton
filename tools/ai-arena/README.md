# Pika AI Labs

Local, resumable champion/challenger experiments on the **real game engine**. This branch does not change the deployed game, CPU stats, multiplayer rules, or default benchmark bot. Requires Node.js 22+ and no dependencies.

## Run it

```sh
# One headless match against the released AI Unlimited CPU.
node tools/ai-arena/lab.mjs match --right=unlimited:cpu

# Train five generations. Repeat the same command to resume for five more.
node tools/ai-arena/lab.mjs evolve --generations=5 --jobs=4
node tools/ai-arena/lab.mjs status

# Freeze the latest completed champion and audit it with a fresh case set.
node tools/ai-arena/lab.mjs audit --token=release-1 --cases=12 --jobs=4

# Play the saved champion against the original pilot. Use --game-seed=1 or 1728
# for 1P or 2P to serve first. Swap the two policy arguments to check court effects.
node tools/ai-arena/lab.mjs match --left=.ai-lab/champion.json --right=baseline
```

`--dir=path` creates a separate experiment. The default `.ai-lab/` is gitignored.
A generation log includes all candidate parameter values, case manifests, per-match scores,
side, first server, skill counts, and promotion decision. Completed generations are
committed to local JSON files by atomic rename; an interrupted generation can be rerun.
Use a new directory when the engine, Node version, or the run configuration changes.
Changing `--generations` or `--jobs` is safe on resume. After a hard kill, remove a stale
`evolve.lock` only after verifying the listed PID is no longer running.

## How selection works

1. Mutate the incumbent's guard, serve and receive position, smash preference, or zap
   timing/distance. The win rate, with an additional timeout penalty, selects one challenger.
2. Re-evaluate that challenger and incumbent on a fresh common set of opponents. Promote
   only with at least **+10 percentage points** win rate, no increase in timeouts, at least
   as many wins as losses, **and** at least 3 wins in 4 completed direct games vs the incumbent.
3. Use a separately named audit only after locking a champion. Don't tune against it.

Policy-v-policy uses independent read-only views, mirrors keys for the right-hand pilot,
and runs both courts and both first servers (four cases per opponent configuration). Stock
CPU comparisons are **fixed-side** because the built-in CPU can only drive 2P. AI Unlimited
provides a base-stat benchmark; AI Korean is deliberately an additional boosted stress test.
Varying engine seeds alone doesn't diversify deterministic policy-v-policy games, so the
training and audit sets also vary opponent policy parameters. These are small search samples,
not statistically independent game populations or proof of a globally optimal policy.

Counts are observed at tick boundaries: contacts and Iron Tails, jumps/dashes, zap fires
and zap stuns. These are useful diagnostics, not the selection objective. They can miss
same-tick/cancelled actions. Timeouts never count as wins. Tick boundaries, random seeds,
case arguments, and the code/runtime revision are logged; native CPU decisions currently
share the same seeded `Math.random()` stream as cosmetic effects.

## Next experiments

The current loop improves bounded numeric parameters; it does not rewrite code or use an
LLM. Try code-level candidates (e.g. opponent landing prediction for zaps, multi-shot
lookahead, better reset position after dashes) in separate branches/run directories.
Keep the benchmark manifests matched, compare worst-opponent as well as total win rate,
and keep a final audit off the tuning path. For a longer job, invoke a larger **bounded**
`--generations` count or resume in a terminal; no hosted runner is set up by this branch.

## Experimental rollout policy

```sh
# Try the candidate against the released CPU.
node tools/ai-arena/lab.mjs match --left=rollout --right=unlimited:cpu

# Compare with the incumbent using a fresh common set of opponents and a
# four-game direct duel; writes a report without changing champion.json.
node tools/ai-arena/lab.mjs challenge --dir=.ai-lab/rollout --token=rollout-v1 --cases=5 --jobs=6

# Include the rollout candidate in a resumable search; only the usual gate can promote it.
node tools/ai-arena/lab.mjs evolve --dir=.ai-lab/rollout-evolution --challenger=rollout --generations=2
```

At selected decision points, the candidate tests ground drops, drives, clears
and lobs; jump/dash versus staying grounded; and firing a zap versus recovery.
The forecasts use a separate copy of the actual engine and a common starting
state and RNG cursor. Stock CPU forecasts restore the CPU's planning state;
pilot opponents replan using the ordinary, non-recursive policy. This is a
bounded forecast, not an exact replay of any opponent's hidden future decisions.

A finished rollout scores **+1 for winning the point, -1 for losing**. An unresolved
branch is scored 0 and ties default to the original action, except equally winning
branches can prefer not to spend a skill. No reward is given for a zap hit, a smash,
or using up time. This version has no learned win-probability model: the separate
`evolve` command can search parameters but the rollout choices themselves are
lookahead, not neural training. A policy JSON can set `planner: "rollout"` and
`rolloutHorizon` (72–180 ticks, default 108).

The challenger does not replace the baseline automatically. Match and challenge
logs include rollout decisions, selected action types, adjudicated branches, and
sample state hashes. Existing checkpoint runs have a different code revision;
use a new directory for the rollout experiment.

See [the fixed evaluation results](ROLLOUT_RESULTS.md) for the first comparison.
