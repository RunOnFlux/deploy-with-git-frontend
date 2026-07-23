import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, AlertTriangle, CheckSquare, Square, Loader2, ClipboardList, Info } from 'lucide-react';
import {
  maskGitUrl,
  BILLING_PERIODS,
  normalizeCustomPlan,
  isValidPort,
  supportsAdditionalAppPort,
} from '../../services/deployService';
import { formatGeoRows } from '../../services/geolocationSpec';
import { DB_MIN_INSTANCES, DB_TYPES, REDIS_ADDON, getDatabaseConnectionString, getRedisConnectionString, redactConnectionPassword, formatRamMb, databaseNeedsName } from '../../services/databaseSpec';
import { useAuth } from '../../context/AuthContext';

function Row({ label, value, mono }) {
  return (
    <div className="flex gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-text-muted w-36 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-text break-all ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function EnvRow({ envKey, value, revealed, info, onToggleReveal }) {
  return (
    <div className="flex gap-4 py-2 border-b border-border">
      <span className="text-xs text-text-muted w-36 shrink-0 pt-0.5">{envKey}</span>
      <div className="flex-1 flex items-start gap-2 min-w-0">
        <span className="text-sm text-text font-mono break-all flex-1">
          {envKey}={revealed ? value : redactConnectionPassword(value)}
        </span>
        <button
          type="button"
          className="text-text-muted hover:text-text shrink-0"
          title={info}
          aria-label={`${envKey} usage info`}
        >
          <Info className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggleReveal}
          className="text-text-muted hover:text-text shrink-0"
          title={revealed ? `Hide ${envKey}` : `Show ${envKey}`}
          aria-label={revealed ? `Hide ${envKey}` : `Show ${envKey}`}
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}


const POLLING_LABELS = {
  disabled: 'Disabled',
  '3600': '1 hour',
  '7200': '2 hours',
  '21600': '6 hours',
  '43200': '12 hours',
  '86400': '24 hours',
};

export default function Step4Review({ plan, repo, config, ports, termsAccepted, onTermsChange, onEligibilityChecked }) {
  const { zelidauth } = useAuth();
  const zelid = zelidauth?.zelid;

  const [jsonOpen, setJsonOpen] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [showAddonEnv, setShowAddonEnv] = useState({});
  const [dupCheckStatus, setDupCheckStatus] = useState('idle'); // idle|checking|done
  const [eligible, setEligible] = useState(true);

  const clusterAddonEnabled = !!(config.database?.enabled || config.redis?.enabled);
  // Enterprise apps (private repos and cluster add-ons are auto-encrypted) follow a stricter free-first-month rule.
  const isEnterprise = !!(repo?.isPrivate || config?.enterprise || clusterAddonEnabled);

  const billingLabel = BILLING_PERIODS.find((b) => b.months === config.billingPeriod?.months)?.label ?? '1 month';
  const displayPlan = normalizeCustomPlan(plan);
  const displayInstances = clusterAddonEnabled && plan?.id === 'custom'
    ? Math.max(displayPlan.instances, DB_MIN_INSTANCES)
    : displayPlan.instances;
  const displayUrl = showCreds ? repo.url : maskGitUrl(repo.url);
  const additionalAppPortEnabled =
    supportsAdditionalAppPort(plan) &&
    isValidPort(config.additionalPort) &&
    Number(config.additionalPort) !== Number(config.port) &&
    Number(config.additionalPort) !== 9001;
  const mgmtExternalPort = ports?.length ? ports[ports.length - 1] : null;
  const secondAppExternalPort = additionalAppPortEnabled && ports?.length > 2 ? ports[1] : null;
  const externalPortRows = ports
    ? [
        String(ports[0]),
        ...(secondAppExternalPort ? [`${secondAppExternalPort} (second app)`] : []),
        `${mgmtExternalPort} (mgmt)`,
      ].join(' / ')
    : '—';

  function toggleAddonEnv(key) {
    setShowAddonEnv((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Determine free-first-month eligibility. Reads the owner's on-chain history from
  // /apps/permanentmessages (the same source the appsMonitor backend uses), so the UI
  // and the backend agree on who gets charged. Per-customer rule: any app the owner has
  // ever registered on Flux disqualifies them — the free month is one per Flux Cloud
  // account, not per app or repo.
  useEffect(() => {
    if (!zelid) {
      onEligibilityChecked?.(true);
      setDupCheckStatus('done');
      return;
    }
    setDupCheckStatus('checking');

    const markEligible = () => {
      setEligible(true);
      onEligibilityChecked?.(true);
    };

    (async () => {
      try {
        const resp = await fetch(
          `/api/flux/apps/permanentmessages?owner=${zelid}`,
          { headers: { 'x-apicache-bypass': 'true' } },
        );
        const json = await resp.json();
        if (json.status !== 'success' || !Array.isArray(json.data)) {
          markEligible(); // fail open
          return;
        }

        const registerMessages = json.data.filter((m) => m.type === 'fluxappregister');

        // Per-customer rule: any app the owner has ever registered on Flux disqualifies the
        // free first month — one free month per Flux Cloud account, not per app or repo.
        const priorApp = registerMessages[0];
        setEligible(!priorApp);
        onEligibilityChecked?.(!priorApp);
      } catch {
        markEligible(); // fail open
      } finally {
        setDupCheckStatus('done');
      }
    })();
  }, [zelid, repo?.url, isEnterprise]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-bold text-text">Review</h2>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Confirm your deployment settings before signing.
      </p>

      {/* Duplicate repo warning */}
      {dupCheckStatus === 'checking' && (
        <div className="flex items-center gap-2 text-xs text-text-muted mb-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking deployment eligibility…
        </div>
      )}
      {dupCheckStatus === 'done' && !eligible && (
        <div className="flex items-start gap-2 text-sm text-amber-300 bg-amber-400/5 border border-amber-400/20 px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Free first month not applicable</p>
            <p className="text-xs text-amber-300/80 mt-1">
              You already have an app on Flux, so the free first month — which is for customers new to
              Flux Cloud — doesn&apos;t apply. You will be charged for this month, covered by our 30-day
              money-back guarantee.
            </p>
          </div>
        </div>
      )}

      {/* Plan */}
      <section className="card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Plan</h3>
        <Row label="Plan" value={displayPlan?.label} />
        <Row label="CPU" value={`${displayPlan?.cpu} vCPU`} />
        <Row label="RAM" value={`${displayPlan?.ram ? displayPlan.ram / 1000 : '—'} GB`} />
        <Row label="Storage" value={`${displayPlan?.hdd} GB`} />
        <Row label="Instances" value={displayInstances} />
        <Row label="Billing" value={billingLabel} />
        <Row
          label="Price"
          value={
            plan?.priceMonthly === 0
              ? 'Free'
              : plan?.priceMonthly
              ? `$${plan.priceMonthly}/mo${eligible ? ' (first month free)' : ''}`
              : 'Calculated at checkout'
          }
        />
      </section>

      {/* Repository */}
      <section className="card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Repository</h3>
        <div className="flex gap-4 py-2 border-b border-border items-start">
          <span className="text-xs text-text-muted w-36 shrink-0 pt-0.5">URL</span>
          <div className="flex-1 flex items-start gap-2 min-w-0">
            <span className="text-sm text-text font-mono break-all flex-1">{displayUrl || '—'}</span>
            {repo.isPrivate && (
              <button type="button" onClick={() => setShowCreds((v) => !v)}
                className="text-text-muted hover:text-text shrink-0" title={showCreds ? 'Hide credentials' : 'Show credentials'}>
                {showCreds ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
        <Row label="Branch" value={repo.branch || 'main'} mono />
        {repo.subdirectory && <Row label="Subdirectory" value={repo.subdirectory} mono />}
        <Row label="Access" value={repo.isPrivate ? '🔒 Private' : '🌐 Public'} />
        <Row label="Enterprise" value={isEnterprise ? 'Encrypted' : '—'} />
      </section>

      {config.database?.enabled && plan?.id === 'custom' && (
        <section className="card p-4 mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Database</h3>
          <Row label="Type" value={DB_TYPES[config.database.type]?.label ?? config.database.type} />
          <Row label="Component" value={config.database.componentName} mono />
          {databaseNeedsName(config.database.type) && <Row label="Database" value={config.database.dbName} mono />}
          <Row label="CPU" value={`${config.database.resources?.cpu} vCPU`} />
          <Row label="RAM" value={formatRamMb(config.database.resources?.ram)} />
          <Row label="Storage" value={`${config.database.resources?.hdd} GB`} />
          <EnvRow
            envKey={DB_TYPES[config.database.type]?.envKey ?? 'DATABASE_URL'}
            value={getDatabaseConnectionString({
                type: config.database.type,
                componentName: config.database.componentName,
                password: config.database.password,
                dbName: config.database.dbName,
              })}
            revealed={!!showAddonEnv.database}
            info={`${DB_TYPES[config.database.type]?.envKey ?? 'DATABASE_URL'} is injected into your app container. Use process.env.${DB_TYPES[config.database.type]?.envKey ?? 'DATABASE_URL'} in your application to connect to this ${DB_TYPES[config.database.type]?.label ?? 'database'} component.`}
            onToggleReveal={() => toggleAddonEnv('database')}
          />
        </section>
      )}

      {config.redis?.enabled && plan?.id === 'custom' && (
        <section className="card p-4 mb-4">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Redis</h3>
          <Row label="Component" value={config.redis.componentName} mono />
          <Row label="CPU" value={`${config.redis.resources?.cpu} vCPU`} />
          <Row label="RAM" value={formatRamMb(config.redis.resources?.ram)} />
          <Row label="Storage" value={`${config.redis.resources?.hdd} GB`} />
          <EnvRow
            envKey={REDIS_ADDON.envKey}
            value={getRedisConnectionString({
                componentName: config.redis.componentName,
                password: config.redis.password,
              })}
            revealed={!!showAddonEnv.redis}
            info={`${REDIS_ADDON.envKey} is injected into your app container. Use process.env.${REDIS_ADDON.envKey} in your application to connect to Redis through the TLS proxy on port 6380.`}
            onToggleReveal={() => toggleAddonEnv('redis')}
          />
        </section>
      )}

      {/* App config */}
      <section className="card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Configuration</h3>
        <Row label="App name" value={config.appName} mono />
        <Row label="App port" value={ports?.[0] ? `${config.port} -> ${ports[0]}` : config.port} mono />
        {additionalAppPortEnabled && (
          <Row
            label="Second app port"
            value={secondAppExternalPort ? `${config.additionalPort} -> ${secondAppExternalPort}` : config.additionalPort}
            mono
          />
        )}
        <Row label="External ports" value={externalPortRows} mono />
        {config.contactEmail && <Row label="Contact email" value={config.contactEmail} />}
        {config.customDomain && <Row label="Custom domain" value={config.customDomain} mono />}
        <Row label="Auto-redeploy" value={POLLING_LABELS[config.pollingInterval] || config.pollingInterval || '24 hours'} />
        {config.runtime && (
          <Row label="Runtime" value={config.runtimeVersion ? `${config.runtime} ${config.runtimeVersion}` : config.runtime} />
        )}
        <Row label="Geolocation" value={formatGeoRows(config.geolocation)} />
        {config.extraEnvVars?.length > 0 && (
          <div className="py-2">
            <span className="text-xs text-text-muted">Env vars</span>
            <div className="mt-1 space-y-1">
              {config.extraEnvVars.map((ev, i) => (
                <div key={i} className="font-mono text-xs text-text bg-surface-hover px-2 py-1">
                  {ev.key}={ev.value ? '(set)' : '(empty)'}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Raw JSON toggle */}
      <button type="button" onClick={() => setJsonOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text w-full mb-2">
        {jsonOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {jsonOpen ? 'Hide' : 'Show'} spec preview
      </button>
      {jsonOpen && (
        <pre className="bg-surface-hover p-4 text-xs font-mono text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap">
          {JSON.stringify({
            plan: { id: plan?.id, cpu: plan?.cpu, ram: plan?.ram, hdd: plan?.hdd, instances: plan?.instances },
            repo: { url: maskGitUrl(repo.url), branch: repo.branch, subdirectory: repo.subdirectory },
            config: {
              appName: config.appName, port: config.port,
              additionalPort: additionalAppPortEnabled ? config.additionalPort : undefined,
              billingPeriod: config.billingPeriod?.months,
              pollingInterval: config.pollingInterval,
              runtime: config.runtime,
              geolocation: config.geolocation,
              envVarKeys: config.extraEnvVars?.map((e) => e.key),
            },
            ports,
          }, null, 2)}
        </pre>
      )}

      {/* Terms of Service */}
      <div className="mt-5 p-4 border border-border bg-surface/40">
        <button
          type="button"
          onClick={() => onTermsChange?.(!termsAccepted)}
          className="flex items-start gap-3 w-full text-left"
        >
          {termsAccepted
            ? <CheckSquare className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            : <Square className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />}
          <span className="text-sm text-text">
            I understand that this deployment will be submitted to the Flux blockchain and cannot be undone.
            Environment variables are publicly visible. I agree to the{' '}
            <a href="https://runonflux.io/terms" target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
              Flux Terms of Service
            </a>.
          </span>
        </button>
      </div>

      <p className="text-xs text-text-muted mt-3">
        After clicking <strong>Deploy</strong>, we&apos;ll verify your spec with the Flux network, sign it with your wallet, and submit it.
      </p>
    </div>
  );
}
