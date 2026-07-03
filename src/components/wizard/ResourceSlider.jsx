export default function ResourceSlider({ label, value, valueLabel, valueControl, min, max, step, unit, onChange, disabled = false }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-muted">{label}</span>
        {valueControl ?? (
          <span className="text-xs font-mono text-text">{valueLabel ?? `${value}${unit ?? ''}`}</span>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </div>
  );
}
