import type { Colormap, Scale } from '../lib/display'
import type { Display } from '../lib/model'
import type { T } from '../i18n'
import NumField from './NumField'

type Props = { d: Display; onChange: (d: Display) => void; t: T }

export default function DisplayControls({ d, onChange, t }: Props) {
  const set = (patch: Partial<Display>) => onChange({ ...d, ...patch })
  return (
    <div className="section">
      <h3>{t('Display')}</h3>
      <div className="grid2">
        <label className="field">
          <span>{t('Radius scale')}</span>
          <select value={d.scale} onChange={(e) => set({ scale: e.target.value as Scale })}>
            <option value="db">{t('Logarithmic (dB)')}</option>
            <option value="power">{t('Linear power')}</option>
            <option value="field">{t('Linear field')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('Colour map')}</span>
          <select value={d.colormap} onChange={(e) => set({ colormap: e.target.value as Colormap })}>
            <option value="turbo">Turbo</option>
            <option value="jet">Jet</option>
            <option value="viridis">Viridis</option>
            <option value="inferno">Inferno</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>{t('Dynamic range: {0} dB', d.range)}</span>
        <input type="range" min={10} max={80} step={5} value={d.range} onChange={(e) => set({ range: Number(e.target.value) })} />
      </label>
      <div className="row checks">
        <label>
          <input type="checkbox" checked={d.wire} onChange={(e) => set({ wire: e.target.checked })} /> {t('Wireframe')}
        </label>
        <label>
          <input type="checkbox" checked={d.spin} onChange={(e) => set({ spin: e.target.checked })} /> {t('Auto-rotate')}
        </label>
        <label>
          <input type="checkbox" checked={d.cuts} onChange={(e) => set({ cuts: e.target.checked })} /> {t('Show cuts in 3-D')}
        </label>
      </div>

      <h3>{t('Polar cuts')}</h3>
      <label className="field">
        <span>{t('Cut planes')}</span>
        <select value={d.cutMode} onChange={(e) => set({ cutMode: e.target.value as Display['cutMode'] })}>
          <option value="peak">{t('Two planes through the beam peak')}</option>
          <option value="plane">{t('Elevation and azimuth cut')}</option>
        </select>
      </label>
      {d.cutMode === 'peak' ? (
        <label className="field">
          <span>{t('Rotate about the beam: {0}°', d.cutRotation)}</span>
          <input type="range" min={0} max={90} step={5} value={d.cutRotation} onChange={(e) => set({ cutRotation: Number(e.target.value) })} />
        </label>
      ) : (
        <div className="grid2">
          <NumField label={t('Elevation cut at φ')} unit="°" value={d.cutPhi} min={0} max={360} step={5} onChange={(v) => set({ cutPhi: v })} />
          <NumField label={t('Azimuth cut at θ')} unit="°" value={d.cutTheta} min={0} max={180} step={5} onChange={(v) => set({ cutTheta: v })} />
        </div>
      )}
    </div>
  )
}
