import { useRef, useState } from 'react'
import { ImportError, importPattern, type ImportOptions, type ImportResult } from '../lib/importers'
import { sampleCsv, sampleMsi, sampleNec } from '../lib/samples'
import type { T } from '../i18n'

type Props = {
  result: ImportResult | null
  onResult: (r: ImportResult | null) => void
  t: T
}

const MAX_BYTES = 30 * 1024 * 1024

export default function ImportPanel({ result, onResult, t }: Props) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [opts, setOpts] = useState<ImportOptions>({ format: 'auto', gainUnit: 'auto', angles: 'auto' })
  const [error, setError] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const run = (src: string, o: ImportOptions, name = fileName) => {
    try {
      const r = importPattern(src, o)
      if (name) r.name = `${name} (${r.name})`
      onResult(r)
      setError(null)
    } catch (e) {
      onResult(null)
      setError(e instanceof ImportError ? t(...e.note) : t('Could not read the file: {0}', e instanceof Error ? e.message : String(e)))
    }
  }

  const load = (src: string, name: string) => {
    setText(src.length > 200_000 ? '' : src)
    setFileName(name)
    run(src, opts, name)
  }

  const readFile = async (f: File) => {
    if (f.size > MAX_BYTES) {
      onResult(null)
      setError(t('File is larger than 30 MB.'))
      return
    }
    load(await f.text(), f.name)
  }

  const update = (patch: Partial<ImportOptions>) => {
    const next = { ...opts, ...patch }
    setOpts(next)
    if (text) run(text, next)
  }

  return (
    <div className="section">
      <h3>{t('Import a pattern')}</h3>
      <div
        className={drag ? 'drop on' : 'drop'}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const f = e.dataTransfer.files[0]
          if (f) void readFile(f)
        }}
      >
        <p className="hint">{t('Drop a file here: CSV (theta, phi, gain), NEC2 output with RADIATION PATTERNS, or MSI Planet .msi / .pln.')}</p>
        <button onClick={() => input.current?.click()}>{t('Open file…')}</button>
        <input
          ref={input}
          type="file"
          accept=".csv,.txt,.out,.nec,.msi,.pln,.dat,text/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void readFile(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="row">
        <span className="hint">{t('Examples')}</span>
        <button className="small" onClick={() => load(sampleNec(), 'yagi.out')}>
          NEC2
        </button>
        <button className="small" onClick={() => load(sampleCsv(), 'patch.csv')}>
          CSV
        </button>
        <button className="small" onClick={() => load(sampleMsi(), 'panel.msi')}>
          MSI
        </button>
      </div>

      <label className="field">
        <span>{t('Or paste the file contents')}</span>
        <textarea
          value={text}
          rows={5}
          spellCheck={false}
          placeholder={'theta,phi,gain\n0,0,6.1\n10,0,5.9\n…'}
          onChange={(e) => {
            setText(e.target.value)
            if (e.target.value.trim()) run(e.target.value, opts)
            else {
              onResult(null)
              setError(null)
            }
          }}
        />
      </label>

      <div className="grid3">
        <label className="field">
          <span>{t('Format')}</span>
          <select value={opts.format} onChange={(e) => update({ format: e.target.value as ImportOptions['format'] })}>
            <option value="auto">{t('Auto')}</option>
            <option value="csv">CSV</option>
            <option value="nec">NEC2</option>
            <option value="msi">MSI</option>
          </select>
        </label>
        <label className="field">
          <span>{t('CSV angles')}</span>
          <select value={opts.angles} onChange={(e) => update({ angles: e.target.value as ImportOptions['angles'] })}>
            <option value="auto">{t('Auto')}</option>
            <option value="zenith">{t('θ from zenith')}</option>
            <option value="elevation">{t('Elevation')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('CSV gain')}</span>
          <select value={opts.gainUnit} onChange={(e) => update({ gainUnit: e.target.value as ImportOptions['gainUnit'] })}>
            <option value="auto">{t('Auto')}</option>
            <option value="db">dB</option>
            <option value="linear">{t('Linear power')}</option>
          </select>
        </label>
      </div>

      {error && (
        <p className="err-text" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="card">
          <p className="hint">
            <strong>{result.name}</strong>
            {' · '}
            {t('{0} rows read', result.points)}
          </p>
          {result.notes.map((n, i) => (
            <p key={i} className="hint">
              {t(...n)}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
