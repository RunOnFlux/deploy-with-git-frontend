import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { calculatePrice, getPaymentAddress } from '../../services/deployService';
import DeploymentTracker from './DeploymentTracker';
import { CreditCard, Loader2, XCircle, ArrowRight } from 'lucide-react';
import qs from 'qs';

const PAYMENT_BRIDGE_URL = import.meta.env.VITE_PAYMENT_BRIDGE_URL || 'https://fiatpaymentsbridge.runonflux.io';

function getFluxNodeUrl(zelidauth) {
  const sticky = sessionStorage.getItem('stickyBackendDNS') || zelidauth?._stickyBackend;
  return (typeof sticky === 'string' && sticky.startsWith('http')) ? sticky : 'https://api.runonflux.io';
}

export default function Step6Payment({ verifiedSpec, plan, registration, onBack }) {
  const { zelidauth } = useAuth();
  const [priceUsd, setPriceUsd] = useState(null);
  const [priceFlux, setPriceFlux] = useState(null);
  const [paymentAddress, setPaymentAddress] = useState(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | pending | error
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);
  const wsRef = useRef(null);

  const isFree = plan?.priceMonthly === 0 || plan?.id === 'free';
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

  // Cleanup WebSocket on unmount
  useEffect(() => () => wsRef.current?.close(), []);

  // Free plan or after payment → show deployment tracker
  if (isFree || paid) {
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

  async function handleStripe() {
    if (!zelidauth) { setError('Not authenticated.'); setStatus('error'); return; }

    // Open popup synchronously before async fetch to avoid popup blockers
    const popup = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
    if (popup) {
      popup.document.write('<p style="font-family:sans-serif;padding:2rem;color:#aaa">Redirecting to Stripe checkout…</p>');
    }

    setStatus('pending');
    try {
      const resp = await fetch(`${PAYMENT_BRIDGE_URL}/api/v1/stripe/checkout/create`, {
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
            success_url: `${window.location.origin}/successcheckout`,
            cancel_url: window.location.origin,
            kpi: { origin: 'FluxOS', marketplace: true, registration: true },
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
        window.open(checkoutUrl, '_blank');
      }
      // After opening Stripe checkout, show deployment tracker (payment will complete externally)
      setStatus('idle');
      setPaid(true);
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setError(err.message);
      setStatus('error');
    }
  }

  async function handleZelCore() {
    if (!paymentAddress || !priceFlux || !txid) {
      setError('Payment details not loaded yet. Please wait.');
      return;
    }
    setStatus('pending');
    try {
      const nodeUrl = getFluxNodeUrl(zelidauth);

      // 1. Get a payment ID from the Flux backend
      const prResp = await fetch(`${nodeUrl}/payment/paymentrequest`);
      const prJson = await prResp.json();
      if (prJson.status !== 'success' || !prJson.data?.paymentId) {
        throw new Error(prJson.data?.message || 'Failed to get payment request ID');
      }
      const paymentId = prJson.data.paymentId;
      const callbackUrl = encodeURIComponent(`${nodeUrl}/payment/verifypayment?paymentid=${paymentId}`);

      // 2. Open WebSocket to listen for payment confirmation
      const wsUrl = nodeUrl.replace(/^https?:\/\//, 'wss://') + `/ws/payment/${paymentId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          const parsed = qs.parse(event.data);
          const st = parsed.status;
          if (st === 'success' && parsed.data?.txid) { ws.close(); setPaid(true); }
          else if (st === 'error') { ws.close(); setError(parsed.data?.message || 'ZelCore payment failed'); setStatus('error'); }
        } catch {}
      };
      ws.onerror = () => { setError('Payment confirmation connection failed. Check your wallet for the transaction.'); setStatus('error'); };

      // 3. Open ZelCore via anchor click (avoids navigating the page away)
      const protocol = `zel:?action=pay&coin=zelcash&address=${paymentAddress}&amount=${priceFlux}&message=${encodeURIComponent(txid)}&callback=${callbackUrl}`;
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
    } catch (err) {
      setError(err.message || 'ZelCore payment failed');
      setStatus('error');
    }
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
        Your app has been registered. Complete payment to activate deployment.
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
            <p className="text-green-400 mt-0.5">First month free</p>
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

