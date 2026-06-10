import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { calculatePrice, getPaymentAddress } from '../../services/deployService';
import DeploymentTracker from './DeploymentTracker';
import { CreditCard, Loader2, XCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';

export default function Step6Payment({ verifiedSpec, plan, registration, billingPeriod, eligibleForFree = true, subtitle, onBack }) {
  const { zelidauth } = useAuth();
  const [priceUsd, setPriceUsd] = useState(null);
  const [priceFlux, setPriceFlux] = useState(null);
  const [paymentAddress, setPaymentAddress] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const [stripeInitiated, setStripeInitiated] = useState(false); // popup opened, waiting for user
  const [blockedUrl, setBlockedUrl] = useState(null); // popup was blocked
  const popupRef = useRef(null);
  const wsRef = useRef(null);

  const isFree = (plan?.priceMonthly === 0 || plan?.id === 'free') && eligibleForFree;
  const appName = registration?.appName || verifiedSpec?.name;
  const txid = registration?.txid;

  function loadPricing() {
    if (!verifiedSpec || !zelidauth || isFree) return;
    setPriceLoading(true);
    setPriceError('');
    Promise.all([
      calculatePrice(verifiedSpec, zelidauth),
      getPaymentAddress(zelidauth),
    ]).then(([price, addr]) => {
      if (price?.usd != null) setPriceUsd(price.usd);
      if (price?.flux != null) setPriceFlux(price.flux);
      if (addr) setPaymentAddress(addr);
    }).catch((err) => {
      setPriceError(err.message || 'Failed to load pricing. Check your connection.');
    }).finally(() => {
      setPriceLoading(false);
    });
  }

  // Fetch price + payment address on mount
  useEffect(() => {
    loadPricing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    wsRef.current?.close();
    popupRef.current?.close();
  }, []);

  // Update flow: once paid, hand control back to parent (SpecEditorCard shows its own tracker)
  useEffect(() => {
    if (paid && onBack) onBack();
  // onBack identity is stable (inline arrow in SpecEditorCard); paid only flips once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid]);

  // Free plan or after payment confirmed → show deployment tracker (wizard flow only)
  if (isFree || (paid && !onBack)) {
    return (
      <DeploymentTracker
        appName={appName}
        txid={txid}
        zelidauth={zelidauth}
        buildLogs={[]}
        buildLogsComplete={true}
        priceFlux={isFree ? null : priceFlux}
        priceUsd={isFree ? null : priceUsd}
      />
    );
  }

  // Stripe popup opened — waiting for user to complete or cancel
  if (stripeInitiated) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2.5 mb-1">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="font-heading text-xl font-bold text-text">Complete Payment</h2>
        </div>
        <div className="p-4 rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
            <p className="text-sm font-medium text-text">Stripe checkout opened in a new window</p>
          </div>
          <p className="text-xs text-text-muted mb-4">
            Complete the payment in the Stripe window, then click <strong>I&apos;ve paid</strong> to start deployment monitoring.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setStripeInitiated(false); setPaid(true); }}
              className="btn-primary flex-1"
            >
              I've paid, continue
            </button>
            <button
              type="button"
              onClick={() => { popupRef.current?.close(); popupRef.current = null; setBlockedUrl(null); setStripeInitiated(false); }}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
        {blockedUrl && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Popup blocked.{' '}
              <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">
                Open Stripe checkout <ExternalLink className="w-3 h-3" />
              </a>
            </span>
          </div>
        )}
      </div>
    );
  }

  async function handleStripe() {
    if (!zelidauth) { setError('Not authenticated.'); setStatus('error'); return; }

    // Open popup synchronously before async fetch to avoid popup blockers
    const popup = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    popupRef.current = popup;
    if (popup) {
      popup.document.write('<p style="font-family:sans-serif;padding:2rem;color:#aaa">Redirecting to Stripe checkout…</p>');
    }

    setStatus('pending');
    try {
      const paymentBridgeUrl = getRuntimeConfig().paymentBridgeUrl;
      // Multi-month billing → subscription endpoint; single month → one-time checkout
      const months = billingPeriod?.months ?? 1;
      const endpoint = months > 1
        ? `${paymentBridgeUrl}/api/v1/stripe/subscription/create`
        : `${paymentBridgeUrl}/api/v1/stripe/checkout/create`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zelid: zelidauth.zelid,
          signature: zelidauth.signature,
          loginPhrase: zelidauth.loginPhrase,
          details: {
            name: plan?.id || 'standard',
            description: `Orbit deployment: ${appName}`,
            hash: txid,
            price: parseFloat((priceUsd ?? 0).toFixed(2)),
            productName: appName,
            ...(months > 1 ? { period: months } : {}),
            success_url: `${window.location.origin}/successcheckout`,
            cancel_url: window.location.origin,
            kpi: { origin: 'Orbit', marketplace: true, registration: true },
          },
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.status === 'error') throw new Error(json.data?.message || json.message || 'Checkout failed');
      const checkoutUrl = json.data;
      if (!checkoutUrl) throw new Error('No checkout URL returned');

      if (popup && !popup.closed) {
        popup.location.href = checkoutUrl;
      } else {
        // Popup was blocked — store URL for manual open
        setBlockedUrl(checkoutUrl);
      }
      setStatus('idle');
      setStripeInitiated(true);
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      popupRef.current = null;
      setError(err.message);
      setStatus('error');
    }
  }

  async function handleZelCore() {
    if (!paymentAddress || !priceFlux || !txid) {
      setError('Payment details not loaded yet. Please wait.');
      return;
    }
    // Open ZelCore deep link — no server call needed.
    // Blockchain polling in DeploymentTracker will confirm the payment.
    const protocol = `zel:?action=pay&coin=zelcash&address=${encodeURIComponent(paymentAddress)}&amount=${priceFlux}&message=${encodeURIComponent(txid)}`;
    if (window.zelcore && typeof window.zelcore.protocol === 'function') {
      window.zelcore.protocol(protocol);
    } else {
      const a = document.createElement('a');
      a.href = protocol;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setPaid(true);
  }

  async function handleSSP() {
    if (!window.ssp) {
      setError('SSP wallet extension not found. Please install it and try again.');
      setStatus('error');
      return;
    }
    if (!paymentAddress || !priceFlux || !txid) {
      setError('Payment details not loaded yet. Please wait.');
      return;
    }
    setStatus('pending');
    try {
      const response = await window.ssp.request('pay', {
        message: txid,
        amount: priceFlux.toString(),
        address: paymentAddress,
        chain: 'flux',
      });
      if (response?.status === 'ERROR') throw new Error(response.data || response.result || 'SSP payment failed');
      if (!response?.txid) throw new Error('No transaction ID returned from SSP');
      setPaid(true);
    } catch (err) {
      setError(err.message || 'SSP payment failed');
      setStatus('error');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <CreditCard className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-bold text-text">Payment</h2>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        {subtitle ?? 'Your app has been registered. Complete payment to activate deployment.'}
      </p>

      {/* Price summary */}
      {priceUsd != null && (
        <div className="card p-4 mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted mb-0.5">Total due</p>
            <p className="text-xl font-bold text-text">${priceUsd}</p>
            {priceFlux && <p className="text-xs text-text-muted">{priceFlux} FLUX</p>}
          </div>
          <div className="text-xs text-text-muted text-right">
            <p>{plan?.label || plan?.name || 'Standard'} plan</p>
            {billingPeriod?.months > 1
              ? <p className="text-primary mt-0.5">{billingPeriod.months} months</p>
              : <p className="mt-0.5">1 month</p>}
          </div>
        </div>
      )}

      {/* Loading price */}
      {priceLoading && (
        <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading pricing…
        </div>
      )}

      {/* Price load error */}
      {priceError && !priceLoading && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-400 mb-5">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{priceError}</p>
            <button type="button" onClick={loadPricing} className="mt-2 text-xs underline hover:no-underline">
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Payment error */}
      {status === 'error' && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400 mb-5">
          <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            <button type="button" onClick={() => setStatus('idle')} className="mt-2 text-xs underline hover:no-underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Payment methods */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleStripe}
          disabled={status === 'pending'}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CreditCard className="w-5 h-5 text-primary shrink-0" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-text">Credit / Debit Card</p>
            <p className="text-xs text-text-muted">Powered by Stripe</p>
          </div>
          {status === 'pending' ? <Loader2 className="w-4 h-4 animate-spin text-text-muted" /> : <ArrowRight className="w-4 h-4 text-text-muted" />}
        </button>

        <button
          type="button"
          onClick={handleZelCore}
          disabled={status === 'pending' || !priceFlux}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <img src="/zelcore.svg" alt="ZelCore" className="w-5 h-5 shrink-0 rounded-full" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-text">ZelCore Wallet</p>
            <p className="text-xs text-text-muted">{priceFlux ? `${priceFlux} FLUX` : priceLoading ? 'Loading…' : 'Unavailable'}</p>
          </div>
          {status === 'pending' ? <Loader2 className="w-4 h-4 animate-spin text-text-muted" /> : <ArrowRight className="w-4 h-4 text-text-muted" />}
        </button>

        <button
          type="button"
          onClick={handleSSP}
          disabled={status === 'pending' || !priceFlux}
          className="w-full flex items-center gap-3 p-4 rounded-xl border border-border bg-surface hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <img src="/ssp.svg" alt="SSP" className="w-5 h-5 shrink-0" />
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-text">SSP Wallet</p>
            <p className="text-xs text-text-muted">{priceFlux ? `${priceFlux} FLUX` : priceLoading ? 'Loading…' : 'Unavailable'}</p>
          </div>
          {status === 'pending' ? <Loader2 className="w-4 h-4 animate-spin text-text-muted" /> : <ArrowRight className="w-4 h-4 text-text-muted" />}
        </button>
      </div>

      {status === 'pending' && (
        <p className="text-center text-sm text-text-muted mt-4">Waiting for payment confirmation…</p>
      )}

      {/* Back / skip */}
      {onBack && status !== 'pending' && (
        <button type="button" onClick={onBack} className="mt-5 text-sm text-text-muted hover:text-text transition-colors">
          ← Back
        </button>
      )}
    </div>
  );
}

