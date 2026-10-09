import { useState } from 'react'

type Props = {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  hint?: string
}

/** A number input that keeps the raw text while typing and flags values outside min..max (the model clamps them). */
export default function NumField({ label, value, onChange, min, max, step, unit, hint }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const bad = draft !== null && (draft.trim() === '' || !Number.isFinite(Number(draft)) || (min !== undefined && Number(draft) < min) || (max !== undefined && Number(draft) > max))
  return (
    <label className="field" title={hint}>
      <span>
        {label}
        {unit ? <span className="unit"> ({unit})</span> : null}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 'any'}
        min={min}
        max={max}
        className={bad ? 'bad' : undefined}
        aria-invalid={bad}
        value={draft ?? String(+value.toFixed(4))}
        onChange={(e) => {
          setDraft(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(v)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  )
}
