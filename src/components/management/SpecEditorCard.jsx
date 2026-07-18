import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, Settings2, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Check, RefreshCw, Upload, Clipboard, X, SlidersHorizontal, KeyRound, Globe, Server, Database } from 'lucide-react';
import { parseEnvText } from '../../utils/envParser';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../utils/firebase';
import {
  verifyUpdateSpec,
  updateApp,
  buildDataToSign,
  calculatePrice,
  signWithSSO,
  signWithSSP,
  signWithZelCore,
  pollUpdate,
  getBlocksRemaining,
  PLANS,
} from '../../services/deployService';
import { fetchCurrentBlock } from '../../services/appsService';
import { parseGeoSpec, buildGeoSpec } from '../../services/geolocationSpec';
import GeoSelector from '../common/GeoSelector';
import { encryptSpec } from '../../services/enterpriseCrypto';
import { redeployAllInstances } from '../../services/managementService';
import Step6Payment from '../wizard/Step6Payment';
import ResourceSlider from '../wizard/ResourceSlider';
import { DB_MIN_INSTANCES, REDIS_ADDON, isDatabaseCompose } from '../../services/databaseSpec';

// Keys that are completely hidden — never shown, always preserved as-is
const HIDDEN_KEYS = new Set([
  'GIT_REPO_URL', 'GIT_REPO', 'REPO_URL',
  'ORBIT_RUNTIME', 'ORBIT_RUNTIME_VERSION',
]);

// Orbit-managed settings shown with typed UI controls (editable)
const ORBIT_SETTINGS_DEFS = [
  { key: 'POLLING_INTERVAL', label: 'Polling Interval', type: 'select'   },
  { key: 'APP_PORT',         label: 'App Port',         type: 'number', aliases: ['PORT'] },
  { key: 'GIT_BRANCH',       label: 'Git Branch',       type: 'text',   aliases: ['BRANCH'] },
  { key: 'GIT_TOKEN',        label: 'Git Token',        type: 'password' },
  { key: 'BUILD_COMMAND',    label: 'Build Command',    type: 'text'    },
  { key: 'RUN_COMMAND',      label: 'Run Command',      type: 'text'    },
  { key: 'PROJECT_PATH',     label: 'Project Path',     type: 'text'    },
  { key: 'WEBHOOK_SECRET',   label: 'Webhook Secret',   type: 'password' },
  { key: 'API_KEY',          label: 'API Key',          type: 'password' },
];

const ALL_ORBIT_KEYS = new Set(
  ORBIT_SETTINGS_DEFS.flatMap((d) => [d.key, ...(d.aliases ?? [])]),
);

const POLLING_OPTIONS = [
  { value: '300',   label: '5 minutes'  },
  { value: '600',   label: '10 minutes' },
  { value: '1800',  label: '30 minutes' },
  { value: '3600',  label: '1 hour'     },
  { value: '21600', label: '6 hours'    },
  { value: '43200', label: '12 hours'   },
  { value: '86400', label: '24 hours'   },
];

function fixedPlanForSpec(spec) {
  const compose = spec?.compose?.[0];
  if (!compose) return null;
  return PLANS.find((plan) =>
    plan.id !== 'custom' &&
    plan.cpu === Number(compose.cpu) &&
    plan.ram === Number(compose.ram) &&
    plan.hdd === Number(compose.hdd) &&
    plan.instances === Number(spec.instances ?? 1)
  ) ?? null;
}

function hasAddonComponents(spec) {
  return (spec?.compose?.length ?? 0) > 1;
}

function getAddonKind(compose) {
  const image = String(compose?.repotag ?? '').toLowerCase();
  const name = String(compose?.name ?? '').toLowerCase();
  if (isDatabaseCompose(compose)) return 'db';
  if (
    image === REDIS_ADDON.image.toLowerCase() ||
    image.includes('flux-redis-cluster') ||
    name === 'redis'
  ) {
    return 'redis';
  }
  return null;
}

function getAddonComponents(spec) {
  return (spec?.compose ?? [])
    .map((compose, index) => {
      const kind = index === 0 ? null : getAddonKind(compose);
      if (!kind) return null;
      return {
        index,
        kind,
        title: kind === 'redis' ? 'Redis resources' : 'Database resources',
        tabLabel: kind === 'redis' ? 'Redis' : 'DB',
        compose,
      };
    })
    .filter(Boolean);
}

function isCustomResourceSpec(spec) {
  if (!spec?.compose?.[0]) return false;
  if (hasAddonComponents(spec)) return true;
  return !fixedPlanForSpec(spec);
}

function normalizeComponentResources(resources) {
  return {
    cpu: Math.min(15, Math.max(0.1, Number(resources.cpu) || 0.1)),
    ram: Math.min(59000, Math.max(100, Math.round(Number(resources.ram) || 100))),
    hdd: Math.min(820, Math.max(1, Math.round(Number(resources.hdd) || 1))),
  };
}

function normalizeAppResources(resources, minInstances = 1) {
  return {
    ...normalizeComponentResources(resources),
    instances: Math.min(3, Math.max(minInstances, Math.round(Number(resources.instances) || minInstances))),
  };
}

function ResourceSliderWithInput({
  label,
  value,
  min,
  max,
  step,
  inputValue,
  inputSuffix,
  disabled,
  onChange,
}) {
  return (
    <div>
      <ResourceSlider
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={onChange}
        valueControl={(
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={inputValue}
              onChange={(e) => {
                if (e.target.value === '') return;
                const next = Number(e.target.value);
                if (Number.isFinite(next)) onChange(next);
              }}
              disabled={disabled}
              className="input h-6 w-20 px-2 py-0 text-[11px] font-mono text-right disabled:opacity-40"
            />
            <span className="w-9 text-[11px] text-text-muted">{inputSuffix}</span>
          </div>
        )}
      />
    </div>
  );
}

function InstancesPicker({ value, min, disabled, onChange }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted">Instances</span>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => {
            const isDisabled = disabled || n < min;
            return (
              <button
                key={n}
                type="button"
                disabled={isDisabled}
                onClick={() => onChange(n)}
                className={`w-8 h-8 rounded-lg text-sm font-semibold border transition-colors ${
                  value === n
                    ? 'bg-primary text-white border-primary'
                    : isDisabled
                    ? 'bg-surface-hover/50 text-text-muted/40 border-border cursor-not-allowed'
                    : 'bg-surface-hover text-text-secondary border-border hover:border-primary/50'
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-text-muted">
        {min > 1
          ? `At least ${min} instances required when a database or Redis addon is enabled.`
          : 'Multiple instances improve uptime on the decentralized network.'}
      </p>
    </div>
  );
}

function ResourceControls({ values, disabled, onChange }) {
  return (
    <div className="space-y-3">
      <ResourceSliderWithInput
        label="CPU"
        value={values.cpu}
        inputValue={values.cpu}
        inputSuffix="vCPU"
        min={0.1}
        max={15}
        step={0.1}
        disabled={disabled}
        onChange={(cpu) => onChange('cpu', Number(cpu.toFixed(1)))}
      />
      <ResourceSliderWithInput
        label="RAM"
        value={values.ram / 1000}
        inputValue={values.ram / 1000}
        inputSuffix="GB"
        min={0.1}
        max={59}
        step={0.5}
        disabled={disabled}
        onChange={(ramGb) => onChange('ram', Math.round(ramGb * 1000))}
      />
      <ResourceSliderWithInput
        label="SSD"
        value={values.hdd}
        inputValue={values.hdd}
        inputSuffix="GB"
        min={1}
        max={820}
        step={1}
        disabled={disabled}
        onChange={(hdd) => onChange('hdd', hdd)}
      />
    </div>
  );
}

function parseEnvParams(params = []) {
  return params.map((e) => {
    const idx = e.indexOf('=');
    return idx > 0
      ? { key: e.slice(0, idx), value: e.slice(idx + 1) }
      : { key: e, value: '' };
  });
}

function buildEnvParams(rows) {
  return rows.map(({ key, value }) => `${key}=${value}`);
}

function EnvImporter({ onImport, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [feedback, setFeedback] = useState(null);
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

  function handleText(text) { applyParsed(parseEnvText(text)); }
  async function handleFile(file) { handleText(await file.text()); }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function pasteClipboard() {
    try {
      handleText(await navigator.clipboard.readText());
    } catch {
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
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !disabled && fileRef.current?.click()}
        className={`flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-2.5 text-xs cursor-pointer transition-colors ${
          disabled ? 'opacity-40 cursor-not-allowed' :
          dragging ? 'border-primary bg-primary/5 text-primary'
                   : 'border-border text-text-muted hover:border-primary/50 hover:text-text-secondary hover:bg-surface-hover'
        }`}
      >
        <Upload className="w-3.5 h-3.5 shrink-0" />
        <span>Drop <code className="font-mono">.env</code>, JSON or YAML, or click to browse</span>
        <input ref={fileRef} type="file" accept=".env,.json,.yaml,.yml,text/plain,application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <button type="button" onClick={pasteClipboard} disabled={disabled}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors disabled:opacity-40">
          <Clipboard className="w-3.5 h-3.5" /> Paste from clipboard
        </button>
        {feedback && (
          <span className={`flex items-center gap-1 text-xs ${feedback.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {feedback.type === 'success' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {feedback.message}
          </span>
        )}
      </div>
      {showPasteArea && (
        <div className="mt-2 rounded-lg border border-border bg-surface p-3 space-y-2">
          <p className="text-xs text-text-muted">Paste your <code className="font-mono">.env</code>, JSON or YAML below:</p>
          <textarea ref={textareaRef} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitPasteArea(); }}
            placeholder={'KEY=value\nANOTHER_KEY=value'} rows={5}
            className="w-full input-base font-mono text-xs resize-none" />
          <div className="flex gap-2">
            <button type="button" onClick={submitPasteArea}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-hover transition-colors">Import</button>
            <button type="button" onClick={() => { setShowPasteArea(false); setPasteText(''); }}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-muted hover:text-text transition-colors">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Geo helpers ──────────────────────────────────────────────────────────────

function PasswordInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        className="input w-full text-xs font-mono pr-8"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? '••••••••'}
        disabled={disabled}
        autoComplete="off"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function SpecEditorCard({ spec, nodeStatuses = [], onSaved, maxHeight }) {
  const { zelidauth, loginType } = useAuth();

  // ── Local editable state ───────────────────────────────────────────────
  const [description, setDescription]   = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [userEnvRows, setUserEnvRows]   = useState([]); // { key, value }
  const [hiddenEnvRows, setHiddenEnvRows] = useState([]); // { key, value } — preserved, never shown
  const [appResources, setAppResources] = useState({ cpu: 1, ram: 2000, hdd: 10, instances: 1 });
  const [addonResources, setAddonResources] = useState({});
  // orbit settings: keyed by the actual env key found in spec (could be alias)
  // e.g. { POLLING_INTERVAL: '60', APP_PORT: '3000', BRANCH: 'main', ... }
  const [orbitSettings, setOrbitSettings] = useState({});

  const [activeTab, setActiveTab]         = useState('general');

  const [geolocation, setGeolocation] = useState([]);

  // Save flow state
  const [savePhase, setSavePhase]     = useState(null);
  const [saveError, setSaveError]     = useState(null);
  // If paid update: show payment step with { txid, verifiedSpec, price }
  const [paymentContext, setPaymentContext] = useState(null);
  // After successful registration: blockchain polling + redeploy prompt
  // { hash, polling: 'waiting'|'confirmed'|'timeout', redeploying: bool, redeployResult }
  const [updateContext, setUpdateContext] = useState(null);
  const cancelPollRef = useRef(null);

  // Cancel polling on unmount
  useEffect(() => () => { cancelPollRef.current?.(); }, []);

  // ── Populate state from spec ─────────────────────────────────────────
  useEffect(() => {
    if (!spec) return;
    setDescription(spec.description ?? '');
    const compose = spec.compose?.[0] ?? {};
    setCustomDomain(compose.domains?.[0] ?? '');
    setAppResources({
      cpu: Number(compose.cpu) || 1,
      ram: Number(compose.ram) || 2000,
      hdd: Number(compose.hdd) || 10,
      instances: Number(spec.instances) || 1,
    });
    setAddonResources(Object.fromEntries(
      getAddonComponents(spec).map(({ index, compose: addonCompose }) => [
        index,
        normalizeComponentResources({
          cpu: addonCompose.cpu,
          ram: addonCompose.ram,
          hdd: addonCompose.hdd,
        }),
      ]),
    ));

    const all = parseEnvParams(compose.environmentParameters ?? []);
    const hidden = [];
    const orbit  = {};
    const user   = [];

    for (const row of all) {
      if (HIDDEN_KEYS.has(row.key)) {
        hidden.push(row);
      } else if (ALL_ORBIT_KEYS.has(row.key)) {
        orbit[row.key] = row.value;
      } else {
        user.push(row);
      }
    }

    setHiddenEnvRows(hidden);
    setOrbitSettings(orbit);
    setUserEnvRows(user);
    setGeolocation(parseGeoSpec(spec.geolocation ?? []));
  }, [spec]);

  // ── Dirty check ──────────────────────────────────────────────────────
  const isDirty = useCallback(() => {
    if (!spec) return false;
    const compose = spec.compose?.[0] ?? {};
    if (description !== (spec.description ?? '')) return true;
    if (customDomain !== (compose.domains?.[0] ?? '')) return true;
    if (isCustomResourceSpec(spec)) {
      const minInstances = hasAddonComponents(spec) ? DB_MIN_INSTANCES : 1;
      const resources = normalizeAppResources(appResources, minInstances);
      if (resources.cpu !== Number(compose.cpu)) return true;
      if (resources.ram !== Number(compose.ram)) return true;
      if (resources.hdd !== Number(compose.hdd)) return true;
      if (resources.instances !== Number(spec.instances ?? 1)) return true;
    }
    for (const { index, compose: addonCompose } of getAddonComponents(spec)) {
      const resources = normalizeComponentResources(addonResources[index] ?? addonCompose);
      if (resources.cpu !== Number(addonCompose.cpu)) return true;
      if (resources.ram !== Number(addonCompose.ram)) return true;
      if (resources.hdd !== Number(addonCompose.hdd)) return true;
    }

    const allOrig = parseEnvParams(compose.environmentParameters ?? []);
    const origOrbit = {};
    const origUser  = [];
    for (const row of allOrig) {
      if (HIDDEN_KEYS.has(row.key)) continue;
      if (ALL_ORBIT_KEYS.has(row.key)) origOrbit[row.key] = row.value;
      else origUser.push(row);
    }
    if (JSON.stringify(origOrbit) !== JSON.stringify(orbitSettings)) return true;
    if (JSON.stringify(origUser)  !== JSON.stringify(userEnvRows))   return true;
    if (JSON.stringify(buildGeoSpec(geolocation)) !== JSON.stringify(spec.geolocation ?? [])) return true;
    return false;
  }, [spec, description, customDomain, appResources, addonResources, orbitSettings, userEnvRows, geolocation]);

  // ── Helpers ───────────────────────────────────────────────────────────
  function updateOrbit(key, value) {
    setOrbitSettings((s) => ({ ...s, [key]: value }));
  }

  function updateAppResource(field, value) {
    const minInstances = hasAddonComponents(spec) ? DB_MIN_INSTANCES : 1;
    setAppResources((resources) => normalizeAppResources(
      { ...resources, [field]: field === 'instances' ? Math.round(value) : value },
      minInstances,
    ));
  }

  function updateAddonResource(index, field, value) {
    setAddonResources((resources) => ({
      ...resources,
      [index]: normalizeComponentResources({
        ...(resources[index] ?? spec?.compose?.[index] ?? {}),
        [field]: value,
      }),
    }));
  }

  function addRow() {
    setUserEnvRows((rows) => [...rows, { key: '', value: '' }]);
  }
  function updateRow(idx, field, val) {
    setUserEnvRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
  }
  function removeRow(idx) {
    setUserEnvRows((rows) => rows.filter((_, i) => i !== idx));
  }

  // ── Save / re-register ───────────────────────────────────────────────
  async function handleSave() {
    if (!spec || !zelidauth) return;
    setSaveError(null);
    setUpdateContext(null);
    cancelPollRef.current?.();

    // Rebuild env params: hidden first, then orbit settings, then user vars
    const orbitRows = Object.entries(orbitSettings)
      .filter(([k]) => k.trim())
      .map(([k, v]) => ({ key: k, value: v }));
    const validUser = userEnvRows.filter((r) => r.key.trim());
    const allRows   = [...hiddenEnvRows, ...orbitRows, ...validUser];
    const resourcesEditable = isCustomResourceSpec(spec);
    const minInstances = hasAddonComponents(spec) ? DB_MIN_INSTANCES : 1;
    const resources = normalizeAppResources(appResources, minInstances);
    const addonEntries = getAddonComponents(spec);
    const addonIndexes = new Set(addonEntries.map(({ index }) => index));

    // Maintenance updates must NOT extend the subscription. `expire` is relative to the
    // registration height, so keep the same expiry by setting it to the blocks remaining
    // (height + expire − current block). Sending the original expire re-subscribes for the
    // full period → the network reads it as a paid extension that the appsMonitor service
    // won't cover, so the update is never funded and never confirms. Time extensions are
    // handled separately in the renewal flow (RenewModal).
    const currentBlock = await fetchCurrentBlock();
    const remainingBlocks = getBlocksRemaining(spec.height, spec.expire, currentBlock);
    if (remainingBlocks == null || remainingBlocks <= 0) {
      setSaveError('Could not read the current block height to preserve your subscription. Please try again.');
      return;
    }

    const updatedSpec = {
      ...spec,
      description,
      expire: remainingBlocks,
      ...(resourcesEditable ? { instances: resources.instances } : {}),
      geolocation: buildGeoSpec(geolocation),
      compose: spec.compose.map((c, i) => {
        if (i === 0) {
          return (() => {
              const domainCount = Math.max(c.domains?.length ?? 0, c.ports?.length ?? 0, 1);
              const domains = Array.from({ length: domainCount }, (_, idx) => c.domains?.[idx] ?? '');
              domains[0] = customDomain;
              return {
                ...c,
                ...(resourcesEditable
                  ? { cpu: resources.cpu, ram: resources.ram, hdd: resources.hdd }
                  : {}),
                domains,
                environmentParameters: buildEnvParams(allRows),
              };
            })();
        }
        if (addonIndexes.has(i)) {
          const addonResourceValues = normalizeComponentResources(addonResources[i] ?? c);
          return {
            ...c,
            cpu: addonResourceValues.cpu,
            ram: addonResourceValues.ram,
            hdd: addonResourceValues.hdd,
          };
        }
        return c;
      }),
    };

    setSavePhase('verifying');
    let specToVerify = updatedSpec;
    // Enterprise apps: re-encrypt before submitting so the blockchain stores
    // compose/contacts inside the encrypted enterprise blob (not in plain text).
    if (spec.isEnterprise || spec._wasEnterprise) {
      try {
        specToVerify = await encryptSpec(updatedSpec, zelidauth);
      } catch (err) {
        setSaveError(`Enterprise encryption failed: ${err.message}`);
        setSavePhase(null);
        return;
      }
    }
    let verifiedSpec;
    try {
      verifiedSpec = await verifyUpdateSpec(specToVerify);
    } catch (err) {
      setSaveError(`Verification failed: ${err.message}`);
      setSavePhase(null);
      return;
    }

    // The verify endpoint may reset expire back to the on-chain value — re-apply the
    // remaining blocks so this stays a maintenance update (same expiry, no extension).
    verifiedSpec.expire = remainingBlocks;

    // Calculate price — if flux > 0 the update requires payment.
    // Default to null on error so we don't silently skip a payment that may be owed.
    let price = null;
    try {
      price = await calculatePrice(verifiedSpec, zelidauth);
    } catch {
      // Non-fatal: treat as unknown price (will not show payment screen)
    }

    setSavePhase('signing');
    const timestamp   = Date.now();
    const dataToSign  = buildDataToSign(verifiedSpec, timestamp, true);
    let signature;
    try {
      if (loginType === 'firebase') {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) throw new Error('Firebase user not found');
        signature = await signWithSSO(dataToSign, firebaseUser);
      } else if (loginType === 'ssp') {
        signature = await signWithSSP(dataToSign);
      } else if (loginType === 'zelcore') {
        signature = await signWithZelCore(dataToSign, zelidauth, timestamp);
      } else {
        throw new Error(`Unsupported login type: ${loginType}`);
      }
    } catch (err) {
      setSaveError(`Signing failed: ${err.message}`);
      setSavePhase(null);
      return;
    }

    setSavePhase('registering');
    let result;
    try {
      result = await updateApp({ verifiedSpec, timestamp, signature, zelidauth });
    } catch (err) {
      setSaveError(`Update failed: ${err.message}`);
      setSavePhase(null);
      return;
    }

    setSavePhase(null);
    if (price?.flux > 0) {
      setPaymentContext({ txid: result, verifiedSpec, price });
    } else {
      startUpdatePolling(result);
    }
  }

  function startUpdatePolling(updateHash) {
    setUpdateContext({ hash: updateHash, polling: 'waiting', redeploying: false, redeployResult: null });
    cancelPollRef.current = pollUpdate(spec.name, updateHash, {
      onSuccess: () => {
        setUpdateContext((c) => ({ ...c, polling: 'confirmed' }));
        onSaved?.();
      },
      onError: () => {
        setUpdateContext((c) => ({ ...c, polling: 'timeout' }));
      },
    });
  }

  async function handleRedeployAll() {
    setUpdateContext((c) => ({ ...c, redeploying: true, redeployResult: null }));
    try {
      const result = await redeployAllInstances(spec.name, nodeStatuses, zelidauth);
      setUpdateContext((c) => ({ ...c, redeploying: false, redeployResult: result }));
    } catch {
      setUpdateContext((c) => ({ ...c, redeploying: false, redeployResult: { ok: 0, failed: nodeStatuses.length } }));
    }
  }

  const isSaving = savePhase !== null;
  const phaseLabel = {
    verifying:   'Verifying…',
    signing:     'Waiting for signature…',
    registering: 'Registering update…',
  };

  // After a paid update is submitted, show the full payment step
  if (paymentContext) {
    return (
      <div className="card">
        <Step6Payment
          verifiedSpec={paymentContext.verifiedSpec}
          plan={null}
          registration={{ appName: paymentContext.verifiedSpec?.name, txid: paymentContext.txid }}
          priceOverride={paymentContext.price}
          subtitle="Your app has been updated. Complete payment to apply changes to the network."
          onBack={() => {
            setPaymentContext(null);
            // Payment was completed (user pressed "I've paid") — start polling
            startUpdatePolling(paymentContext.txid);
          }}
        />
      </div>
    );
  }

    if (!spec) {
    return (
      <div className="card animate-pulse">
        <div className="h-5 w-28 bg-surface-hover rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 bg-surface-hover rounded" />
          ))}
        </div>
      </div>
    );
  }

  const resourcesEditable = isCustomResourceSpec(spec);
  const minResourceInstances = hasAddonComponents(spec) ? DB_MIN_INSTANCES : 1;
  const resourceValues = normalizeAppResources(appResources, minResourceInstances);

  // Total per-node hardware for the geo capacity filter = sum of every compose
  // component (all run on the same node). Compose ram is MB → GB. Empty for
  // enterprise apps whose compose is encrypted — then only the arcane/IP gate applies.
  const geoHardware = (() => {
    const comps = Array.isArray(spec?.compose) ? spec.compose : [];
    let cpu = 0, ram = 0, hdd = 0;
    for (const c of comps) {
      cpu += Number(c.cpu) || 0;
      ram += Number(c.ram) || 0;
      hdd += Number(c.hdd) || 0;
    }
    return { cpu, ram: ram / 1000, hdd };
  })();
  const geoEnterprise = !!(spec?.isEnterprise || spec?._wasEnterprise);
  const addonComponents = getAddonComponents(spec);
  const dbAddon = addonComponents.find(({ kind }) => kind === 'db');
  const redisAddon = addonComponents.find(({ kind }) => kind === 'redis');

  const TABS = [
    { id: 'general',  label: 'General',      icon: <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" /> },
    ...(dbAddon ? [{ id: 'db', label: 'DB', icon: <Database className="w-3.5 h-3.5 shrink-0" /> }] : []),
    ...(redisAddon ? [{ id: 'redis', label: 'Redis', icon: <Server className="w-3.5 h-3.5 shrink-0" /> }] : []),
    { id: 'geo',      label: 'Geolocation',  icon: <Globe className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'deploy',   label: 'Deploy',       icon: <Settings2 className="w-3.5 h-3.5 shrink-0" /> },
    { id: 'env',      label: `Env (${userEnvRows.length})`, icon: <KeyRound className="w-3.5 h-3.5 shrink-0" /> },
  ];

  return (
    <div className="card flex flex-col gap-0" style={maxHeight ? { height: maxHeight } : undefined}>
      <h2 className="font-semibold text-text mb-3 shrink-0">App Settings</h2>

      {/* Tab bar */}
      <div className="flex gap-1 mb-3 shrink-0 bg-background/40 rounded-lg p-1">
        {TABS.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-150 ${
              activeTab === id
                ? 'bg-surface shadow text-text'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Scrollable tab content */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1 -mr-1">

        {/* ── General ── */}
        {activeTab === 'general' && (
          <div className="space-y-3 py-1">
            <div>
              <label className="block text-xs text-text-muted mb-1">Description</label>
              <input
                className="input w-full text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Short description of your app"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Custom Domain</label>
              <input
                className="input w-full text-sm font-mono"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="yourdomain.com"
                disabled={isSaving}
              />
              <p className="text-xs text-text-muted mt-1">
                Add a <code className="bg-surface-hover px-1 rounded">CNAME</code> record pointing{' '}
                <code className="bg-surface-hover px-1 rounded">yourdomain.com</code> to{' '}
                <code className="bg-surface-hover px-1 rounded select-all">
                  {spec?.name}.app.runonflux.io
                </code>{' '}
                before applying changes.
              </p>
            </div>
            {resourcesEditable && (
              <div className="pt-3 border-t border-border/50">
                <div className="flex items-start gap-2 mb-3">
                  <Server className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-text">App resources</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Changes are registered on-chain and apply after redeploy.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <ResourceControls
                    values={resourceValues}
                    disabled={isSaving}
                    onChange={updateAppResource}
                  />
                  <InstancesPicker
                    value={resourceValues.instances}
                    disabled={isSaving}
                    min={minResourceInstances}
                    onChange={(instances) => updateAppResource('instances', instances)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {dbAddon && activeTab === 'db' && (
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-2">
              <Database className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-text">Database resources</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Adjust CPU, RAM, and SSD for the {dbAddon.compose.name || 'database'} component.
                </p>
              </div>
            </div>
            <ResourceControls
              values={normalizeComponentResources(addonResources[dbAddon.index] ?? dbAddon.compose)}
              disabled={isSaving}
              onChange={(field, value) => updateAddonResource(dbAddon.index, field, value)}
            />
          </div>
        )}

        {redisAddon && activeTab === 'redis' && (
          <div className="space-y-3 py-1">
            <div className="flex items-start gap-2">
              <Server className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-text">Redis resources</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Adjust CPU, RAM, and SSD for the {redisAddon.compose.name || 'redis'} component.
                </p>
              </div>
            </div>
            <ResourceControls
              values={normalizeComponentResources(addonResources[redisAddon.index] ?? redisAddon.compose)}
              disabled={isSaving}
              onChange={(field, value) => updateAddonResource(redisAddon.index, field, value)}
            />
          </div>
        )}

        {/* ── Geolocation ── */}
        {activeTab === 'geo' && (
          <div className="py-1">
            <p className="text-xs text-text-muted mb-3">
              Select regions to allow (✓) or forbid (✗). Leave blank for global deployment.
            </p>
            <GeoSelector
              selected={geolocation}
              onChange={setGeolocation}
              disabled={isSaving}
              instances={resourcesEditable ? resourceValues.instances : (spec?.instances ?? 1)}
              hardware={geoHardware}
              enterprise={geoEnterprise}
            />
          </div>
        )}

        {/* ── Deploy Options ── */}
        {activeTab === 'deploy' && (
          <div className="space-y-3 py-1">
            {ORBIT_SETTINGS_DEFS.map((def) => {
              const actualKey =
                orbitSettings[def.key] !== undefined
                  ? def.key
                  : (def.aliases ?? []).find((a) => orbitSettings[a] !== undefined) ?? def.key;
              const value = orbitSettings[actualKey] ?? '';
              return (
                <div key={def.key}>
                  <label className="block text-xs text-text-muted mb-1">{def.label}</label>
                  {def.type === 'select' ? (
                    <select
                      className="input w-full text-sm"
                      value={value}
                      onChange={(e) => updateOrbit(actualKey, e.target.value)}
                      disabled={isSaving}
                    >
                      {!POLLING_OPTIONS.find((o) => o.value === value) && value && (
                        <option value={value}>{value}s (custom)</option>
                      )}
                      {POLLING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : def.type === 'password' ? (
                    <PasswordInput
                      value={value}
                      onChange={(e) => updateOrbit(actualKey, e.target.value)}
                      disabled={isSaving}
                    />
                  ) : (
                    <input
                      className="input w-full text-sm font-mono"
                      type={def.type === 'number' ? 'number' : 'text'}
                      value={value}
                      onChange={(e) => updateOrbit(actualKey, e.target.value)}
                      placeholder={def.label}
                      disabled={isSaving}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Env Vars ── */}
        {activeTab === 'env' && (
          <div className="py-1">
            <EnvImporter onImport={(pairs) => {
              setUserEnvRows((prev) => {
                const next = [...prev];
                for (const { key, value } of pairs) {
                  const existing = next.findIndex((r) => r.key === key);
                  if (existing >= 0) next[existing] = { key, value };
                  else next.push({ key, value });
                }
                return next;
              });
            }} disabled={isSaving} />
            {userEnvRows.length === 0 && (
              <p className="text-xs text-text-muted mb-3">No custom environment variables yet.</p>
            )}
            <div className="space-y-2 mb-3">
              {userEnvRows.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    className="input flex-1 text-xs font-mono"
                    value={row.key}
                    onChange={(e) => updateRow(idx, 'key', e.target.value)}
                    placeholder="KEY"
                    disabled={isSaving}
                  />
                  <div className="flex-[2]">
                    <PasswordInput
                      value={row.value}
                      onChange={(e) => updateRow(idx, 'value', e.target.value)}
                      placeholder="value"
                      disabled={isSaving}
                    />
                  </div>
                  <button
                    onClick={() => removeRow(idx)}
                    disabled={isSaving}
                    className="text-danger hover:text-danger/80 transition-colors p-1 disabled:opacity-40"
                    title="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addRow}
              disabled={isSaving}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add variable
            </button>
          </div>
        )}

      </div>{/* end scrollable tab content */}

      {/* ── Pinned footer: status + save ── */}
      <div className="shrink-0 pt-3 mt-1 border-t border-border/50">
      {/* ── Status / Save ── */}
      {saveError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 mb-3 text-sm text-danger">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {saveError}
        </div>
      )}

      {/* ── Update tracker ── shown after successful registration */}
      {updateContext && (
        <div className="rounded-lg border border-border overflow-hidden mb-3">
          {/* Blockchain confirmation row */}
          <div className="flex items-center gap-3 px-3 py-2.5 bg-surface-hover border-b border-border/50">
            {updateContext.polling === 'confirmed' ? (
              <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
            ) : updateContext.polling === 'timeout' ? (
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
            )}
            <span className="text-sm text-text">
              {updateContext.polling === 'confirmed'
                ? 'Update confirmed on blockchain'
                : updateContext.polling === 'timeout'
                  ? 'Confirmation timed out. Check back in a few minutes.'
                  : 'Waiting for blockchain confirmation…'}
            </span>
          </div>

          {/* Redeploy row — shown once confirmed */}
          {updateContext.polling === 'confirmed' && (
            <div className="px-3 py-3">
              <p className="text-xs text-text-muted mb-2.5">
                Update is live on-chain. Redeploy all running instances to apply the new spec immediately.
              </p>
              {updateContext.redeployResult ? (
                <div className={`flex items-center gap-2 text-sm ${updateContext.redeployResult.failed === 0 ? 'text-accent' : 'text-warning'}`}>
                  {updateContext.redeployResult.failed === 0
                    ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                    : <AlertCircle className="w-4 h-4 shrink-0" />}
                  {updateContext.redeployResult.failed === 0
                    ? `Redeployed ${updateContext.redeployResult.ok} instance${updateContext.redeployResult.ok !== 1 ? 's' : ''} successfully`
                    : `${updateContext.redeployResult.ok} succeeded, ${updateContext.redeployResult.failed} failed`}
                </div>
              ) : (
                <button
                  onClick={handleRedeployAll}
                  disabled={updateContext.redeploying || nodeStatuses.length === 0}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateContext.redeploying ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />Redeploying…</>
                  ) : (
                    <><RefreshCw className="w-3.5 h-3.5" />Redeploy all instances ({nodeStatuses.length})</>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isSaving || !isDirty()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border text-text-secondary hover:bg-surface-hover hover:text-text transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {phaseLabel[savePhase]}
          </>
        ) : (
          <><Check className="w-4 h-4" />Apply Changes</>
        )}
      </button>
      </div>{/* end pinned footer */}
    </div>
  );
}
