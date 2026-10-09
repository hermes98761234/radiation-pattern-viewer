import { D2R, FLOOR_DBI, dirVec, sampleGain, vecAngles, type PatternGrid } from './grid'

export type Peak = { theta: number; phi: number; gain: number }

/** Direction of maximum gain. Among equal maxima (rings, mirrored lobes) the first in scan order wins. */
export function findPeak(grid: PatternGrid): Peak {
  let best = -Infinity
  let bi = 0
  for (let n = 0; n < grid.gain.length; n++) {
    if (grid.gain[n] > best + 1e-5) {
      best = grid.gain[n]
      bi = n
    }
  }
  return { theta: Math.floor(bi / grid.nPhi) * grid.dTheta, phi: (bi % grid.nPhi) * grid.dPhi, gain: best }
}

export type CutPoint = { angle: number; gain: number; theta: number; phi: number }
export type Cut = CutPoint[]

/** 0.5 degree steps over a full circle, angle from -180 (inclusive) to 180 (exclusive). */
export const CUT_N = 720
const angleAt = (i: number) => -180 + (i * 360) / CUT_N
/** Index of angle 0. */
export const CUT_ZERO = CUT_N / 2

function makeCut(grid: PatternGrid, dir: (angleDeg: number) => [number, number, number]): Cut {
  const out: Cut = []
  for (let i = 0; i < CUT_N; i++) {
    const angle = angleAt(i)
    const { theta, phi } = vecAngles(dir(angle))
    out.push({ angle, gain: sampleGain(grid, theta, phi), theta, phi })
  }
  return out
}

const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: number[]) => {
  const r = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / r, a[1] / r, a[2] / r]
}

/**
 * Two orthogonal great-circle cuts through the beam peak. A contains the z axis (the "elevation-like" plane;
 * for a vertical dipole or a patch with its E field along x this is the E-plane), B is perpendicular to it.
 * `rotation` turns both about the peak direction. Angle 0 is the peak direction.
 */
export function peakCuts(grid: PatternGrid, peak: Peak, rotation = 0): { a: Cut; b: Cut } {
  const p = dirVec(peak.theta, peak.phi)
  const zAxis = [0, 0, 1]
  const dz = p[2]
  let u = [zAxis[0] - dz * p[0], zAxis[1] - dz * p[1], zAxis[2] - dz * p[2]]
  if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = [1, 0, 0] // peak on the z axis: use the xz plane
  u = unit(u)
  const w = unit(cross(p, u))
  const r = rotation * D2R
  const u2 = [u[0] * Math.cos(r) + w[0] * Math.sin(r), u[1] * Math.cos(r) + w[1] * Math.sin(r), u[2] * Math.cos(r) + w[2] * Math.sin(r)]
  const w2 = [-u[0] * Math.sin(r) + w[0] * Math.cos(r), -u[1] * Math.sin(r) + w[1] * Math.cos(r), -u[2] * Math.sin(r) + w[2] * Math.cos(r)]
  const along = (v: number[]) => (angle: number): [number, number, number] => {
    const a = angle * D2R
    return [p[0] * Math.cos(a) + v[0] * Math.sin(a), p[1] * Math.cos(a) + v[1] * Math.sin(a), p[2] * Math.cos(a) + v[2] * Math.sin(a)]
  }
  return { a: makeCut(grid, along(u2)), b: makeCut(grid, along(w2)) }
}

/** Vertical-plane cut at azimuth phi: angle is the polar angle from zenith (negative = the opposite side, phi + 180). */
export function elevationCut(grid: PatternGrid, phiDeg: number): Cut {
  const f = phiDeg * D2R
  return makeCut(grid, (a) => [Math.sin(a * D2R) * Math.cos(f), Math.sin(a * D2R) * Math.sin(f), Math.cos(a * D2R)])
}

/** Horizontal cone cut at polar angle theta: angle is the azimuth phi. */
export function azimuthCut(grid: PatternGrid, thetaDeg: number): Cut {
  return makeCut(grid, (a) => dirVec(thetaDeg, a))
}

export type Beamwidth = { width: number; low: number; high: number }

/** Walks away from `center` until the gain is `drop` dB lower; returns the (fractional) number of samples, or null if it never is. */
function walk(cut: Cut, center: number, dir: 1 | -1, level: number): number | null {
  const n = cut.length
  let prev = cut[center].gain
  for (let k = 1; k < n; k++) {
    const g = cut[(((center + dir * k) % n) + n) % n].gain
    if (g <= level) return k - 1 + (prev - level) / (prev - g || 1)
    prev = g
  }
  return null
}

export function argmax(cut: Cut): number {
  let bi = 0
  for (let i = 1; i < cut.length; i++) if (cut[i].gain > cut[bi].gain + 1e-3) bi = i
  return bi
}

/**
 * Half-power (-3 dB) beamwidth of the lobe around `center` (default: the cut's maximum), in degrees.
 * Null when the gain never falls 3 dB (an omnidirectional cut).
 */
export function halfPowerBeamwidth(cut: Cut, center = argmax(cut), drop = 3): Beamwidth | null {
  const level = cut[center].gain - drop
  const hi = walk(cut, center, 1, level)
  const lo = walk(cut, center, -1, level)
  if (hi === null || lo === null) return null
  const step = 360 / cut.length
  return { width: (hi + lo) * step, low: -lo * step, high: hi * step }
}

/**
 * Highest sidelobe relative to the main lobe around `center`, in dB (negative), or null if there is no
 * lobe outside the main lobe's nulls. Lobes at the floor count as "no sidelobe" (returns FLOOR-relative value).
 */
export function sidelobeLevel(cut: Cut, center = argmax(cut)): number | null {
  const n = cut.length
  const descend = (dir: 1 | -1) => {
    let k = 0
    while (k < n - 1) {
      const a = cut[(((center + dir * k) % n) + n) % n].gain
      const b = cut[(((center + dir * (k + 1)) % n) + n) % n].gain
      if (b >= a - 1e-6) break
      k++
    }
    return k
  }
  const up = descend(1)
  const down = descend(-1)
  if (up + down >= n - 2) return null
  let best = -Infinity
  for (let k = up + 1; k < n - down; k++) best = Math.max(best, cut[(center + k) % n].gain)
  return best - cut[center].gain
}

export type FrontBack = {
  /** Peak gain minus gain exactly opposite the peak, dB. */
  frontToBack: number
  /** Peak gain minus the highest gain anywhere more than 90 degrees from the peak, dB. */
  frontToRear: number
}

export function frontBack(grid: PatternGrid, peak: Peak): FrontBack {
  const p = dirVec(peak.theta, peak.phi)
  const opp = vecAngles([-p[0], -p[1], -p[2]])
  const back = sampleGain(grid, opp.theta, opp.phi)
  let rear = FLOOR_DBI
  for (let i = 0; i < grid.nTheta; i++) {
    const t = i * grid.dTheta
    for (let j = 0; j < grid.nPhi; j++) {
      const v = dirVec(t, j * grid.dPhi)
      if (v[0] * p[0] + v[1] * p[1] + v[2] * p[2] < -1e-9) rear = Math.max(rear, grid.gain[i * grid.nPhi + j])
    }
  }
  return { frontToBack: peak.gain - back, frontToRear: peak.gain - rear }
}

