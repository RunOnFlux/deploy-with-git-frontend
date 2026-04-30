import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Copy, Check, ExternalLink, Terminal, Clock } from 'lucide-react';
import { getPaymentAddress, pollDeployment } from '../../services/deployService';

const DEPLOY_PHASES = [
  { label: 'Waiting for blockchain confirmation' },
  { label: 'Confirmed on blockchain' },
  { label: 'Deployment complete!' },
];

function LogLine({ log }) {
  const isError = log.status === 'error';
  return (
    <div className={`text-xs font-mono leading-relaxed ${isError ? 'text-red-400' : 'text-text-secondary'}`}>
      {typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}
    </div>
  );
}

export default function DeploymentTracker({
  appName,
  txid,
  zelidauth,
  buildLogs,
  buildLogsComplete,
  priceFlux,
  priceUsd,
}) {
  const [paymentAddress, setPaymentAddress] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(true);
  const [deployPhase, setDeployPhase] = useState(0);
  const [deployMessage, setDeployMessage] = useState('');
  const [deployError, setDeployError] = useState('');
  const [copied, setCopied] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);
  const stopPollRef = useRef(null);
  const logsEndRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [buildLogs]);

  useEffect(() => {
    // Fetch payment address
    getPaymentAddress(zelidauth)
      .then(setPaymentAddress)
      .catch(() => setPaymentAddress(null))
      .finally(() => setPaymentLoading(false));

    // Start deployment polling (public GET endpoints — no zelidauth needed)
    stopPollRef.current = pollDeployment(appName, txid, {
      // Advance past the completed phase so it shows as ✅, not spinning
      onPhase: (p) => setDeployPhase(p + 1),
      onSuccess: () => {
        setDeployPhase(DEPLOY_PHASES.length);
        // Navigate to the manage page after a brief pause so the user sees the success state
        setTimeout(() => {
          navigate(`/dashboard/deployments/${encodeURIComponent(appName)}`);
        }, 2500);
      },
      onError: (err) => {
        setDeployError(err.message);
      },
    });

    return () => stopPollRef.current?.();
  }, []);

  function copyAddress() {
    if (!paymentAddress) return;
    navigator.clipboard.writeText(paymentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // isDeployed only when all phases have completed (onSuccess sets deployPhase to DEPLOY_PHASES.length)
  const isDeployed = deployPhase >= DEPLOY_PHASES.length;
  const appUrl = `https://${appName.toLowerCase()}.app.runonflux.io`;

  return (
    <div className="space-y-4 mt-4">
      {/* Registration success header */}
      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
          <span className="font-medium text-green-400">App registered successfully!</span>
        </div>
        {txid && (
          <p className="text-xs text-text-muted font-mono break-all mt-1">TX: {txid}</p>
        )}
      </div>

      {/* Payment info */}
      <div className="p-4 rounded-lg bg-surface border border-border">
        <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-muted" />
          Payment Info
        </h3>
        {paymentLoading ? (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading payment details…
          </div>
        ) : paymentAddress ? (
          <div className="space-y-2">
            <p className="text-xs text-text-muted mb-2">
              Send FLUX to this address to fund your deployment. The first month is <span className="text-green-400 font-medium">free for new apps</span>.
            </p>
            {(priceFlux != null || priceUsd != null) && (
              <div className="flex items-center gap-3 px-2.5 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm mb-1">
                <span className="text-text-muted text-xs">Amount:</span>
                {priceFlux != null && (
                  <span className="font-semibold text-text">{priceFlux} <span className="text-xs text-text-muted">FLUX</span></span>
                )}
                {priceFlux != null && priceUsd != null && (
                  <span className="text-text-muted text-xs">≈</span>
                )}
                {priceUsd != null && (
                  <span className="text-xs text-text-muted">${priceUsd} USD</span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-hover border border-border">
              <span className="text-xs font-mono text-text-secondary flex-1 break-all select-all">
                {paymentAddress}
              </span>
              <button
                onClick={copyAddress}
                className="shrink-0 p-1.5 rounded hover:bg-border transition-colors"
                title="Copy address"
              >
                {copied
                  ? <Check className="w-3.5 h-3.5 text-green-400" />
                  : <Copy className="w-3.5 h-3.5 text-text-muted" />}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Payment address unavailable. Check the Flux dashboard.</p>
        )}
      </div>

      {/* Deployment status */}
      <div className="p-4 rounded-lg bg-surface border border-border">
        <h3 className="text-sm font-semibold text-text mb-3">Deployment Status</h3>
        <div className="space-y-2.5">
          {DEPLOY_PHASES.map((p, i) => {
            const isDone = deployPhase > i;
            const isCurrent = deployPhase === i;
            const isPending = deployPhase < i;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 text-sm ${isPending ? 'opacity-40' : ''}`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-border shrink-0" />
                )}
                <span
                  className={
                    isDone
                      ? 'text-text-secondary line-through'
                      : isCurrent
                      ? 'text-text font-medium'
                      : 'text-text-muted'
                  }
                >
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>
        {deployError && (
          <p className="text-xs text-amber-400 mt-3 flex items-start gap-1">
            <span className="shrink-0">⚠</span>
            {deployError}
          </p>
        )}
        {!isDeployed && (
          <p className="text-xs text-text-muted mt-3">
            Checking every 10 seconds. Blockchain confirmation typically takes 5–15 minutes.
          </p>
        )}
      </div>

      {/* Live when deployed */}
      {isDeployed && (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <h3 className="text-sm font-semibold text-green-400 mb-2">🎉 Your app is live!</h3>
          <a
            href={appUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            {appUrl}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Build logs (collapsible) */}
      {buildLogs.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setLogsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-surface hover:bg-surface-hover text-sm text-text-muted transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5" />
              <span>Build logs</span>
              {!buildLogsComplete && (
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
              )}
              {buildLogsComplete && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">done</span>
              )}
            </div>
            <span className="text-xs">{logsOpen ? '▲ collapse' : '▼ expand'}</span>
          </button>
          {logsOpen && (
            <div className="bg-black/30 p-3 max-h-64 overflow-y-auto space-y-0.5">
              {buildLogs.map((log, i) => (
                <LogLine key={i} log={log} />
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
