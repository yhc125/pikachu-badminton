// Offline reference player for the Korean-mode benchmark. Reads snapshots and emits only 1P key input.
export function makePilot(
  w,
  sendEvent,
  {
    zapLead = null,
    guardX = 110,
    receiveX = 105,
    serveX = 134,
    smashBonus = 2,
    serveDrop = 0,
    serveLob = 0,
    zapDistance = 25,
  } = {},
) {
  const { game: g, P1: p, P2: o, S: s, bolts } = w,
    dt = 1 / 60;
  const L = "KeyA",
    R = "KeyD",
    U = "KeyW",
    D = "KeyS",
    F = "KeyF",
    H = "KeyH";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dir = (x, t = 1) => (x > t ? R : x < -t ? L : "");
  const xsign = (k) => (k === R ? 1 : k === L ? -1 : 0);
  const clean = (a) => a.filter(Boolean);
  const OWN_LIMIT = 188;
  // Integrate candidate shuttle paths, including drag, gravity, floor and net.
  function path(q, n = 150) {
    let { x, y, vx, vy } = q,
      a = [];
    for (let i = 0; i < n; i++) {
      a.push({ x, y, vx, vy });
      if (y >= 196) break;
      for (let j = 0; j < 4; j++) {
        const v = Math.hypot(vx, vy),
          px = x;
        vx -= (0.0028 * v * vx) / 240;
        vy += (420 - 0.0028 * v * vy) / 240;
        x += vx / 240;
        y += vy / 240;
        if ((px - 192) * (x - 192) <= 0 && px !== x && y > 160) {
          x = px;
          vx *= -0.15;
          vy = Math.max(vy, 0) * 0.4;
        }
        if (y >= 196) break;
      }
    }
    return a;
  }
  function shot(q, key, air, face) {
    const { x, y } = q,
      d = face > 0 ? 368 - x : x - 16,
      h = 196 - y,
      ahead = (192 - x) * face;
    let sp, a;
    if (air) {
      sp = 560;
      a =
        ahead > 4
          ? Math.max(-40, Math.min(20, (Math.atan2(150 - y, ahead) * 180) / Math.PI - 3))
          : 20;
    } else if (key === D) {
      sp = 220;
      a = -34;
    } else if (xsign(key) * face === 1) {
      sp = clamp(40 + 1.607 * d - 1.283 * h, 260, 560);
      a = -22;
    } else if (xsign(key) * face === -1) {
      sp = clamp(-217 + 3.302 * d - 0.453 * h, 300, 640);
      a = -68;
    } else {
      sp = clamp(-7 + 1.714 * d - 0.575 * h, 250, 560);
      a = -52;
    }
    a = (a * Math.PI) / 180;
    return path({ x, y, vx: Math.cos(a) * sp * face, vy: Math.sin(a) * sp });
  }
  // Favor an in-court landing that gives the CPU the least time for an intercept.
  function oppValue(f, air, contact, ox = o.x) {
    const end = f.at(-1);
    if (end.y < 196 || end.x < 194 || end.x > 367) return -220;
    let spare = -9;
    const dash = o.cd.quick <= contact / 60 + 0.28;
    const stun = Math.max(0, o.stun - contact / 60);
    const ay = o.ground ? 0 : o.y - 196;
    for (let j = 2; j < f.length - 1; j++) {
      const b = f[j];
      if (b.x < 199 || b.y < 104) continue;
      const jump =
        b.y < 154
          ? Math.min(0.34, Math.max(0, (160 - b.y + (ay ? Math.min(ay + 15, 0) : 0)) / 165))
          : 0;
      const distance = Math.max(0, Math.abs(clamp(b.x + 12, 201, 369) - ox) - 19),
        run = distance / 132.25,
        move = dash ? Math.min(run, 0.15 + Math.max(0, distance - 67) / 132.25) : run;
      spare = Math.max(spare, j / 60 - Math.max(jump, move) - stun);
    }
    let val = spare === -9 ? 140 : -spare * 100;
    val += Math.min(70, Math.abs(end.x - ox)) * 0.17;
    if (air) val += smashBonus;
    return val;
  }
  let sent = new Set(),
    last = -1,
    lastOwner = null,
    plan = null,
    attackHold = "",
    n = 0,
    lastPlan = -999;
  function send(held = [], pulses = []) {
    if (p.x >= 187.5 && pulses.includes(H) && held.includes(R))
      pulses = pulses.filter((k) => k !== H);
    if (p.x >= OWN_LIMIT) held = held.filter((k) => k !== R);
    const h = new Set(clean(held));
    for (const a of sent) if (!h.has(a)) sendEvent("keyup", a);
    for (const a of h) if (!sent.has(a)) sendEvent("keydown", a);
    sent = h;
    for (const a of clean(pulses)) {
      sendEvent("keydown", a);
      if (!h.has(a)) sendEvent("keyup", a);
    }
  }
  function bulletAt(x, y, j) {
    if (p.iframes > j * dt + 0.04) return false;
    for (const b of bolts) {
      if (b.owner === p || b.life < j * dt - 0.01) continue;
      const dx = Math.max(0, Math.abs(b.x + b.vx * j * dt - x) - 11),
        dy = Math.max(0, Math.abs(b.y - y + 14) - 14);
      if (dx * dx + dy * dy <= 31) return true;
    }
    return false;
  }
  const dashDirections = [
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, -1],
    [-1, -1],
    [0, 1],
    [1, 1],
    [-1, 1],
  ];
  function vert(mode, max) {
    let y = p.y,
      v = p.vy,
      ground = p.ground,
      q = p.quickT,
      dx = p.dashX,
      dy = p.dashY,
      vx = p.vx,
      ys = [y],
      dq = [0],
      run = [0],
      dead = [false];
    for (let i = 1; i <= max; i++) {
      if (i === 1 && mode.dash) {
        [dx, dy] = mode.dash;
        const h = Math.hypot(dx, dy);
        dx /= h;
        dy /= h;
        q = 0.15;
        vx = dx * 470;
        v = dy * 470;
        if (dy < 0) ground = false;
      }
      if (mode.jump === i && q <= 0 && ground) {
        v = -330;
        ground = false;
      }
      let d = 0,
        r = 0;
      if (q > 0) {
        q -= dt;
        if (q <= 0) v = dy * 120;
        d = vx * dt;
      } else r = 115 * dt;
      if (q <= 0) v += 900 * dt;
      y += v * dt;
      if (y < 24) {
        y = 24;
        v = Math.max(v, 0);
      }
      if (y >= 196) {
        y = 196;
        v = 0;
        ground = true;
      } else ground = false;
      ys.push(y);
      dq.push(dq[i - 1] + d);
      run.push(run[i - 1] + r);
      dead.push(q > 0);
    }
    return { ys, dq, run, dead };
  }
  // Search future swing frames, legal shot directions, walk targets and jump/dash options.
  function choose(flight) {
    const max = Math.min(98, flight.length),
      end = flight.at(-1),
      fight = Math.max(0, (o.x - 202) * 0.03);
    if (max < 3) return null;
    const modes = [{ jump: 0 }];
    if (p.ground) {
      for (let i = 1; i < Math.min(42, max); i += 4) modes.push({ jump: i });
    } else if (p.vy > 0) {
      let yi = p.y,
        vi = p.vy,
        j = 1;
      while (yi < 196 && j < 40) {
        vi += 900 * dt;
        yi += vi * dt;
        j++;
      }
      if (j + 5 < max) modes.push({ jump: j + 1 }, { jump: j + 5 }, { jump: j + 10 });
    }
    if (p.cd.quick <= dt && p.quickT <= 0) {
      for (const d of dashDirections) {
        if (p.ground && d[1] > 0) continue;
        modes.push({ dash: d });
      }
    }
    const cache = new Map();
    let best = null;
    for (const mode of modes) {
      const { ys, dq, run, dead } = vert(mode, max);
      for (let start = 1; start < max - 1; start += start < 13 ? 1 : 2) {
        if (
          dead[start - 1] ||
          start * dt < p.noHit - dt ||
          (p.act &&
            start * dt <
              (p.act.type === "basic" ? 0.26 : p.act.type === "tail" ? 0.5 : 0.24) - p.act.t - dt)
        )
          continue;
        if (
          mode.dash &&
          mode.dash[0] > 0 &&
          p.x + 80 * (mode.dash[1] ? Math.SQRT1_2 : 1) > OWN_LIMIT
        )
          continue;
        const base = clamp(p.x + dq[start - 1], 12, OWN_LIMIT),
          dist = run[start - 1];
        const minx = clamp(base - dist, 12, OWN_LIMIT),
          maxx = clamp(base + dist, 12, OWN_LIMIT);
        if (maxx - minx < 0) continue;
        const contactFrame = start + 1;
        if (
          Math.min(
            flight[contactFrame - 1]?.x ?? 999,
            flight[Math.min(start + 8, max - 1)]?.x ?? 999,
          ) >
          o.x + 18
        )
          continue;
        const keys =
          ys[contactFrame] < 194 && ys[Math.min(start + 8, max)] < 194 ? ["", L, R] : ["", L, R, D];
        for (const key of keys) {
          const rate = (xsign(key) * 115 * 0.55) / 60;
          const faces = maxx < o.x - 5 ? [1] : minx > o.x + 5 ? [-1] : [1, -1];
          for (const face of faces) {
            const minFace = face > 0 ? minx : Math.max(minx, o.x - 2),
              maxFace = face > 0 ? Math.min(maxx, o.x + 2) : maxx;
            if (minFace > maxFace) continue;
            for (let j = contactFrame; j <= Math.min(max - 1, start + 8); j++) {
              const q = flight[j - 1];
              if (!q || q.y >= 196 || (end.x > 192 && end.x < 368 && q.x > o.x + 12)) continue;
              const dy = q.y - ys[j] + 18,
                reach2 = 20.3 ** 2 - dy ** 2;
              if (reach2 < 0) continue;
              const ctr = q.x - 12 * face - rate * (j - start + 1),
                reach = Math.sqrt(reach2);
              if (ctr + reach < minFace - 0.1 || ctr - reach > maxFace + 0.1) continue;
              for (const target0 of [ctr, ctr - reach * 0.68, ctr + reach * 0.68]) {
                const target = clamp(target0, minFace, maxFace);
                const step = 115 / 60;
                const tx = clamp(
                  base + Math.round((target - base) / step) * step,
                  minFace,
                  maxFace,
                );
                let idx = 0,
                  margin = 0;
                for (let t = contactFrame; t <= j; t++) {
                  const r = flight[t - 1];
                  const px = clamp(tx + rate * (t - start + 1), 12, 372),
                    gap = Math.hypot(r.x - px - 12 * face, r.y - ys[t] + 18);
                  if (gap < 20.65) {
                    idx = t;
                    margin = 21 - gap;
                    break;
                  }
                }
                if (!idx) continue;
                const z = flight[idx - 1],
                  air = ys[idx] < 195.99;
                const cacheKey = idx * 8 + (face < 0 ? 4 : 0) + "|" + (air ? "air" : key);
                let val = cache.get(cacheKey);
                if (val === undefined) {
                  val = oppValue(shot(z, key, air, face), air, idx);
                  cache.set(cacheKey, val);
                }
                if (val < -200) continue;
                let avoid = true;
                if (bolts.length) {
                  const travel = tx - base;
                  for (let t = 1; t <= idx; t += 2) {
                    const px =
                      t >= start
                        ? tx + rate * (t - start + 1)
                        : clamp(
                            p.x + dq[t] + Math.sign(travel) * Math.min(Math.abs(travel), run[t]),
                            12,
                            372,
                          );
                    if (bulletAt(px, ys[t], t)) {
                      avoid = false;
                      break;
                    }
                  }
                }
                if (!avoid) continue;
                val +=
                  Math.min(15, margin) * 0.43 -
                  idx * 0.29 -
                  (mode.dash ? 2.4 : 0) -
                  (mode.jump ? 1.5 : 0) -
                  Math.abs(tx - p.x) * 0.025 +
                  fight * (z.x < 179 ? 0 : 0.4);
                if (air && key) val -= 0.25;
                if (!best || val > best.val)
                  best = { val, mode, start, tx, idx, key, air, face, contact: [z.x, z.y, margin] };
              }
            }
          }
        }
      }
    }
    return best;
  }
  function dodge(target) {
    if (!p.ground || p.iframes > 0.18) return false;
    const m = xsign(target) * 115;
    for (const b of bolts) {
      if (b.owner === o && (p.x - b.x) * Math.sign(b.vx) > 0) {
        const lead = (p.x - b.x) / (b.vx - m);
        if (lead >= 0 && lead < 0.23) return true;
      }
    }
    return false;
  }
  // Recover to midcourt, shading forward for short balls. Jump over incoming zaps.
  // Pressure only after a legal outgoing shot. Leave enough time for our own hit lockout.
  function canPressureWithZap(f) {
    if (s.last !== p || p.act || !p.ground || p.cd.zap > dt || p.face !== 1) return false;
    if (!o.ground || o.knocked || o.stun > 0 || o.iframes > 0.1 || o.x - p.x < zapDistance)
      return false;
    const end = f.at(-1);
    if (end.y < 196 || end.x <= 192 || end.x > 368) return false;
    const meet = f.findIndex((v) => v.x > 192 && v.y > 156 && v.y < 196 && v.vy > 0);
    if (meet < 0) return false;
    const boltTravel = 0.07 + Math.max(0, o.x - p.x - 24) / 250;
    const lead = meet * dt - boltTravel;
    return meet * dt >= 0.34 && lead >= zapLead - 0.18 && lead <= zapLead + 0.1;
  }

  function guard(f) {
    if (p.quickT > 0) {
      send([]);
      return;
    }
    const end = f.at(-1);
    const meet = f.find((v) => v.x > 201 && v.y > 123 && v.vy > 0) ?? end;
    const target =
      end.x > 193 && end.x < 367 && end.y >= 196 && meet.x < 240 ? guardX + 14 : guardX;
    const move = dir(target - p.x, 2);
    if (dodge(move)) {
      send([move], [U]);
    } else if (zapLead !== null && canPressureWithZap(f)) {
      send([move], ["KeyG"]);
    } else {
      send([move]);
    }
  }
  function tick() {
    if (g.time === last || g.freeze > 0) return;
    last = g.time;
    n++;
    if (g.state === "over") {
      send([]);
      return;
    }
    if (s.last !== lastOwner) {
      plan = null;
      lastPlan = -999;
      lastOwner = s.last;
    }
    if (p.stun > 0 || p.knocked || g.paused) {
      plan = null;
      send([]);
      return;
    }
    if (g.state === "point" || g.state === "title") {
      plan = null;
      send([]);
      return;
    }
    if (g.state === "serve") {
      plan = null;
      if (g.server === p) {
        if (p.act) {
          send([attackHold]);
          return;
        }
        const home = serveX;
        if (Math.abs(p.x - home) > 1.6) {
          send([dir(home - p.x)]);
          return;
        }
        let best = -300,
          selected = "";
        for (const k of ["", L, R, D]) {
          const f = shot(s, k, false, p.face),
            v = oppValue(f, false, 2);
          const weighted = v > -200 ? v + (k === D ? serveDrop : k === L ? serveLob : 0) : v;
          if (weighted > best) {
            best = weighted;
            selected = k;
          }
        }
        attackHold = selected;
        send([selected], [F]);
      } else {
        const move = dir(receiveX - p.x, 2);
        send([move]);
      }
      return;
    }
    if (g.state !== "rally" || s.state !== "fly") {
      send([]);
      return;
    }
    const f = path(s, 125),
      end = f.at(-1);
    if (s.last === p) {
      if (p.act && p.act.type === "basic" && !p.act.hitS) {
        send([attackHold]);
        return;
      }
      guard(f);
      return;
    }
    if (end.x < 15.8 || end.x > 368.2 || end.x > 192) {
      if (p.act && p.act.type === "basic" && !p.act.hitS) {
        send([attackHold]);
        return;
      }
      guard(f);
      return;
    }
    if (p.act?.type === "basic" && !p.act.hitS) {
      send([attackHold]);
      return;
    }
    if (p.quickT > 0) {
      send([]);
      return;
    }
    const jumpAge = plan && n - plan.at;
    if (!plan || n - lastPlan >= (plan.start < 10 ? 2 : 4) || jumpAge >= plan.start - 1) {
      plan = choose(f);
      if (plan) plan.at = n;
      lastPlan = n;
    }
    const mv = plan ? dir(plan.tx - p.x) : dir(clamp(end.x - p.face * 12, 12, 182) - p.x);
    if (plan) {
      const age = n - plan.at,
        wantDash = plan.mode.dash && age === 0,
        wantJump = plan.mode.jump === age + 1;
      if (plan.start <= age + 1 && !p.act) {
        attackHold = plan.key;
        send([attackHold], [F]);
        plan = null;
        return;
      }
      if (wantDash) {
        const [dx, dy] = plan.mode.dash,
          dk = dx === 1 ? R : dx === -1 ? L : "",
          dyKey = dy < 0 ? U : dy > 0 ? D : "";
        send([dk, dyKey], [H]);
        plan = null;
        return;
      }
      if (wantJump && p.ground) {
        send([mv], [U]);
        plan = null;
        return;
      }
      send([mv]);
      return;
    }
    if (p.ground && dodge(mv)) {
      send([mv], [U]);
      return;
    }
    if (!p.act && f.length < 14 && Math.hypot(s.x - p.x - p.face * 12, s.y - p.y + 18) < 25) {
      let selected = "",
        val = -999;
      for (const k of ["", L, R, D]) {
        const v = oppValue(shot(f[Math.min(1, f.length - 1)], k, !p.ground, p.face), !p.ground, 2);
        if (v > val) {
          selected = k;
          val = v;
        }
      }
      attackHold = selected;
      send([selected], [F]);
      return;
    }
    if (
      mv &&
      !(mv === R && p.x + 80 > OWN_LIMIT) &&
      p.cd.quick <= dt &&
      Math.abs(end.x - p.x) > 60 &&
      f.length < 36
    ) {
      send([mv], [H]);
      return;
    }
    send([mv]);
  }
  return { tick };
}
