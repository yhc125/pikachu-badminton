import { readFile } from "node:fs/promises";

// Load the actual game and assets, with only its browser UI and frame loop stubbed.
Object.assign(globalThis, {
  window: globalThis,
  location: { search: "" },
  document: {
    getElementById: (id) => (id === "screen" ? { getContext: () => ({}) } : null),
    querySelectorAll: () => [],
  },
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  requestAnimationFrame() {},
  ImageData: class {
    constructor(w, h) {
      this.data = new Uint8ClampedArray(w * h * 4);
    }
  },
  Worker: class {},
  fetch: async (name) =>
    new Response(await readFile(new URL(`../../badminton/${name}`, import.meta.url))),
});
await import("../../badminton/game.js");
export const match = globalThis.__pika;

// Another module instance owns all of its players, inputs, CPU and cosmetic state.
let rolloutGame;
export async function loadRolloutGame() {
  if (rolloutGame) return rolloutGame;
  try {
    await import("../../badminton/game.js?lab-rollout");
    return (rolloutGame = globalThis.__pika);
  } finally {
    globalThis.__pika = match;
  }
}
