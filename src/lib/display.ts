import type { Cut } from './analysis'

export type Scale = 'db' | 'power' | 'field'
export type Colormap = 'turbo' | 'jet' | 'viridis' | 'inferno'

/** Normalised plot radius 0..1 for a gain, relative to the peak, over a dynamic range of `range` dB. */
export function radiusOf(gain: number, peak: number, range: number, scale: Scale): number {
  const d = Math.min(0, gain - peak)
  if (scale === 'db') return Math.max(0, 1 + d / range)
  const r = Math.pow(10, d / (scale === 'power' ? 10 : 20))
  return r < 1e-3 ? 0 : r
}

/** Gain offsets (dB below peak) at which polar rings are drawn. */
export function ringOffsets(range: number, scale: Scale): number[] {
  if (scale === 'db') {
    const step = range <= 20 ? 5 : range <= 50 ? 10 : 20
    const out: number[] = []
    for (let d = 0; d <= range + 1e-9; d += step) out.push(-d)
    return out
  }
  return [0, -3, -6, -10, -15, -20, -30].filter((d) => d >= -range)
}

type RGB = [number, number, number]
const lerp = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const ramp = (stops: string[]) => {
  const c = stops.map(hex)
  return (x: number): RGB => {
    const f = x * (c.length - 1)
    const i = Math.min(c.length - 2, Math.floor(f))
    return lerp(c[i], c[i + 1], f - i)
  }
}
const viridis = ramp(['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'])
const inferno = ramp(['#000004', '#1b0c41', '#4a0c6b', '#781c6d', '#a52c60', '#cf4446', '#ed6925', '#fb9b06', '#f7d13d', '#fcffa4'])
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Polynomial approximation of Google's Turbo colormap (A. Mikhailov). */
function turbo(x: number): RGB {
  return [
    0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943)))),
    0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604)))),
    0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973)))),
  ].map(clamp01) as RGB
}

function jet(x: number): RGB {
  const f = (c: number) => clamp01(1.5 - Math.abs(4 * x - c))
  return [f(3), f(2), f(1)]
}

export function colorAt(map: Colormap, x: number): RGB {
  const v = clamp01(x)
  switch (map) {
    case 'turbo':
      return turbo(v)
    case 'jet':
      return jet(v)
    case 'viridis':
      return viridis(v)
    case 'inferno':
      return inferno(v)
  }
}

export function cssGradient(map: Colormap): string {
  const stops = Array.from({ length: 9 }, (_, i) => {
    const [r, g, b] = colorAt(map, i / 8)
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}) ${(i / 8) * 100}%`
  })
  return `linear-gradient(to top, ${stops.join(',')})`
}

/** Shapes a cut for plotting: radius from the peak-relative gain. */
export function cutRadii(cut: Cut, peak: number, range: number, scale: Scale): number[] {
  return cut.map((p) => radiusOf(p.gain, peak, range, scale))
}
