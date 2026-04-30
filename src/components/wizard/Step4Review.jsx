import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, AlertTriangle, CheckSquare, Square, Loader2, ClipboardList } from 'lucide-react';
import { maskGitUrl, GEO_OPTIONS, BILLING_PERIODS } from '../../services/deployService';
import { useAuth } from '../../context/AuthContext';

function Row({ label, value, mono }) {
  return (
    <div className="flex gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs text-text-muted w-36 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-text break-all ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}

function GeoLabel(geoArray) {
  if (!geoArray?.length) return 'No restriction (global)';
  return geoArray
    .map((g) => {
      const opt = GEO_OPTIONS.find((o) => o.code === g.code);
      const label = opt?.label ?? g.code;
      return `${g.type === 'forbidden' ? '✗ ' : '✓ '}${label}`;
    })
    .join(', ');
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
  const { user } = useAuth();
  const zelid = user?.zelid;

  const [jsonOpen, setJsonOpen] = useState(false);
  const [showCreds, setShowCreds] = useState(false);
  const [dupCheckStatus, setDupCheckStatus] = useState('idle'); // idle|checking|done
  const [hasDuplicate, setHasDuplicate] = useState(false);
  const [existingAppName, setExistingAppName] = useState(null);

  const billingLabel = BILLING_PERIODS.find((b) => b.months === config.billingPeriod?.months)?.label ?? '1 month';
  const displayUrl = showCreds ? repo.url : maskGitUrl(repo.url);
  const pollingLabel = POLLING_LABELS[config.pollingInterval] || config.pollingInterval || '24 hours';

  // Normalize repo URL for comparison (strip creds, trailing slash, .git)
  function normalizeRepoUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      u.username = '';
      u.password = '';
      return u.toString().replace(/\.git$/, '').replace(/\/$/, '');
    } catch {
      return url.replace(/\.git$/, '').replace(/\/$/, '');
    }
  }

  // Check if user already has any running Orbit app → not eligible for free tier
  useEffect(() => {
    if (!zelid) {
      onEligibilityChecked?.(true);
      setDupCheckStatus('done');
      return;
    }
    setDupCheckStatus('checking');

    (async () => {
      try {
        const resp = await fetch(
          `/api/flux/apps/globalappsspecifications?owner=${zelid}`,
          { headers: { 'x-apicache-bypass': 'true' } },
        );
        const json = await resp.json();
        if (json.status !== 'success' || !Array.isArray(json.data)) {
          onEligibilityChecked?.(true); // fail open
          setDupCheckStatus('done');
          return;
        }

        const hasOrbitApp = json.data.some((app) => {
          // Non-enterprise: check repotag on compose[0]
          if (app.compose?.length > 0) {
            return app.compose[0]?.repotag === 'runonflux/orbit:latest';
          }
          // Enterprise: compose is empty, but enterprise blob means it IS an orbit app
          return !!(app.version >= 8 && app.enterprise);
        });

        setHasDuplicate(hasOrbitApp);
        if (hasOrbitApp) setExistingAppName(json.data.find((app) => app.compose?.[0]?.repotag === 'runonflux/orbit:latest')?.name ?? null);
        onEligibilityChecked?.(!hasOrbitApp);
      } catch {
        onEligibilityChecked?.(true); // fail open
      } finally {
        setDupCheckStatus('done');
      }
    })();
  }, [zelid]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {dupCheckStatus === 'done' && hasDuplicate && (
        <div className="flex items-start gap-2 text-sm text-amber-300 bg-amber-400/5 border border-amber-400/20 rounded-xl px-4 py-3 mb-4">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Not eligible for first month free</p>
            <p className="text-xs text-amber-300/80 mt-1">
              You already have a running Orbit app (<code className="font-mono">{existingAppName}</code>).
              Only one free Orbit app is allowed per account. Paid plans will be charged immediately.
            </p>
          </div>
        </div>
      )}

      {/* Plan */}
      <section className="card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Plan</h3>
        <Row label="Plan" value={plan?.label} />
        <Row label="CPU" value={`${plan?.cpu} vCPU`} />
        <Row label="RAM" value={`${plan ? plan.ram / 1000 : '—'} GB`} />
        <Row label="Storage" value={`${plan?.hdd} GB`} />
        <Row label="Instances" value={plan?.instances} />
        <Row label="Billing" value={billingLabel} />
        <Row
          label="Price"
          value={
            plan?.priceMonthly === 0
              ? 'Free'
              : plan?.priceMonthly
              ? `$${plan.priceMonthly}/mo${!hasDuplicate ? ' (first month free)' : ''}`
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
        <Row label="Enterprise" value={(repo.isPrivate || config.enterprise) ? '🔐 Encrypted' : '—'} />
      </section>

      {/* App config */}
      <section className="card p-4 mb-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Configuration</h3>
        <Row label="App name" value={config.appName} mono />
        <Row label="App port" value={config.port} mono />
        <Row label="External ports" value={ports ? `${ports[0]} / ${ports[1]} (mgmt)` : '—'} mono />
        {config.contactEmail && <Row label="Contact email" value={config.contactEmail} />}
        {config.customDomain && <Row label="Custom domain" value={config.customDomain} mono />}
        <Row label="Auto-redeploy" value={POLLING_LABELS[config.pollingInterval] || config.pollingInterval || '24 hours'} />
        {config.runtime && (
          <Row label="Runtime" value={config.runtimeVersion ? `${config.runtime} ${config.runtimeVersion}` : config.runtime} />
        )}
        <Row label="Geolocation" value={GeoLabel(config.geolocation)} />
        {config.extraEnvVars?.length > 0 && (
          <div className="py-2">
            <span className="text-xs text-text-muted">Env vars</span>
            <div className="mt-1 space-y-1">
              {config.extraEnvVars.map((ev, i) => (
                <div key={i} className="font-mono text-xs text-text bg-surface-hover rounded px-2 py-1">
                  {ev.key}={ev.value ? '(set)' : '(empty)'}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Raw JSON toggle */}
      <button type="button" onClick={() => setJsonOpen((v) => !v)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors w-full mb-2">
        {jsonOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        {jsonOpen ? 'Hide' : 'Show'} spec preview
      </button>
      {jsonOpen && (
        <pre className="bg-surface-hover rounded-lg p-4 text-xs font-mono text-text-secondary overflow-auto max-h-64 whitespace-pre-wrap">
          {JSON.stringify({
            plan: { id: plan?.id, cpu: plan?.cpu, ram: plan?.ram, hdd: plan?.hdd, instances: plan?.instances },
            repo: { url: maskGitUrl(repo.url), branch: repo.branch, subdirectory: repo.subdirectory },
            config: {
              appName: config.appName, port: config.port,
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
      <div className="mt-5 p-4 border border-border rounded-xl bg-surface/40">
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
