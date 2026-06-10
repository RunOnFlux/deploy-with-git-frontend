import { useState, useEffect, useRef, useMemo } from 'react';
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
  pollUpdate,
  BLOCKS_PER_MONTH,
  getBlocksRemaining,
  getRenewalOptions,
  formatDurationFromBlocks,
  expiryDateFromBlocks,
  formatExpiryDate,
  usesStripeSubscription,
} from '../../services/deployService';

const PAYMENT_BRIDGE_URL = import.meta.env.VITE_PAYMENT_BRIDGE_URL || 'https://fiatpaymentsbridge.runonflux.io';

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
function PeriodPicker({ app, rawSpec, blocksRemaining, renewalOptions, onConfirm, onClose }) {
  const defaultIndex = Math.max(0, renewalOptions.findIndex((p) => p.blocks === BLOCKS_PER_MONTH));
  const [selected, setSelected] = useState(defaultIndex);
  const [prices, setPrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [priceError, setPriceError] = useState('');
  const { zelidauth } = useAuth();

  const selectedPeriod = renewalOptions[selected];
  const selectedPrice = prices[selected];
  const remaining = Math.max(0, blocksRemaining ?? 0);
  const currentExpiryDate = expiryDateFromBlocks(remaining);

  useEffect(() => {
    if (selected >= renewalOptions.length) {
      setSelected(Math.max(0, renewalOptions.length - 1));
    }
  }, [renewalOptions.length, selected]);

  useEffect(() => {
    if (!rawSpec || !zelidauth || renewalOptions.length === 0) return;

    let cancelled = false;
    setPricesLoading(true);
    setPriceError('');
    setPrices({});

    Promise.all(
      renewalOptions.map(async (period, i) => {
        const spec = buildRenewalSpec(rawSpec, period.expireBlocks);
        const price = await calculatePrice(spec, zelidauth);
        return { i, price };
      }),
    )
      .then((results) => {
        if (cancelled) return;
        const next = {};
        results.forEach(({ i, price }) => { next[i] = price; });
        setPrices(next);
      })
      .catch((e) => {
        if (cancelled) return;
        setPriceError(e.message || 'Could not load prices');
      })
      .finally(() => {
        if (!cancelled) setPricesLoading(false);
      });

    return () => { cancelled = true; };
  }, [rawSpec, renewalOptions, zelidauth]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-lg font-semibold text-text mb-0.5">Renew {app.name}</h2>
        <p className="text-sm text-text-muted">Choose how long to extend the deployment.</p>
      </div>

      {/* Current subscription */}
      <div className="rounded-xl border border-border/40 bg-background/40 px-4 py-3">
        <div className="flex items-start gap-2 text-sm">
          <Clock className="w-4 h-4 text-text-muted mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-text-secondary">
              Active until{' '}
              <span className="font-medium text-text">{formatExpiryDate(currentExpiryDate)}</span>
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {formatDurationFromBlocks(remaining)} remaining
            </p>
          </div>
        </div>
      </div>

      {/* Period options — vertical list */}
      <div className="space-y-2" role="radiogroup" aria-label="Renewal period">
        {renewalOptions.map((period, i) => {
          const isSelected = selected === i;
          const price = prices[i];

          return (
            <button
              key={`${period.blocks}-${period.label}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(i)}
              className={`w-full text-left rounded-xl border px-4 py-3 transition-all duration-150 ${
                isSelected
                  ? 'bg-primary/10 border-primary/50 ring-1 ring-primary/20'
                  : 'bg-background/40 border-border/40 hover:border-border/70 hover:bg-background/60'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'border-primary' : 'border-border'
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-primary' : 'text-text'}`}>
                      {period.label}
                      {period.isCustomMax && (
                        <span className="text-text-muted font-normal"> · max</span>
                      )}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Until {formatExpiryDate(period.newExpiryDate)}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 min-w-[3.5rem]">
                  {pricesLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-text-muted ml-auto" />
                  ) : price?.usd != null ? (
                    <div>
                      <p className="text-sm font-semibold text-text">${price.usd}</p>
                      {price.flux > 0 && (
                        <p className="text-[10px] text-text-muted">{price.flux} FLUX</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {priceError && (
        <p className="text-sm text-amber-400 -mt-2">{priceError}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onClose} className="btn-secondary flex-1">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(selectedPeriod, selectedPrice?.usd, selectedPrice?.flux)}
          disabled={pricesLoading || selectedPrice?.usd == null || !selectedPeriod}
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
      const spec = buildRenewalSpec(rawSpec, period.expireBlocks);

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
function PaymentStep({ app, txid, priceUsd, priceFlux, period, onClose }) {
  const { zelidauth } = useAuth();
  const [paymentAddress, setPaymentAddress] = useState(null);
  const [addrLoading, setAddrLoading]       = useState(true);
  const [status, setStatus]       = useState('idle'); // idle | pending | error
  const [error, setError]         = useState('');
  const [polling, setPolling]     = useState(false);  // blockchain polling active
  const [confirmed, setConfirmed] = useState(false);  // blockchain confirmed
  const [pollError, setPollError] = useState('');
  const [stripeInitiated, setStripeInitiated] = useState(false);
  const [blockedUrl, setBlockedUrl]           = useState(null);
  const popupRef  = useRef(null);
  const stopPoll  = useRef(null);

  useEffect(() => {
    getPaymentAddress(zelidauth)
      .then(setPaymentAddress)
      .catch(() => {})
      .finally(() => setAddrLoading(false));
    return () => { popupRef.current?.close(); stopPoll.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startPolling() {
    setPolling(true);
    setPollError('');
    stopPoll.current = pollUpdate(app.name, txid, {
      onSuccess: () => { setPolling(false); setConfirmed(true); },
      onError:   (e) => { setPolling(false); setPollError(e.message); },
    });
  }

  async function handleStripe() {
    const popup = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    popupRef.current = popup;
    if (popup) popup.document.write('<p style="font-family:sans-serif;padding:2rem;color:#aaa">Redirecting to Stripe checkout…</p>');
    setStatus('pending');
    try {
      const months = period.blocks / BLOCKS_PER_MONTH;
      const subscription = usesStripeSubscription(period);
      const endpoint = subscription
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
            ...(subscription ? { period: months } : {}),
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
    startPolling();
  }

  async function handleSSP() {
    if (!window.ssp) { setError('SSP wallet not found.'); setStatus('error'); return; }
    if (!paymentAddress || !priceFlux) { setError('Payment details not ready.'); return; }
    setStatus('pending');
    try {
      const resp = await window.ssp.request('pay', { message: txid, amount: priceFlux.toString(), address: paymentAddress, chain: 'flux' });
      if (resp?.status === 'ERROR') throw new Error(resp.data || 'SSP payment failed');
      setStatus('idle');
      startPolling();
    } catch (e) {
      setError(e.message || 'SSP payment failed');
      setStatus('error');
    }
  }

  // ── Confirmed ──
  if (confirmed) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center">
          <CheckCircle className="w-7 h-7 text-green-400" />
        </div>
        <div>
          <p className="font-semibold text-text text-lg">Renewal confirmed!</p>
          <p className="text-sm text-text-muted mt-1">
            Your app <span className="text-text font-medium">{app.name}</span> has been extended
            by <span className="text-primary font-medium">{period.label}</span>
            {period.newExpiryDate && (
              <> — active until <span className="text-text font-medium">{formatExpiryDate(period.newExpiryDate)}</span></>
            )}.
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-primary mt-2">Done</button>
      </div>
    );
  }

  // ── Waiting for blockchain ──
  if (polling || pollError) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="font-heading text-lg font-semibold text-text">Awaiting Confirmation</h2>
          <p className="text-sm text-text-muted">Checking blockchain every 10 seconds…</p>
        </div>

        <div className="rounded-xl border border-border/40 bg-background/40 p-5 flex flex-col items-center gap-4 text-center">
          {polling ? (
            <>
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <Loader2 className="w-5 h-5 text-primary animate-spin absolute -bottom-1 -right-1" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">Waiting for blockchain confirmation</p>
                <p className="text-xs text-text-muted mt-1">Typically takes 5–15 minutes after payment.</p>
              </div>
              <p className="text-xs font-mono text-text-muted/60 break-all">TX: {txid}</p>
            </>
          ) : (
            <>
              <XCircle className="w-8 h-8 text-red-400" />
              <div>
                <p className="text-sm font-medium text-text">Confirmation timed out</p>
                <p className="text-xs text-text-muted mt-1">{pollError}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={startPolling} className="btn-secondary text-sm">Retry</button>
                <button type="button" onClick={onClose} className="btn-primary text-sm">Close</button>
              </div>
            </>
          )}
        </div>

        {polling && (
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text transition-colors text-center">
            Close — renewal will continue in background
          </button>
        )}
      </div>
    );
  }

  // ── Stripe initiated ──
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
          <p className="text-xs text-text-muted mb-4">Complete the payment, then click <strong>I've paid</strong> to start blockchain monitoring.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => { setStripeInitiated(false); startPolling(); }} className="btn-primary flex-1">I've paid, monitor</button>
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

  // ── Payment method selection ──
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
export default function RenewModal({ app, currentBlock, onClose }) {
  const [phase, setPhase] = useState('loading'); // loading | pick | signing | paying | error | maxed
  const [signingPhase, setSigningPhase] = useState(''); // verifying | signing | submitting
  const [rawSpec, setRawSpec]     = useState(null);
  const [period, setPeriod]       = useState(null);
  const [priceUsd, setPriceUsd]   = useState(null);
  const [priceFlux, setPriceFlux] = useState(null);
  const [txid, setTxid]           = useState(null);
  const [verifiedSpec, setVerifiedSpec] = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');

  const blocksRemaining = useMemo(
    () => getBlocksRemaining(app.height, app.expire, currentBlock),
    [app.height, app.expire, currentBlock],
  );

  const renewalOptions = useMemo(
    () => getRenewalOptions(blocksRemaining),
    [blocksRemaining],
  );

  // Fetch the raw full spec on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/flux/apps/appspecifications/${encodeURIComponent(app.name)}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.status !== 'success' || !json.data) throw new Error('Could not fetch app spec');
        setRawSpec(json.data);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMsg(e.message || 'Failed to load app spec');
        setPhase('error');
      });
    return () => { cancelled = true; };
  }, [app.name]);

  useEffect(() => {
    if (!rawSpec) return;
    setPhase(renewalOptions.length === 0 ? 'maxed' : 'pick');
  }, [rawSpec, renewalOptions.length]);

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
      <div className="relative w-full max-w-lg bg-surface border border-border/50 rounded-2xl shadow-2xl p-6">
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

        {/* Max subscription reached */}
        {phase === 'maxed' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-text">Maximum subscription length reached</p>
              <p className="text-sm text-text-muted mt-1">
                This app already has the maximum 1-year subscription. Renew when time runs down.
              </p>
            </div>
            <button type="button" onClick={onClose} className="btn-primary">Close</button>
          </div>
        )}

        {/* Period picker */}
        {phase === 'pick' && (
          <PeriodPicker
            app={app}
            rawSpec={rawSpec}
            blocksRemaining={blocksRemaining}
            renewalOptions={renewalOptions}
            onConfirm={handleConfirm}
            onClose={onClose}
          />
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
