import { useState, useEffect, useRef, useMemo } from 'react';
import { Plus, Trash2, AlertCircle, Loader2, Check, Globe, ChevronDown, ChevronUp, Zap, Info, GitPullRequest, Upload, Clipboard, X, ShieldCheck, SlidersHorizontal, Clock } from 'lucide-react';
import {
  BILLING_PERIODS,
  validateAppName,
  checkAppNameAvailable,
  isValidPort,
  supportsAdditionalAppPort,
} from '../../services/deployService';
import { parseEnvText } from '../../utils/envParser';
import DatabaseAddon from './DatabaseAddon';
import CustomPlanResources, { PlanResourceSummary } from './CustomPlanResources';
import GeoSelector from '../common/GeoSelector';
import BuildSettingsCard from './BuildSettingsCard';

const POLLING_OPTIONS = [
  { value: 'disabled', label: 'Disabled' },
  { value: '3600', label: '1 hour' },
  { value: '7200', label: '2 hours' },
  { value: '21600', label: '6 hours' },
  { value: '43200', label: '12 hours' },
  { value: '86400', label: '24 hours (default)' },
];

// Orbit-reserved env keys — users cannot set these manually
const RESERVED_ENV_KEYS = new Set([
  'BUILD_COMMAND', 'RUN_COMMAND', 'INSTALL_COMMAND',
  'GIT_REPO_URL', 'APP_PORT', 'ORBIT_CHECK_INTERVAL', 'PR_PREVIEW_ENABLED',
  'WEBHOOK_SECRET', 'API_KEY', 'DATABASE_URL', 'MONGO_URL', 'REDIS_URL',
]);

function EnvImporter({ onImport }) {
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success'|'error', message }
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  function flash(type, message) {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3500);
  }

  function applyParsed({ pairs, format, error }) {
    if (error) return flash('error', error);
    if (!pairs.length) return flash('error', 'No variables found');
    onImport(pairs);
    flash('success', `Imported ${pairs.length} variable${pairs.length !== 1 ? 's' : ''} from ${format.toUpperCase()}`);
  }

  function handleText(text) {
    applyParsed(parseEnvText(text));
  }

  async function handleFile(file) {
    const text = await file.text();
    handleText(text);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      handleText(text);
    } catch {
      // Clipboard API blocked — open the manual textarea instead
      setShowPasteArea(true);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }

  function submitPasteArea() {
    if (!pasteText.trim()) return;
    handleText(pasteText);
    setPasteText('');
    setShowPasteArea(false);
  }

  return (
    <div className="mb-3">
      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`flex items-center justify-center gap-2 border border-dashed px-4 py-3 text-sm cursor-pointer ${
          dragging
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border text-text-muted hover:border-primary/50 hover:text-text-secondary hover:bg-surface-hover'
        }`}
      >
        <Upload className="w-4 h-4 shrink-0" />
        <span>Drop <code className="font-mono text-xs">.env</code>, JSON or YAML, or click to browse</span>
        <input
          ref={fileRef}
          type="file"
          accept=".env,.json,.yaml,.yml,text/plain,application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />
      </div>

      {/* Clipboard button + feedback */}
      <div className="flex items-center gap-2 mt-1.5">
        <button
          type="button"
          onClick={pasteClipboard}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text "
        >
          <Clipboard className="w-3.5 h-3.5" /> Paste from clipboard
        </button>
        {feedback && (
          <span className={`flex items-center gap-1 text-xs ${feedback.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {feedback.type === 'success' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {feedback.message}
          </span>
        )}
      </div>

      {/* Manual paste fallback */}
      {showPasteArea && (
        <div className="mt-2 border border-border bg-surface p-3 space-y-2">
          <p className="text-xs text-text-muted">Paste your <code className="font-mono">.env</code>, JSON or YAML below:</p>
          <textarea
            ref={textareaRef}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPasteArea(); }}
            placeholder={'KEY=value\nANOTHER_KEY=value'}
            rows={5}
            className="w-full input-base font-mono text-xs resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitPasteArea}
              className="px-3 py-1.5 bg-primary text-white text-xs font-medium hover:bg-primary-hover "
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => { setShowPasteArea(false); setPasteText(''); }}
              className="px-3 py-1.5 border border-border text-xs text-text-muted hover:text-text "
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EnvVarRow({ envVar, onChange, onRemove }) {
  const isReserved = envVar.key && RESERVED_ENV_KEYS.has(envVar.key.trim().toUpperCase());
  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="KEY"
          value={envVar.key}
          onChange={(e) => onChange({ ...envVar, key: e.target.value.toUpperCase().replace(/\s/g, '_') })}
          className={`input-base flex-1 font-mono text-sm ${isReserved ? 'border-red-400/60 focus:border-red-400' : ''}`}
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
          className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 "
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {isReserved && (
        <p className="text-xs text-red-400 pl-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          <span><code className="font-mono">{envVar.key}</code> is managed by Orbit. Use the dedicated field above instead.</span>
        </p>
      )}
    </div>
  );
}


function ConfigSection({ title, description, children }) {
  return (
    <section className="mb-8 last:mb-0">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {description && <p className="text-xs text-text-muted mt-0.5 mb-4">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

function EnterpriseModeBlock({ enterprise, isEnterpriseForced, forceReason, onToggle }) {
  if (isEnterpriseForced) {
    return (
      <div className="flex items-start gap-3 border border-primary/30 bg-primary/5 px-4 py-3">
        <ShieldCheck className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-text">Enterprise mode enabled</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {forceReason || 'Private repositories require encrypted specs on ArcaneOS nodes. Environment variables are end-to-end encrypted.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 border border-border bg-surface px-4 py-3">
      <ShieldCheck className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text">Enterprise mode</p>
          <button
            type="button"
            onClick={() => onToggle(!enterprise)}
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
          Encrypt app specifications and run exclusively on ArcaneOS nodes. Required for storing secrets in environment variables.
        </p>
      </div>
    </div>
  );
}


function CollapsibleCard({ title, description, icon, expanded, onToggle, configured, children }) {
  return (
    <div className=" border border-border bg-surface/40 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-surface-hover/40 "
      >
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-text">{title}</p>
            {configured && <span className="text-xs text-primary">configured</span>}
          </div>
          {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-text-muted shrink-0 mt-1" />
          : <ChevronDown className="w-4 h-4 text-text-muted shrink-0 mt-1" />}
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border/40">
          {children}
        </div>
      )}
    </div>
  );
}


export default function Step3Config({ plan, config, onChange, onPlanChange, portAutoDetected, isEnterpriseForced, appPorts }) {
  const { appName, port, portTouched, additionalPort, additionalPortTouched, billingPeriod, geolocation, extraEnvVars,
          contactEmail, customDomain, pollingInterval, webhookSecret, apiKey,
          prPreviewEnabled, enterprise } = config;
  const [nameState, setNameState] = useState('idle');
  const [nameError, setNameError] = useState('');
  const [showPreviewBuilds, setShowPreviewBuilds] = useState(false);
  const debounceRef = useRef(null);
  const addonEnterpriseRequired = plan?.id === 'custom' && (config.database?.enabled || config.redis?.enabled);
  const additionalPortSupported = supportsAdditionalAppPort(plan);
  const primaryPortNumber = Number(port);
  const additionalPortNumber = Number(additionalPort);
  const additionalPortOpen = additionalPortSupported && (additionalPortTouched || Boolean(additionalPort));
  const additionalPortValid =
    !additionalPort ||
    (
      isValidPort(additionalPort) &&
      additionalPortNumber !== primaryPortNumber &&
      additionalPortNumber !== 9001
    );

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

  // Auto-open preview section if enabled (e.g. from flux.json import)
  useEffect(() => {
    if (prPreviewEnabled) setShowPreviewBuilds(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Generated database/Redis credentials must be encrypted in Enterprise specs.
  useEffect(() => {
    if (addonEnterpriseRequired && !enterprise) {
      onChange({ ...config, enterprise: true });
    }
  }, [addonEnterpriseRequired, enterprise]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(field, value) {
    onChange({ ...config, [field]: value });
  }

  // Total per-node hardware the app needs = main plan + any enabled add-on
  // components (they all run on the same node). Plan ram/hdd are GB; add-on
  // resources.ram is MB. Feeds the GeoSelector's capacity filter.
  const geoHardware = useMemo(() => {
    let cpu = Number(plan?.cpu) || 0;
    let ram = Number(plan?.ram) || 0; // GB
    let hdd = Number(plan?.hdd) || 0; // GB
    const addComponent = (r) => {
      if (!r) return;
      cpu += Number(r.cpu) || 0;
      ram += (Number(r.ram) || 0) / 1000; // MB → GB
      hdd += Number(r.hdd) || 0;
    };
    if (config.database?.enabled) addComponent(config.database.resources);
    if (config.redis?.enabled) addComponent(config.redis.resources);
    return { cpu, ram, hdd };
  }, [plan, config.database, config.redis]);

  // Setting a secret field auto-enables Enterprise mode
  function updateSecret(field, value) {
    onChange({ ...config, [field]: value, enterprise: true });
  }

  function importEnvVars(pairs) {
    // Merge: skip reserved keys and deduplicate (imported value wins for existing keys)
    const filtered = pairs.filter(({ key }) => key && !RESERVED_ENV_KEYS.has(key.trim().toUpperCase()));
    const merged = [...extraEnvVars];
    for (const incoming of filtered) {
      const idx = merged.findIndex((e) => e.key === incoming.key);
      if (idx >= 0) merged[idx] = incoming;
      else merged.push(incoming);
    }
    update('extraEnvVars', merged);
  }

  function addEnvVar() {
    update('extraEnvVars', [...extraEnvVars, { key: '', value: '' }]);
  }

  function updateEnvVar(idx, data) {
    update('extraEnvVars', extraEnvVars.map((e, i) => (i === idx ? data : e)));
  }

  function removeEnvVar(idx) {
    update('extraEnvVars', extraEnvVars.filter((_, i) => i !== idx));
  }

  function openAdditionalPort() {
    onChange({ ...config, additionalPortTouched: true });
  }

  function updateAdditionalPort(value) {
    onChange({ ...config, additionalPort: value, additionalPortTouched: true });
  }

  function removeAdditionalPort() {
    onChange({ ...config, additionalPort: '', additionalPortTouched: false });
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
      <div className="flex items-center gap-2.5 mb-1">
        <SlidersHorizontal className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-bold text-text">Configure</h2>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Name your app, configure containers, and set deployment options.
      </p>

      {/* ── App details ── */}
      <ConfigSection title="App details" description="Basic identity and how users reach your app.">
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
            Default URL: <code className="font-mono">{appName ? `${appName}.app.runonflux.io` : '{appName}.app.runonflux.io'}</code>
          </p>
        </div>

        <div>
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
              <span className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 ">
                <Zap className="w-3.5 h-3.5" /> Auto-detected
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-1">
            The port your app listens on inside the container (e.g. 3000, 8080, 5000).
          </p>

          {additionalPortSupported && (
            <div className="mt-3">
              {additionalPortOpen ? (
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">
                    Second app port <span className="text-text-muted font-normal">(optional)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="number"
                      min="1" max="65535"
                      placeholder="8080"
                      value={additionalPort ?? ''}
                      onChange={(e) => updateAdditionalPort(e.target.value)}
                      className={`input-base w-36 ${additionalPort && !additionalPortValid ? 'border-red-500/50 focus:ring-red-500' : ''}`}
                    />
                    {additionalPort && !additionalPortTouched && (
                      <span className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 border border-primary/20 px-2 py-1 ">
                        <Zap className="w-3.5 h-3.5" /> Auto-detected
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={removeAdditionalPort}
                      className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 "
                      title="Remove second app port"
                      aria-label="Remove second app port"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-text-muted mt-1">
                    Exposes one extra port for your app container and maps it to a random Flux external port.
                  </p>
                  {additionalPort && !additionalPortValid && (
                    <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Use a valid port different from {port || 'the primary app port'} and 9001.
                    </p>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openAdditionalPort}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover "
                >
                  <Plus className="w-4 h-4" /> Add second app port
                </button>
              )}
            </div>
          )}
        </div>
      </ConfigSection>

      {/* ── Containers ── */}
      <ConfigSection title="Containers" description="Application and optional database resources.">
        <PlanResourceSummary plan={plan} />
        <CustomPlanResources plan={plan} config={config} onPlanChange={onPlanChange} />
        <BuildSettingsCard config={config} onChange={onChange} />
        <DatabaseAddon
          plan={plan}
          config={config}
          appName={appName}
          appPorts={appPorts}
          onChange={onChange}
          onPlanChange={onPlanChange}
        />
      </ConfigSection>

      {/* ── Deployment options ── */}
      <ConfigSection title="Deployment options" description="Where and how long your app runs.">
        <div className="mb-5">
          <label className="block text-sm font-medium text-text mb-1 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Geolocation <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <p className="text-xs text-text-muted mb-2">Select regions to allow (✓) or forbid (✗). Leave empty for global deployment.</p>
          <GeoSelector
            selected={geolocation}
            onChange={(v) => update('geolocation', v)}
            instances={plan?.instances ?? 1}
            hardware={geoHardware}
            enterprise={enterprise || isEnterpriseForced || addonEnterpriseRequired}
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-text mb-2">Billing period</label>
          <div className="flex flex-wrap gap-2">
            {BILLING_PERIODS.map((bp) => (
              <button key={bp.months} type="button" onClick={() => update('billingPeriod', bp)}
                className={`px-3 py-1.5 border text-sm font-medium ${
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

        <div className="mb-5">
          <label className="block text-sm font-medium text-text mb-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Auto-redeploy interval
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

        <EnterpriseModeBlock
          enterprise={enterprise}
          isEnterpriseForced={isEnterpriseForced || addonEnterpriseRequired}
          forceReason={
            addonEnterpriseRequired
              ? 'Cluster add-ons store generated connection secrets in environment variables, so the app spec is encrypted.'
              : undefined
          }
          onToggle={(v) => update('enterprise', v)}
        />
      </ConfigSection>

      {/* ── Environment ── */}
      <ConfigSection title="Environment" description="Variables, secrets, and optional preview settings.">
      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-3">Environment variables</label>

        {(isEnterpriseForced || enterprise) ? (
          <div className="flex items-start gap-2 text-xs text-primary/80 bg-primary/5 border border-primary/20 px-3 py-2 mb-3">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Environment variables are end-to-end encrypted and not visible on the blockchain.
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-400/5 border border-amber-400/15 px-3 py-2 mb-3 light:text-amber-700 env-warning">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Environment variables are stored publicly on the Flux blockchain.{' '}
              <strong>Do not include secrets.</strong>{' '}
              Enable <button type="button" onClick={() => update('enterprise', true)} className="underline hover:text-amber-200 env-warning-link">Enterprise mode</button> above if you need to store sensitive values.
            </span>
          </div>
        )}

        <EnvImporter onImport={importEnvVars} />

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
          className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover "
        >
          <Plus className="w-4 h-4" /> Add variable
        </button>
      </div>

      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-1">Security</label>
        <p className="text-xs text-text-muted mb-3">
          Setting either field automatically enables{' '}
          <span className="text-orange-400 font-medium">Enterprise mode</span> to keep secrets encrypted.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Webhook secret</label>
            <input
              type="password"
              placeholder="••••••••"
              value={webhookSecret ?? ''}
              onChange={(e) => updateSecret('webhookSecret', e.target.value)}
              className="input-base w-full font-mono text-sm"
              autoComplete="new-password"
            />
            <p className="text-xs text-text-muted mt-1">Secret for webhook deployments.</p>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">API key</label>
            <input
              type="password"
              placeholder="••••••••"
              value={apiKey ?? ''}
              onChange={(e) => updateSecret('apiKey', e.target.value)}
              className="input-base w-full font-mono text-sm"
              autoComplete="new-password"
            />
            <p className="text-xs text-text-muted mt-1">Protects status, logs, and preview endpoints.</p>
          </div>
        </div>
      </div>

      <CollapsibleCard
        title="Preview builds"
        description="Deploy a preview for each pull request. Static sites only."
        icon={<GitPullRequest className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
        expanded={showPreviewBuilds}
        onToggle={() => setShowPreviewBuilds((v) => !v)}
        configured={!!prPreviewEnabled}
      >
        <div className="pt-4 flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">PR preview builds</p>
                <span className="text-xs text-text-muted bg-surface-hover border border-border px-1.5 py-0.5">Static sites only</span>
              </div>
              <button
                type="button"
                onClick={() => update('prPreviewEnabled', !prPreviewEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  prPreviewEnabled ? 'bg-primary' : 'bg-border'
                }`}
                role="switch"
                aria-checked={!!prPreviewEnabled}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${prPreviewEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <p className="text-xs text-text-secondary mt-1.5">
              Automatically build and deploy a preview for each pull request.
            </p>
          </div>
        </div>
      </CollapsibleCard>
      </ConfigSection>

    </div>
  );
}
