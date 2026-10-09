import { dipoleGrid, linearGrid, monopoleGrid, patchGrid, planarGrid, yagiGrid } from './analytic'
import { azimuthCut, argmax, CUT_ZERO, elevationCut, findPeak, frontBack, halfPowerBeamwidth, peakCuts, sidelobeLevel, type Beamwidth, type Cut, type FrontBack, type Peak } from './analysis'
import type { Display, Kind, Params } from './model'
import { sanitize } from './model'
import { N } from '../i18n'
import { gridStats, type GridStats, type PatternGrid } from './grid'
import type { Note } from './importers'

export type Analytic = Exclude<Kind, 'import'>

export function buildPattern(kind: Analytic, params: Params): PatternGrid {
  switch (kind) {
    case 'dipole':
      return dipoleGrid(sanitize('dipole', params.dipole))
    case 'monopole':
      return monopoleGrid(sanitize('monopole', params.monopole))
    case 'yagi':
      return yagiGrid(sanitize('yagi', params.yagi))
    case 'patch':
      return patchGrid(sanitize('patch', params.patch))
    case 'linear':
      return linearGrid(sanitize('linear', params.linear))
    case 'planar':
      return planarGrid(sanitize('planar', params.planar))
  }
}

/** Whether cut A / cut B through the peak are the E- and H-plane (true for the linearly polarised single antennas). */
export function hasEHPlanes(kind: Kind): boolean {
  return kind === 'dipole' || kind === 'monopole' || kind === 'yagi' || kind === 'patch'
}

export type Analysis = {
  stats: GridStats
  peak: Peak
  fb: FrontBack
  cutA: Cut
  cutB: Cut
  centerA: number
  centerB: number
  hpbwA: Beamwidth | null
  hpbwB: Beamwidth | null
  sllA: number | null
  sllB: number | null
  titleA: Note
  titleB: Note
}

export function analyze(grid: PatternGrid, d: Pick<Display, 'cutMode' | 'cutRotation' | 'cutPhi' | 'cutTheta'>, eh: boolean): Analysis {
  const stats = gridStats(grid)
  const peak = findPeak(grid)
  const fb = frontBack(grid, peak)
  let cutA: Cut
  let cutB: Cut
  let titleA: Note
  let titleB: Note
  if (d.cutMode === 'peak') {
    const c = peakCuts(grid, peak, d.cutRotation)
    cutA = c.a
    cutB = c.b
    const rot = d.cutRotation === 0
    titleA = eh && rot ? [N('E-plane (through the peak and z)')] : [N('Plane A (through the peak and z)')]
    titleB = eh && rot ? [N('H-plane (perpendicular to the E-plane)')] : [N('Plane B (perpendicular to A)')]
  } else {
    cutA = elevationCut(grid, d.cutPhi)
    cutB = azimuthCut(grid, d.cutTheta)
    titleA = [N('Elevation cut at φ = {0}°'), d.cutPhi]
    titleB = [N('Azimuth cut at θ = {0}°'), d.cutTheta]
  }
  const peakMode = d.cutMode === 'peak'
  const centerA = peakMode ? CUT_ZERO : argmax(cutA)
  const centerB = peakMode ? CUT_ZERO : argmax(cutB)
  return {
    stats,
    peak,
    fb,
    cutA,
    cutB,
    centerA,
    centerB,
    hpbwA: halfPowerBeamwidth(cutA, centerA),
    hpbwB: halfPowerBeamwidth(cutB, centerB),
    sllA: sidelobeLevel(cutA, centerA),
    sllB: sidelobeLevel(cutB, centerB),
    titleA,
    titleB,
  }
}
