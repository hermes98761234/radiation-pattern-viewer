import { useState } from 'react'
import { patchDesign, type ElementKind, type TaperKind } from '../lib/analytic'
import { KINDS, PRESETS, sanitize, type Kind, type Params } from '../lib/model'
import { N, type T } from '../i18n'
import NumField from './NumField'

type Props = {
  kind: Kind
  params: Params
  onKind: (k: Kind) => void
  onParams: (p: Params) => void
  t: T
}

const TAPERS: { v: TaperKind; label: string }[] = [
  { v: 'uniform', label: N('Uniform') },
  { v: 'hamming', label: N('Hamming') },
  { v: 'hann', label: N('Hann') },
  { v: 'blackman', label: N('Blackman') },
  { v: 'triangular', label: N('Triangular') },
  { v: 'chebyshev', label: N('Dolph-Chebyshev') },
]

const ELEMENTS: { v: ElementKind; label: string }[] = [
  { v: 'isotropic', label: N('Isotropic') },
  { v: 'dipole', label: N('Half-wave dipole (along z)') },
  { v: 'cosine', label: N('Cosine, upper half space (patch-like)') },
]

export default function PatternControls({ kind, params, onKind, onParams, t }: Props) {
  const set = <K extends keyof Params>(k: K, patch: Partial<Params[K]>) => onParams({ ...params, [k]: { ...params[k], ...patch } })
  const presets = kind === 'import' ? [] : PRESETS[kind]
  const [patch, setPatch] = useState({ f: 2400, er: 4.4, h: 1.6 })

  return (
    <div className="section">
      <h3>{t('Antenna')}</h3>
      <div className="kinds" role="tablist" aria-label={t('Antenna type')}>
        {KINDS.map((k) => (
          <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'tab on' : 'tab'} onClick={() => onKind(k.kind)}>
            {t(k.label)}
          </button>
        ))}
      </div>

      {kind !== 'import' && (
        <label className="field">
          <span>{t('Preset')}</span>
          <select
            value=""
            onChange={(e) => {
              const pr = presets[Number(e.target.value)]
              if (pr) onParams({ ...params, [kind]: pr.params })
            }}
          >
            <option value="">{t('Choose a preset…')}</option>
            {presets.map((pr, i) => (
              <option key={pr.name} value={i}>
                {t(pr.name)}
              </option>
            ))}
          </select>
        </label>
      )}

      {kind === 'dipole' && (
        <>
          <NumField label={t('Total length')} unit="λ" value={params.dipole.length} min={0.01} max={4} step={0.05} onChange={(v) => set('dipole', { length: v })} />
          <p className="hint">{t('Centre-fed thin dipole along z with a sinusoidal current. 0.5 λ gives 2.15 dBi.')}</p>
        </>
      )}

      {kind === 'monopole' && (
        <>
          <NumField label={t('Height above ground')} unit="λ" value={params.monopole.height} min={0.005} max={2} step={0.025} onChange={(v) => set('monopole', { height: v })} />
          <p className="hint">{t('Vertical monopole on an infinite perfect ground plane: the upper half of a dipole twice as long, with twice the gain.')}</p>
        </>
      )}

      {kind === 'yagi' && (
        <>
          <div className="grid2">
            <NumField label={t('Directors')} value={params.yagi.directors} min={0} max={20} step={1} onChange={(v) => set('yagi', { directors: v })} />
            <NumField label={t('Driven length')} unit="λ" value={params.yagi.drivenLength} min={0.2} max={0.7} step={0.01} onChange={(v) => set('yagi', { drivenLength: v })} />
            <NumField label={t('Reflector spacing')} unit="λ" value={params.yagi.reflectorSpacing} min={0.05} max={0.5} step={0.01} onChange={(v) => set('yagi', { reflectorSpacing: v })} />
            <NumField label={t('Director spacing')} unit="λ" value={params.yagi.directorSpacing} min={0.05} max={0.6} step={0.01} onChange={(v) => set('yagi', { directorSpacing: v })} />
          </div>
          <NumField label={t('Director length / driven')} value={params.yagi.directorLength} min={0.7} max={1.1} step={0.01} onChange={(v) => set('yagi', { directorLength: v })} />
          <p className="hint">{t('Idealised current model, not a full wire solve: sinusoidal dipoles on a boom along x, the reflector current cancelling the rear lobe and the directors lagging in phase. Use it to see the shape; import a NEC2 run for a real design.')}</p>
        </>
      )}

      {kind === 'patch' && (
        <>
          <div className="grid2">
            <NumField label={t('Length (resonant, x)')} unit="λ" value={params.patch.length} min={0.05} max={1} step={0.01} onChange={(v) => set('patch', { length: v })} />
            <NumField label={t('Width (y)')} unit="λ" value={params.patch.width} min={0.05} max={1.5} step={0.01} onChange={(v) => set('patch', { width: v })} />
          </div>
          <p className="hint">{t('Rectangular microstrip patch on an infinite ground plane (two-slot cavity model), radiating towards +z. The E-plane is xz.')}</p>
          <details className="card">
            <summary>{t('Patch size from substrate')}</summary>
            <div className="grid3">
              <NumField label={t('Frequency')} unit="MHz" value={patch.f} min={1} onChange={(v) => setPatch({ ...patch, f: v })} />
              <NumField label={t('Dielectric constant')} value={patch.er} min={1} onChange={(v) => setPatch({ ...patch, er: v })} />
              <NumField label={t('Substrate height')} unit="mm" value={patch.h} min={0.01} onChange={(v) => setPatch({ ...patch, h: v })} />
            </div>
            {patch.f > 0 && patch.er >= 1 && patch.h > 0 ? (
              (() => {
                const d = patchDesign(patch.f * 1e6, patch.er, patch.h / 1000)
                return (
                  <>
                    <p className="hint">
                      {t('W = {0} mm, L = {1} mm (ε_eff = {2})', (d.width * 1000).toFixed(1), (d.length * 1000).toFixed(1), d.eeff.toFixed(2))}
                    </p>
                    <button className="small" onClick={() => onParams({ ...params, patch: sanitize('patch', { length: d.length / d.lambda0, width: d.width / d.lambda0 }) })}>
                      {t('Use these dimensions')}
                    </button>
                  </>
                )
              })()
            ) : null}
          </details>
        </>
      )}

      {kind === 'linear' && (
        <>
          <div className="grid2">
            <NumField label={t('Elements')} value={params.linear.n} min={1} max={64} step={1} onChange={(v) => set('linear', { n: v })} />
            <NumField label={t('Spacing')} unit="λ" value={params.linear.spacing} min={0.05} max={3} step={0.05} onChange={(v) => set('linear', { spacing: v })} />
            <NumField label={t('Steering from broadside')} unit="°" value={params.linear.steer} min={-90} max={90} step={1} onChange={(v) => set('linear', { steer: v })} />
            <label className="field">
              <span>{t('Array axis')}</span>
              <select value={params.linear.axis} onChange={(e) => set('linear', { axis: e.target.value as Params['linear']['axis'] })}>
                <option value="x">x</option>
                <option value="y">y</option>
                <option value="z">z</option>
              </select>
            </label>
          </div>
          <Weighting taper={params.linear.taper} sll={params.linear.sll} element={params.linear.element} onTaper={(v) => set('linear', { taper: v })} onSll={(v) => set('linear', { sll: v })} onElement={(v) => set('linear', { element: v })} t={t} />
          <p className="hint">{t('Steering 90° is end-fire. Spacing above 0.5 λ lets grating lobes appear.')}</p>
        </>
      )}

      {kind === 'planar' && (
        <>
          <div className="grid2">
            <NumField label={t('Elements in x')} value={params.planar.nx} min={1} max={32} step={1} onChange={(v) => set('planar', { nx: v })} />
            <NumField label={t('Elements in y')} value={params.planar.ny} min={1} max={32} step={1} onChange={(v) => set('planar', { ny: v })} />
            <NumField label={t('Spacing in x')} unit="λ" value={params.planar.dx} min={0.05} max={3} step={0.05} onChange={(v) => set('planar', { dx: v })} />
            <NumField label={t('Spacing in y')} unit="λ" value={params.planar.dy} min={0.05} max={3} step={0.05} onChange={(v) => set('planar', { dy: v })} />
            <NumField label={t('Steer θ')} unit="°" value={params.planar.steerTheta} min={0} max={90} step={1} onChange={(v) => set('planar', { steerTheta: v })} />
            <NumField label={t('Steer φ')} unit="°" value={params.planar.steerPhi} min={-360} max={360} step={1} onChange={(v) => set('planar', { steerPhi: v })} />
          </div>
          <Weighting taper={params.planar.taper} sll={params.planar.sll} element={params.planar.element} onTaper={(v) => set('planar', { taper: v })} onSll={(v) => set('planar', { sll: v })} onElement={(v) => set('planar', { element: v })} t={t} />
          <p className="hint">{t('Rectangular lattice in the xy plane, separable amplitude taper, phase set so the beam points to (θ, φ).')}</p>
        </>
      )}
    </div>
  )
}

function Weighting(p: { taper: TaperKind; sll: number; element: ElementKind; onTaper: (v: TaperKind) => void; onSll: (v: number) => void; onElement: (v: ElementKind) => void; t: T }) {
  const { t } = p
  return (
    <>
      <div className="grid2">
        <label className="field">
          <span>{t('Amplitude taper')}</span>
          <select value={p.taper} onChange={(e) => p.onTaper(e.target.value as TaperKind)}>
            {TAPERS.map((x) => (
              <option key={x.v} value={x.v}>
                {t(x.label)}
              </option>
            ))}
          </select>
        </label>
        {p.taper === 'chebyshev' && <NumField label={t('Sidelobe level')} unit="dB" value={p.sll} min={15} max={60} step={1} onChange={p.onSll} />}
      </div>
      <label className="field">
        <span>{t('Element pattern')}</span>
        <select value={p.element} onChange={(e) => p.onElement(e.target.value as ElementKind)}>
          {ELEMENTS.map((x) => (
            <option key={x.v} value={x.v}>
              {t(x.label)}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
