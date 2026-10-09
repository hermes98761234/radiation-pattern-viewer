import { D2R, gridFromPower, type PatternGrid } from './grid'

/* ---------- element patterns ---------- */

/**
 * Far-field amplitude of a centre-fed thin dipole along z with a sinusoidal current,
 * total length `len` in wavelengths: [cos(kL/2 cos t) - cos(kL/2)] / sin t.
 */
export function dipoleField(len: number, theta: number): number {
  const s = Math.sin(theta)
  if (Math.abs(s) < 1e-9) return 0
  const h = Math.PI * len
  return (Math.cos(h * Math.cos(theta)) - Math.cos(h)) / s
}

export type ElementKind = 'isotropic' | 'dipole' | 'cosine'

/** Relative power pattern of one array element. */
export function elementPower(kind: ElementKind, theta: number): number {
  switch (kind) {
    case 'isotropic':
      return 1
    case 'dipole':
      return dipoleField(0.5, theta) ** 2
    case 'cosine':
      return theta < Math.PI / 2 ? Math.cos(theta) : 0
  }
}

/* ---------- simple wires ---------- */

export type DipoleParams = { length: number }
export function dipoleGrid(p: DipoleParams): PatternGrid {
  return gridFromPower((t) => dipoleField(p.length, t) ** 2)
}

/** Monopole of height `height` (wavelengths) on an infinite perfect ground plane: a dipole of length 2h, upper half-space only. */
export type MonopoleParams = { height: number }
export function monopoleGrid(p: MonopoleParams): PatternGrid {
  return gridFromPower((t) => (t <= Math.PI / 2 + 1e-9 ? dipoleField(2 * p.height, t) ** 2 : 0))
}

/* ---------- Yagi (idealised current model) ---------- */

export type YagiParams = {
  directors: number
  /** Reflector spacing behind the driven element, wavelengths. */
  reflectorSpacing: number
  /** Spacing between directors, wavelengths. */
  directorSpacing: number
  /** Driven element length, wavelengths. */
  drivenLength: number
  /** Director length as a fraction of the driven element. */
  directorLength: number
  /** Director phase lag as a multiple of the free-space phase (slow-wave factor). */
  slow?: number
  /** Director amplitude decay per element. */
  dec?: number
}

export type YagiElement = { x: number; length: number; amp: number; phase: number }

/**
 * Elements of an idealised Yagi on the x axis (boom), all parallel to z. Not a method-of-moments solve:
 * the reflector current is set to (almost) cancel the rear lobe, and the directors
 * carry a gently falling amplitude with a slow-wave phase lag so the array radiates towards +x.
 */
export function yagiElements(p: YagiParams): YagiElement[] {
  const k = 2 * Math.PI
  const driven: YagiElement = { x: 0, length: p.drivenLength, amp: 1, phase: 0 }
  const els: YagiElement[] = [driven]
  for (let i = 1; i <= p.directors; i++) {
    const x = i * p.directorSpacing
    els.push({ x, length: p.drivenLength * p.directorLength, amp: 0.85 * Math.pow(p.dec ?? 0.93, i - 1), phase: -k * x * (p.slow ?? 1.1) })
  }
  // Reflector current: whatever cancels the field radiated straight back (towards -x) by all the other elements.
  const rl = p.drivenLength * 1.05
  let re = 0
  let im = 0
  for (const e of els) {
    const a = e.amp * dipoleField(e.length, Math.PI / 2)
    re += a * Math.cos(e.phase - k * e.x)
    im += a * Math.sin(e.phase - k * e.x)
  }
  const fr = dipoleField(rl, Math.PI / 2)
  // 15% under-driven, so the rear lobe is deep but finite, as on a real antenna.
  const mag = (0.85 * Math.hypot(re, im)) / fr
  const phase = Math.atan2(im, re) + Math.PI - k * p.reflectorSpacing
  return [{ x: -p.reflectorSpacing, length: rl, amp: mag, phase }, ...els]
}

export function yagiGrid(p: YagiParams): PatternGrid {
  const els = yagiElements(p)
  const k = 2 * Math.PI
  return gridFromPower((t, f) => {
    const u = Math.sin(t) * Math.cos(f)
    let re = 0
    let im = 0
    for (const e of els) {
      const a = e.amp * dipoleField(e.length, t)
      const ph = e.phase + k * e.x * u
      re += a * Math.cos(ph)
      im += a * Math.sin(ph)
    }
    return re * re + im * im
  })
}

/* ---------- Rectangular microstrip patch (cavity / two-slot model) ---------- */

export type PatchParams = {
  /** Resonant length along x, wavelengths. */
  length: number
  /** Width along y, wavelengths. */
  width: number
}

const sinc = (x: number) => (Math.abs(x) < 1e-9 ? 1 : Math.sin(x) / x)

/**
 * Two radiating slots of width W separated by L (magnetic currents along y, in phase) over an
 * infinite ground plane, so only the upper half-space radiates:
 * U = (cos^2 phi + cos^2 theta sin^2 phi) sinc^2(kW/2 sin t sin f) cos^2(kL/2 sin t cos f).
 */
export function patchPower(p: PatchParams, t: number, f: number): number {
  if (t > Math.PI / 2 + 1e-9) return 0
  const kw = Math.PI * p.width
  const kl = Math.PI * p.length
  const s = Math.sin(t)
  const ang = (Math.cos(f) ** 2 + (Math.cos(t) * Math.sin(f)) ** 2) * sinc(kw * s * Math.sin(f)) ** 2
  return ang * Math.cos(kl * s * Math.cos(f)) ** 2
}
export function patchGrid(p: PatchParams): PatternGrid {
  return gridFromPower((t, f) => patchPower(p, t, f))
}

/** Transmission-line-model patch dimensions (Balanis, Antenna Theory, section 14.2). Lengths in metres. */
export function patchDesign(fHz: number, er: number, h: number) {
  const c = 299792458
  const w = (c / (2 * fHz)) * Math.sqrt(2 / (er + 1))
  const eeff = (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + (12 * h) / w, -0.5)
  const dl = (0.412 * h * ((eeff + 0.3) * (w / h + 0.264))) / ((eeff - 0.258) * (w / h + 0.8))
  const l = c / (2 * fHz * Math.sqrt(eeff)) - 2 * dl
  return { width: w, length: l, eeff, deltaL: dl, lambda0: c / fHz }
}

/* ---------- Array tapers ---------- */

export type TaperKind = 'uniform' | 'hamming' | 'hann' | 'blackman' | 'triangular' | 'chebyshev'

/** Amplitude weights for n elements, peak-normalised. `sll` is the Dolph-Chebyshev sidelobe level in dB (positive). */
export function taperWeights(kind: TaperKind, n: number, sll = 30): number[] {
  if (n <= 1) return [1]
  const idx = Array.from({ length: n }, (_, i) => i)
  switch (kind) {
    case 'uniform':
      return idx.map(() => 1)
    case 'hamming':
      return idx.map((i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)))
    case 'hann':
      return idx.map((i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 1)) / (n + 1)))
    case 'blackman':
      return idx.map((i) => {
        const x = (2 * Math.PI * (i + 1)) / (n + 1)
        return 0.42 - 0.5 * Math.cos(x) + 0.08 * Math.cos(2 * x)
      })
    case 'triangular':
      return idx.map((i) => 1 - Math.abs((2 * (i + 1)) / (n + 1) - 1))
    case 'chebyshev':
      return chebyshev(n, sll)
  }
}

/** Dolph-Chebyshev weights (same construction as scipy.signal.windows.chebwin). */
function chebyshev(n: number, at: number): number[] {
  const order = n - 1
  const beta = Math.cosh(Math.acosh(Math.pow(10, Math.abs(at) / 20)) / order)
  const p: number[] = []
  for (let m = 0; m < n; m++) {
    const x = beta * Math.cos((m * Math.PI) / n)
    if (x > 1) p.push(Math.cosh(order * Math.acosh(x)))
    else if (x < -1) p.push((order % 2 ? -1 : 1) * Math.cosh(order * Math.acosh(-x)))
    else p.push(Math.cos(order * Math.acos(x)))
  }
  // Real part of the DFT of p (with the half-sample phase for even n).
  const re = (m: number) => {
    let s = 0
    for (let k = 0; k < n; k++) {
      const ang = (-2 * Math.PI * k * m) / n
      if (n % 2) s += p[k] * Math.cos(ang)
      else s += p[k] * Math.cos(ang + (Math.PI * k) / n)
    }
    return s
  }
  const half = n % 2 ? (n + 1) / 2 : n / 2 + 1
  const w0 = Array.from({ length: half }, (_, m) => re(m))
  const w = n % 2 ? [...w0.slice(1).reverse(), ...w0] : [...w0.slice(1).reverse(), ...w0.slice(1)]
  const max = Math.max(...w)
  return w.map((v) => v / max)
}

/* ---------- Phased arrays ---------- */

export type LinearParams = {
  n: number
  /** Element spacing, wavelengths. */
  spacing: number
  /** Beam direction measured from broadside, degrees (-90..90). */
  steer: number
  axis: 'x' | 'y' | 'z'
  taper: TaperKind
  sll: number
  element: ElementKind
}

/** |sum w_n exp(j k d (n - (N-1)/2) u)| for direction cosine offset u. */
function af1d(w: readonly number[], d: number, u: number): number {
  const k = 2 * Math.PI * d * u
  const c = (w.length - 1) / 2
  let re = 0
  let im = 0
  for (let i = 0; i < w.length; i++) {
    const a = k * (i - c)
    re += w[i] * Math.cos(a)
    im += w[i] * Math.sin(a)
  }
  return Math.hypot(re, im)
}

export function linearGrid(p: LinearParams): PatternGrid {
  const w = taperWeights(p.taper, p.n, p.sll)
  const u0 = Math.sin(p.steer * D2R)
  return gridFromPower((t, f) => {
    const s = Math.sin(t)
    const u = p.axis === 'x' ? s * Math.cos(f) : p.axis === 'y' ? s * Math.sin(f) : Math.cos(t)
    return elementPower(p.element, t) * af1d(w, p.spacing, u - u0) ** 2
  })
}

export type PlanarParams = {
  nx: number
  ny: number
  dx: number
  dy: number
  /** Beam direction: polar angle from +z and azimuth, degrees. */
  steerTheta: number
  steerPhi: number
  taper: TaperKind
  sll: number
  element: ElementKind
}

/** Rectangular lattice in the xy plane with separable weights, so the array factor is a product of two 1-D sums. */
export function planarGrid(p: PlanarParams): PatternGrid {
  const wx = taperWeights(p.taper, p.nx, p.sll)
  const wy = taperWeights(p.taper, p.ny, p.sll)
  const ux0 = Math.sin(p.steerTheta * D2R) * Math.cos(p.steerPhi * D2R)
  const uy0 = Math.sin(p.steerTheta * D2R) * Math.sin(p.steerPhi * D2R)
  return gridFromPower((t, f) => {
    const s = Math.sin(t)
    return elementPower(p.element, t) * (af1d(wx, p.dx, s * Math.cos(f) - ux0) * af1d(wy, p.dy, s * Math.sin(f) - uy0)) ** 2
  })
}
