/**
 * A small seeded random generator, and a shuffle that uses it.
 *
 * The survey's order effects are only worth measuring if every order is
 * reproducible: a response stores one seed, and everything a respondent saw —
 * which ranking screens, in what order, with the options in what order — can be
 * rebuilt from it and from the instrument version. `Math.random()` cannot be
 * rebuilt, so it is not used anywhere in `shared/survey*`.
 *
 * mulberry32 is not cryptographic and does not need to be: nothing here is a
 * secret. The response id, which *is* one, comes from `crypto.getRandomValues`
 * in the Worker.
 */

export type Rng = () => number

/** A uniform number in [0, 1), the same sequence for the same seed. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh copy in random order (Fisher–Yates). */
export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** An integer in [0, n). */
export function int(n: number, rng: Rng): number {
  return Math.floor(rng() * n)
}
