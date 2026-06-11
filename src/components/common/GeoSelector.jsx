import { GEO_OPTIONS } from '../../services/geolocationSpec';

export default function GeoSelector({ selected, onChange, disabled = false }) {
  function toggle(code) {
    const existing = selected.find((g) => g.code === code);
    if (existing) onChange(selected.filter((g) => g.code !== code));
    else onChange([...selected, { code, type: 'allowed' }]);
  }

  function toggleType(code) {
    onChange(selected.map((g) => (
      g.code === code ? { ...g, type: g.type === 'allowed' ? 'forbidden' : 'allowed' } : g
    )));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {GEO_OPTIONS.map(({ code, label }) => {
        const sel = selected.find((g) => g.code === code);
        const isForbidden = sel?.type === 'forbidden';
        return (
          <div
            key={code}
            className={`flex items-center rounded-lg overflow-hidden border ${
              disabled ? 'opacity-50 pointer-events-none' : ''
            } ${sel ? isForbidden ? 'border-red-500/40' : 'border-primary/40' : 'border-border'}`}
          >
            <button
              type="button"
              onClick={() => toggle(code)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                sel
                  ? isForbidden
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-primary/20 text-primary'
                  : 'bg-surface text-text-muted hover:bg-surface-hover'
              }`}
            >
              {label}
            </button>
            {sel && (
              <button
                type="button"
                onClick={() => toggleType(code)}
                className={`px-2 py-1.5 text-xs border-l border-border transition-colors ${
                  isForbidden
                    ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'bg-primary/10 text-primary hover:bg-primary/20'
                }`}
                title={`Currently ${isForbidden ? 'forbidden' : 'allowed'} — click to toggle`}
              >
                {isForbidden ? '✗' : '✓'}
              </button>
            )}
          </div>
        );
      })}
      {selected.length === 0 && (
        <p className="text-xs text-text-muted py-1.5">No restriction — deploys globally</p>
      )}
    </div>
  );
}
