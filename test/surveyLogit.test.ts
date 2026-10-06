import { describe, it, expect } from 'vitest'
import { fitLogit, invert, solve, type ChoiceSet } from '../shared/surveyLogit'
import { seeded } from '../shared/surveyRandom'

/**
 * The solver on problems with answers that can be worked out by hand, so a wrong
 * estimator cannot hide behind a model complicated enough to be unverifiable.
 */

describe('linear algebra', () => {
  it('solves a small system, and says when there is no solution', () => {
    expect(solve([[2, 1], [1, 3]], [5, 10])!.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([1, 3])
    expect(solve([[1, 2], [2, 4]], [1, 2])).toBeNull()
  })

  it('inverts a matrix', () => {
    const inv = invert([[4, 7], [2, 6]])!
    expect(inv[0][0]).toBeCloseTo(0.6, 9)
    expect(inv[0][1]).toBeCloseTo(-0.7, 9)
    expect(inv[1][0]).toBeCloseTo(-0.2, 9)
    expect(inv[1][1]).toBeCloseTo(0.4, 9)
  })
})

describe('a two-way choice has a closed-form answer', () => {
  // Alternative 0 has feature 1, alternative 1 has feature 0. Out of n choices,
  // k pick the first: the maximum-likelihood estimate is log(k / (n - k)) and
  // its standard error is sqrt(1/k + 1/(n - k)).
  const data = (k: number, n: number): ChoiceSet[] =>
    Array.from({ length: n }, (_, i) => ({ x: [[1], [0]], chosen: i < k ? 0 : 1 }))

  it('finds the log odds', () => {
    const fit = fitLogit(data(700, 1000), 1)
    expect(fit.converged).toBe(true)
    expect(fit.theta[0]).toBeCloseTo(Math.log(700 / 300), 6)
  })

  it('reports the standard error that theory gives', () => {
    const fit = fitLogit(data(700, 1000), 1)
    expect(fit.se[0]).toBeCloseTo(Math.sqrt(1 / 700 + 1 / 300), 4)
  })

  it('finds no preference when the choices split evenly', () => {
    expect(fitLogit(data(500, 1000), 1).theta[0]).toBeCloseTo(0, 6)
  })

  it('reports the number of choices it was fitted to', () => {
    expect(fitLogit(data(7, 10), 1).n).toBe(10)
  })
})

describe('a larger problem with known preferences', () => {
  const truth = [0.8, -0.5, 0.3]
  const rng = seeded(2026)
  const sets: ChoiceSet[] = Array.from({ length: 4000 }, () => {
    const x = Array.from({ length: 3 }, () => truth.map(() => (rng() < 0.5 ? 0 : 1)))
    const u = x.map((f) => f.reduce((s, v, k) => s + v * truth[k], 0))
    const e = u.map(Math.exp)
    const total = e.reduce((s, v) => s + v, 0)
    let draw = rng() * total
    let chosen = 0
    for (let j = 0; j < e.length; j++) {
      draw -= e[j]
      if (draw <= 0) {
        chosen = j
        break
      }
    }
    return { x, chosen }
  })
  const fit = fitLogit(sets, 3)

  it('recovers each preference within three standard errors', () => {
    expect(fit.converged).toBe(true)
    truth.forEach((t, k) => expect(Math.abs(fit.theta[k] - t) / fit.se[k], `theta ${k}`).toBeLessThan(3))
  })

  it('has a covariance matrix whose diagonal is the squared standard errors', () => {
    fit.se.forEach((s, k) => expect(fit.cov[k][k]).toBeCloseTo(s * s, 12))
  })
})

describe('when the data cannot separate the parameters', () => {
  it('does not throw, and does not claim to be sure', () => {
    // Two features that are always identical: one parameter's worth of information.
    const sets: ChoiceSet[] = Array.from({ length: 50 }, (_, i) => ({ x: [[1, 1], [0, 0]], chosen: i % 3 === 0 ? 0 : 1 }))
    const fit = fitLogit(sets, 2)
    expect(fit.theta.every(Number.isFinite)).toBe(true)
    expect(Math.max(...fit.se)).toBeGreaterThan(100)
  })

  it('copes with no data at all', () => {
    const fit = fitLogit([], 2)
    expect(fit.theta).toEqual([0, 0])
    expect(fit.n).toBe(0)
  })
})
