import type { Beamwidth } from '../lib/analysis'
import type { Analysis } from '../lib/build'
import type { T } from '../i18n'

const DBD = 2.15

const db = (v: number, digits = 1) => `${v.toFixed(digits)} dB`

function width(b: Beamwidth | null, t: T) {
  return b ? `${b.width.toFixed(1)}°` : t('omnidirectional')
}

function sidelobe(v: number | null, t: T) {
  if (v === null) return t('none')
  if (v < -60) return '< −60 dB'
  return db(v)
}

function ratio(v: number, t: T) {
  return v > 60 ? t('> {0} dB', 60) : db(v)
}

type Props = {
  a: Analysis
  /** Show the integral-based efficiency (imported measured/simulated data, not the lossless analytic models). */
  showEfficiency: boolean
  t: T
}

export default function Readouts({ a, showEfficiency, t }: Props) {
  const { peak, stats, fb } = a
  const rows: [string, string][] = [
    [t('Peak gain'), `${peak.gain.toFixed(2)} dBi  (${(peak.gain - DBD).toFixed(2)} dBd)`],
    [t('Peak direction'), `θ ${peak.theta.toFixed(0)}°, φ ${peak.phi.toFixed(0)}°  (${t('elevation {0}°', (90 - peak.theta).toFixed(0))})`],
    [t('Directivity (from the pattern)'), `${stats.directivityDbi.toFixed(2)} dBi`],
    ...(showEfficiency ? ([[t('Implied radiation efficiency'), `${(stats.efficiency * 100).toFixed(0)} %`]] as [string, string][]) : []),
    [t('HPBW, {0}', t(...a.titleA)), width(a.hpbwA, t)],
    [t('HPBW, {0}', t(...a.titleB)), width(a.hpbwB, t)],
    [t('Highest sidelobe, cut A'), sidelobe(a.sllA, t)],
    [t('Highest sidelobe, cut B'), sidelobe(a.sllB, t)],
    [t('Front-to-back (180° from the peak)'), ratio(fb.frontToBack, t)],
    [t('Front-to-rear (worst rear direction)'), ratio(fb.frontToRear, t)],
  ]
  return (
    <table className="data">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="val">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
