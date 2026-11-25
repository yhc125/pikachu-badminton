export const baseline = Object.freeze({
  zapLead: null,
  guardX: 110,
  receiveX: 105,
  serveX: 134,
  smashBonus: 2,
  serveDrop: 0,
  serveLob: 0,
  zapDistance: 25,
});
export const bounds = Object.freeze({
  zapLead: [0.08, 0.45],
  guardX: [88, 153],
  receiveX: [80, 135],
  serveX: [96, 135],
  smashBonus: [-65, 22],
  serveDrop: [-20, 55],
  serveLob: [-20, 55],
  zapDistance: [20, 95],
});
export function validatePolicy(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Policy must be a JSON object");
  for (const k of Object.keys(input))
    if (!Object.hasOwn(bounds, k)) throw Error(`Unknown policy field: ${k}`);
  const policy = { ...baseline, ...input };
  for (const [k, [min, max]] of Object.entries(bounds)) {
    const v = policy[k];
    if (k === "zapLead" && v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
      throw Error(`Invalid ${k}: ${v}`);
  }
  return policy;
}
