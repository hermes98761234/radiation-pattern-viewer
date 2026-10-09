import { describe, expect, it } from 'vitest'
import { yagiGrid } from './analytic'
import { findPeak } from './analysis'
import { FLOOR_DBI, gridStats, sampleGain } from './grid'
import { detectFormat, exportCsv, importPattern, ImportError } from './importers'
import { sampleCsv, sampleMsi, sampleNec } from './samples'

describe('CSV', () => {
  it('reads a theta/phi/gain table with header and keeps the values', () => {
    const rows = ['theta,phi,gain']
    for (let t = 0; t <= 180; t += 10) for (let p = 0; p < 360; p += 20) rows.push(`${t},${p},${(5 - t / 30).toFixed(2)}`)
    const r = importPattern(rows.join('\n'))
    expect(r.format).toBe('csv')
    expect(r.coverage).toBeGreaterThan(0.98)
    expect(sampleGain(r.grid, 0, 0)).toBeCloseTo(5, 1)
    expect(sampleGain(r.grid, 90, 100)).toBeCloseTo(2, 1)
    expect(sampleGain(r.grid, 95, 33)).toBeCloseTo(5 - 95 / 30, 1) // interpolated between lattice points
    expect(sampleGain(r.grid, 180, 250)).toBeCloseTo(-1, 1)
  })
  it('handles semicolons, tabs and column names in any order', () => {
    const a = importPattern('phi;theta;gain_dB\n' + [0, 90, 180, 270].flatMap((p) => [0, 90, 180].map((t) => `${p};${t};${t === 90 ? '3,5' : '0'}`)).join('\n'))
    expect(sampleGain(a.grid, 90, 90)).toBeCloseTo(3.5, 1)
    const b = importPattern('theta\tphi\tgain\n0\t0\t1\n0\t90\t1\n90\t0\t4\n90\t90\t4\n180\t0\t1\n180\t90\t1')
    expect(sampleGain(b.grid, 90, 0)).toBeCloseTo(4, 1)
  })
  it('reads elevation angles when they go negative or the header says so', () => {
    const rows = ['elevation,azimuth,gain']
    for (const el of [-90, 0, 90]) for (const az of [0, 90, 180, 270]) rows.push(`${el},${az},${el === 0 ? 6 : 0}`)
    const r = importPattern(rows.join('\n'))
    expect(findPeak(r.grid).theta).toBe(90)
    expect(r.notes.length).toBeGreaterThan(0)
  })
  it('converts linear power to dB', () => {
    const rows = ['theta,phi,gain_linear']
    for (const t of [0, 90, 180]) for (const p of [0, 120, 240]) rows.push(`${t},${p},${t === 90 ? 2 : 1}`)
    const r = importPattern(rows.join('\n'))
    expect(sampleGain(r.grid, 90, 0)).toBeCloseTo(3.01, 1)
    expect(sampleGain(r.grid, 0, 0)).toBeCloseTo(0, 1)
  })
  it('revolves a single cut and reports partial coverage', () => {
    const rows = ['angle,gain']
    for (let t = 0; t <= 90; t += 10) rows.push(`${t},${10 - t / 9}`)
    const r = importPattern(rows.join('\n'))
    expect(r.coverage).toBeGreaterThan(0.45)
    expect(r.coverage).toBeLessThan(0.55)
    expect(sampleGain(r.grid, 0, 77)).toBeCloseTo(10, 1)
    expect(sampleGain(r.grid, 120, 0)).toBe(FLOOR_DBI)
  })
  it('rejects garbage', () => {
    expect(() => importPattern('hello world')).toThrow(ImportError)
    expect(() => importPattern('theta,phi,gain\n400,0,1\n500,10,2')).toThrow(ImportError)
  })
})

const NEC = `
                               - - - - - - FREQUENCY - - - - - -

                            FREQUENCY :  299.8000 MHZ

                                 - - - RADIATION PATTERNS - - -

 - - ANGLES - -       - POWER GAINS -       - - - POLARIZATION - - -   - - - E(THETA) - - -    - - - E(PHI) - - -
  THETA    PHI       VERT.   HOR.   TOTAL    AXIAL     TILT   SENSE    MAGNITUDE    PHASE      MAGNITUDE   PHASE
 DEGREES  DEGREES       DB      DB      DB     RATIO  DEGREES            VOLTS/M   DEGREES      VOLTS/M    DEGREES
     0.00     0.00  -999.99 -999.99 -999.99  0.00000    0.00  LINEAR   0.0000E+00      0.00   0.0000E+00      0.00
    30.00     0.00    -1.17 -999.99   -1.17  0.00000    0.00  LINEAR   2.1850E-01      0.00   0.0000E+00      0.00
    60.00     0.00     1.26 -999.99    1.26  0.00000    0.00  LINEAR   2.8884E-01      0.00   0.0000E+00      0.00
    90.00     0.00     2.15 -999.99    2.15  0.00000    0.00  LINEAR   3.2100E-01      0.00   0.0000E+00      0.00
   120.00     0.00     1.26 -999.99    1.26  0.00000    0.00  LINEAR   2.8884E-01      0.00   0.0000E+00      0.00
   150.00     0.00    -1.17-999.99   -1.17  0.00000    0.00  LINEAR   2.1850E-01      0.00   0.0000E+00      0.00
   180.00     0.00  -999.99 -999.99 -999.99  0.00000    0.00  LINEAR   0.0000E+00      0.00   0.0000E+00      0.00
     0.00    90.00  -999.99 -999.99 -999.99  0.00000    0.00  LINEAR   0.0000E+00      0.00   0.0000E+00      0.00
    30.00    90.00     -1.17 -999.99   -1.17  0.00000    0.00  LINEAR   2.1850E-01      0.00   0.0000E+00      0.00
    60.00    90.00      1.26 -999.99    1.26  0.00000    0.00  LINEAR   2.8884E-01      0.00   0.0000E+00      0.00
    90.00    90.00      2.15 -999.99    2.15  0.00000    0.00  LINEAR   3.2100E-01      0.00   0.0000E+00      0.00
   120.00    90.00      1.26 -999.99    1.26  0.00000    0.00  LINEAR   2.8884E-01      0.00   0.0000E+00      0.00
   150.00    90.00     -1.17 -999.99   -1.17  0.00000    0.00  LINEAR   2.1850E-01      0.00   0.0000E+00      0.00
   180.00    90.00  -999.99 -999.99 -999.99  0.00000    0.00  LINEAR   0.0000E+00      0.00   0.0000E+00      0.00

 AVERAGE POWER GAIN: 1.0000 - SOLID ANGLE USED IN AVERAGING: (4.0000)*PI STERADIANS.
`

describe('NEC2', () => {
  it('detects and parses the TOTAL gain column, including glued columns and -999.99', () => {
    expect(detectFormat(NEC)).toBe('nec')
    const r = importPattern(NEC)
    expect(r.format).toBe('nec')
    expect(r.points).toBe(14)
    expect(r.name).toContain('299.8')
    expect(sampleGain(r.grid, 90, 0)).toBeCloseTo(2.15, 1)
    expect(sampleGain(r.grid, 150, 90)).toBeCloseTo(-1.17, 1)
    expect(sampleGain(r.grid, 0, 0)).toBe(FLOOR_DBI)
    expect(findPeak(r.grid).gain).toBeCloseTo(2.15, 1)
  })
  it('round-trips the generated sample (Yagi) to within a fraction of a dB', () => {
    const text = sampleNec()
    expect(detectFormat(text)).toBe('nec')
    const r = importPattern(text)
    const ref = yagiGrid({ directors: 3, reflectorSpacing: 0.2, directorSpacing: 0.3, drivenLength: 0.47, directorLength: 0.95 })
    expect(findPeak(r.grid).gain).toBeCloseTo(findPeak(ref).gain, 0)
    expect(findPeak(r.grid).phi).toBe(0)
    expect(sampleGain(r.grid, 90, 180)).toBeLessThan(findPeak(r.grid).gain - 10)
  })
  it('errors when the table has no rows', () => {
    expect(() => importPattern('- - - RADIATION PATTERNS - - -\n DEGREES DEGREES\n')).toThrow(ImportError)
  })
})

describe('MSI Planet', () => {
  it('rebuilds the 3-D pattern: boresight gain, 3 dB azimuth width and downtilt', () => {
    const text = sampleMsi()
    expect(detectFormat(text)).toBe('msi')
    const r = importPattern(text)
    expect(r.format).toBe('msi')
    expect(r.name).toContain('SAMPLE')
    const pk = findPeak(r.grid)
    expect(pk.gain).toBeCloseTo(15, 0)
    expect(pk.phi).toBe(0)
    expect(pk.theta).toBe(94) // 4 degrees electrical downtilt
    // 3GPP: 12 (x / 65)^2 = 3 dB at x = 32.5 degrees
    expect(sampleGain(r.grid, 94, 32)).toBeCloseTo(15 - 3, 0)
    expect(sampleGain(r.grid, 94, 180)).toBeLessThan(15 - 29)
  })
  it('converts dBd to dBi', () => {
    const text = 'NAME x\nGAIN 10 dBd\nHORIZONTAL 4\n0 0\n90 3\n180 20\n270 3\nVERTICAL 4\n0 0\n90 10\n180 20\n270 10\n'
    expect(findPeak(importPattern(text).grid).gain).toBeCloseTo(12.15, 1)
  })
  it('needs both cuts', () => {
    expect(() => importPattern('GAIN 3 dBi\nHORIZONTAL 2\n0 0\n180 10\n')).toThrow(ImportError)
  })
})

describe('export', () => {
  it('writes a CSV that imports back to the same peak', () => {
    const grid = yagiGrid({ directors: 3, reflectorSpacing: 0.2, directorSpacing: 0.3, drivenLength: 0.47, directorLength: 0.95 })
    const r = importPattern(exportCsv(grid, 5))
    expect(findPeak(r.grid).gain).toBeCloseTo(findPeak(grid).gain, 0)
    expect(gridStats(r.grid).efficiency).toBeCloseTo(1, 1)
  })
  it('sample CSV imports', () => {
    expect(importPattern(sampleCsv()).coverage).toBeGreaterThan(0.98)
  })
})
