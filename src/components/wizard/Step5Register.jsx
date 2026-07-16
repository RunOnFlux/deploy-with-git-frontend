import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../utils/firebase';
import {
  buildSpec,
  buildDataToSign,
  verifySpec,
  registerApp,
  signWithSSO,
  signWithSSP,
  signWithZelCore,
  uploadContacts,
  streamTestInstall,
  buildPrivateRepoUrl,
  redactSpecCredentials,
} from '../../services/deployService';
import { encryptSpec } from '../../services/enterpriseCrypto';
import qs from 'qs';
import { CheckCircle2, XCircle, Loader2, Terminal, Rocket } from 'lucide-react';

function zelidauthStr(za) {
  const { zelid, signature, loginPhrase } = za;
  return qs.stringify({ zelid, signature, loginPhrase });
}

const PHASE_LABELS = {
  contacts: 'Uploading contact info…',
  verify: 'Verifying spec…',
  encrypt: 'Encrypting app spec…',
  sign: 'Waiting for signature…',
  register: 'Submitting to Flux network…',
  install: 'Running test installation…',
  done: 'Registration complete!',
  error: 'Failed',
};

export default function Step5Register({ plan, repo, config, ports, onSuccess, onError: onWizardError }) {
  const { zelidauth, loginType, user } = useAuth();
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');
  const [appName, setAppName] = useState('');
  const [buildLogs, setBuildLogs] = useState([]);
  const [buildLogsComplete, setBuildLogsComplete] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const streamRef = useRef(null);
  const deployStartedRef = useRef(false);
  // Pre-encryption spec (credentials redacted) for price calculation in Step6
  const specForPricingRef = useRef(null);

  // Cancel stream on unmount
  useEffect(() => () => streamRef.current?.abort(), []);

  // Auto-start deploying when step mounts — guard prevents Strict Mode double-fire
  useEffect(() => {
    if (deployStartedRef.current) return;
    deployStartedRef.current = true;
    handleDeploy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function fail(msg) {
    setError(msg);
    setPhase('error');
    onWizardError?.(msg);
  }

  async function handleDeploy() {
    setError('');
    setBuildLogs([]);
    setBuildLogsComplete(false);
    setPhase('contacts');

    // Build complete repo URL (embed credentials if private)
    let finalRepoUrl = repo.url;
    if (repo.isPrivate && repo.username && repo.token) {
      finalRepoUrl = buildPrivateRepoUrl(repo.url, repo.username, repo.token);
    }

    const repoForSpec = { ...repo, url: finalRepoUrl };
    const zelid = zelidauth?.zelid;

    try {
      // 1. Upload contact email to Flux Storage → get F_S_CONTACTS reference
      let contactsRef = null;
      const contactEmail = config.contactEmail || user?.email;
      if (contactEmail) {
        try {
          contactsRef = await uploadContacts(contactEmail);
        } catch (err) {
          // Non-fatal: proceed without contacts reference
          console.warn('Contacts upload failed, continuing without:', err.message);
        }
      }

      // 2. Build local spec
      setPhase('verify');
      const localSpec = buildSpec({ zelid, contactsRef, plan, repo: repoForSpec, config, ports });

      // 3. Verify spec with Flux backend → get normalized spec to sign
      //    Falls back to local spec if verify times out or fails (like minecraft)
      const requiresEnterpriseAddon = plan?.id === 'custom' && (config.database?.enabled || config.redis?.enabled);
      const isEnterprise = repo.isPrivate || !!config.enterprise || requiresEnterpriseAddon;
      let normalizedSpec;
      try {
        normalizedSpec = await verifySpec(localSpec);
      } catch (err) {
        console.warn('Spec verification failed, using local spec:', err.message);
        normalizedSpec = localSpec;
      }

      // 3b. Encrypt spec for enterprise/private apps
      if (isEnterprise) {
        setPhase('encrypt');
        try {
          normalizedSpec = await encryptSpec(normalizedSpec, zelidauth);
        } catch (err) {
          const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
          fail(isTimeout
            ? 'Enterprise key request timed out. The Flux network\'s getpublickey endpoint is currently unavailable — try again later or contact support.'
            : `Encryption failed: ${err.message}`);
          return;
        }
      }

      // Save the exact spec that will be registered, for price calculation in Step6.
      // For enterprise apps this MUST be the post-encryption spec: the Flux price API
      // (calculatefiatandfluxprice) decrypts it and adds the enterprise "scope" surcharge,
      // so the quote matches what the network enforces at registration. Pricing the plaintext
      // pre-encryption spec omitted that surcharge, so enterprise apps were underpaid & rejected.
      specForPricingRef.current = redactSpecCredentials(normalizedSpec);

      // 4. Create timestamp (single source of truth)
      const timestamp = Date.now();
      const dataToSign = buildDataToSign(normalizedSpec, timestamp);

      // 5. Sign based on login type
      setPhase('sign');
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
        fail(`Signing failed: ${err.message}`);
        return;
      }

      // 6. Register app
      setPhase('register');
      let regTxid;
      try {
        regTxid = await registerApp({ verifiedSpec: normalizedSpec, timestamp, signature, zelidauth });
      } catch (err) {
        fail(`Registration failed: ${err.message}`);
        return;
      }
      setTxid(regTxid);
      setAppName(config.appName);

      // 7. Test install — blocking, shows build logs, must pass before payment
      setPhase('install');
      const zaStr = zelidauthStr(zelidauth);
      let testFailed = false;

      await new Promise((resolve) => {
        streamRef.current = streamTestInstall(regTxid, zaStr, {
          onLine: (log) => setBuildLogs((prev) => [...prev, log]),
          onError: (err) => {
            setBuildLogs((prev) => [...prev, { status: 'error', data: err.message }]);
            setBuildLogsComplete(true);
            testFailed = true;
            resolve();
          },
          onDone: () => {
            setBuildLogsComplete(true);
            resolve();
          },
        });
      });

      if (testFailed) {
        setPhase('test_failed');
        return;
      }

      // Test passed → advance to payment step
      setPhase('done');
      onSuccess?.({ txid: regTxid, appName: config.appName, verifiedSpec: specForPricingRef.current });
    } catch (err) {
      fail(err.message || 'Unexpected error');
    }
  }

  function skipToPayment() {
    setPhase('done');
    onSuccess?.({ txid, appName, verifiedSpec: specForPricingRef.current });
  }

  function retryTest() {
    if (!txid) return;
    setPhase('install');
    setBuildLogs([]);
    setBuildLogsComplete(false);
    const zaStr = zelidauthStr(zelidauth);
    let testFailed = false;

    new Promise((resolve) => {
      streamRef.current = streamTestInstall(txid, zaStr, {
        onLine: (log) => setBuildLogs((prev) => [...prev, log]),
        onError: (err) => {
          setBuildLogs((prev) => [...prev, { status: 'error', data: err.message }]);
          setBuildLogsComplete(true);
          testFailed = true;
          resolve();
        },
        onDone: () => {
          setBuildLogsComplete(true);
          resolve();
        },
      });
    }).then(() => {
      if (!testFailed) {
        setPhase('done');
        onSuccess?.({ txid, appName, verifiedSpec: specForPricingRef.current });
      } else {
        setPhase('test_failed');
      }
    });
  }

  const requiresEnterpriseAddon = plan?.id === 'custom' && (config.database?.enabled || config.redis?.enabled);
  const isEnterprise = repo.isPrivate || !!config.enterprise || requiresEnterpriseAddon;
  const phaseSteps = isEnterprise
    ? ['verify', 'encrypt', 'sign', 'register', 'install']
    : ['verify', 'sign', 'register', 'install'];

  // Phases that count as "all done" for the progress tracker
  const allRegistered = ['install', 'test_failed', 'done'].includes(phase);
  const isRunning = phase !== 'idle' && phase !== 'done';

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <Rocket className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-bold text-text">Deploy</h2>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        We'll verify, sign, and submit your app to the Flux network.
      </p>

      {/* Phase steps */}
      {phase !== 'idle' && phase !== 'done' && (
        <div className="space-y-3 mb-6">
          {phaseSteps.map((p) => {
            const activePhase = allRegistered ? 'install' : phase;
            const currentIdx = phaseSteps.indexOf(activePhase);
            const thisIdx = phaseSteps.indexOf(p);
            const isDone = allRegistered
              ? (p === 'install' ? phase === 'done' : true)
              : (isRunning && thisIdx < currentIdx);
            const isCurrent = (phase === p) || (phase === 'test_failed' && p === 'install');
            const isPending = !isDone && !isCurrent;

            return (
              <div key={p} className={`flex items-center gap-3 text-sm ${isPending && phase !== 'idle' ? 'opacity-40' : ''}`}>
                {isDone ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                ) : isCurrent ? (
                  phase === 'test_failed'
                    ? <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                    : <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-border shrink-0" />
                )}
                <span className={isCurrent ? (phase === 'test_failed' ? 'text-red-400 font-medium' : 'text-text font-medium') : isDone ? 'text-text-secondary' : 'text-text-muted'}>
                  {PHASE_LABELS[p]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Build logs — shown during install and after (collapsible) */}
      {buildLogs.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden mb-5">
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-surface hover:bg-surface-hover text-sm text-text-muted transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" />
              <span>Build logs</span>
              {!buildLogsComplete && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
              {buildLogsComplete && phase !== 'test_failed' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">passed</span>
              )}
              {phase === 'test_failed' && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">failed</span>
              )}
            </div>
            <span className="text-xs">{logsOpen ? '▲' : '▼'}</span>
          </button>
          {logsOpen && (
            <div className="bg-black/30 p-3 max-h-64 overflow-y-auto space-y-0.5">
              {buildLogs.map((log, i) => (
                <div key={i} className={`text-xs font-mono leading-relaxed ${log.status === 'error' ? 'text-red-400' : 'text-text-secondary'}`}>
                  {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-5">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Test failed warning */}
      {phase === 'test_failed' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400 mb-5">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          Test installation failed. Check the logs above. You can retry or skip to payment anyway.
        </div>
      )}

      {/* Success — advancing to payment */}
      {phase === 'done' && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Test passed. Proceeding to payment…
        </div>
      )}

      {/* Action buttons — only shown on failure */}
      {phase === 'test_failed' && (
        <div className="flex gap-3">
          <button type="button" onClick={retryTest} className="btn-primary flex-1">
            Retry test
          </button>
          <button type="button" onClick={skipToPayment} className="btn-secondary flex-1">
            Skip to payment
          </button>
        </div>
      )}
      {phase === 'error' && (
        <button type="button" onClick={handleDeploy} className="btn-primary w-full">
          Retry
        </button>
      )}
    </div>
  );
}
