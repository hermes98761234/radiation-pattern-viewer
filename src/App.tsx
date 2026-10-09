import { lazy, Suspense, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { tr, type T } from './i18n'
import { analyze, buildPattern, hasEHPlanes } from './lib/build'
import { cssGradient } from './lib/display'
import { exportCsv, type ImportResult } from './lib/importers'
import { DEFAULT_PARAMS, loadState, saveState, type AppState, type Kind } from './lib/model'
import DisplayControls from './components/DisplayControls'
import ImportPanel from './components/ImportPanel'
import PatternControls from './components/PatternControls'
import PolarPlot from './components/PolarPlot'
import Readouts from './components/Readouts'
import type { Hover, SceneHandle } from './components/Scene3D'

const Scene3D = lazy(() => import('./components/Scene3D'))

function download(name: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

export default function App() {
  const [state, setState] = useState<AppState>(loadState)
  const [imported, setImported] = useState<ImportResult | null>(null)
  const [hover, setHover] = useState<Hover>(null)
  const [noGl, setNoGl] = useState(false)
  const [sysDark, setSysDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const scene = useRef<SceneHandle>(null)
  const { kind, params, display, lang, theme } = state
  const t: T = (s, ...a) => tr(lang, s, ...a)
  const update = (patch: Partial<AppState>) => setState((s) => ({ ...s, ...patch }))

  useEffect(() => saveState(state), [state])
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSysDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  // Layout effect: the 3-D scene reads CSS variables in a passive effect that must see the new theme.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    root.lang = lang
  }, [theme, lang])
  useEffect(() => {
    document.title = lang === 'uk' ? 'Переглядач діаграм спрямованості антен' : 'Antenna Radiation Pattern Viewer'
  }, [lang])

  // Heavy-ish recompute (65 000 directions) is deferred so typing in a field stays responsive.
  const active = kind === 'import' ? null : params[kind]
  const dKind = useDeferredValue(kind)
  const dActive = useDeferredValue(active)
  const grid = useMemo(() => {
    if (dKind === 'import') return imported?.grid ?? null
    return buildPattern(dKind, { ...DEFAULT_PARAMS, [dKind]: dActive }) // only the active kind's parameters are read
  }, [dKind, dActive, imported])
  const stale = dKind !== kind || dActive !== active

  const { cutMode, cutRotation, cutPhi, cutTheta } = display
  const a = useMemo(
    () => (grid ? analyze(grid, { cutMode, cutRotation, cutPhi, cutTheta }, hasEHPlanes(dKind)) : null),
    [grid, dKind, cutMode, cutRotation, cutPhi, cutTheta],
  )

  const themeKey = `${theme}:${sysDark}`
  const setKind = (k: Kind) => update({ kind: k })

  return (
    <div className="app">
      <header className="toolbar">
        <span className="brand">{t('Antenna radiation pattern viewer')}</span>
        <span className="hint">{t('3-D patterns, E/H-plane cuts, gain, beamwidth and front-to-back.')}</span>
        <span className="spacer" />
        <label className="inline">
          {t('Language')}{' '}
          <select value={lang} onChange={(e) => update({ lang: e.target.value as AppState['lang'] })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
        <label className="inline">
          {t('Theme')}{' '}
          <select value={theme} onChange={(e) => update({ theme: e.target.value as AppState['theme'] })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
      </header>

      <div className="body">
        <aside className="side">
          <div className="panel">
            <PatternControls kind={kind} params={params} onKind={setKind} onParams={(p) => update({ params: p })} t={t} />
            {kind === 'import' && <ImportPanel result={imported} onResult={setImported} t={t} />}
            <DisplayControls d={display} onChange={(d) => update({ display: d })} t={t} />
          </div>
        </aside>

        <main className="main">
          {grid && a ? (
            <>
              <section className="box">
                <div className="scene-box">
                  {noGl ? (
                    <div className="scene-canvas scene-msg">{t('WebGL is not available in this browser. The polar cuts below still work.')}</div>
                  ) : (
                    <Suspense fallback={<div className="scene-canvas scene-msg">{t('Loading 3-D view…')}</div>}>
                      <Scene3D
                        ref={scene}
                        grid={grid}
                        peak={a.peak}
                        cutA={a.cutA}
                        cutB={a.cutB}
                        scale={display.scale}
                        range={display.range}
                        colormap={display.colormap}
                        wire={display.wire}
                        spin={display.spin}
                        showCuts={display.cuts}
                        themeKey={themeKey}
                        onHover={setHover}
                        onUnavailable={() => setNoGl(true)}
                      />
                    </Suspense>
                  )}
                  {stale && <div className="busy">{t('Updating…')}</div>}
                  <div className="legend" aria-hidden="true">
                    <span>{a.peak.gain.toFixed(0)} dBi</span>
                    <div className="bar" style={{ background: cssGradient(display.colormap) }} />
                    <span>{(a.peak.gain - display.range).toFixed(0)}</span>
                  </div>
                  <div className="hoverinfo" aria-live="off">
                    {hover ? `θ ${hover.theta.toFixed(0)}°  φ ${hover.phi.toFixed(0)}°  ${hover.gain.toFixed(1)} dBi` : t('Drag to rotate, scroll to zoom, hover for gain.')}
                  </div>
                </div>
                <div className="row">
                  <button className="small" onClick={() => scene.current?.resetView()}>
                    {t('Reset view')}
                  </button>
                  <button
                    className="small"
                    onClick={() => {
                      const url = scene.current?.snapshot()
                      if (url) download('radiation-pattern.png', url)
                    }}
                  >
                    {t('Save PNG')}
                  </button>
                  <button
                    className="small"
                    onClick={() => {
                      const url = URL.createObjectURL(new Blob([exportCsv(grid)], { type: 'text/csv' }))
                      download('radiation-pattern.csv', url)
                      setTimeout(() => URL.revokeObjectURL(url), 1000)
                    }}
                  >
                    {t('Export CSV')}
                  </button>
                  <span className="spacer" />
                  <span className="legend-key">
                    <i style={{ background: '#f59e0b' }} /> A <i style={{ background: '#22d3ee' }} /> B <i style={{ background: '#fff', border: '1px solid #888' }} /> {t('beam peak')}
                  </span>
                </div>
              </section>

              <section className="box">
                <h3>{t('Polar cuts')}</h3>
                <div className="polars">
                  <PolarPlot
                    title={t(...a.titleA)}
                    cut={a.cutA}
                    peak={a.peak.gain}
                    range={display.range}
                    scale={display.scale}
                    hpbw={a.hpbwA}
                    center={a.centerA}
                    color="#f59e0b"
                    angleLabel={display.cutMode === 'peak' ? t('angle from the peak') : t('θ from the zenith')}
                    t={t}
                  />
                  <PolarPlot
                    title={t(...a.titleB)}
                    cut={a.cutB}
                    peak={a.peak.gain}
                    range={display.range}
                    scale={display.scale}
                    hpbw={a.hpbwB}
                    center={a.centerB}
                    color="#22d3ee"
                    angleLabel={display.cutMode === 'peak' ? t('angle from the peak') : t('azimuth φ')}
                    t={t}
                  />
                </div>
              </section>

              <section className="box">
                <h3>{t('Readout')}</h3>
                <Readouts a={a} showEfficiency={kind === 'import' && imported?.format !== 'msi'} t={t} />
              </section>
            </>
          ) : (
            <section className="box">
              <p className="verdict warn">{t('Load a pattern file or paste its contents to see it here.')}</p>
            </section>
          )}
        </main>
      </div>

      <p className="hint foot">
        {t('Analytic patterns assume lossless, ideal antennas. Everything runs in your browser; files never leave it.')}{' '}
        <a href="https://github.com/hermes98761234/radiation-pattern-viewer">{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
