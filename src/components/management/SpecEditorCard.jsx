import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Settings2, ChevronDown, ChevronUp, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, Check } from 'lucide-react';
import toast from 'react-hot-toast';
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
} from '../../services/deployService';
import { encryptSpec } from '../../services/enterpriseCrypto';
import Step6Payment from '../wizard/Step6Payment';

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

// Return the ORBIT_SETTINGS_DEF that owns this env key (canonical or alias)
function orbitDefFor(key) {
  return ORBIT_SETTINGS_DEFS.find(
    (d) => d.key === key || (d.aliases ?? []).includes(key),
  );
}

function SectionHeader({ title, expanded, onToggle }) {
  return (
    <button
      className="flex items-center justify-between w-full text-left py-2 group"
      onClick={onToggle}
    >
      <span className="font-medium text-sm text-text">{title}</span>
      {expanded ? (
        <ChevronUp className="w-4 h-4 text-text-muted group-hover:text-text transition-colors" />
      ) : (
        <ChevronDown className="w-4 h-4 text-text-muted group-hover:text-text transition-colors" />
      )}
    </button>
  );
}

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

export default function SpecEditorCard({ spec, onSaved }) {
  const { zelidauth, loginType } = useAuth();

  // ── Local editable state ───────────────────────────────────────────────
  const [description, setDescription]   = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [userEnvRows, setUserEnvRows]   = useState([]); // { key, value }
  const [hiddenEnvRows, setHiddenEnvRows] = useState([]); // { key, value } — preserved, never shown
  // orbit settings: keyed by the actual env key found in spec (could be alias)
  // e.g. { POLLING_INTERVAL: '60', APP_PORT: '3000', BRANCH: 'main', ... }
  const [orbitSettings, setOrbitSettings] = useState({});

  // Sections collapse state
  const [settingsOpen, setSettingsOpen]   = useState(true);
  const [orbitOpen, setOrbitOpen]         = useState(false);
  const [userEnvOpen, setUserEnvOpen]     = useState(true);

  // Save flow state
  const [savePhase, setSavePhase]     = useState(null);
  const [saveError, setSaveError]     = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // If paid update: show payment step with { txid, verifiedSpec, price }
  const [paymentContext, setPaymentContext] = useState(null);

  // ── Populate state from spec ─────────────────────────────────────────
  useEffect(() => {
    if (!spec) return;
    setDescription(spec.description ?? '');
    const compose = spec.compose?.[0] ?? {};
    setCustomDomain(compose.domains?.[0] ?? '');

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
  }, [spec]);

  // ── Dirty check ──────────────────────────────────────────────────────
  const isDirty = useCallback(() => {
    if (!spec) return false;
    const compose = spec.compose?.[0] ?? {};
    if (description !== (spec.description ?? '')) return true;
    if (customDomain !== (compose.domains?.[0] ?? '')) return true;

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
    return false;
  }, [spec, description, customDomain, orbitSettings, userEnvRows]);

  // ── Helpers ───────────────────────────────────────────────────────────
  function updateOrbit(key, value) {
    setOrbitSettings((s) => ({ ...s, [key]: value }));
    setSaveSuccess(false);
  }

  function addRow() {
    setUserEnvRows((rows) => [...rows, { key: '', value: '' }]);
    setSaveSuccess(false);
  }
  function updateRow(idx, field, val) {
    setUserEnvRows((rows) => rows.map((r, i) => (i === idx ? { ...r, [field]: val } : r)));
    setSaveSuccess(false);
  }
  function removeRow(idx) {
    setUserEnvRows((rows) => rows.filter((_, i) => i !== idx));
    setSaveSuccess(false);
  }

  // ── Save / re-register ───────────────────────────────────────────────
  async function handleSave() {
    if (!spec || !zelidauth) return;
    setSaveError(null);
    setSaveSuccess(false);
    setUpdatePrice(null);

    // Rebuild env params: hidden first, then orbit settings, then user vars
    const orbitRows = Object.entries(orbitSettings)
      .filter(([k]) => k.trim())
      .map(([k, v]) => ({ key: k, value: v }));
    const validUser = userEnvRows.filter((r) => r.key.trim());
    const allRows   = [...hiddenEnvRows, ...orbitRows, ...validUser];

    const updatedSpec = {
      ...spec,
      description,
      compose: spec.compose.map((c, i) =>
        i === 0
          ? {
              ...c,
              domains: [customDomain, c.domains?.[1] ?? ''],
              environmentParameters: buildEnvParams(allRows),
            }
          : c,
      ),
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
    setSaveSuccess(true);
    if (price?.flux > 0) {
      setPaymentContext({ txid: result, verifiedSpec, price });
    } else {
      toast.success('Settings saved — changes will propagate to nodes in a few minutes.');
      onSaved?.();
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
          onBack={() => setPaymentContext(null)}
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

  return (
    <div className="card flex flex-col gap-0">
      <h2 className="font-semibold text-text mb-4">App Settings</h2>

      {/* ── General section ── */}
      <div className="border border-border rounded-lg mb-3 overflow-hidden">
        <div className="px-3 bg-surface-hover">
          <SectionHeader title="General" expanded={settingsOpen} onToggle={() => setSettingsOpen((v) => !v)} />
        </div>
        {settingsOpen && (
          <div className="px-3 py-3 space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Description</label>
              <input
                className="input w-full text-sm"
                value={description}
                onChange={(e) => { setDescription(e.target.value); setSaveSuccess(false); }}
                placeholder="Short description of your app"
                disabled={isSaving}
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Custom Domain</label>
              <input
                className="input w-full text-sm font-mono"
                value={customDomain}
                onChange={(e) => { setCustomDomain(e.target.value); setSaveSuccess(false); }}
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
          </div>
        )}
      </div>

      {/* ── Orbit Settings section ── */}
      <div className="border border-border rounded-lg mb-3 overflow-hidden">
        <div className="px-3 bg-surface-hover">
          <SectionHeader
            title={
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-primary" />
                Deploy Options
              </span>
            }
            expanded={orbitOpen}
            onToggle={() => setOrbitOpen((v) => !v)}
          />
        </div>
        {orbitOpen && (
          <div className="px-3 py-3 space-y-3">
            {ORBIT_SETTINGS_DEFS.map((def) => {
              // Find actual key in orbitSettings (could be alias)
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
      </div>

      {/* ── User env vars section ── */}
      <div className="border border-border rounded-lg mb-4 overflow-hidden">
        <div className="px-3 bg-surface-hover">
          <SectionHeader
            title={`Environment Variables (${userEnvRows.length})`}
            expanded={userEnvOpen}
            onToggle={() => setUserEnvOpen((v) => !v)}
          />
        </div>
        {userEnvOpen && (
          <div className="px-3 py-3">
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
                  <input
                    className="input flex-[2] text-xs font-mono"
                    value={row.value}
                    onChange={(e) => updateRow(idx, 'value', e.target.value)}
                    placeholder="value"
                    disabled={isSaving}
                  />
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
      </div>

      {/* ── Status / Save ── */}
      {saveError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger/10 border border-danger/20 mb-3 text-sm text-danger">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {saveError}
        </div>
      )}

      {saveSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20 mb-3 text-sm text-accent">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Update submitted. Changes will propagate to nodes in a few minutes.
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
    </div>
  );
}

