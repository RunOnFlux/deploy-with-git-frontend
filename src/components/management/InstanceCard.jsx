import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  RotateCcw, Play, Square, PauseCircle, PlayCircle, Trash2,
  ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, Terminal, Wrench, GitCommit,
  RefreshCcw, GitMerge, Zap,
} from 'lucide-react';
import StatusBadge from '../dashboard/StatusBadge';
import LogsPanel from './LogsPanel';
import { performNodeAction, nodeBaseUrl, fetchNodeOrbitStatus, triggerOrbitDeploy } from '../../services/managementService';
import { useAuth } from '../../context/AuthContext';

const ACTION_BUTTONS = [
  { id: 'redeploy',      label: 'Redeploy',      icon: RefreshCcw,   variant: 'secondary' },
  { id: 'hard-redeploy', label: 'Hard Redeploy',  icon: Zap,          variant: 'warning'   },
  { id: 'restart',       label: 'Restart',        icon: RotateCcw,    variant: 'secondary' },
  { id: 'start',         label: 'Start',          icon: Play,         variant: 'secondary' },
  { id: 'stop',          label: 'Stop',           icon: Square,       variant: 'secondary' },
  { id: 'pause',         label: 'Pause',          icon: PauseCircle,  variant: 'secondary' },
  { id: 'unpause',       label: 'Unpause',        icon: PlayCircle,   variant: 'secondary' },
  { id: 'remove',        label: 'Remove',         icon: Trash2,       variant: 'danger'    },
];

const LOG_TABS = [
  { id: 'build', label: 'Build Logs', icon: Wrench  },
  { id: 'app', label: 'Container Logs', icon: Terminal },
];

function mapRunningStatus(runningstatus) {
  switch (runningstatus?.toLowerCase()) {
    case 'running': return 'running';
    case 'installing': return 'installing';
    case 'stopped': return 'stopped';
    case 'paused': return 'stopped';
    default: return 'unknown';
  }
}

function variantClass(variant) {
  switch (variant) {
    case 'warning': return 'border border-warning/30 text-warning hover:bg-warning/10';
    case 'danger':  return 'border border-danger/30 text-danger hover:bg-danger/10';
    default:        return 'border border-border text-text-secondary hover:bg-surface-hover hover:text-text';
  }
}

export default function InstanceCard({ node, appName, mgmtPort, webhookSecret, branch }) {
  const { zelidauth } = useAuth();
  const [logsOpen, setLogsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('build');
  const [loadingAction, setLoadingAction] = useState(null);
  const [actionResult, setActionResult] = useState(null); // { type: 'success'|'error', msg }
  const [confirmAction, setConfirmAction] = useState(null); // id of action awaiting confirmation

  const CONFIRM_REQUIRED = new Set(['remove', 'redeploy', 'hard-redeploy', 'restart']);
  const [orbitStatus, setOrbitStatus] = useState(null);

  // Fetch per-node orbit status once on mount
  useEffect(() => {
    if (!node.ip || !mgmtPort) return;
    fetchNodeOrbitStatus(node.ip, mgmtPort)
      .then(setOrbitStatus)
      .catch(() => {});
  }, [node.ip, mgmtPort]);

  const nodeBase = nodeBaseUrl(node.ip, node.port);
  const zaStr = zelidauth
    ? new URLSearchParams({
        zelid: zelidauth.zelid,
        signature: zelidauth.signature,
        loginPhrase: zelidauth.loginPhrase,
      }).toString()
    : '';

  async function runAction(actionId) {
    if (CONFIRM_REQUIRED.has(actionId) && confirmAction !== actionId) {
      setConfirmAction(actionId);
      setConfirmRemove(false);
      return;
    }
    setConfirmAction(null);
    setLoadingAction(actionId);
    setActionResult(null);

    try {
      const result = await performNodeAction(nodeBase, actionId, appName, zaStr);
      if (result?.status === 'success') {
        const msg = result.data || `${actionId} successful`;
        toast.success(msg);
        setActionResult({ type: 'success', msg });
      } else {
        setActionResult({ type: 'error', msg: result?.data || `${actionId} failed` });
      }
    } catch (err) {
      setActionResult({ type: 'error', msg: err.message });
    } finally {
      setLoadingAction(null);
    }
  }

  async function runDeploy() {
    setLoadingAction('redeploy-orbit');
    setActionResult(null);
    try {
      const result = await triggerOrbitDeploy(node.ip, mgmtPort, webhookSecret, branch, false);
      if (result?.status === 'ok') {
        toast.success('Pull & Build triggered — checking for new commits.');
        setActionResult({ type: 'success', msg: 'Pull & Build triggered — checking for new commits.' });
      } else {
        setActionResult({ type: 'error', msg: result?.error || result?.message || 'Pull & Build failed' });
      }
    } catch (err) {
      setActionResult({ type: 'error', msg: err.message });
    } finally {
      setLoadingAction(null);
    }
  }

  const status = mapRunningStatus(node.runningstatus);

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* ── Node header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-hover">
        <div className="flex items-center gap-3">
          <StatusBadge status={status} />
          <span className="font-mono text-sm text-text">{node.ip}</span>
          {orbitStatus?.last_deployment?.commit ? (
            <span className="flex items-center gap-1 text-xs text-text-muted font-mono">
              <GitCommit className="w-3 h-3" />
              {orbitStatus.last_deployment.commit}
              {orbitStatus.last_deployment.build_status && (
                <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  orbitStatus.last_deployment.build_status === 'success'
                    ? 'bg-accent/15 text-accent'
                    : 'bg-danger/15 text-danger'
                }`}>
                  {orbitStatus.last_deployment.build_status}
                </span>
              )}
            </span>
          ) : (
            <Loader2 className="w-3 h-3 animate-spin text-text-muted" />
          )}
        </div>
        <button
          onClick={() => setLogsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text transition-colors"
        >
          {logsOpen ? (
            <><ChevronUp className="w-4 h-4" /> Hide logs</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Show logs</>
          )}
        </button>
      </div>

      {/* ── Action buttons ── */}
      <div className="px-4 py-3 flex flex-wrap gap-2">
        {/* Orbit actions */}
        <button
          onClick={() => runDeploy()}
          disabled={!!loadingAction || !mgmtPort || !webhookSecret}
          title={!webhookSecret ? 'WEBHOOK_SECRET not configured for this app' : 'Pull latest commit and build if changed'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 border border-primary/40 text-primary hover:bg-primary/10`}
        >
          {loadingAction === 'redeploy-orbit' ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GitMerge className="w-3.5 h-3.5" />
          )}
          Pull & Build
        </button>

        <div className="w-px bg-border mx-0.5 self-stretch" />

        {/* Flux node actions */}
        {ACTION_BUTTONS.map(({ id, label, icon: Icon, variant }) => {
          const isLoading = loadingAction === id;
          const isConfirm = confirmAction === id;
          const confirmLabel = id === 'remove' ? 'Confirm Remove'
            : id === 'hard-redeploy' ? 'Confirm Hard Redeploy'
            : `Confirm ${label}`;
          return (
            <React.Fragment key={id}>
              <button
                onClick={() => runAction(id)}
                disabled={!!loadingAction}
                title={isConfirm ? `Click again to confirm` : label}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${variantClass(isConfirm ? 'danger' : variant)}`}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
                {isConfirm ? confirmLabel : label}
              </button>
              {isConfirm && (
                <button
                  onClick={() => setConfirmAction(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-border text-text-muted hover:bg-surface-hover hover:text-text"
                >
                  Cancel
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Action result ── */}
      {actionResult && (
        <div className={`mx-4 mb-3 flex items-start gap-2 p-2.5 rounded-lg text-xs ${
          actionResult.type === 'success'
            ? 'bg-accent/10 border border-accent/20 text-accent'
            : 'bg-danger/10 border border-danger/20 text-danger'
        }`}>
          {actionResult.type === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          }
          <span className="break-all">{String(actionResult.msg)}</span>
        </div>
      )}

      {/* ── Log panel ── */}
      {logsOpen && (
        <div className="border-t border-border">
          {/* Tab bar */}
          <div className="flex border-b border-border bg-surface-hover">
            {LOG_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  activeTab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <LogsPanel
            key={`${node.ip}-${node.port}-${activeTab}`}
            nodeIp={node.ip}
            nodePort={node.port}
            appName={appName}
            zelidauth={zaStr}
            activeTab={activeTab}
            mgmtPort={mgmtPort}
          />
        </div>
      )}
    </div>
  );
}
