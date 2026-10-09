import type { Beamwidth, Cut } from '../lib/analysis'
import { radiusOf, ringOffsets, type Scale } from '../lib/display'
import type { T } from '../i18n'

type Props = {
  title: string
  cut: Cut
  peak: number
  range: number
  scale: Scale
  hpbw: Beamwidth | null
  center: number
  color: string
  /** Label for the angle axis, e.g. "θ" or "φ". */
  angleLabel: string
  t: T
}

const R = 118
const C = 150

/** x, y of a point at plot angle `deg` (0 at the top, clockwise) and radius fraction r. */
const pt = (deg: number, r: number): [number, number] => [C + R * r * Math.sin((deg * Math.PI) / 180), C - R * r * Math.cos((deg * Math.PI) / 180)]

export default function PolarPlot({ title, cut, peak, range, scale, hpbw, center, color, angleLabel, t }: Props) {
  const d = cut
    .filter((_, i) => i % 2 === 0)
    .map((p, i) => {
      const [x, y] = pt(p.angle, radiusOf(p.gain, peak, range, scale))
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join('')
  const rings = ringOffsets(range, scale)
  const spokes = Array.from({ length: 12 }, (_, i) => i * 30)
  const c0 = cut[center].angle
  return (
    <figure className="polar">
      <figcaption>{title}</figcaption>
      <svg viewBox="0 0 300 300" role="img" aria-label={title}>
        {rings.map((off) => {
          const r = radiusOf(peak + off, peak, range, scale)
          return r > 0.005 ? (
            <g key={off}>
              <circle cx={C} cy={C} r={R * r} className={off === 0 ? 'ring strong' : 'ring'} />
              <text x={C + 3} y={C - R * r + 10} className="tick">
                {off === 0 ? '0 dB' : off}
              </text>
            </g>
          ) : null
        })}
        {spokes.map((a) => {
          const [x, y] = pt(a, 1)
          const [lx, ly] = pt(a, 1.11)
          const shown = a > 180 ? a - 360 : a
          return (
            <g key={a}>
              <line x1={C} y1={C} x2={x} y2={y} className="spoke" />
              <text x={lx} y={ly} className="tick" textAnchor="middle" dominantBaseline="middle">
                {shown}°
              </text>
            </g>
          )
        })}
        {hpbw && (
          <>
            <line x1={C} y1={C} x2={pt(c0 + hpbw.low, 1)[0]} y2={pt(c0 + hpbw.low, 1)[1]} className="hpbw" />
            <line x1={C} y1={C} x2={pt(c0 + hpbw.high, 1)[0]} y2={pt(c0 + hpbw.high, 1)[1]} className="hpbw" />
          </>
        )}
        <path d={d + 'Z'} fill={color} fillOpacity="0.16" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        <text x={C} y={294} textAnchor="middle" className="tick">
          {angleLabel}
          {hpbw ? ` · ${t('HPBW {0}°', hpbw.width.toFixed(1))}` : ` · ${t('omnidirectional')}`}
        </text>
      </svg>
    </figure>
  )
}
