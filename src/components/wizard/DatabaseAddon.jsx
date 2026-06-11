import { useMemo, useState } from 'react';
import { Database, Copy, Check, RefreshCw } from 'lucide-react';
import {
  DB_TYPES,
  DB_MIN_INSTANCES,
  createDefaultDatabaseConfig,
  generateDbPorts,
  generateSecret,
  getDatabaseConnectionString,
  formatRamMb,
} from '../../services/databaseSpec';
import { normalizeCustomPlan } from '../../services/deployService';

function ResourceSlider({ label, value, valueLabel, min, max, step, unit, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-muted">{label}</span>
        <span className="text-xs font-mono text-text">{valueLabel ?? `${value}${unit}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}

export default function DatabaseAddon({ plan, config, appName, appPorts, onChange, onPlanChange }) {
  const database = config.database ?? createDefaultDatabaseConfig();
  const [copied, setCopied] = useState(false);

  const connectionString = useMemo(() => {
    if (!database.enabled || !appName || !database.password) return '';
    return getDatabaseConnectionString({
      type: database.type,
      componentName: database.componentName,
      password: database.password,
      dbName: database.dbName,
    });
  }, [database]);

  if (plan?.id !== 'custom') return null;

  function updateDatabase(patch) {
    onChange({ ...config, database: { ...database, ...patch } });
  }

  function ensureMinInstances() {
    const normalized = normalizeCustomPlan(plan);
    if (normalized.instances < DB_MIN_INSTANCES) {
      onPlanChange?.({ ...normalized, instances: DB_MIN_INSTANCES });
    } else if (plan?.id === 'custom' && (plan.cpu == null || plan.ram == null || plan.hdd == null)) {
      onPlanChange?.(normalized);
    }
  }

  function enableDatabase(enabled) {
    if (!enabled) {
      updateDatabase({ enabled: false });
      return;
    }
    const next = createDefaultDatabaseConfig(database.type);
    next.enabled = true;
    next.ports = generateDbPorts(next.type, appPorts ?? []);
    onChange({ ...config, database: next });
    ensureMinInstances();
  }

  function switchType(type) {
    const next = createDefaultDatabaseConfig(type);
    next.enabled = true;
    next.ports = generateDbPorts(type, appPorts ?? []);
    onChange({ ...config, database: next });
    ensureMinInstances();
  }

  function regenerateSecrets() {
    updateDatabase({
      password: generateSecret(20),
      replicationPassword: database.type === 'postgres' ? generateSecret(20) : '',
      sslPassphrase: database.type === 'postgres' ? generateSecret(16) : '',
      keyfilePassphrase: database.type === 'mongodb' ? generateSecret(16) : '',
    });
  }

  async function copyConnectionString() {
    if (!connectionString) return;
    await navigator.clipboard.writeText(connectionString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const envKey = DB_TYPES[database.type]?.envKey ?? 'DATABASE_URL';

  return (
    <div className="mb-5 rounded-xl border border-border bg-surface/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-text">Database container</p>
            <p className="text-xs text-text-muted mt-0.5">
              Add a managed PostgreSQL or MongoDB cluster alongside your app. Custom plan only.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => enableDatabase(!database.enabled)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            database.enabled ? 'bg-primary' : 'bg-border'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
              database.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {database.enabled && (
        <div className="space-y-4 pt-2 border-t border-border/40">
          <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Database clusters require at least {DB_MIN_INSTANCES} instances.
            {plan?.instances < DB_MIN_INSTANCES
              ? ' Instances will be set to 3.'
              : ` Current: ${plan.instances} instances.`}
          </p>
          <div className="flex gap-2">
            {Object.values(DB_TYPES).map((db) => (
              <button
                key={db.id}
                type="button"
                onClick={() => switchType(db.id)}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  database.type === db.id
                    ? 'bg-primary/15 border-primary/50 text-primary'
                    : 'bg-background/40 border-border/40 text-text-muted hover:border-border'
                }`}
              >
                {db.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Component name</label>
              <input
                type="text"
                value={database.componentName}
                onChange={(e) => updateDatabase({ componentName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                className="input-base w-full font-mono text-sm"
                maxLength={16}
              />
            </div>
            {database.type === 'postgres' && (
              <div>
                <label className="block text-xs text-text-muted mb-1">Database name</label>
                <input
                  type="text"
                  value={database.dbName}
                  onChange={(e) => updateDatabase({ dbName: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
                  className="input-base w-full font-mono text-sm"
                  maxLength={32}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">DB resources</p>
            <ResourceSlider
              label="CPU"
              value={database.resources.cpu}
              min={0.5}
              max={8}
              step={0.1}
              unit=" vCPU"
              onChange={(cpu) => updateDatabase({ resources: { ...database.resources, cpu } })}
            />
            <ResourceSlider
              label="RAM"
              value={database.resources.ram / 1000}
              valueLabel={formatRamMb(database.resources.ram)}
              min={1}
              max={32}
              step={0.5}
              unit=" GB"
              onChange={(ramGb) => updateDatabase({ resources: { ...database.resources, ram: Math.round(ramGb * 1000) } })}
            />
            <ResourceSlider
              label="Storage"
              value={database.resources.hdd}
              min={5}
              max={200}
              step={1}
              unit=" GB"
              onChange={(hdd) => updateDatabase({ resources: { ...database.resources, hdd } })}
            />
          </div>

          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs font-semibold text-text">
                Set this env var on your app: <code className="font-mono text-primary">{envKey}</code>
              </p>
              <button
                type="button"
                onClick={regenerateSecrets}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
                title="Regenerate passwords"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Regenerate secrets
              </button>
            </div>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-[11px] font-mono text-text-secondary break-all leading-relaxed">
                {connectionString || 'Enter an app name to preview the connection string'}
              </code>
              <button
                type="button"
                onClick={copyConnectionString}
                disabled={!connectionString}
                className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover disabled:opacity-40"
                title="Copy connection string"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              This value is added automatically to your app container. Use the proxy port (5433) for PostgreSQL.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
