import { useState, useEffect, useRef } from 'react';
import { X, Clock, Loader2, XCircle, CheckCircle, CreditCard, ArrowRight, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../utils/firebase';
import {
  verifyUpdateSpec,
  updateApp,
  buildDataToSign,
  signWithSSO,
  signWithSSP,
  signWithZelCore,
  calculatePrice,
  getPaymentAddress,
} from '../../services/deployService';

const PAYMENT_BRIDGE_URL = import.meta.env.VITE_PAYMENT_BRIDGE_URL || 'https://fiatpaymentsbridge.runonflux.io';

const RENEW_PERIODS = [
  { label: '1 week',   subLabel: '~7 days',    blocks: 7 * 720 },
  { label: '2 weeks',  subLabel: '~14 days',   blocks: 14 * 720 },
  { label: '1 month',  subLabel: '~1 mo',      blocks: 88000 },
  { label: '2 months', subLabel: '~2 mo',      blocks: 2 * 88000 },
  { label: '3 months', subLabel: '~3 mo',      blocks: 3 * 88000 },
  { label: '6 months', subLabel: '~6 mo',      blocks: 6 * 88000 },
  { label: '1 year',   subLabel: '~12 mo',     blocks: 12 * 88000 },
];

function buildRenewalSpec(rawSpec, expireBlocks) {
  // Keep only valid Flux app spec fields, replacing expire
  return {
    version:     rawSpec.version,
    name:        rawSpec.name,
    description: rawSpec.description ?? '',
    owner:       rawSpec.owner,
    compose:     rawSpec.compose ?? [],
    instances:   rawSpec.instances,
    contacts:    rawSpec.contacts ?? [],
    geolocation: rawSpec.geolocation ?? [],
    expire:      expireBlocks,
    nodes:       rawSpec.nodes ?? [],
    staticip:    rawSpec.staticip ?? false,
    enterprise:  rawSpec.enterprise ?? '',
  };
}

// ─── Period Picker ────────────────────────────────────────────────────────────
function PeriodPicker({ app, rawSpec, onConfirm, onClose }) {
  const [selected, setSelected] = useState(2); // default: 1 month
  const [priceUsd, setPriceUsd]   = useState(null);
  const [priceFlux, setPriceFlux] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError]     = useState('');
  const { zelidauth } = useAuth();

  useEffect(() => {
    if (!rawSpec || !zelidauth) return;
    setPriceLoading(true);
    setPriceError('');
    const spec = buildRenewalSpec(rawSpec, RENEW_PERIODS[selected].blocks);
    calculatePrice(spec, zelidauth)
      .then((p) => { setPriceUsd(p?.usd ?? null); setPriceFlux(p?.flux ?? null); })
      .catch((e) => setPriceError(e.message || 'Could not load price'))
      .finally(() => setPriceLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, rawSpec]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-lg font-semibold text-text mb-0.5">Renew {app.name}</h2>
        <p className="text-sm text-text-muted">Choose how long to extend the deployment.</p>
      </div>

      {/* Period buttons */}
      <div className="grid grid-cols-4 gap-2">
        {RENEW_PERIODS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setSelected(i)}
            className={`flex flex-col items-center justify-center px-2 py-3 rounded-xl border text-xs font-medium transition-all duration-150 ${
              selected === i
                ? 'bg-primary/15 border-primary/50 text-primary'
                : 'bg-background/40 border-border/40 text-text-muted hover:border-border hover:text-text-secondary'
            }`}
          >
            <span className="font-semibold text-[13px] leading-tight">{p.label}</span>
          </button>
        ))}
      </div>

      {/* Price estimate */}
      <div className="rounded-xl border border-border/40 bg-background/40 p-4 flex items-center justify-between min-h-[64px]">
        {priceLoading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Calculating price…
          </div>
        ) : priceError ? (
          <p className="text-sm text-amber-400">{priceError}</p>
        ) : priceUsd != null ? (
          <>
            <div>
              <p className="text-xs text-text-muted mb-0.5">Estimated cost</p>
              <p className="text-xl font-bold text-text">${priceUsd}</p>
              {priceFlux && <p className="text-xs text-text-muted">{priceFlux} FLUX</p>}
            </div>
            <div className="text-right text-xs text-text-muted">
              <p className="text-primary font-medium">{RENEW_PERIODS[selected].label}</p>
              <p className="mt-0.5">extension</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted">Select a period to see pricing.</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(RENEW_PERIODS[selected], priceUsd, priceFlux)}
          disabled={priceLoading || priceUsd == null}
          className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Continue <ChevronRight className="w-4 h-4 ml-1" />
        </button>
      </div>
    </div>
  );
}

// ─── Signing step ─────────────────────────────────────────────────────────────
function SigningStep({ app, rawSpec, period, onDone, onError }) {
  const { zelidauth, loginType } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    async function run() {
      const spec = buildRenewalSpec(rawSpec, period.blocks);

      // 1. Verify
      onDone('verifying');
      let verifiedSpec;
      try {
        verifiedSpec = await verifyUpdateSpec(spec);
      } catch (e) {
        onError(`Verification failed: ${e.message}`);
        return;
      }

      // 2. Sign
      onDone('signing');
      const timestamp  = Date.now();
      const dataToSign = buildDataToSign(verifiedSpec, timestamp, true);
      let signature;
      try {
        if (loginType === 'firebase') {
          const firebaseUser = auth.currentUser;
          if (!firebaseUser) throw new Error('Not authenticated');
          signature = await signWithSSO(dataToSign, firebaseUser);
        } else if (loginType === 'ssp') {
          signature = await signWithSSP(dataToSign);
        } else {
          signature = await signWithZelCore(dataToSign, zelidauth, timestamp);
        }
      } catch (e) {
        onError(`Signing failed: ${e.message}`);
        return;
      }

      // 3. Submit
      onDone('submitting');
      let txid;
      try {
        txid = await updateApp({ verifiedSpec, timestamp, signature, zelidauth });
      } catch (e) {
        onError(`Submission failed: ${e.message}`);
        return;
      }

      onDone('done', { txid, verifiedSpec });
    }

    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null; // parent renders the progress UI
}

// ─── Payment step ─────────────────────────────────────────────────────────────
function PaymentStep({ app, txid, verifiedSpec, priceUsd, priceFlux, period, onClose }) {
  const { zelidauth } = useAuth();
  const [paymentAddress, setPaymentAddress] = useState(null);
  const [addrLoading, setAddrLoading]       = useState(true);
  const [status, setStatus]   = useState('idle');
  const [error, setError]     = useState('');
  const [paid, setPaid]       = useState(false);
  const [stripeInitiated, setStripeInitiated] = useState(false);
  const [blockedUrl, setBlockedUrl]           = useState(null);
  const popupRef = useRef(null);

  useEffect(() => {
    getPaymentAddress(zelidauth)
      .then(setPaymentAddress)
      .catch(() => {})
      .finally(() => setAddrLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => { popupRef.current?.close(); }, []);

  async function handleStripe() {
    const popup = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    popupRef.current = popup;
    if (popup) popup.document.write('<p style="font-family:sans-serif;padding:2rem;color:#aaa">Redirecting to Stripe checkout…</p>');
    setStatus('pending');
    try {
      const months = period.blocks / 88000;
      const endpoint = months > 1
        ? `${PAYMENT_BRIDGE_URL}/api/v1/stripe/subscription/create`
        : `${PAYMENT_BRIDGE_URL}/api/v1/stripe/checkout/create`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zelid: zelidauth.zelid,
          signature: zelidauth.signature,
          loginPhrase: zelidauth.loginPhrase,
          details: {
            name: 'renewal',
            description: `Orbit renewal: ${app.name}`,
            hash: txid,
            price: parseFloat((priceUsd ?? 0).toFixed(2)),
            productName: app.name,
            ...(months > 1 ? { period: months } : {}),
            success_url: `${window.location.origin}/successcheckout`,
            cancel_url: window.location.origin,
            kpi: { origin: 'Orbit', marketplace: true, renewal: true },
          },
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status === 'error') throw new Error(json.data?.message || 'Checkout failed');
      const url = json.data;
      if (!url) throw new Error('No checkout URL returned');
      if (popup && !popup.closed) popup.location.href = url;
      else setBlockedUrl(url);
      setStatus('idle');
      setStripeInitiated(true);
    } catch (e) {
      if (popup && !popup.closed) popup.close();
      popupRef.current = null;
      setError(e.message);
      setStatus('error');
    }
  }

  function handleZelCore() {
    if (!paymentAddress || !priceFlux || !txid) return;
    const protocol = `zel:?action=pay&coin=zelcash&address=${encodeURIComponent(paymentAddress)}&amount=${priceFlux}&message=${encodeURIComponent(txid)}`;
    const a = document.createElement('a');
    a.href = protocol; a.style.display = 'none';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setPaid(true);
  }

  async function handleSSP() {
    if (!window.ssp) { setError('SSP wallet not found.'); setStatus('error'); return; }
    if (!paymentAddress || !priceFlux) { setError('Payment details not ready.'); return; }
    setStatus('pending');
    try {
      const resp = await window.ssp.request('pay', { message: txid, amount: priceFlux.toString(), address: paymentAddress, chain: 'flux' });
      if (resp?.status === 'ERROR') throw new Error(resp.data || 'SSP payment failed');
      setPaid(true);
    } catch (e) {
      setError(e.message || 'SSP payment failed');
      setStatus('error');
    }
  }

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle className="w-6 h-6 text-green-400" />
        </div>
        <div>
          <p className="font-semibold text-text">Payment initiated</p>
          <p className="text-sm text-text-muted mt-1">Your renewal will activate once the transaction confirms on-chain.</p>
        </div>
        <button type="button" onClick={onClose} className="btn-primary mt-2">Done</button>
      </div>
    );
  }

  if (stripeInitiated) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold text-text">Complete Payment</h2>
        </div>
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            <p className="text-sm font-medium text-text">Stripe checkout opened in a new window</p>
          </div>
          <p className="text-xs text-text-muted mb-4">Complete the payment, then click <strong>I've paid</strong> below.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setStripeInitiated(false); setPaid(true); }} className="btn-primary flex-1">I've paid, continue</button>
            <button type="button" onClick={() => { popupRef.current?.close(); setStripeInitiated(false); setBlockedUrl(null); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
        {blockedUrl && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Popup blocked. <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="underline">Open Stripe checkout</a></span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-text">Payment</h2>
        <p className="text-sm text-text-muted">Renewal registered. Complete payment to activate.</p>
      </div>

      {/* Price summary */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-text-muted mb-0.5">Total due</p>
          <p className="text-xl font-bold text-text">${priceUsd}</p>
          {priceFlux && <p className="text-xs text-text-muted">{priceFlux} FLUX</p>}
        </div>
        <div className="text-xs text-text-muted text-right">
          <p className="text-primary font-medium">{period.label}</p>
          <p className="mt-0.5">renewal</p>
        </div>
      </div>

      {status === 'error' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            <button type="button" onClick={() => setStatus('idle')} className="mt-1 text-xs underline">Dismiss</button>
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <button type="button" onClick={handleStripe} disabled={status === 'pending'}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <CreditCard className="w-5 h-5 text-primary shrink-0" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-text">Credit / Debit Card</p>
            <p className="text-xs text-text-muted">Powered by Stripe</p>
          </div>
          {status === 'pending' ? <Loader2 className="w-4 h-4 animate-spin text-text-muted" /> : <ArrowRight className="w-4 h-4 text-text-muted" />}
        </button>

        <button type="button" onClick={handleZelCore} disabled={status === 'pending' || !priceFlux || addrLoading}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <img src="/zelcore.svg" alt="ZelCore" className="w-5 h-5 shrink-0 rounded-full" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-text">ZelCore Wallet</p>
            <p className="text-xs text-text-muted">{priceFlux ? `${priceFlux} FLUX` : addrLoading ? 'Loading…' : 'Unavailable'}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted" />
        </button>

        <button type="button" onClick={handleSSP} disabled={status === 'pending' || !priceFlux || addrLoading}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <img src="/ssp.svg" alt="SSP" className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-text">SSP Wallet</p>
            <p className="text-xs text-text-muted">{priceFlux ? `${priceFlux} FLUX` : addrLoading ? 'Loading…' : 'Unavailable'}</p>
          </div>
          <ArrowRight className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text transition-colors mt-1">
        ← Back to billing
      </button>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function RenewModal({ app, onClose }) {
  const [phase, setPhase] = useState('loading'); // loading | pick | signing | paying | error
  const [signingPhase, setSigningPhase] = useState(''); // verifying | signing | submitting
  const [rawSpec, setRawSpec]     = useState(null);
  const [period, setPeriod]       = useState(null);
  const [priceUsd, setPriceUsd]   = useState(null);
  const [priceFlux, setPriceFlux] = useState(null);
  const [txid, setTxid]           = useState(null);
  const [verifiedSpec, setVerifiedSpec] = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');

  // Fetch the raw full spec on mount
  useEffect(() => {
    fetch(`/api/flux/apps/appspecifications/${encodeURIComponent(app.name)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.status !== 'success' || !json.data) throw new Error('Could not fetch app spec');
        setRawSpec(json.data);
        setPhase('pick');
      })
      .catch((e) => {
        setErrorMsg(e.message || 'Failed to load app spec');
        setPhase('error');
      });
  }, [app.name]);

  function handleConfirm(selectedPeriod, usd, flux) {
    setPeriod(selectedPeriod);
    setPriceUsd(usd);
    setPriceFlux(flux);
    setPhase('signing');
  }

  function handleSigningProgress(step, result) {
    if (step === 'done') {
      setTxid(result.txid);
      setVerifiedSpec(result.verifiedSpec);
      setPhase('paying');
    } else {
      setSigningPhase(step);
    }
  }

  function handleSigningError(msg) {
    setErrorMsg(msg);
    setPhase('error');
  }

  const SIGNING_LABELS = {
    verifying:  'Verifying spec…',
    signing:    'Waiting for signature…',
    submitting: 'Submitting to blockchain…',
  };

  return (
    /* Overlay */
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative w-full max-w-md bg-surface border border-border/50 rounded-2xl shadow-2xl p-6">
        {/* Close */}
        <button type="button" onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors">
          <X className="w-4 h-4" />
        </button>

        {/* Loading spec */}
        {phase === 'loading' && (
          <div className="flex items-center gap-3 py-8 justify-center text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading app spec…</span>
          </div>
        )}

        {/* Period picker */}
        {phase === 'pick' && (
          <PeriodPicker app={app} rawSpec={rawSpec} onConfirm={handleConfirm} onClose={onClose} />
        )}

        {/* Signing in progress */}
        {phase === 'signing' && (
          <>
            <SigningStep
              app={app}
              rawSpec={rawSpec}
              period={period}
              onDone={handleSigningProgress}
              onError={handleSigningError}
            />
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-text">{SIGNING_LABELS[signingPhase] || 'Processing…'}</p>
                <p className="text-sm text-text-muted mt-1">This may take a few seconds.</p>
              </div>
              <Loader2 className="w-5 h-5 animate-spin text-text-muted" />
            </div>
          </>
        )}

        {/* Payment */}
        {phase === 'paying' && (
          <PaymentStep
            app={app}
            txid={txid}
            verifiedSpec={verifiedSpec}
            priceUsd={priceUsd}
            priceFlux={priceFlux}
            period={period}
            onClose={onClose}
          />
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <p className="font-semibold text-text">Something went wrong</p>
              <p className="text-sm text-text-muted mt-1">{errorMsg}</p>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setPhase('pick'); setErrorMsg(''); }} className="btn-secondary">Try again</button>
              <button type="button" onClick={onClose} className="btn-primary">Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
