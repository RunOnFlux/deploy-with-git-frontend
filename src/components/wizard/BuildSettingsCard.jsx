import { Hammer } from 'lucide-react';

const RUNTIMES = [
  { value: 'node', label: 'Node.js' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'dotnet', label: '.NET' },
];

const BUILD_COMMAND_FIELDS = [
  { field: 'installCommand', label: 'Install', placeholder: 'npm install' },
  { field: 'buildCommand', label: 'Build', placeholder: 'npm run build' },
  { field: 'runCommand', label: 'Start', placeholder: 'node server.js' },
];

export default function BuildSettingsCard({ config, onChange }) {
  const { runtime, runtimeVersion, installCommand, buildCommand, runCommand } = config;

  function update(field, value) {
    onChange({ ...config, [field]: value });
  }

  const hasOverrides = Boolean(runtime || installCommand || buildCommand || runCommand);

  return (
    <div className="mb-5 border border-border bg-surface/40 p-4">
      <div className="flex items-start gap-3 mb-3">
        <Hammer className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text">Build settings</p>
            {hasOverrides && <span className="text-xs text-primary">customized</span>}
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Override runtime and commands. Leave blank to use Orbit auto-detection from your repo.
          </p>
        </div>
      </div>

      <div className="space-y-5 pt-2 border-t border-border/40">
        <div>
          <label className="block text-sm font-medium text-text mb-1">
            Runtime override <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {RUNTIMES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => update('runtime', runtime === r.value ? '' : r.value)}
                className={`px-3 py-1.5 border text-xs font-medium ${
                  runtime === r.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {runtime && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-text mb-1">
                Version <span className="text-text-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder={runtime === 'node' ? '20' : runtime === 'python' ? '3.11' : 'latest'}
                value={runtimeVersion ?? ''}
                onChange={(e) => update('runtimeVersion', e.target.value)}
                className="input-base w-32 text-sm"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-text mb-3">
            Build commands <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <div className="space-y-2">
            {BUILD_COMMAND_FIELDS.map(({ field, label, placeholder }) => (
              <div key={field} className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-12 shrink-0 text-right">{label}</span>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={config[field] ?? ''}
                  onChange={(e) => update(field, e.target.value)}
                  className="input-base flex-1 font-mono text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
