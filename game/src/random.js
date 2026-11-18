// Seeded randomness for Golden Hour. The city is built from one fixed seed so every run —
// and every staged screenshot — lays out Porto Lume exactly the same way. Live play never
// reseeds from the clock; the seed only varies when a caller passes one in explicitly.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random helper with the small conveniences the city builder uses. */
export function createRng(seed) {
  const next = createRandom(seed);
  return {
    next,
    range(lo, hi) { return lo + next() * (hi - lo); },
    pick(list) { return list[Math.floor(next() * list.length) % list.length]; },
    chance(p) { return next() < p; },
  };
}
