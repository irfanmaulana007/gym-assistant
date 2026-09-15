// Native iOS-style toggle switch. A labeled `role="switch"` button — the track
// slides its thumb and shifts color when on. Built from the design tokens
// (`--surface-2`, `--primary`, `--radius-pill`) per the native-mobile-ux rule:
// no hover-dependent state, a comfortable tap target, no desktop chrome.
interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function Switch({ checked, onChange, label }: SwitchProps) {
  return (
    <div className="switch-row">
      <span className="switch-label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? 'switch-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="switch-thumb" aria-hidden="true" />
      </button>
    </div>
  )
}
