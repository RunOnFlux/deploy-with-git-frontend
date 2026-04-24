import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, AlertCircle, Loader2, Check, Globe, ChevronDown, ChevronUp, Zap, Info } from 'lucide-react';
import { BILLING_PERIODS, GEO_OPTIONS, validateAppName, checkAppNameAvailable } from '../../services/deployService';

const POLLING_OPTIONS = [
  { value: 'disabled', label: 'Disabled' },
  { value: '3600', label: '1 hour' },
  { value: '7200', label: '2 hours' },
  { value: '21600', label: '6 hours' },
  { value: '43200', label: '12 hours' },
  { value: '86400', label: '24 hours (default)' },
];

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

// Orbit-specific env var suggestions (not API_KEY — env vars are public on Flux)
const ORBIT_ENV_SUGGESTIONS = [
  { key: 'BUILD_COMMAND', placeholder: 'npm run build', description: 'Custom build command' },
  { key: 'RUN_COMMAND', placeholder: 'node server.js', description: 'Custom start command' },
  { key: 'INSTALL_COMMAND', placeholder: 'npm install', description: 'Custom install command' },
  { key: 'PR_PREVIEW_ENABLED', placeholder: 'true', description: 'Enable PR preview builds' },
];

function EnvVarRow({ envVar, onChange, onRemove }) {
  return (
    <div className="flex gap-2 items-center">
      <input
        type="text"
        placeholder="KEY"
        value={envVar.key}
        onChange={(e) => onChange({ ...envVar, key: e.target.value.toUpperCase().replace(/\s/g, '_') })}
        className="input-base flex-1 font-mono text-sm"
      />
      <input
        type="text"
        placeholder="value"
        value={envVar.value}
        onChange={(e) => onChange({ ...envVar, value: e.target.value })}
        className="input-base flex-[2] font-mono text-sm"
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function GeoSelector({ selected, onChange }) {
  function toggle(code) {
    const existing = selected.find((g) => g.code === code);
    if (existing) onChange(selected.filter((g) => g.code !== code));
    else onChange([...selected, { code, type: 'allowed' }]);
  }

  function toggleType(code) {
    onChange(selected.map((g) => g.code === code ? { ...g, type: g.type === 'allowed' ? 'forbidden' : 'allowed' } : g));
  }

  return (
    <div className="flex flex-wrap gap-2">
      {GEO_OPTIONS.map(({ code, label }) => {
        const sel = selected.find((g) => g.code === code);
        const isForbidden = sel?.type === 'forbidden';
        return (
          <div key={code} className="flex items-center rounded-lg overflow-hidden border border-border">
            <button type="button" onClick={() => toggle(code)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${sel ? isForbidden ? 'bg-red-500/20 text-red-400' : 'bg-primary/20 text-primary' : 'bg-surface text-text-muted hover:bg-surface-hover'}`}>
              {label}
            </button>
            {sel && (
              <button type="button" onClick={() => toggleType(code)}
                className={`px-2 py-1.5 text-xs border-l border-border transition-colors ${isForbidden ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' : 'bg-primary/10 text-primary hover:bg-primary/20'}`}
                title={`Currently ${isForbidden ? 'forbidden' : 'allowed'} — click to toggle`}>
                {isForbidden ? '✗' : '✓'}
              </button>
            )}
          </div>
        );
      })}
      {selected.length === 0 && <p className="text-xs text-text-muted py-1.5">No restriction — deploys globally</p>}
    </div>
  );
}

export default function Step3Config({ config, onChange, portAutoDetected, isEnterpriseForced }) {
  const { appName, port, portTouched, billingPeriod, geolocation, extraEnvVars,
          contactEmail, customDomain, pollingInterval, runtime, runtimeVersion, enterprise } = config;
  const [nameState, setNameState] = useState('idle');
  const [nameError, setNameError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debounceRef = useRef(null);

  // Debounced name availability check
  useEffect(() => {
    const validationError = validateAppName(appName);
    if (validationError) {
      setNameError(validationError);
      setNameState('invalid');
      return;
    }
    setNameError('');
    setNameState('checking');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const available = await checkAppNameAvailable(appName);
      setNameState(available ? 'available' : 'taken');
      if (!available) setNameError('This name is already taken on the Flux network');
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [appName]);

  // Auto-open advanced if any advanced fields are set (e.g. from deep-link prefill)
  useEffect(() => {
    if (pollingInterval && pollingInterval !== '86400') setShowAdvanced(true);
    if (runtime) setShowAdvanced(true);
    if (extraEnvVars?.length > 0) setShowAdvanced(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function update(field, value) {
    onChange({ ...config, [field]: value });
  }

  function addEnvVar() {
    update('extraEnvVars', [...extraEnvVars, { key: '', value: '' }]);
    setShowAdvanced(true);
  }

  function updateEnvVar(idx, data) {
    update('extraEnvVars', extraEnvVars.map((e, i) => (i === idx ? data : e)));
  }

  function removeEnvVar(idx) {
    update('extraEnvVars', extraEnvVars.filter((_, i) => i !== idx));
  }

  function addSuggestedEnvVar(key, placeholder) {
    if (extraEnvVars.find((e) => e.key === key)) return; // already exists
    update('extraEnvVars', [...extraEnvVars, { key, value: '' }]);
    setShowAdvanced(true);
  }

  const nameStatusIcon = {
    idle: null,
    checking: <Loader2 className="w-4 h-4 animate-spin text-text-muted" />,
    available: <Check className="w-4 h-4 text-green-400" />,
    taken: <AlertCircle className="w-4 h-4 text-red-400" />,
    invalid: <AlertCircle className="w-4 h-4 text-red-400" />,
  }[nameState];

  return (
    <div>
      <h2 className="font-heading text-xl font-bold text-text mb-1">Configure</h2>
      <p className="text-sm text-text-secondary mb-6">
        Set your app name, port, and deployment settings.
      </p>

      {/* App name */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-1">
          App name <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="my-app"
            value={appName}
            onChange={(e) => update('appName', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            className={`input-base w-full pr-9 ${
              nameState === 'taken' || nameState === 'invalid'
                ? 'border-red-500/50 focus:ring-red-500'
                : nameState === 'available' ? 'border-green-500/50' : ''
            }`}
            maxLength={32}
          />
          {nameStatusIcon && <div className="absolute right-3 top-1/2 -translate-y-1/2">{nameStatusIcon}</div>}
        </div>
        {nameError ? (
          <p className="text-xs text-red-400 mt-1">{nameError}</p>
        ) : nameState === 'available' ? (
          <p className="text-xs text-green-400 mt-1">✓ Name is available</p>
        ) : (
          <p className="text-xs text-text-muted mt-1">
            3–32 chars, lowercase letters, numbers and hyphens. Globally unique on Flux.
          </p>
        )}
      </div>

      {/* App port */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-1">
          App port <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="1" max="65535"
            placeholder="3000"
            value={port}
            onChange={(e) => onChange({ ...config, port: e.target.value, portTouched: true })}
            className="input-base w-36"
          />
          {portAutoDetected && !portTouched && (
            <span className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg">
              <Zap className="w-3.5 h-3.5" /> Auto-detected
            </span>
          )}
        </div>
        <p className="text-xs text-text-muted mt-1">
          The port your app listens on inside the container (e.g. 3000, 8080, 5000).
        </p>
      </div>

      {/* Contact email */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-1">
          Contact email <span className="text-red-400">*</span>
        </label>
        <input
          type="email"
          placeholder="you@example.com"
          value={contactEmail}
          onChange={(e) => update('contactEmail', e.target.value)}
          className="input-base w-full"
        />
        <p className="text-xs text-text-muted mt-1">Used for deployment notifications.</p>
      </div>

      {/* Enterprise mode */}
      <div className="mb-5">
        {isEnterpriseForced ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-xl">🔐</span>
            <div>
              <p className="text-sm font-semibold text-text">Enterprise mode — required</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Private repositories always use end-to-end encryption. Your app specs and environment
                variables are encrypted with your public key before being submitted to the Flux network.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3">
            <span className="text-xl">🔐</span>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-text">Enterprise mode</p>
                <button
                  type="button"
                  onClick={() => update('enterprise', !enterprise)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    enterprise ? 'bg-primary' : 'bg-border'
                  }`}
                  role="switch"
                  aria-checked={enterprise}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${enterprise ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Encrypt all app specs and environment variables end-to-end with your public key.
                Enable for sensitive configurations or production secrets.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Billing period */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text mb-2">Billing period</label>
        <div className="flex flex-wrap gap-2">
          {BILLING_PERIODS.map((bp) => (
            <button key={bp.months} type="button" onClick={() => update('billingPeriod', bp)}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                billingPeriod?.months === bp.months
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
              }`}>
              {bp.label}
              {bp.discount > 0 && <span className="ml-1.5 text-xs text-green-400">–{bp.discount}%</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Geolocation */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-text mb-1 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Geolocation <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <p className="text-xs text-text-muted mb-2">Select regions to allow (✓) or forbid (✗) for your deployment.</p>
        <GeoSelector selected={geolocation} onChange={(v) => update('geolocation', v)} />
      </div>

      {/* Custom domain */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-1">
          Custom domain <span className="text-text-muted font-normal">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="myapp.example.com"
          value={customDomain}
          onChange={(e) => update('customDomain', e.target.value)}
          className="input-base w-full"
        />
        <p className="text-xs text-text-muted mt-1">
          Your app will be accessible at <code className="font-mono">{'{appName}'}.app.runonflux.io</code> by default.
        </p>
      </div>

      {/* Advanced options toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors w-full mb-3"
      >
        {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        Advanced options
        {(runtime || (pollingInterval && pollingInterval !== '86400') || extraEnvVars?.length > 0) && (
          <span className="ml-auto text-xs text-primary">configured</span>
        )}
      </button>

      {showAdvanced && (
        <div className="border border-border rounded-xl p-4 space-y-5 mb-2 bg-surface/40">

          {/* Polling interval */}
          <div>
            <label className="block text-sm font-medium text-text mb-1">
              Auto-redeploy interval
            </label>
            <select
              value={pollingInterval}
              onChange={(e) => update('pollingInterval', e.target.value)}
              className="input-base w-48"
            >
              {POLLING_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-text-muted mt-1">
              How often Orbit checks for new commits and redeploys automatically.
            </p>
          </div>

          {/* Runtime selector */}
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
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
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
                  value={runtimeVersion}
                  onChange={(e) => update('runtimeVersion', e.target.value)}
                  className="input-base w-32 text-sm"
                />
              </div>
            )}
            <p className="text-xs text-text-muted mt-1">
              Override the runtime Orbit uses to build and run your app.
            </p>
          </div>

          {/* Environment variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text">Environment variables</label>
            </div>

            {/* Orbit suggestions */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {ORBIT_ENV_SUGGESTIONS.map((s) => {
                const alreadyAdded = extraEnvVars.find((e) => e.key === s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    disabled={!!alreadyAdded}
                    onClick={() => addSuggestedEnvVar(s.key, s.placeholder)}
                    title={s.description}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
                      alreadyAdded
                        ? 'bg-primary/5 text-primary/40 cursor-default'
                        : 'bg-surface border border-border text-text-muted hover:text-text hover:bg-surface-hover'
                    }`}
                  >
                    {alreadyAdded ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {s.key}
                  </button>
                );
              })}
            </div>

            {(isEnterpriseForced || enterprise) ? (
              <div className="flex items-start gap-2 text-xs text-primary/80 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Environment variables are end-to-end encrypted and not visible on the blockchain.
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2 mb-3">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Environment variables are stored publicly on the Flux blockchain.{' '}
                  <strong>Do not include secrets.</strong>{' '}
                  Enable <button type="button" onClick={() => update('enterprise', true)} className="underline hover:text-amber-200">Enterprise mode</button> above if you need to store sensitive values.
                </span>
              </div>
            )}

            {extraEnvVars.length > 0 && (
              <div className="space-y-2 mb-3">
                {extraEnvVars.map((ev, idx) => (
                  <EnvVarRow key={idx} envVar={ev} onChange={(d) => updateEnvVar(idx, d)} onRemove={() => removeEnvVar(idx)} />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addEnvVar}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors"
            >
              <Plus className="w-4 h-4" /> Add variable
            </button>
            <p className="text-xs text-text-muted mt-1">
              <code className="font-mono">GIT_REPO_URL</code>, <code className="font-mono">APP_PORT</code>, and{' '}
              <code className="font-mono">ORBIT_CHECK_INTERVAL</code> are set automatically.
            </p>
          </div>
        </div>
      )}

      {/* Show env var add outside advanced section if advanced is closed */}
      {!showAdvanced && (
        <div className="mt-2">
          <button
            type="button"
            onClick={addEnvVar}
            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors"
          >
            <Plus className="w-4 h-4" /> Add environment variable
          </button>
          {extraEnvVars.length > 0 && (
            <p className="text-xs text-text-muted mt-1">{extraEnvVars.length} variable{extraEnvVars.length !== 1 ? 's' : ''} configured</p>
          )}
        </div>
      )}
    </div>
  );
}
