/** A far-field gain pattern sampled on a regular (theta, phi) grid, in dBi. */

export const D2R = Math.PI / 180
export const R2D = 180 / Math.PI
/** Gains below this are clamped (nulls and "no data" such as NEC's -999.99). */
export const FLOOR_DBI = -80

/** theta: polar angle from +z, 0..180 deg (inclusive). phi: azimuth from +x towards +y, 0..360 deg (exclusive). */
export type PatternGrid = {
  nTheta: number
  nPhi: number
  dTheta: number
  dPhi: number
  /** dBi, index i * nPhi + j for theta = i * dTheta, phi = j * dPhi. */
  gain: Float32Array
}

export const N_THETA = 181
export const N_PHI = 360

export function newGrid(fill = FLOOR_DBI): PatternGrid {
  const gain = new Float32Array(N_THETA * N_PHI)
  gain.fill(fill)
  return { nTheta: N_THETA, nPhi: N_PHI, dTheta: 180 / (N_THETA - 1), dPhi: 360 / N_PHI, gain }
}

export const toDb = (p: number) => (p > 0 ? Math.max(FLOOR_DBI, 10 * Math.log10(p)) : FLOOR_DBI)
export const fromDb = (g: number) => Math.pow(10, g / 10)

/**
 * Solid-angle integral of a linear pattern U(theta, phi) over the full sphere
 * (trapezoid in theta, rectangle in phi; both are exact for the periodic phi direction).
 */
function sphereIntegral(u: ArrayLike<number>, g: Pick<PatternGrid, 'nTheta' | 'nPhi' | 'dTheta' | 'dPhi'>): number {
  const rows: number[] = []
  let max = 0
  for (let i = 0; i < g.nTheta; i++) {
    let row = 0
    for (let j = 0; j < g.nPhi; j++) {
      row += u[i * g.nPhi + j]
      if (u[i * g.nPhi + j] > max) max = u[i * g.nPhi + j]
    }
    rows.push(row)
  }
  // An upper-half-space pattern (ground plane) ends in a step at the equator: count the equator row as half a cell.
  const equator = Math.round(90 / g.dTheta)
  let lower = 0
  for (let i = equator + 1; i < g.nTheta; i++) lower = Math.max(lower, rows[i])
  if (g.nTheta > equator + 1 && lower <= 1e-9 * max * g.nPhi) rows[equator] *= 0.5
  let sum = 0
  for (let i = 0; i < g.nTheta; i++) sum += rows[i] * Math.sin(i * g.dTheta * D2R)
  return sum * g.dTheta * D2R * g.dPhi * D2R
}

/**
 * Builds a lossless gain grid from a relative power pattern: gain = 4 pi U / integral(U).
 * Returns the grid and the integral-based directivity of the peak in dBi.
 */
export function gridFromPower(power: (thetaRad: number, phiRad: number) => number): PatternGrid {
  const grid = newGrid()
  const u = new Float64Array(grid.gain.length)
  for (let i = 0; i < grid.nTheta; i++) {
    const th = i * grid.dTheta * D2R
    for (let j = 0; j < grid.nPhi; j++) {
      const v = power(th, j * grid.dPhi * D2R)
      u[i * grid.nPhi + j] = Number.isFinite(v) && v > 0 ? v : 0
    }
  }
  const total = sphereIntegral(u, grid)
  if (!(total > 0)) return grid
  const k = (4 * Math.PI) / total
  for (let n = 0; n < u.length; n++) grid.gain[n] = toDb(u[n] * k)
  return grid
}

export type GridStats = {
  peakDbi: number
  /** Fraction of the power an isotropic radiator would emit: integral(G) / (4 pi). 1 for a lossless antenna. */
  efficiency: number
  /** Peak gain divided by the efficiency, in dBi (the directivity implied by the pattern). */
  directivityDbi: number
}

export function gridStats(grid: PatternGrid): GridStats {
  let peak = -Infinity
  const lin = new Float64Array(grid.gain.length)
  for (let n = 0; n < lin.length; n++) {
    if (grid.gain[n] > peak) peak = grid.gain[n]
    lin[n] = fromDb(grid.gain[n])
  }
  const eff = sphereIntegral(lin, grid) / (4 * Math.PI)
  return { peakDbi: peak, efficiency: eff, directivityDbi: peak - 10 * Math.log10(eff) }
}

/** Gain in dBi in direction (theta, phi) degrees, bilinear in linear power. */
export function sampleGain(grid: PatternGrid, thetaDeg: number, phiDeg: number): number {
  let th = thetaDeg
  let ph = phiDeg
  // Fold theta outside 0..180 across the poles.
  th = ((th % 360) + 360) % 360
  if (th > 180) {
    th = 360 - th
    ph += 180
  }
  ph = ((ph % 360) + 360) % 360
  const ft = th / grid.dTheta
  const fp = ph / grid.dPhi
  const i0 = Math.min(grid.nTheta - 2, Math.floor(ft))
  const j0 = Math.floor(fp) % grid.nPhi
  const j1 = (j0 + 1) % grid.nPhi
  const a = ft - i0
  const b = fp - Math.floor(fp)
  const at = (i: number, j: number) => fromDb(grid.gain[i * grid.nPhi + j])
  const p = (1 - a) * ((1 - b) * at(i0, j0) + b * at(i0, j1)) + a * ((1 - b) * at(i0 + 1, j0) + b * at(i0 + 1, j1))
  return toDb(p)
}

/** Unit vector for (theta, phi) in degrees. */
export function dirVec(thetaDeg: number, phiDeg: number): [number, number, number] {
  const t = thetaDeg * D2R
  const p = phiDeg * D2R
  return [Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p), Math.cos(t)]
}

/** (theta, phi) in degrees of a (not necessarily unit) vector; phi in [0, 360). */
export function vecAngles(v: readonly [number, number, number]): { theta: number; phi: number } {
  const r = Math.hypot(v[0], v[1], v[2]) || 1
  const theta = Math.acos(Math.max(-1, Math.min(1, v[2] / r))) * R2D
  const phi = Math.hypot(v[0], v[1]) < 1e-12 ? 0 : ((Math.atan2(v[1], v[0]) * R2D) % 360 + 360) % 360
  return { theta, phi }
}
