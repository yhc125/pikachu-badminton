import assert from "node:assert/strict";
import { match } from "../korean-shutout/load-game.mjs";
import { makePilot } from "../korean-shutout/pilot.mjs";
import { validatePolicy } from "./policy.mjs";
import { makeRollout } from "./rollout.mjs";

const keyMirror = {
  KeyA: "ArrowRight",
  KeyD: "ArrowLeft",
  KeyW: "ArrowUp",
  KeyS: "ArrowDown",
  KeyF: "KeyK",
  KeyH: "Semicolon",
  KeyG: "KeyL",
};
const dt = 1 / 60,
  WIDTH = 384;
const metrics = () => ({ shots: 0, tail: 0, dash: 0, zapFired: 0, zapHit: 0, jump: 0 });

function asPilot(engine, side, config, chooseAction = null) {
  const { game, P1, P2, S, bolts, keyDown, keyUp } = engine;
  const flip = side === 2;
  const viewPlayer = (p) =>
    Object.freeze({
      get x() {
        return flip ? WIDTH - p.x : p.x;
      },
      get y() {
        return p.y;
      },
      get vx() {
        return flip ? -p.vx : p.vx;
      },
      get vy() {
        return p.vy;
      },
      get face() {
        return flip ? -p.face : p.face;
      },
      get ground() {
        return p.ground;
      },
      get quickT() {
        return p.quickT;
      },
      get dashX() {
        return flip ? -p.dashX : p.dashX;
      },
      get dashY() {
        return p.dashY;
      },
      get iframes() {
        return p.iframes;
      },
      get act() {
        return p.act && Object.freeze({ ...p.act });
      },
      get cd() {
        return Object.freeze({ ...p.cd });
      },
      get noHit() {
        return p.noHit;
      },
      get stun() {
        return p.stun;
      },
      get knocked() {
        return p.knocked;
      },
    });
  const left = viewPlayer(P1),
    right = viewPlayer(P2);
  const ref = (p) => (p === P1 ? left : p === P2 ? right : null);
  const observations = {
    P1: flip ? right : left,
    P2: flip ? left : right,
    game: Object.freeze({
      get time() {
        return game.time;
      },
      get state() {
        return game.state;
      },
      get freeze() {
        return game.freeze;
      },
      get paused() {
        return game.paused;
      },
      get server() {
        return ref(game.server);
      },
    }),
    S: Object.freeze({
      get x() {
        return flip ? WIDTH - S.x : S.x;
      },
      get y() {
        return S.y;
      },
      get vx() {
        return flip ? -S.vx : S.vx;
      },
      get vy() {
        return S.vy;
      },
      get state() {
        return S.state;
      },
      get last() {
        return ref(S.last);
      },
    }),
    // Keep the same collection identity because the pilot captures it once.
    bolts: [],
  };
  const pilot = makePilot(
    observations,
    (type, key) => {
      assert.ok(Object.hasOwn(keyMirror, key), `Unsupported pilot key: ${key}`);
      const physical = flip ? keyMirror[key] : key;
      if (type === "keydown") keyDown(physical);
      else keyUp(physical);
    },
    {
      ...validatePolicy(config),
      ...(chooseAction ? { smashBonus: 0, serveLob: 0, serveDrop: 0, chooseAction } : {}),
    },
  );
  return {
    prime: pilot.prime,
    tick() {
      observations.bolts.length = 0;
      for (const b of bolts)
        observations.bolts.push(
          Object.freeze({
            owner: ref(b.owner),
            x: flip ? WIDTH - b.x : b.x,
            y: b.y,
            vx: flip ? -b.vx : b.vx,
            life: b.life,
          }),
        );
      pilot.tick();
    },
  };
}

// Worker runs a single match to avoid mutable state leaking across matches.
export async function play({ left, right, gameSeed, cpuSeed, maxTicks = 15_000 }) {
  const { game, P1, P2, S, pressed, keyDown, keyUp, setAI, step, aiLevels } = match;
  assert.ok(typeof left === "object" && left !== null, "Left uses a pilot policy");
  const native = typeof right === "string";
  assert.ok(!native || Object.hasOwn(aiLevels, right), `Unknown opponent: ${right}`);
  left = validatePolicy(left);
  if (!native) right = validatePolicy(right);
  setAI(native ? right : null);
  const unseeded = Math.random;
  let rng = cpuSeed >>> 0;
  const useRollout = left.planner === "rollout" || right?.planner === "rollout";
  const rollout =
    useRollout && (await makeRollout(match, asPilot, () => rng, native ? right : null));
  const choose = (side, config, opponent) =>
    config.planner === "rollout" ? rollout.forSide(side, config, opponent) : null;
  const pilots = [
    asPilot(match, 1, left, choose(1, left, native ? null : right)),
    ...(native ? [] : [asPilot(match, 2, right, choose(2, right, left))]),
  ];
  Math.random = () => (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  try {
    game.rng = gameSeed >>> 0;
    keyDown("Enter");
    keyUp("Enter");
    const ps = [P1, P2],
      counts = [metrics(), metrics()],
      crossed = [false, false];
    let server,
      ticks = 0;
    for (; ticks < maxTicks && game.state !== "over"; ticks++) {
      const prevOwner = S.last;
      const before = ps.map((p) => ({
        ground: p.ground,
        dash: p.quickT,
        stunN: p.stunN,
        act: p.act,
        fired: p.act?.fired,
      }));
      step(dt);
      pressed.clear();
      server ??= game.server.id;
      crossed[0] ||= P1.x > 192;
      crossed[1] ||= P2.x < 192;
      for (const [i, p] of ps.entries()) {
        const c = counts[i],
          old = before[i];
        if (S.last === p && prevOwner !== p) {
          c.shots++;
          if (S.smash > 0) c.tail++;
        }
        if (p.quickT > 0 && old.dash <= 0) c.dash++;
        if (old.ground && !p.ground && p.vy < 0 && p.quickT <= 0 && !p.knocked) c.jump++;
        if (p.act?.type === "zap" && p.act.fired && (old.act !== p.act || !old.fired)) c.zapFired++;
        if (p.stunN !== old.stunN && p.stunKind === "zap") counts[1 - i].zapHit++;
      }
      for (const p of pilots) p.tick();
    }
    return {
      score: [P1.score, P2.score],
      ticks,
      timeout: game.state !== "over",
      server,
      counts,
      crossed,
      ...(rollout ? { evaluation: rollout.report } : {}),
      power: [1, native ? (aiLevels[right].pow ?? 1) : 1],
    };
  } finally {
    Math.random = unseeded;
  }
}

if (process.argv[2]) console.log(JSON.stringify(await play(JSON.parse(process.argv[2]))));
