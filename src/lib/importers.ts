import { N } from '../i18n'
import { FLOOR_DBI, D2R, fromDb, newGrid, toDb, type PatternGrid } from './grid'

export type ImportFormat = 'csv' | 'nec' | 'msi'
export type ImportOptions = {
  format?: ImportFormat | 'auto'
  /** CSV only: unit of the gain column. */
  gainUnit?: 'auto' | 'db' | 'linear'
  /** CSV only: whether the first angle is the polar angle from zenith or the elevation above the horizon. */
  angles?: 'auto' | 'zenith' | 'elevation'
}

/** A message for the UI: an English source string (translated by the caller) and its arguments. */
export type Note = [string, ...(string | number)[]]

export type ImportResult = {
  grid: PatternGrid
  format: ImportFormat
  name: string
  /** Number of data rows used. */
  points: number
  /** Share of the sphere (solid angle) that the file had data for. */
  coverage: number
  notes: Note[]
}

export class ImportError extends Error {
  note: Note
  constructor(...note: Note) {
    super(String(note[0]))
    this.note = note
  }
}

const num = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/
const isNum = (s: string) => num.test(s)

export function detectFormat(text: string): ImportFormat {
  if (/RADIATION\s+PATTERNS?/i.test(text) && /DEGREES/i.test(text)) return 'nec'
  if (/^\s*(HORIZONTAL|VERTICAL)\s+\d+/im.test(text)) return 'msi'
  return 'csv'
}

export function importPattern(text: string, opts: ImportOptions = {}): ImportResult {
  const fmt = opts.format && opts.format !== 'auto' ? opts.format : detectFormat(text)
  if (fmt === 'nec') return parseNec(text)
  if (fmt === 'msi') return parseMsi(text)
  return parseCsv(text, opts)
}

/* ---------- gridding scattered or lattice samples ---------- */

type Sample = { theta: number; phi: number; gain: number }

const mod360 = (a: number) => ((a % 360) + 360) % 360
const wrap180 = (a: number) => mod360(a + 180) - 180

function buildGrid(samples: Sample[]): { grid: PatternGrid; coverage: number } {
  const key = (v: number) => Math.round(v * 1000) / 1000
  const thetas = [...new Set(samples.map((s) => key(s.theta)))].sort((a, b) => a - b)
  const phis = [...new Set(samples.map((s) => key(mod360(s.phi))))].sort((a, b) => a - b)
  const grid = newGrid()
  const covered = new Uint8Array(grid.gain.length)
  const lattice = thetas.length >= 2 && samples.length >= 0.85 * thetas.length * phis.length
  if (lattice) fillLattice(grid, covered, samples, thetas, phis, key)
  else fillScattered(grid, covered, samples)
  let cov = 0
  let tot = 0
  for (let i = 0; i < grid.nTheta; i++) {
    const w = Math.sin(i * grid.dTheta * D2R) + 1e-9
    for (let j = 0; j < grid.nPhi; j++) {
      tot += w
      if (covered[i * grid.nPhi + j]) cov += w
    }
  }
  return { grid, coverage: cov / tot }
}

function fillLattice(grid: PatternGrid, covered: Uint8Array, samples: Sample[], thetas: number[], phis: number[], key: (v: number) => number) {
  const ti = new Map(thetas.map((v, i) => [v, i]))
  const pi = new Map(phis.map((v, i) => [v, i]))
  const nt = thetas.length
  const np = phis.length
  const lin = new Float64Array(nt * np).fill(-1)
  for (const s of samples) lin[ti.get(key(s.theta))! * np + pi.get(key(mod360(s.phi)))!] = fromDb(s.gain)
  // Missing lattice cells take the nearest known value in their row, else floor.
  for (let a = 0; a < nt; a++)
    for (let b = 0; b < np; b++)
      if (lin[a * np + b] < 0) {
        let best = -1
        for (let d = 1; d < np && best < 0; d++) {
          const l = lin[a * np + ((b - d + np) % np)]
          const r = lin[a * np + ((b + d) % np)]
          best = l >= 0 ? l : r >= 0 ? r : -1
        }
        lin[a * np + b] = best >= 0 ? best : 0
      }
  const step = np > 1 ? Math.min(...phis.slice(1).map((v, i) => v - phis[i]), 360 - (phis[np - 1] - phis[0])) : 360
  const periodic = np > 1 && phis[np - 1] - phis[0] + step >= 359
  const tmin = thetas[0]
  const tmax = thetas[nt - 1]
  for (let i = 0; i < grid.nTheta; i++) {
    const th = i * grid.dTheta
    if (th < tmin - 1e-6 || th > tmax + 1e-6) continue
    let a = 0
    while (a < nt - 2 && thetas[a + 1] < th) a++
    const ta = thetas[a]
    const tb = thetas[Math.min(a + 1, nt - 1)]
    const ft = tb > ta ? Math.min(1, Math.max(0, (th - ta) / (tb - ta))) : 0
    const rowA = a
    const rowB = Math.min(a + 1, nt - 1)
    for (let j = 0; j < grid.nPhi; j++) {
      const ph = j * grid.dPhi
      let b0: number
      let b1: number
      let fp: number
      if (np === 1) {
        b0 = b1 = 0
        fp = 0
      } else if (periodic) {
        // Find the lattice interval containing ph (wrapping around).
        let k = phis.length - 1
        for (let m = 0; m < np; m++) if (phis[m] <= ph + 1e-9) k = m
        b0 = k
        b1 = (k + 1) % np
        const p0 = phis[b0]
        const p1 = b1 === 0 ? phis[0] + 360 : phis[b1]
        const pp = ph < p0 ? ph + 360 : ph
        fp = (pp - p0) / (p1 - p0)
      } else {
        if (ph < phis[0] - step / 2 || ph > phis[np - 1] + step / 2) continue
        const c = Math.min(phis[np - 1], Math.max(phis[0], ph))
        let k = 0
        while (k < np - 2 && phis[k + 1] < c) k++
        b0 = k
        b1 = k + 1
        fp = (c - phis[k]) / (phis[k + 1] - phis[k])
      }
      const v =
        (1 - ft) * ((1 - fp) * lin[rowA * np + b0] + fp * lin[rowA * np + b1]) + ft * ((1 - fp) * lin[rowB * np + b0] + fp * lin[rowB * np + b1])
      grid.gain[i * grid.nPhi + j] = toDb(v)
      covered[i * grid.nPhi + j] = 1
    }
  }
}

/** Bins samples into cells, then spreads them to empty neighbours (up to ~20 degrees) by breadth-first search. */
function fillScattered(grid: PatternGrid, covered: Uint8Array, samples: Sample[]) {
  const sum = new Float64Array(grid.gain.length)
  const cnt = new Uint16Array(grid.gain.length)
  for (const s of samples) {
    const i = Math.min(grid.nTheta - 1, Math.max(0, Math.round(s.theta / grid.dTheta)))
    const j = Math.round(mod360(s.phi) / grid.dPhi) % grid.nPhi
    sum[i * grid.nPhi + j] += fromDb(s.gain)
    cnt[i * grid.nPhi + j]++
  }
  let queue: number[] = []
  const dist = new Int16Array(grid.gain.length).fill(-1)
  for (let n = 0; n < sum.length; n++)
    if (cnt[n]) {
      grid.gain[n] = toDb(sum[n] / cnt[n])
      covered[n] = 1
      dist[n] = 0
      queue.push(n)
    }
  for (let d = 1; d <= 20 && queue.length; d++) {
    const next: number[] = []
    for (const n of queue) {
      const i = Math.floor(n / grid.nPhi)
      const j = n % grid.nPhi
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di
        if (ii < 0 || ii >= grid.nTheta) continue
        const m = ii * grid.nPhi + ((j + dj + grid.nPhi) % grid.nPhi)
        if (dist[m] < 0) {
          dist[m] = d
          grid.gain[m] = grid.gain[n]
          next.push(m)
        }
      }
    }
    queue = next
  }
}

/* ---------- CSV ---------- */

function splitRow(line: string): string[] {
  const l = line.trim()
  if (l.includes(';')) return l.split(';').map((s) => s.trim().replace(',', '.'))
  return l.split(/[\s,]+/).filter((s) => s !== '')
}

function parseCsv(text: string, opts: ImportOptions): ImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/(#|\/\/).*$/, '').trim())
    .filter((l) => l !== '')
  const rows = lines.map(splitRow)
  let header: string[] | null = null
  if (rows.length && rows[0].some((c) => !isNum(c))) header = rows.shift()!.map((c) => c.toLowerCase().replace(/["']/g, ''))
  const data = rows.filter((r) => r.length >= 2 && r.slice(0, 3).every(isNum)).map((r) => r.map(Number))
  if (data.length < 2) throw new ImportError(N('No numeric rows found. Expected columns: theta, phi, gain.'))
  const cols = header ?? []
  const find = (re: RegExp) => cols.findIndex((c) => re.test(c))
  const width = Math.min(...data.map((r) => r.length))
  let it = find(/theta|zenith|polar|elev|^el\b|^th\b/)
  let ip = find(/phi|azim|^az\b|^ph\b/)
  let ig = find(/gain|db|mag|power|dir|pattern|level|amp/)
  if (width >= 3) {
    if (it < 0 && ip < 0) {
      it = 0
      ip = 1
    } else if (it < 0) it = [0, 1, 2].find((c) => c !== ip && c !== ig)!
    else if (ip < 0) ip = [0, 1, 2].find((c) => c !== it && c !== ig)!
    if (ig < 0) ig = [0, 1, 2].find((c) => c !== it && c !== ip)!
  } else {
    it = 0
    ip = -1
    ig = 1
  }
  const elevHeader = it >= 0 && /elev|^el\b/.test(cols[it] ?? '')
  const rawTheta = data.map((r) => r[it])
  const convention = opts.angles && opts.angles !== 'auto' ? opts.angles : elevHeader || Math.min(...rawTheta) < 0 ? 'elevation' : 'zenith'
  const rawGain = data.map((r) => r[ig])
  const linear = opts.gainUnit === 'linear' || (opts.gainUnit !== 'db' && header !== null && /lin|v\/m|ratio/.test(cols[ig] ?? ''))
  const notes: Note[] = []
  const samples: Sample[] = data.map((r, n) => {
    let theta = convention === 'elevation' ? 90 - r[it] : r[it]
    let phi = ip >= 0 ? r[ip] : 0
    if (ip < 0 && theta < 0) {
      theta = -theta // a 2-column cut given over -180..180
      phi = 180
    }
    return { theta, phi, gain: linear ? toDb(rawGain[n]) : Math.max(FLOOR_DBI, rawGain[n]) }
  })
  if (samples.some((s) => s.theta < -1e-6 || s.theta > 180 + 1e-6))
    throw new ImportError(N('Polar angles must lie within 0..180 degrees (or elevation within -90..90).'))
  if (ip < 0) {
    // One cut only: revolve it around the z axis.
    notes.push([N('Only one angle column: the cut is revolved about the z axis.')])
    const cut = samples.filter((s) => s.phi === 0)
    const full: Sample[] = []
    for (const s of cut) for (let p = 0; p < 360; p += 10) full.push({ theta: s.theta, phi: p, gain: s.gain })
    for (const s of samples.filter((s) => s.phi === 180)) for (let p = 0; p < 360; p += 10) full.push({ theta: s.theta, phi: p, gain: s.gain })
    return finish(buildGrid(full), 'csv', 'CSV', samples.length, notes, convention)
  }
  return finish(buildGrid(samples), 'csv', 'CSV', samples.length, notes, convention)
}

function finish(b: { grid: PatternGrid; coverage: number }, format: ImportFormat, name: string, points: number, notes: Note[], convention?: string): ImportResult {
  if (convention === 'elevation') notes.push([N('Angles read as elevation above the horizon (theta = 90 - angle).')])
  if (b.coverage < 0.98) notes.push([N('The file covers {0}% of the sphere; the rest is drawn as no radiation.'), Math.round(b.coverage * 100)])
  return { grid: b.grid, format, name, points, coverage: b.coverage, notes }
}

/* ---------- NEC2 radiation pattern tables ---------- */

function parseNec(text: string): ImportResult {
  const lines = text.split(/\r?\n/)
  let start = -1
  lines.forEach((l, i) => {
    if (/RADIATION\s+PATTERNS?/i.test(l)) start = i
  })
  if (start < 0) throw new ImportError(N('No "RADIATION PATTERNS" table found in the NEC output.'))
  const samples: Sample[] = []
  let seenHeader = false
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (/DEGREES/i.test(l)) {
      seenHeader = true
      continue
    }
    if (!seenHeader) continue
    const nums = l.match(/-?\d+\.\d+|-?\d+/g)
    const looksLikeRow = nums && nums.length >= 5 && /^\s*-?\d/.test(l)
    if (looksLikeRow) {
      const [theta, phi, , , total] = nums.map(Number)
      samples.push({ theta, phi, gain: Math.max(FLOOR_DBI, total) })
    } else if (l.trim() !== '' && samples.length) break
  }
  if (samples.length < 2) throw new ImportError(N('The NEC output has no pattern rows. Add an RP card and re-run.'))
  const notes: Note[] = [[N('Using the TOTAL power gain column (dBi); -999.99 means no radiation.')]]
  const mhz = text.match(/FREQUENCY\s*=?\s*:?\s*([\d.Ee+-]+)\s*MHZ/i)?.[1]
  return finish(buildGrid(samples), 'nec', mhz ? `NEC2 ${mhz} MHz` : 'NEC2', samples.length, notes)
}

/* ---------- MSI Planet / .pln antenna files ---------- */

type Cut1d = { angle: number; att: number }[]

function interp360(cut: Cut1d, a: number): number {
  const x = mod360(a)
  const n = cut.length
  if (n === 1) return cut[0].att
  // cut is sorted by angle in 0..360.
  let hi = cut.findIndex((c) => c.angle >= x)
  if (hi < 0) hi = 0
  const lo = (hi - 1 + n) % n
  const a0 = cut[lo].angle
  const a1 = cut[hi].angle
  const span = mod360(a1 - a0) || 360
  const f = mod360(x - a0) / span
  return cut[lo].att + f * (cut[hi].att - cut[lo].att)
}

function parseMsi(text: string): ImportResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const header = new Map<string, string>()
  const cuts: { H: Cut1d; V: Cut1d } = { H: [], V: [] }
  let cur: 'H' | 'V' | null = null
  for (const l of lines) {
    if (l === '') continue
    const m = l.match(/^([A-Za-z_]+)\s+(.*)$/)
    if (m && !isNum(m[1])) {
      const k = m[1].toUpperCase()
      if (k === 'HORIZONTAL' || k === 'VERTICAL') {
        cur = k === 'HORIZONTAL' ? 'H' : 'V'
      } else {
        cur = null
        header.set(k, m[2])
      }
      continue
    }
    if (cur) {
      const t = l.split(/[\s,;]+/).map(Number)
      if (t.length >= 2 && t.every((v) => Number.isFinite(v))) cuts[cur].push({ angle: mod360(t[0]), att: t[1] })
    }
  }
  if (!cuts.H.length || !cuts.V.length) throw new ImportError(N('The MSI file needs both HORIZONTAL and VERTICAL sections.'))
  cuts.H.sort((a, b) => a.angle - b.angle)
  cuts.V.sort((a, b) => a.angle - b.angle)
  const g = (header.get('GAIN') ?? '0').match(/^([-+\d.eE]+)\s*(\w*)/)
  const gainVal = g ? Number(g[1]) : 0
  const unit = (g?.[2] ?? 'dBd').toLowerCase()
  const g0 = unit === 'dbi' ? gainVal : gainVal + 2.15
  const grid = newGrid()
  for (let i = 0; i < grid.nTheta; i++) {
    const el = 90 - i * grid.dTheta
    for (let j = 0; j < grid.nPhi; j++) {
      const az = -j * grid.dPhi // compass azimuth runs clockwise, phi counter-clockwise
      // Front half-plane uses V(el); behind the panel the vertical cut is mirrored over the zenith. Smooth hand-over between 60 and 120 degrees.
      const w = (1 + Math.cos(Math.min(1, Math.max(0, (Math.abs(wrap180(az)) - 60) / 60)) * Math.PI)) / 2
      const v = w * interp360(cuts.V, el) + (1 - w) * interp360(cuts.V, 180 - el)
      grid.gain[i * grid.nPhi + j] = Math.max(FLOOR_DBI, g0 - Math.min(100, interp360(cuts.H, az) + v))
    }
  }
  const notes: Note[] = [
    [N('The 3-D pattern is rebuilt from the two cuts (horizontal + vertical attenuation), so it is an approximation. Boresight is +x.')],
    [N('Gain {0} dBi (from {1} {2}).'), +g0.toFixed(2), gainVal, unit === 'dbi' ? 'dBi' : 'dBd'],
  ]
  const name = [header.get('MAKE'), header.get('NAME')].filter(Boolean).join(' ') || 'MSI'
  return { grid, format: 'msi', name, points: cuts.H.length + cuts.V.length, coverage: 1, notes }
}

/* ---------- export ---------- */

/** CSV of theta, phi, gain on a coarse grid (default every 5 degrees). */
export function exportCsv(grid: PatternGrid, stepDeg = 5): string {
  const out = ['theta_deg,phi_deg,gain_dBi']
  const sT = Math.max(1, Math.round(stepDeg / grid.dTheta))
  const sP = Math.max(1, Math.round(stepDeg / grid.dPhi))
  for (let i = 0; i < grid.nTheta; i += sT)
    for (let j = 0; j < grid.nPhi; j += sP) out.push(`${+(i * grid.dTheta).toFixed(2)},${+(j * grid.dPhi).toFixed(2)},${grid.gain[i * grid.nPhi + j].toFixed(2)}`)
  return out.join('\n') + '\n'
}
