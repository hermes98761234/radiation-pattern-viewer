import { patchGrid, yagiGrid } from './analytic'
import { FLOOR_DBI, type PatternGrid } from './grid'

/** Generated example files, so the importers have something to show without bundling data. */

function sampleRows(grid: PatternGrid, stepTheta: number, stepPhi: number, thetaMax = 180) {
  const rows: { theta: number; phi: number; gain: number }[] = []
  for (let th = 0; th <= thetaMax; th += stepTheta)
    for (let ph = 0; ph < 360; ph += stepPhi) rows.push({ theta: th, phi: ph, gain: grid.gain[Math.round(th / grid.dTheta) * grid.nPhi + Math.round(ph / grid.dPhi)] })
  return rows
}

/** Patch antenna as "theta,phi,gain" with a header, 10 degree steps over the upper half space. */
export function sampleCsv(): string {
  const g = patchGrid({ length: 0.33, width: 0.45 })
  return (
    'theta_deg,phi_deg,gain_dBi\n' +
    sampleRows(g, 10, 15, 180)
      .map((r) => `${r.theta},${r.phi},${r.gain.toFixed(2)}`)
      .join('\n') +
    '\n'
  )
}

/** A NEC2-style "RADIATION PATTERNS" table (5 degree theta, 10 degree phi) for a 5-element Yagi. */
export function sampleNec(): string {
  const g = yagiGrid({ directors: 3, reflectorSpacing: 0.2, directorSpacing: 0.3, drivenLength: 0.47, directorLength: 0.95 })
  const f = (v: number, w = 9, d = 2) => v.toFixed(d).padStart(w)
  const out = [
    '                               - - - - - - FREQUENCY - - - - - -',
    '',
    '                            FREQUENCY :  144.0000 MHZ',
    '',
    '                                 - - - RADIATION PATTERNS - - -',
    '',
    ' - - ANGLES - -       - POWER GAINS -       - - - POLARIZATION - - -   - - - E(THETA) - - -    - - - E(PHI) - - -',
    '  THETA    PHI       VERT.   HOR.   TOTAL    AXIAL     TILT   SENSE    MAGNITUDE    PHASE      MAGNITUDE   PHASE',
    ' DEGREES  DEGREES       DB      DB      DB     RATIO  DEGREES            VOLTS/M   DEGREES      VOLTS/M    DEGREES',
  ]
  for (const r of sampleRows(g, 5, 10)) {
    const total = Math.max(r.gain, -999.99)
    const vert = r.gain <= FLOOR_DBI + 1 ? -999.99 : r.gain
    const mag = Math.pow(10, total / 20) * 0.0125
    out.push(`${f(r.theta, 9)} ${f(r.phi, 8)} ${f(vert, 9)} ${f(-999.99, 8)} ${f(total, 8)} ${f(0, 11, 5)} ${f(0, 9)}  LINEAR  ${mag.toExponential(4).padStart(12)} ${f(0, 9)} ${(0).toExponential(4).padStart(12)} ${f(0, 9)}`)
  }
  return out.join('\n') + '\n'
}

/** MSI Planet file for a 65 degree, 15 dBi sector panel with 4 degrees of electrical downtilt (3GPP-style cuts). */
export function sampleMsi(): string {
  const hw = 65
  const vw = 7.5
  const tilt = 4
  const att = (x: number, w: number, max: number) => Math.min(12 * (x / w) ** 2, max)
  const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180
  const out = ['NAME SAMPLE-65-15', 'MAKE Example', 'FREQUENCY 1800', 'GAIN 15.0 dBi', `H_WIDTH ${hw}`, `V_WIDTH ${vw}`, 'FRONT_TO_BACK 30', `TILT ELECTRICAL ${tilt}`, 'POLARIZATION VERTICAL', 'HORIZONTAL 360']
  for (let a = 0; a < 360; a++) out.push(`${a} ${att(wrap(a), hw, 30).toFixed(2)}`)
  out.push('VERTICAL 360')
  // Elevation: 0 = boresight, positive up. The beam is tilted down, so its peak is at -tilt degrees.
  for (let a = 0; a < 360; a++) out.push(`${a} ${att(wrap(a) + tilt, vw, 25).toFixed(2)}`)
  return out.join('\n') + '\n'
}
