/**
 * A conditional logit solver, and nothing else.
 *
 * Both of the survey's models are this one model. A respondent faces a set of
 * alternatives, each described by a vector of features, and picks one; the
 * probability of picking alternative j is proportional to exp(x_j · θ). The
 * ranking is two such choices per screen (the best of four, then the worst of
 * the other three, with the features negated), and the paired comparisons are
 * one choice of three (A, B, or Neither).
 *
 * Newton–Raphson on the log-likelihood, with a step-halving line search so a
 * bad step cannot make it worse, and a vanishing ridge so a design that cannot
 * separate two parameters (too few respondents, or a level nobody picked)
 * returns a large standard error rather than failing. Standard errors come from
 * the inverse of the observed information, which is also what the delta method
 * for dollar values in `surveyAnalysis.ts` needs, so the covariance matrix is
 * returned whole.
 *
 * Pure and dependency-free, so it runs in the Worker and in the tests, where it
 * is checked against respondents simulated with known preferences.
 */

export interface ChoiceSet {
  /** One feature vector per alternative, all of length p. */
  x: number[][]
  /** Index of the chosen alternative. */
  chosen: number
}

export interface LogitFit {
  theta: number[]
  /** Standard errors, from the inverse of the observed information. */
  se: number[]
  /** The full covariance matrix of theta. */
  cov: number[][]
  logLik: number
  converged: boolean
  iterations: number
  /** How many choices it was fitted to. */
  n: number
}

function zeros(n: number): number[] {
  return new Array<number>(n).fill(0)
}

function matrix(n: number): number[][] {
  return Array.from({ length: n }, () => zeros(n))
}

/** Solves A x = b by Gaussian elimination with partial pivoting; null when singular. */
export function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r
    if (Math.abs(m[pivot][c]) < 1e-14) return null
    ;[m[pivot], m[c]] = [m[c], m[pivot]]
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c]
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]
    }
  }
  const x = zeros(n)
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n]
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k]
    x[r] = s / m[r][r]
  }
  return x
}

/** The inverse of a symmetric positive-definite matrix, or null. */
export function invert(a: number[][]): number[][] | null {
  const n = a.length
  const cols: number[][] = []
  for (let j = 0; j < n; j++) {
    const e = zeros(n)
    e[j] = 1
    const col = solve(a, e)
    if (!col) return null
    cols.push(col)
  }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]))
}

/** Log-likelihood, gradient and the negative Hessian at theta. */
function evaluate(sets: ChoiceSet[], theta: number[]): { ll: number; grad: number[]; info: number[][] } {
  const p = theta.length
  let ll = 0
  const grad = zeros(p)
  const info = matrix(p)

  for (const { x, chosen } of sets) {
    const u = x.map((f) => f.reduce((s, v, k) => s + v * theta[k], 0))
    const top = Math.max(...u)
    const e = u.map((v) => Math.exp(v - top))
    const total = e.reduce((s, v) => s + v, 0)
    const prob = e.map((v) => v / total)
    ll += u[chosen] - top - Math.log(total)

    // The expected feature vector under the model, and the second moment.
    const mean = zeros(p)
    for (let j = 0; j < x.length; j++) for (let k = 0; k < p; k++) mean[k] += prob[j] * x[j][k]
    for (let k = 0; k < p; k++) grad[k] += x[chosen][k] - mean[k]
    for (let j = 0; j < x.length; j++) {
      const xj = x[j]
      for (let a = 0; a < p; a++) {
        if (xj[a] === 0) continue
        for (let b = 0; b < p; b++) info[a][b] += prob[j] * xj[a] * xj[b]
      }
    }
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) info[a][b] -= mean[a] * mean[b]
  }
  return { ll, grad, info }
}

export function fitLogit(sets: ChoiceSet[], p: number, opts: { maxIterations?: number; ridge?: number } = {}): LogitFit {
  const ridge = opts.ridge ?? 1e-8
  const max = opts.maxIterations ?? 60
  let theta = zeros(p)
  let { ll, grad, info } = evaluate(sets, theta)
  let converged = false
  let iterations = 0

  for (; iterations < max; iterations++) {
    const damped = info.map((row, i) => row.map((v, j) => (i === j ? v + ridge : v)))
    const step = solve(damped, grad)
    if (!step) break

    // Halve the step until the likelihood does not fall.
    let scale = 1
    let next = theta
    let nextEval = { ll, grad, info }
    for (let tries = 0; tries < 30; tries++) {
      next = theta.map((v, i) => v + scale * step[i])
      nextEval = evaluate(sets, next)
      if (nextEval.ll >= ll - 1e-10) break
      scale /= 2
    }

    const moved = Math.max(...step.map((s) => Math.abs(s * scale)))
    theta = next
    ;({ ll, grad, info } = nextEval)
    if (moved < 1e-8) {
      converged = true
      iterations++
      break
    }
  }

  const damped = info.map((row, i) => row.map((v, j) => (i === j ? v + ridge : v)))
  const cov = invert(damped) ?? matrix(p).map((row, i) => row.map((_, j) => (i === j ? Infinity : 0)))
  return {
    theta,
    se: cov.map((row, i) => Math.sqrt(Math.max(row[i], 0))),
    cov,
    logLik: ll,
    converged,
    iterations,
    n: sets.length,
  }
}
