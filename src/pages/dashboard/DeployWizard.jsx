import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useDeployWizard } from '../../hooks/useDeployWizard';
import { PLANS, normalizeCustomPlan } from '../../services/deployService';
import { resolvePlanFromImport } from '../../services/repoConfigImportService';
import { geolocationFromImport } from '../../services/geolocationSpec';
import Step1Plan from '../../components/wizard/Step1Plan';
import Step2Repo from '../../components/wizard/Step2Repo';
import Step3Config from '../../components/wizard/Step3Config';
import Step4Review from '../../components/wizard/Step4Review';
import Step5Register from '../../components/wizard/Step5Register';
import Step6Payment from '../../components/wizard/Step6Payment';

// Allowed plan IDs for deep-link prefill
const PLAN_ALIASES = { free: 'free', standard: 'standard', developer: 'standard', dev: 'standard', pro: 'pro', custom: 'custom' };
const POLLING_ALIASES = { disabled: 'disabled', '1h': '3600', '2h': '7200', '6h': '21600', '12h': '43200', '24h': '86400' };
const RUNTIME_ALIASES = { node: 'node', nodejs: 'node', python: 'python', py: 'python', go: 'go', golang: 'go', rust: 'rust', java: 'java', php: 'php', ruby: 'ruby', dotnet: 'dotnet' };
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
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
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
                  className={`h-px flex-1 mx-2 mb-4 transition-colors ${done ? 'bg-primary' : 'bg-border'}`}
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
    const pollingRaw = (get('pollingInterval') || get('polling')).toLowerCase();
    const runtimeRaw = (get('runtime') || '').toLowerCase();
    const runtimeVersion = get('runtimeVersion') || get('runtime_version');

    const planId = PLAN_ALIASES[planAlias];
    const polling = POLLING_ALIASES[pollingRaw] || pollingRaw;
    const runtime = RUNTIME_ALIASES[runtimeRaw];

    const hasAny = repoUrl || planId || appPort || polling || runtime || heroPrefill?.url;
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
      const dbValid = !db?.enabled || plan?.id !== 'custom' || (
        db.componentName?.length >= 1 &&
        (db.type !== 'postgres' || db.dbName?.length >= 1) &&
        plan?.instances >= 3
      );
      const redisValid = !redis?.enabled || plan?.id !== 'custom' || (
        redis.componentName?.length >= 1 &&
        plan?.instances >= 3
      );
      const uniqueAddonNames = !(db?.enabled && redis?.enabled) || db.componentName !== redis.componentName;
      return (
        config.appName?.length >= 3 &&
        /^[a-z][a-z0-9-]*[a-z0-9]$/.test(config.appName) &&
        config.port &&
        Boolean(config.contactEmail?.trim()) &&
        dbValid &&
        redisValid &&
        uniqueAddonNames
      );
    }
    if (step === 4) return termsAccepted;
    return true;
  }

  function handleNext() {
    if (step === 3) ensurePorts();
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
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors mb-6"
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
                disabled={!canProceed()}
                className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === 4 ? 'Deploy →' : 'Next →'}
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
    </>
  );
}
