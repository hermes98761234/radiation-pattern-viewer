import { N, type Lang } from '../i18n'
import type { Colormap, Scale } from './display'
import type { DipoleParams, LinearParams, MonopoleParams, PatchParams, PlanarParams, YagiParams } from './analytic'

export type Theme = 'auto' | 'light' | 'dark'
export type Kind = 'dipole' | 'monopole' | 'yagi' | 'patch' | 'linear' | 'planar' | 'import'

export type Params = {
  dipole: DipoleParams
  monopole: MonopoleParams
  yagi: YagiParams
  patch: PatchParams
  linear: LinearParams
  planar: PlanarParams
}

export type Display = {
  scale: Scale
  /** Dynamic range of the plots in dB below the peak. */
  range: number
  colormap: Colormap
  wire: boolean
  spin: boolean
  cuts: boolean
  cutMode: 'peak' | 'plane'
  /** Rotation of the two peak cuts about the beam axis, degrees. */
  cutRotation: number
  cutPhi: number
  cutTheta: number
}

export type AppState = {
  lang: Lang
  theme: Theme
  kind: Kind
  params: Params
  display: Display
}

export const DEFAULT_PARAMS: Params = {
  dipole: { length: 0.5 },
  monopole: { height: 0.25 },
  yagi: { directors: 3, reflectorSpacing: 0.2, directorSpacing: 0.3, drivenLength: 0.47, directorLength: 0.95 },
  patch: { length: 0.33, width: 0.45 },
  linear: { n: 8, spacing: 0.5, steer: 0, axis: 'z', taper: 'uniform', sll: 30, element: 'isotropic' },
  planar: { nx: 4, ny: 4, dx: 0.5, dy: 0.5, steerTheta: 0, steerPhi: 0, taper: 'uniform', sll: 30, element: 'cosine' },
}

export const DEFAULT_DISPLAY: Display = {
  scale: 'db',
  range: 30,
  colormap: 'turbo',
  wire: false,
  spin: false,
  cuts: true,
  cutMode: 'peak',
  cutRotation: 0,
  cutPhi: 0,
  cutTheta: 90,
}

export const DEFAULT_STATE: AppState = {
  lang: 'en',
  theme: 'auto',
  kind: 'yagi',
  params: DEFAULT_PARAMS,
  display: DEFAULT_DISPLAY,
}

export const KINDS: { kind: Kind; label: string }[] = [
  { kind: 'dipole', label: N('Dipole') },
  { kind: 'monopole', label: N('Monopole') },
  { kind: 'yagi', label: N('Yagi') },
  { kind: 'patch', label: N('Patch') },
  { kind: 'linear', label: N('Linear array') },
  { kind: 'planar', label: N('Planar array') },
  { kind: 'import', label: N('Import file') },
]

type Preset<K extends keyof Params> = { name: string; params: Params[K] }

export const PRESETS: { [K in keyof Params]: Preset<K>[] } = {
  dipole: [
    { name: N('Short dipole (0.1 λ)'), params: { length: 0.1 } },
    { name: N('Half-wave dipole'), params: { length: 0.5 } },
    { name: N('Full-wave dipole'), params: { length: 1 } },
    { name: N('1.5 λ dipole'), params: { length: 1.5 } },
    { name: N('2 λ dipole'), params: { length: 2 } },
  ],
  monopole: [
    { name: N('Quarter-wave monopole'), params: { height: 0.25 } },
    { name: N('Half-wave monopole'), params: { height: 0.5 } },
    { name: N('5/8 wave monopole'), params: { height: 0.625 } },
  ],
  yagi: [
    { name: N('3 elements'), params: { ...DEFAULT_PARAMS.yagi, directors: 1 } },
    { name: N('5 elements'), params: { ...DEFAULT_PARAMS.yagi, directors: 3 } },
    { name: N('9 elements'), params: { ...DEFAULT_PARAMS.yagi, directors: 7 } },
    { name: N('15 elements'), params: { ...DEFAULT_PARAMS.yagi, directors: 13 } },
  ],
  patch: [
    { name: N('Typical patch'), params: { length: 0.33, width: 0.45 } },
    { name: N('Square patch'), params: { length: 0.35, width: 0.35 } },
    { name: N('Wide patch'), params: { length: 0.3, width: 0.6 } },
  ],
  linear: [
    { name: N('8 elements, broadside'), params: { ...DEFAULT_PARAMS.linear } },
    { name: N('8 elements, steered 30°'), params: { ...DEFAULT_PARAMS.linear, steer: 30 } },
    { name: N('8 elements, end-fire'), params: { ...DEFAULT_PARAMS.linear, steer: 90, spacing: 0.25 } },
    { name: N('12 elements, Chebyshev −30 dB'), params: { ...DEFAULT_PARAMS.linear, n: 12, taper: 'chebyshev', sll: 30 } },
    { name: N('16 dipoles, Hamming taper'), params: { ...DEFAULT_PARAMS.linear, n: 16, taper: 'hamming', element: 'dipole', axis: 'z' } },
    { name: N('Two elements, grating lobes (d = 1.5 λ)'), params: { ...DEFAULT_PARAMS.linear, n: 2, spacing: 1.5 } },
  ],
  planar: [
    { name: N('4 × 4 patches, broadside'), params: { ...DEFAULT_PARAMS.planar } },
    { name: N('8 × 8 patches, steered 30° / 45°'), params: { ...DEFAULT_PARAMS.planar, nx: 8, ny: 8, steerTheta: 30, steerPhi: 45 } },
    { name: N('16 × 4, Hamming taper'), params: { ...DEFAULT_PARAMS.planar, nx: 16, ny: 4, taper: 'hamming' } },
    { name: N('4 × 4 isotropic'), params: { ...DEFAULT_PARAMS.planar, element: 'isotropic' } },
  ],
}

const KEY = 'radiation-pattern-viewer:v1'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Merges stored values over the defaults, ignoring anything of the wrong type. */
function merge<T extends object>(base: T, saved: unknown): T {
  if (!isObj(saved)) return base
  const out = { ...base } as Record<string, unknown>
  for (const [k, v] of Object.entries(base)) {
    const s = saved[k]
    if (s === undefined) continue
    if (isObj(v)) out[k] = merge(v, s)
    else if (typeof s === typeof v) out[k] = s
  }
  return out as T
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = merge(DEFAULT_STATE, JSON.parse(raw))
      if (s.kind === 'import') s.kind = DEFAULT_STATE.kind // imported data is not stored
      return s
    }
  } catch {
    /* unavailable or corrupt: use defaults */
  }
  const uk = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk')
  return { ...DEFAULT_STATE, lang: uk ? 'uk' : 'en' }
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage full or disabled */
  }
}

const clampNum = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo)
const clampInt = (v: number, lo: number, hi: number) => Math.round(clampNum(v, lo, hi))

/** Brings user-entered numbers into the ranges the pattern code supports. */
export function sanitize<K extends keyof Params>(kind: K, p: Params[K]): Params[K] {
  const x = p as Params[keyof Params]
  switch (kind) {
    case 'dipole': {
      const d = x as DipoleParams
      return { length: clampNum(d.length, 0.01, 4) } as Params[K]
    }
    case 'monopole': {
      const d = x as MonopoleParams
      return { height: clampNum(d.height, 0.005, 2) } as Params[K]
    }
    case 'yagi': {
      const y = x as YagiParams
      return {
        directors: clampInt(y.directors, 0, 20),
        reflectorSpacing: clampNum(y.reflectorSpacing, 0.05, 0.5),
        directorSpacing: clampNum(y.directorSpacing, 0.05, 0.6),
        drivenLength: clampNum(y.drivenLength, 0.2, 0.7),
        directorLength: clampNum(y.directorLength, 0.7, 1.1),
      } as Params[K]
    }
    case 'patch': {
      const d = x as PatchParams
      return { length: clampNum(d.length, 0.05, 1), width: clampNum(d.width, 0.05, 1.5) } as Params[K]
    }
    case 'linear': {
      const l = x as LinearParams
      return { ...l, n: clampInt(l.n, 1, 64), spacing: clampNum(l.spacing, 0.05, 3), steer: clampNum(l.steer, -90, 90), sll: clampNum(l.sll, 15, 60) } as Params[K]
    }
    case 'planar': {
      const l = x as PlanarParams
      return {
        ...l,
        nx: clampInt(l.nx, 1, 32),
        ny: clampInt(l.ny, 1, 32),
        dx: clampNum(l.dx, 0.05, 3),
        dy: clampNum(l.dy, 0.05, 3),
        steerTheta: clampNum(l.steerTheta, 0, 90),
        steerPhi: clampNum(l.steerPhi, -360, 360),
        sll: clampNum(l.sll, 15, 60),
      } as Params[K]
    }
  }
  return p
}
