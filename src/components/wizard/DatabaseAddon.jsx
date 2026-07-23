import { useMemo, useState } from 'react';
import { Database, Copy, Check, RefreshCw, Info, Zap, Eye, EyeOff } from 'lucide-react';
import {
  DB_TYPES,
  REDIS_ADDON,
  DB_MIN_INSTANCES,
  createDefaultDatabaseConfig,
  createDefaultRedisConfig,
  generateDbPorts,
  generateRedisPorts,
  generateSecret,
  getDatabaseConnectionString,
  getRedisConnectionString,
  redactConnectionPassword,
  formatRamMb,
  databaseNeedsName,
  isSharedSqlType,
} from '../../services/databaseSpec';
import { normalizeCustomPlan } from '../../services/deployService';
import ResourceSlider from './ResourceSlider';

function AddonHeader({ icon, title, description, enabled, onToggle }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon}
        <div>
          <p className="text-sm font-semibold text-text">{title}</p>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onToggle(!enabled)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          enabled ? 'bg-primary' : 'bg-border'
        }`}
        role="switch"
        aria-checked={!!enabled}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

function EnvValuePreview({ envKey, value, placeholder, revealed, copied, info, onToggleReveal, onCopy }) {
  const displayValue = value
    ? `${envKey}=${revealed ? value : redactConnectionPassword(value)}`
    : placeholder;

  return (
    <div className="flex items-start gap-2">
      <code className="flex-1 text-[11px] font-mono text-text-secondary break-all leading-relaxed">
        {displayValue}
      </code>
      <button
        type="button"
        className="shrink-0 p-1.5 text-text-muted hover:text-text hover:bg-surface-hover"
        title={info}
        aria-label={`${envKey} usage info`}
      >
        <Info className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onToggleReveal}
        disabled={!value}
        className="shrink-0 p-1.5 text-text-muted hover:text-text hover:bg-surface-hover disabled:opacity-40"
        title={revealed ? `Hide ${envKey}` : `Show ${envKey}`}
        aria-label={revealed ? `Hide ${envKey}` : `Show ${envKey}`}
      >
        {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={onCopy}
        disabled={!value}
        className="shrink-0 p-1.5 text-text-muted hover:text-text hover:bg-surface-hover disabled:opacity-40"
        title={`Copy ${envKey}`}
        aria-label={`Copy ${envKey}`}
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function DatabaseAddon({ plan, config, appName, appPorts, onChange, onPlanChange }) {
  const database = config.database ?? createDefaultDatabaseConfig();
  const redis = config.redis ?? createDefaultRedisConfig();
  const [copied, setCopied] = useState(null);
  const [revealed, setRevealed] = useState({});

  const databaseConnectionString = useMemo(() => {
    if (!database.enabled || !appName || !database.password) return '';
    return getDatabaseConnectionString({
      type: database.type,
      componentName: database.componentName,
      password: database.password,
      dbName: database.dbName,
    });
  }, [database, appName]);

  const redisConnectionString = useMemo(() => {
    if (!redis.enabled || !appName || !redis.password) return '';
    return getRedisConnectionString({
      componentName: redis.componentName,
      password: redis.password,
    });
  }, [redis, appName]);

  if (plan?.id !== 'custom') return null;

  const clusterAddonEnabled = database.enabled || redis.enabled;
  const duplicateComponentName =
    database.enabled &&
    redis.enabled &&
    database.componentName &&
    database.componentName === redis.componentName;

  function collectUsedPorts(skip) {
    const used = [...(appPorts ?? [])];
    if (skip !== 'database' && database.ports?.length) used.push(...database.ports);
    if (skip !== 'redis' && redis.ports?.length) used.push(...redis.ports);
    return used;
  }

  function updateDatabase(patch, forceEnterprise = false) {
    onChange({
      ...config,
      database: { ...database, ...patch },
      ...(forceEnterprise ? { enterprise: true } : {}),
    });
  }

  function updateRedis(patch, forceEnterprise = false) {
    onChange({
      ...config,
      redis: { ...redis, ...patch },
      ...(forceEnterprise ? { enterprise: true } : {}),
    });
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
    next.ports = generateDbPorts(next.type, collectUsedPorts('database'));
    onChange({ ...config, database: next, enterprise: true });
    ensureMinInstances();
  }

  function switchType(type) {
    const next = createDefaultDatabaseConfig(type);
    next.enabled = true;
    next.ports = generateDbPorts(type, collectUsedPorts('database'));
    onChange({ ...config, database: next, enterprise: true });
    ensureMinInstances();
  }

  function enableRedis(enabled) {
    if (!enabled) {
      updateRedis({ enabled: false });
      return;
    }
    const next = createDefaultRedisConfig();
    next.enabled = true;
    next.ports = generateRedisPorts(collectUsedPorts('redis'));
    onChange({ ...config, redis: next, enterprise: true });
    ensureMinInstances();
  }

  function regenerateDatabaseSecrets() {
    updateDatabase({
      password: generateSecret(20),
      replicationPassword: database.type === 'postgres' ? generateSecret(20) : '',
      sslPassphrase: database.type === 'postgres' ? generateSecret(16) : '',
      keyfilePassphrase: database.type === 'mongodb' ? generateSecret(16) : '',
    });
  }

  function regenerateRedisSecrets() {
    updateRedis({
      password: generateSecret(20),
      sslPassphrase: generateSecret(16),
    });
  }

  async function copyConnectionString(envKey, value, key) {
    if (!value) return;
    await navigator.clipboard.writeText(`${envKey}=${value}`);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleReveal(key) {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const envKey = DB_TYPES[database.type]?.envKey ?? 'DATABASE_URL';
  const databaseInfo = `${envKey} is added to your app container automatically. Use it in your app as process.env.${envKey} to connect to the ${DB_TYPES[database.type]?.label ?? 'database'} component.`;
  const redisInfo = `${REDIS_ADDON.envKey} is added to your app container automatically. Use it in your app as process.env.${REDIS_ADDON.envKey} to connect to Redis through the TLS proxy on port 6380.`;

  return (
    <div className="mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Data services</p>
          <p className="text-xs text-text-muted mt-1">
            Add persistent storage or caching to your deployment.
          </p>
        </div>
        <span className="shrink-0 border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
          Custom plan
        </span>
      </div>

      {clusterAddonEnabled && (
        <div className="flex items-start gap-2 text-xs text-amber-300/80 bg-amber-400/5 border border-amber-400/15 px-3 py-2 mb-4 light:text-amber-700 env-warning">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Cluster add-ons require at least {DB_MIN_INSTANCES} instances and enable Enterprise mode for generated secrets.
            {plan?.instances < DB_MIN_INSTANCES
              ? ' Instances will be set to 3.'
              : ` Current: ${plan.instances} instances.`}
          </span>
        </div>
      )}

      <div className="space-y-3">
        <div className=" border border-border bg-surface/40 p-4">
          <AddonHeader
            icon={<Database className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
            title="Database"
            description="Choose a database engine for persistent application data."
            enabled={database.enabled}
            onToggle={enableDatabase}
          />

          {database.enabled && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.values(DB_TYPES).map((db) => (
                  <button
                    key={db.id}
                    type="button"
                    onClick={() => switchType(db.id)}
                    className={`flex-1 px-3 py-2 border text-sm font-medium ${
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
                    className={`input-base w-full font-mono text-sm ${duplicateComponentName ? 'border-red-400/60 focus:border-red-400' : ''}`}
                    maxLength={16}
                  />
                </div>
                {databaseNeedsName(database.type) && (
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

              <div className=" border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-text">
                    Set this env var on your app: <code className="font-mono text-primary">{envKey}</code>
                  </p>
                  <button
                    type="button"
                    onClick={regenerateDatabaseSecrets}
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
                    title="Regenerate passwords"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate secrets
                  </button>
                </div>
                <EnvValuePreview
                  envKey={envKey}
                  value={databaseConnectionString}
                  placeholder="Enter an app name to preview the connection string"
                  revealed={!!revealed.database}
                  copied={copied === 'database'}
                  info={databaseInfo}
                  onToggleReveal={() => toggleReveal('database')}
                  onCopy={() => copyConnectionString(envKey, databaseConnectionString, 'database')}
                />
                <p className="text-[11px] text-text-muted mt-2">
                  This value is added automatically to your app container.
                  {database.type === 'postgres' ? ' Use the proxy port (5433) for PostgreSQL.' : ''}
                  {isSharedSqlType(database.type) ? ' Use the shared DB proxy port (3307).' : ''}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className=" border border-border bg-surface/40 p-4">
          <AddonHeader
            icon={<Zap className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
            title="Redis"
            description="Add a Redis cluster for caching, queues, sessions, and rate limiting."
            enabled={redis.enabled}
            onToggle={enableRedis}
          />

          {redis.enabled && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Component name</label>
                  <input
                    type="text"
                    value={redis.componentName}
                    onChange={(e) => updateRedis({ componentName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    className={`input-base w-full font-mono text-sm ${duplicateComponentName ? 'border-red-400/60 focus:border-red-400' : ''}`}
                    maxLength={16}
                  />
                </div>
              </div>
              {duplicateComponentName && (
                <p className="text-xs text-red-400">
                  Database and Redis component names must be different.
                </p>
              )}

              <div className="space-y-3">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Redis resources</p>
                <ResourceSlider
                  label="CPU"
                  value={redis.resources.cpu}
                  min={0.5}
                  max={8}
                  step={0.1}
                  unit=" vCPU"
                  onChange={(cpu) => updateRedis({ resources: { ...redis.resources, cpu } })}
                />
                <ResourceSlider
                  label="RAM"
                  value={redis.resources.ram / 1000}
                  valueLabel={formatRamMb(redis.resources.ram)}
                  min={1}
                  max={32}
                  step={0.5}
                  unit=" GB"
                  onChange={(ramGb) => updateRedis({ resources: { ...redis.resources, ram: Math.round(ramGb * 1000) } })}
                />
                <ResourceSlider
                  label="Storage"
                  value={redis.resources.hdd}
                  min={5}
                  max={200}
                  step={1}
                  unit=" GB"
                  onChange={(hdd) => updateRedis({ resources: { ...redis.resources, hdd } })}
                />
              </div>

              <div className=" border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold text-text">
                    Set this env var on your app: <code className="font-mono text-primary">{REDIS_ADDON.envKey}</code>
                  </p>
                  <button
                    type="button"
                    onClick={regenerateRedisSecrets}
                    className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
                    title="Regenerate Redis secrets"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Regenerate secrets
                  </button>
                </div>
                <EnvValuePreview
                  envKey={REDIS_ADDON.envKey}
                  value={redisConnectionString}
                  placeholder="Enter an app name to preview the connection string"
                  revealed={!!revealed.redis}
                  copied={copied === 'redis'}
                  info={redisInfo}
                  onToggleReveal={() => toggleReveal('redis')}
                  onCopy={() => copyConnectionString(REDIS_ADDON.envKey, redisConnectionString, 'redis')}
                />
                <p className="text-[11px] text-text-muted mt-2">
                  This value is added automatically to your app container. Redis uses the TLS proxy port (6380).
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
