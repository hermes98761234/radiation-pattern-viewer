import { describe, expect, it } from 'vitest'
import { CUT_N, CUT_ZERO, azimuthCut, elevationCut, findPeak, frontBack, halfPowerBeamwidth, peakCuts, sidelobeLevel, type Cut } from './analysis'
import { dipoleGrid, patchGrid } from './analytic'
import { analyze } from './build'
import { D2R, FLOOR_DBI, N_PHI, dirVec, newGrid, sampleGain, vecAngles } from './grid'

const cosCut = (pow: number): Cut =>
  Array.from({ length: CUT_N }, (_, i) => {
    const angle = -180 + (i * 360) / CUT_N
    const c = Math.cos(angle * D2R)
    return { angle, gain: c > 0 ? 10 * Math.log10(c ** pow) : FLOOR_DBI, theta: 0, phi: 0 }
  })

describe('beamwidth', () => {
  it('cos^2 power pattern has a 90 degree half-power width', () => {
    expect(halfPowerBeamwidth(cosCut(2))?.width).toBeCloseTo(90, 0)
  })
  it('cos^1 power pattern is 120 degrees wide', () => {
    expect(halfPowerBeamwidth(cosCut(1))?.width).toBeCloseTo(120, 0)
  })
  it('is null for an omnidirectional cut', () => {
    expect(halfPowerBeamwidth(Array.from({ length: CUT_N }, (_, i) => ({ angle: i, gain: 2, theta: 0, phi: 0 })))).toBeNull()
  })
})

describe('sample / direction helpers', () => {
  it('bilinear sampling hits grid nodes exactly and wraps phi', () => {
    const g = newGrid(0)
    g.gain[10 * N_PHI + 359] = 5
    g.gain[10 * N_PHI + 0] = 5
    expect(sampleGain(g, 10, 359)).toBeCloseTo(5, 3)
    expect(sampleGain(g, 10, 359.5)).toBeCloseTo(5, 3)
  })
  it('vecAngles inverts dirVec', () => {
    const { theta, phi } = vecAngles(dirVec(65, 200))
    expect(theta).toBeCloseTo(65, 9)
    expect(phi).toBeCloseTo(200, 9)
  })
})

describe('cuts of a dipole', () => {
  const g = dipoleGrid({ length: 0.5 })
  it('E-plane (through the peak and z) is a figure of eight, H-plane is omnidirectional', () => {
    const pk = findPeak(g)
    const { a, b } = peakCuts(g, pk)
    expect(a[CUT_ZERO].gain).toBeCloseTo(2.15, 1)
    expect(halfPowerBeamwidth(a, CUT_ZERO)?.width).toBeCloseTo(78.1, 0)
    expect(halfPowerBeamwidth(b, CUT_ZERO)).toBeNull()
    // The null of the figure of eight lies 90 degrees from the peak.
    expect(a[CUT_ZERO + 180].gain).toBeLessThan(-40)
  })
  it('elevation cut angle runs from the zenith', () => {
    const e = elevationCut(g, 0)
    expect(e[CUT_ZERO].gain).toBeLessThan(-40) // zenith
    expect(e[CUT_ZERO + 180].gain).toBeCloseTo(2.15, 1)
    expect(azimuthCut(g, 90)[0].gain).toBeCloseTo(2.15, 1)
  })
  it('front-to-back of a symmetric pattern is 0 dB', () => {
    const pk = findPeak(g)
    expect(frontBack(g, pk).frontToBack).toBeCloseTo(0, 1)
  })
})

describe('patch', () => {
  it('has a very deep back lobe and a sidelobe-free main cut', () => {
    const g = patchGrid({ length: 0.33, width: 0.45 })
    const pk = findPeak(g)
    expect(frontBack(g, pk).frontToBack).toBeGreaterThan(60)
    const { a } = peakCuts(g, pk)
    expect(sidelobeLevel(a, CUT_ZERO)).toBeLessThan(-40)
  })
})

describe('analyze', () => {
  it('collects readouts for the peak cut mode and the plane mode', () => {
    const g = dipoleGrid({ length: 0.5 })
    const p = analyze(g, { cutMode: 'peak', cutRotation: 0, cutPhi: 0, cutTheta: 90 }, true)
    expect(p.titleA[0]).toContain('E-plane')
    expect(p.hpbwA?.width).toBeCloseTo(78.1, 0)
    expect(p.hpbwB).toBeNull()
    const q = analyze(g, { cutMode: 'plane', cutRotation: 0, cutPhi: 0, cutTheta: 90 }, true)
    expect(q.hpbwA?.width).toBeCloseTo(78.1, 0)
    expect(q.stats.peakDbi).toBeCloseTo(2.15, 1)
  })
})
