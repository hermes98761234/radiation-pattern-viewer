import { describe, expect, it } from 'vitest'
import { azimuthCut, elevationCut, type Cut, findPeak, frontBack, halfPowerBeamwidth, peakCuts, sidelobeLevel, CUT_ZERO } from './analysis'
import {
  dipoleGrid,
  linearGrid,
  monopoleGrid,
  patchDesign,
  patchGrid,
  planarGrid,
  taperWeights,
  yagiGrid,
  type LinearParams,
  type PlanarParams,
  type YagiParams,
} from './analytic'
import { D2R, gridStats, sampleGain, type PatternGrid } from './grid'

const lin = (over: Partial<LinearParams> = {}): LinearParams => ({ n: 8, spacing: 0.5, steer: 0, axis: 'x', taper: 'uniform', sll: 30, element: 'isotropic', ...over })
/** Half-plane cut along theta (0..180) at phi = 0: one copy of a beam that a full circle would show twice. */
const thetaCut = (g: PatternGrid): Cut =>
  Array.from({ length: 721 }, (_, i) => ({ angle: i / 4, gain: sampleGain(g, i / 4, 0), theta: i / 4, phi: 0 }))
const yagi3: YagiParams = { directors: 1, reflectorSpacing: 0.2, directorSpacing: 0.3, drivenLength: 0.47, directorLength: 0.95 }

describe('dipole', () => {
  it('half-wave dipole: 2.15 dBi, 78 degree E-plane beamwidth, omni H-plane', () => {
    const g = dipoleGrid({ length: 0.5 })
    const s = gridStats(g)
    expect(s.peakDbi).toBeCloseTo(2.15, 1)
    expect(s.efficiency).toBeCloseTo(1, 2)
    const pk = findPeak(g)
    expect(pk.theta).toBe(90)
    const e = elevationCut(g, 0)
    expect(halfPowerBeamwidth(e, e.findIndex((p) => p.angle === 90))?.width).toBeCloseTo(78.1, 0)
    expect(halfPowerBeamwidth(azimuthCut(g, 90))).toBeNull()
  })
  it('short dipole: 1.76 dBi (D = 1.5), 90 degree beamwidth', () => {
    const g = dipoleGrid({ length: 0.01 })
    expect(gridStats(g).peakDbi).toBeCloseTo(1.76, 1)
    const e = elevationCut(g, 0)
    expect(halfPowerBeamwidth(e, e.findIndex((p) => p.angle === 90))?.width).toBeCloseTo(90, 0)
  })
  it('full-wave dipole: about 3.8 dBi', () => {
    expect(gridStats(dipoleGrid({ length: 1 })).peakDbi).toBeCloseTo(3.8, 1)
  })
  it('1.5 wavelength dipole peaks off the horizon plane null-free lobes', () => {
    const g = dipoleGrid({ length: 1.5 })
    expect(gridStats(g).efficiency).toBeCloseTo(1, 2)
    expect(findPeak(g).theta).not.toBe(90)
  })
})

describe('monopole', () => {
  it('quarter-wave over perfect ground: 5.16 dBi, upper half only', () => {
    const g = monopoleGrid({ height: 0.25 })
    expect(gridStats(g).peakDbi).toBeCloseTo(5.16, 1)
    expect(sampleGain(g, 120, 0)).toBeLessThan(-60)
    expect(findPeak(g).theta).toBe(90)
    expect(gridStats(g).efficiency).toBeCloseTo(1, 1)
  })
  it('5/8 wave monopole (1.25 lambda image dipole) has more gain than quarter-wave', () => {
    const q = gridStats(monopoleGrid({ height: 0.25 })).peakDbi
    const g = gridStats(monopoleGrid({ height: 0.625 })).peakDbi
    expect(g).toBeGreaterThan(q + 2)
    expect(g).toBeCloseTo(5.2 + 3.01, 0)
  })
})

describe('linear array', () => {
  it('8 isotropic elements at half-wave spacing: D = N, beamwidth 0.886 lambda/(N d)', () => {
    const g = linearGrid(lin())
    expect(gridStats(g).peakDbi).toBeCloseTo(10 * Math.log10(8), 1)
    const c = azimuthCut(g, 90) // axis x: the cut around phi = 90 holds the broadside beam
    const i = c.findIndex((p) => p.angle === 90)
    expect(halfPowerBeamwidth(c, i)?.width).toBeCloseTo(12.8, 0)
  })
  it('uniform array has a -13.3 dB first sidelobe', () => {
    const g = linearGrid(lin({ n: 16, axis: 'z' }))
    const c = thetaCut(g)
    expect(sidelobeLevel(c, c.findIndex((p) => p.angle === 90))).toBeCloseTo(-13.3, 0)
  })
  it('steers the beam', () => {
    const g = linearGrid(lin({ axis: 'z', steer: 30 }))
    expect(findPeak(g).theta).toBeCloseTo(60, 0)
  })
  it('Dolph-Chebyshev taper reaches its design sidelobe level', () => {
    const g = linearGrid(lin({ n: 12, taper: 'chebyshev', sll: 30, axis: 'z' }))
    const c = thetaCut(g)
    expect(sidelobeLevel(c, c.findIndex((p) => p.angle === 90))).toBeCloseTo(-30, 0)
  })
  it('endfire needs steer = 90', () => {
    const g = linearGrid(lin({ axis: 'x', steer: 90, spacing: 0.25, n: 6 }))
    const pk = findPeak(g)
    expect(Math.abs(pk.theta - 90)).toBeLessThanOrEqual(2) // the end-fire maximum is very flat
    expect(pk.phi).toBe(0)
  })
})

describe('planar array', () => {
  it('matches the sinc-sum directivity of in-phase isotropic elements', () => {
    const p: PlanarParams = { nx: 4, ny: 4, dx: 0.5, dy: 0.5, steerTheta: 0, steerPhi: 0, taper: 'uniform', sll: 30, element: 'isotropic' }
    const g = planarGrid(p)
    // D = N^2 / sum_m sum_n sin(k r_mn) / (k r_mn)
    const pts: [number, number][] = []
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) pts.push([i * 0.5, j * 0.5])
    let s = 0
    for (const a of pts)
      for (const b of pts) {
        const x = 2 * Math.PI * Math.hypot(a[0] - b[0], a[1] - b[1])
        s += x === 0 ? 1 : Math.sin(x) / x
      }
    const expected = 10 * Math.log10(256 / s)
    expect(gridStats(g).peakDbi).toBeCloseTo(expected, 1)
    expect(findPeak(g).theta).toBe(0)
  })
  it('steers to theta/phi', () => {
    const g = planarGrid({ nx: 8, ny: 8, dx: 0.5, dy: 0.5, steerTheta: 30, steerPhi: 45, taper: 'uniform', sll: 30, element: 'cosine' })
    const pk = findPeak(g)
    expect(pk.theta).toBeGreaterThan(26)
    expect(pk.theta).toBeLessThan(33)
    expect(Math.abs(pk.phi - 45)).toBeLessThanOrEqual(2)
  })
})

describe('patch', () => {
  it('Balanis design example: 10 GHz, er 2.2, h 1.588 mm', () => {
    const d = patchDesign(10e9, 2.2, 0.001588)
    expect(d.width * 100).toBeCloseTo(1.186, 2)
    expect(d.eeff).toBeCloseTo(1.972, 2)
    expect(d.length * 100).toBeCloseTo(0.906, 2)
  })
  it('radiates broadside into the upper half space with a plausible gain and beamwidths', () => {
    const g = patchGrid({ length: 0.33, width: 0.45 })
    const s = gridStats(g)
    expect(s.peakDbi).toBeGreaterThan(6)
    expect(s.peakDbi).toBeLessThan(9.5)
    expect(findPeak(g).theta).toBe(0)
    expect(sampleGain(g, 135, 20)).toBeLessThan(-60)
    const { a, b } = peakCuts(g, findPeak(g))
    const e = halfPowerBeamwidth(a, CUT_ZERO)!.width
    const h = halfPowerBeamwidth(b, CUT_ZERO)!.width
    expect(e).toBeGreaterThan(50)
    expect(e).toBeLessThan(110)
    expect(h).toBeGreaterThan(50)
    expect(h).toBeLessThan(120)
  })
})

describe('yagi', () => {
  it('3 elements: forward gain, good front-to-back', () => {
    const g = yagiGrid(yagi3)
    const pk = findPeak(g)
    expect(pk.theta).toBe(90)
    expect(pk.phi).toBe(0)
    expect(pk.gain).toBeGreaterThan(6)
    expect(pk.gain).toBeLessThan(10.5)
    expect(frontBack(g, pk).frontToBack).toBeGreaterThan(12)
  })
  it('more directors give more gain and a narrower beam', () => {
    const g3 = gridStats(yagiGrid(yagi3)).peakDbi
    const g5 = gridStats(yagiGrid({ ...yagi3, directors: 3 })).peakDbi
    const g9 = gridStats(yagiGrid({ ...yagi3, directors: 7 })).peakDbi
    expect(g5).toBeGreaterThan(g3 + 1)
    expect(g9).toBeGreaterThan(g5 + 1.5)
    expect(g5).toBeLessThan(12)
    expect(g9).toBeLessThan(15)
  })
})

describe('tapers', () => {
  it('are symmetric and peak-normalised', () => {
    for (const k of ['uniform', 'hamming', 'hann', 'blackman', 'triangular', 'chebyshev'] as const) {
      const w = taperWeights(k, 9)
      expect(Math.max(...w)).toBeCloseTo(1, 9)
      for (let i = 0; i < w.length; i++) expect(w[i]).toBeCloseTo(w[w.length - 1 - i], 6)
    }
  })
  it('hamming end weights are 0.08', () => {
    expect(taperWeights('hamming', 8)[0]).toBeCloseTo(0.08, 9)
  })
  it('Chebyshev N=4 matches the known 1 : 1.84 : 1.84 : 1 weights at -26 dB... (monotone edge taper)', () => {
    const w = taperWeights('chebyshev', 5, 20)
    expect(w[2]).toBeCloseTo(1, 9)
    expect(w[0]).toBeLessThan(w[1])
    expect(w[1]).toBeLessThan(w[2])
  })
  it('angle helper sanity', () => {
    expect(Math.sin(30 * D2R)).toBeCloseTo(0.5, 12)
  })
})
