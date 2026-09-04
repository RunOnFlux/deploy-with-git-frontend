import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useDeployWizard } from '../../hooks/useDeployWizard';
import { PLANS, isValidPort, normalizeCustomPlan, supportsAdditionalAppPort, supportsCustomDomain, computeGeoHardware } from '../../services/deployService';
import { resolvePlanFromImport } from '../../services/repoConfigImportService';
import { geolocationFromImport, buildGeoSpec } from '../../services/geolocationSpec';
import { fetchDeployCapacity } from '../../hooks/useNetworkStats';
import { databaseNeedsName } from '../../services/databaseSpec';
import { validatePersistentFolders } from '../../services/persistentVolumeService';
import Step1Plan from '../../components/wizard/Step1Plan';
import Step2Repo from '../../components/wizard/Step2Repo';
import Step3Config from '../../components/wizard/Step3Config';
import Step4Review from '../../components/wizard/Step4Review';
import Step5Register from '../../components/wizard/Step5Register';
import Step6Payment from '../../components/wizard/Step6Payment';

// Allowed plan IDs for deep-link prefill
const PLAN_ALIASES = { free: 'free', standard: 'standard', developer: 'standard', dev: 'standard', pro: 'pro', custom: 'custom' };
const POLLING_ALIASES = { disabled: 'disabled', '1h': '3600', '2h': '7200', '6h': '21600', '12h': '43200', '24h': '86400' };
const RUNTIME_ALIASES = {
  node: 'node',
  nodejs: 'node',
  python: 'python',
  py: 'python',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  java: 'java',
  php: 'php',
  ruby: 'ruby',
  dotnet: 'dotnet',
  erlang: 'erlang',
  otp: 'erlang',
  elixir: 'elixir',
  dart: 'dart',
};
const HERO_PREFILL_KEY = 'orbitHeroDeployPrefill';

const STEPS = [
  { label: 'Plan' },
  { label: 'Repository' },
  { label: 'Configure' },
  { label: 'Review' },
  { label: 'Deploy' },
  { label: 'Payment' },
];

function WizardProgress({ current }) {
  return (
    <div className="flex items-center mb-4">
      {/* Step indicators */}
      <div className="flex items-center flex-1">
        {STEPS.map((s, i) => {
          const num = i + 1;
          const done = num < current;
          const active = num === current;

          return (
            <div key={s.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold border-2 ${
                    done
                      ? 'border-primary bg-primary text-white'
                      : active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-surface text-text-muted'
                  }`}
                >
                  {done ? <Check className="w-4 h-4" /> : num}
                </div>
                <span
                  className={`text-xs mt-1 whitespace-nowrap ${
                    active ? 'text-primary font-medium' : done ? 'text-text-secondary' : 'text-text-muted'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-px flex-1 mx-2 mb-4 ${done ? 'bg-primary' : 'bg-border'}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DeployWizard() {
  const wizard = useDeployWizard();
  const { state, next, back, setPlan, setRepo, setConfig, setTerms, ensurePorts, setRegistration, setVerifiedSpec, setEligibleForFree } = wizard;
  const { step, plan, repo, config, termsAccepted } = state;
  const [searchParams] = useSearchParams();

  // ── Deep-link prefill from URL query params ────────────────────────────────
  useEffect(() => {
    const get = (key) => searchParams.get(key)?.trim() || '';
    let heroPrefill = null;

    try {
      const raw = sessionStorage.getItem(HERO_PREFILL_KEY);
      if (raw) {
        heroPrefill = JSON.parse(raw);
        sessionStorage.removeItem(HERO_PREFILL_KEY);
      }
    } catch {
      sessionStorage.removeItem(HERO_PREFILL_KEY);
    }

    const repoUrl = get('repo') || get('repolink') || get('repository');
    const branch = get('branch');
    const projectPath = get('projectPath') || get('path') || get('subdirectory');
    const planAlias = (get('plan') || get('tier')).toLowerCase();
    const appPort = get('appPort') || get('port');
    const additionalAppPort = get('additionalAppPort') || get('appPort2') || get('port2');
    const pollingRaw = (get('pollingInterval') || get('polling')).toLowerCase();
    const runtimeRaw = (get('runtime') || '').toLowerCase();
    const runtimeVersion = get('runtimeVersion') || get('runtime_version');

    const planId = PLAN_ALIASES[planAlias];
    const polling = POLLING_ALIASES[pollingRaw] || pollingRaw;
    const runtime = RUNTIME_ALIASES[runtimeRaw];

    const hasAny = repoUrl || planId || appPort || additionalAppPort || polling || runtime || heroPrefill?.url;
    if (!hasAny) return;

    if (planId) {
      const p = PLANS.find((pl) => pl.id === planId);
      if (p) {
        setPlan(p.id === 'custom' ? normalizeCustomPlan(p) : p);
        // Auto-advance past step 1 — plan is already chosen
        next();
      }
    }

    const repoUpdates = {};
    if (repoUrl) repoUpdates.url = repoUrl;
    if (branch) { repoUpdates.branch = branch; repoUpdates.branchTouched = true; }
    if (projectPath) repoUpdates.subdirectory = projectPath;

    if (heroPrefill?.url) repoUpdates.url = heroPrefill.url;
    if (heroPrefill?.branch) {
      repoUpdates.branch = heroPrefill.branch;
      repoUpdates.branchTouched = true;
    }
    if (heroPrefill?.isPrivate) {
      repoUpdates.isPrivate = true;
      repoUpdates.authTestStatus = 'success';
      repoUpdates.repoStatus = 'inaccessible';
      if (heroPrefill.username) repoUpdates.username = heroPrefill.username;
      if (heroPrefill.token) repoUpdates.token = heroPrefill.token;
    }
    if (heroPrefill?.compatibilityStatus) repoUpdates.compatibilityStatus = heroPrefill.compatibilityStatus;
    if (heroPrefill?.compatibilityMessage) repoUpdates.compatibilityMessage = heroPrefill.compatibilityMessage;

    if (Object.keys(repoUpdates).length) setRepo(repoUpdates);

    const configUpdates = {};
    if (appPort) configUpdates.port = appPort;
    if (additionalAppPort) {
      configUpdates.additionalPort = additionalAppPort;
      configUpdates.additionalPortTouched = true;
    }
    if (polling) configUpdates.pollingInterval = polling;
    if (runtime) configUpdates.runtime = runtime;
    if (runtimeVersion && runtime) configUpdates.runtimeVersion = runtimeVersion;
    if (Object.keys(configUpdates).length) setConfig(configUpdates);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-enable enterprise when repo is detected as private
  useEffect(() => {
    if (repo.isPrivate && !config.enterprise) {
      setConfig({ enterprise: true });
    }
  }, [repo.isPrivate]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Free plan exposes only the primary app port.
  useEffect(() => {
    if (plan?.id === 'free' && (config.additionalPort || config.additionalPortTouched)) {
      setConfig({ additionalPort: '', additionalPortTouched: false });
    }
  }, [plan?.id, config.additionalPort, config.additionalPortTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  /** Called by Step2Repo when port is auto-detected from repo files. */
  function handlePortDetected(port) {
    if (!config.portTouched) {
      setConfig({ port: String(port), portTouched: false });
    }
  }

  /** Called by Step2Repo when flux.json / vercel.json config is imported. */
  function handleConfigImported(payload) {
    const updates = {};
    if (payload.appPort && !config.portTouched) updates.port = payload.appPort;
    if (payload.additionalPort) {
      updates.additionalPort = payload.additionalPort;
      updates.additionalPortTouched = false;
    }
    if (payload.pollingInterval) updates.pollingInterval = payload.pollingInterval;
    if (payload.runtime) updates.runtime = payload.runtime;
    if (payload.runtimeVersion) updates.runtimeVersion = payload.runtimeVersion;
    if (payload.appName && !config.appName?.trim()) updates.appName = payload.appName;
    if (payload.prPreviewEnabled != null) updates.prPreviewEnabled = Boolean(payload.prPreviewEnabled);
    if (payload.database) updates.database = payload.database;
    if (payload.redis) updates.redis = payload.redis;
    if (payload.database?.enabled || payload.redis?.enabled) updates.enterprise = true;

    const importedGeo = geolocationFromImport(payload);
    if (importedGeo.length) updates.geolocation = importedGeo;

    if (payload.envVars?.length) {
      const COMMAND_KEYS = { BUILD_COMMAND: 'buildCommand', RUN_COMMAND: 'runCommand', INSTALL_COMMAND: 'installCommand' };
      const userEnvVars = [];
      for (const { key, value } of payload.envVars) {
        const mapped = COMMAND_KEYS[key];
        if (mapped) updates[mapped] = value;
        else userEnvVars.push({ key, value });
      }
      if (userEnvVars.length) updates.extraEnvVars = userEnvVars;
    }

    if (Object.keys(updates).length) setConfig(updates);

    const importedPlan = resolvePlanFromImport(payload);
    if (importedPlan) setPlan(importedPlan);
  }

  // ── Validation guards ───────────────────────────────────────────────────────
  function isRepoValidated() {
    const hasHttpUrl = Boolean(repo.url?.trim().startsWith('http'));
    const isPublicRepo = repo.repoStatus === 'public';
    const isAuthenticatedPrivateRepo =
      repo.repoStatus === 'inaccessible' && repo.authTestStatus === 'success';

    return hasHttpUrl && (isPublicRepo || isAuthenticatedPrivateRepo);
  }

  function getRepoValidationHint() {
    if (!repo.url?.trim()) return 'Repository URL required';
    if (!repo.url.trim().startsWith('http')) return 'Enter an HTTPS repository URL';
    if (repo.repoStatus === 'checking') return 'Checking repository access';
    if (repo.repoStatus === 'inaccessible' && repo.authTestStatus !== 'success') {
      return 'Validate repository access to continue';
    }
    if (repo.repoStatus === 'unknown') return 'Repository access could not be verified';
    return 'Validate repository to continue';
  }

  function canProceed() {
    if (step === 1) return Boolean(plan);
    if (step === 2) return isRepoValidated();
    if (step === 3) {
      const db = config.database;
      const redis = config.redis;
      const primaryPort = Number(config.port);
      const additionalPort = Number(config.additionalPort);
      const appPortValid = isValidPort(config.port);
      const additionalPortValid = (
        !config.additionalPort ||
        (
          supportsAdditionalAppPort(plan) &&
          isValidPort(config.additionalPort) &&
          additionalPort !== primaryPort &&
          additionalPort !== 9001
        )
      );
      const dbValid = !db?.enabled || plan?.id !== 'custom' || (
        db.componentName?.length >= 1 &&
        (!databaseNeedsName(db.type) || db.dbName?.length >= 1) &&
        plan?.instances >= 3
      );
      const redisValid = !redis?.enabled || plan?.id !== 'custom' || (
        redis.componentName?.length >= 1 &&
        plan?.instances >= 3
      );
      const uniqueAddonNames = !(db?.enabled && redis?.enabled) || db.componentName !== redis.componentName;
      const persistentFoldersValid = validatePersistentFolders(config.persistentFolders).valid;
      const replicationValid = !config.persistentFolders?.length || Number(plan?.instances) >= 2;
      const customDomainValid = supportsCustomDomain(plan) || !config.customDomain?.trim();
      return (
        config.appName?.length >= 3 &&
        /^[a-z][a-z0-9-]*[a-z0-9]$/.test(config.appName) &&
        appPortValid &&
        additionalPortValid &&
        Boolean(config.contactEmail?.trim()) &&
        dbValid &&
        redisValid &&
        uniqueAddonNames &&
        persistentFoldersValid &&
        replicationValid &&
        customDomainValid
      );
    }
    if (step === 4) return termsAccepted;
    return true;
  }

  const [capacityPrompt, setCapacityPrompt] = useState(null);
  const [verifyingCapacity, setVerifyingCapacity] = useState(false);
  // Keyed by the whole bet, not just the locations: the same selection is a different
  // one on a bigger plan or more copies, and a warning waved through on one must not
  // cover the other. A ref, so the answer survives stepping back and forward.
  const acceptedCapacity = useRef(new Set());

  /**
   * The last thing between the customer and the review-and-pay screen.
   *
   * The counts on the location picker come from a network-wide aggregate that can be
   * the best part of an hour old. Fine while they are still choosing; not fine here.
   * Three locations reading "1 free" each can be one that is free and two that were
   * taken half an hour ago, and nothing on the screen would say so — so the BFF asks
   * the hosts themselves before this click goes through, and only when the answer
   * could change (see /api/deploy-capacity).
   *
   * It narrows the window rather than closing it. Registration, the on-chain message
   * and Flux choosing a host are minutes more, and nothing can be reserved in advance.
   * So it is a warning with a way past it, never a block.
   */
  async function handleNext() {
    if (step !== 3) { next(); return; }
    ensurePorts();
    const geolocation = buildGeoSpec(config.geolocation || []);
    // No locations picked is a legitimate answer: it deploys globally, and the whole
    // network is the pool. There is nothing to be too narrow about.
    if (!geolocation.length) { next(); return; }

    setVerifyingCapacity(true);
    const capacity = await fetchDeployCapacity({
      geolocation,
      ...computeGeoHardware(plan, config),
      enterprise: !!(config.enterprise || repo.isPrivate),
      instances: plan?.instances ?? 1,
    });
    setVerifyingCapacity(false);

    // No answer means no opinion. The BFF says nothing rather than guessing, and so
    // does this: a warning built on a request that failed is one people learn to
    // click through, which costs us the ones that are real.
    if (!capacity?.verdict) { next(); return; }
    const key = [...geolocation].sort().join('|')
      + `::${plan?.id}::${plan?.instances}::${capacity.verdict}`;
    if (acceptedCapacity.current.has(key)) { next(); return; }
    setCapacityPrompt({ ...capacity, key });
  }

  function acceptCapacityWarning() {
    if (capacityPrompt) acceptedCapacity.current.add(capacityPrompt.key);
    setCapacityPrompt(null);
    next();
  }

  return (
    <>
      <Helmet>
        <title>New Deployment — Orbit</title>
      </Helmet>

      <div className="p-6">
        <Link
          to="/dashboard/deployments"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to deployments
        </Link>

        <WizardProgress current={step} />

        <div className="card p-6 mb-6">
          {step === 1 && (
            <Step1Plan
              plan={plan}
              onChange={(p) => { setPlan(p); next(); }}
            />
          )}
          {step === 2 && (
            <Step2Repo
              repo={repo}
              onChange={setRepo}
              onPortDetected={handlePortDetected}
              onConfigImported={handleConfigImported}
            />
          )}
          {step === 3 && (
            <Step3Config
              plan={plan}
              config={config}
              onChange={setConfig}
              onPlanChange={setPlan}
              portAutoDetected={!config.portTouched}
              isEnterpriseForced={!!repo.isPrivate}
              appPorts={state.ports ?? undefined}
            />
          )}
          {step === 4 && (
            <Step4Review
              plan={plan}
              repo={repo}
              config={config}
              ports={state.ports || ensurePorts()}
              termsAccepted={termsAccepted}
              onTermsChange={setTerms}
              onEligibilityChecked={setEligibleForFree}
            />
          )}
          {step === 5 && (
            <Step5Register
              plan={plan}
              repo={repo}
              config={config}
              ports={state.ports}
              onSuccess={({ txid, appName, verifiedSpec }) => {
                setRegistration({ txid, appName });
                setVerifiedSpec(verifiedSpec);
                next();
              }}
            />
          )}
          {step === 6 && (
            <Step6Payment
              verifiedSpec={state.verifiedSpec}
              plan={plan}
              registration={state.registration}
              billingPeriod={config.billingPeriod}
              eligibleForFree={state.eligibleForFree}
            />
          )}
        </div>

        {step <= 4 && (
          <div className="flex justify-between gap-4">
            {step > 1 ? (
              <button type="button" onClick={back} className="btn-secondary">
                ← Back
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-3">
              {step === 4 && !termsAccepted && (
                <span className="text-xs text-text-muted">Accept the terms to continue</span>
              )}
              {step === 2 && !isRepoValidated() && (
                <span className="text-xs text-text-muted">{getRepoValidationHint()}</span>
              )}
              {step === 3 && !config.contactEmail?.trim() && (
                <span className="text-xs text-text-muted">Contact email required</span>
              )}
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed() || verifyingCapacity}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {verifyingCapacity ? 'Checking availability…' : (step === 4 ? 'Deploy →' : 'Next →')}
              </button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex justify-start">
            <button type="button" onClick={back} className="btn-secondary">
              ← Back
            </button>
          </div>
        )}
      </div>

      {/* The picker's own notice is easy to walk past; this is the same fact where it
          cannot be. Still not a block — "Continue anyway" is right there. */}
      {capacityPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md border border-amber-500/40 bg-surface p-6">
            {capacityPrompt.verdict === 'short' ? (
              <>
                <h4 className="text-lg font-semibold text-amber-400 mb-2">
                  These locations cannot fit your app
                </h4>
                <p className="text-sm text-text-secondary leading-relaxed">
                  They cover {capacityPrompt.ipCount} host{capacityPrompt.ipCount === 1 ? '' : 's'} able to
                  run this plan, and your app runs on {capacityPrompt.instances} copies. Flux never puts two
                  copies on the same host, so at least {capacityPrompt.instances - capacityPrompt.ipCount}{' '}
                  {capacityPrompt.instances - capacityPrompt.ipCount === 1 ? 'copy' : 'copies'} will have
                  nowhere to go for as long as this selection stands, and that does not resolve itself
                  with time.
                </p>
              </>
            ) : (
              <>
                <h4 className="text-lg font-semibold text-amber-400 mb-2">
                  The hosts in your locations are full right now
                </h4>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {capacityPrompt.freeIpCount === 0
                    ? `None of the ${capacityPrompt.ipCount} hosts matching your locations has room for this plan at the moment.`
                    : `Only ${capacityPrompt.freeIpCount} of the ${capacityPrompt.ipCount} hosts matching your locations has room for this plan, and your app runs on ${capacityPrompt.instances} copies.`}{' '}
                  Your app may sit waiting to deploy until one frees up.
                </p>
                {capacityPrompt.live && (
                  <p className="text-xs text-text-muted mt-2">
                    We asked those hosts directly just now, so this is more current than the counts on
                    the previous screen.
                  </p>
                )}
              </>
            )}
            <p className="text-sm text-text-muted mt-3">
              Adding another location gives it somewhere to go.
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2 mt-5">
              <button
                type="button"
                onClick={acceptCapacityWarning}
                className="btn-secondary flex-1"
              >
                Continue anyway
              </button>
              <button
                type="button"
                onClick={() => setCapacityPrompt(null)}
                className="btn-primary flex-1"
              >
                Add another location
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
