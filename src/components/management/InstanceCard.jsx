import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  RotateCcw, Play, Square, PauseCircle, PlayCircle, Trash2,
  ChevronDown, ChevronUp, Loader2, AlertCircle, CheckCircle2, Terminal, Wrench, GitCommit,
  RefreshCcw, GitMerge, Zap, ScrollText, Database, Server,
} from 'lucide-react';
import StatusBadge from '../dashboard/StatusBadge';
import LogsPanel from './LogsPanel';
import { performNodeAction, nodeBaseUrl, fetchNodeOrbitStatus, triggerOrbitDeploy } from '../../services/managementService';
import { useAuth } from '../../context/AuthContext';
import { REDIS_ADDON, isDatabaseCompose } from '../../services/databaseSpec';

const ACTION_BUTTONS = [
  { id: 'redeploy', label: 'Redeploy', icon: RefreshCcw, variant: 'secondary' },
  { id: 'hard-redeploy', label: 'Hard Redeploy', icon: Zap, variant: 'warning' },
  { id: 'restart', label: 'Restart', icon: RotateCcw, variant: 'secondary' },
  { id: 'start', label: 'Start', icon: Play, variant: 'secondary' },
  { id: 'stop', label: 'Stop', icon: Square, variant: 'secondary' },
  { id: 'pause', label: 'Pause', icon: PauseCircle, variant: 'secondary' },
  { id: 'unpause', label: 'Unpause', icon: PlayCircle, variant: 'secondary' },
  { id: 'remove', label: 'Remove', icon: Trash2, variant: 'danger' },
];

const LOG_TABS = [
  { id: 'build', label: 'Build Logs', icon: Wrench },
  { id: 'orbit-app', label: 'App Logs', icon: ScrollText },
  { id: 'app', label: 'Container Logs', icon: Terminal },
];

function getAddonLogTabs(spec, appName) {
  return (spec?.compose ?? [])
    .slice(1)
    .map((compose, offset) => {
      const index = offset + 1;
      const image = String(compose?.repotag ?? '').toLowerCase();
      const name = String(compose?.name ?? '').toLowerCase();
      const isDb = isDatabaseCompose(compose);
      const isRedis =
        image === REDIS_ADDON.image.toLowerCase() ||
        image.includes('flux-redis-cluster') ||
        name === 'redis';
      if (!isDb && !isRedis) return null;

      const componentName = compose?.name;
      if (!componentName) return null;

      return {
        id: `${isRedis ? 'redis' : 'db'}-${index}`,
        label: isRedis ? 'Redis Logs' : 'DB Logs',
        icon: isRedis ? Server : Database,
        container: `${componentName}_${appName}`,
        downloadName: `${appName}-${componentName}`,
      };
    })
    .filter(Boolean);
}

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
    case 'danger': return 'border border-danger/30 text-danger hover:bg-danger/10';
    default: return 'border border-border text-text-secondary hover:bg-surface-hover hover:text-text';
  }
}

export default function InstanceCard({ node, appName, spec, mgmtPort, webhookSecret, branch, apiKey }) {
  const { zelidauth } = useAuth();
  const [logsOpen, setLogsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('build');
  const [loadingAction, setLoadingAction] = useState(null);
  const [actionResult, setActionResult] = useState(null); // { type: 'success'|'error', msg }
  const [progressMsg, setProgressMsg] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // id of action awaiting confirmation

  const CONFIRM_REQUIRED = new Set(['remove', 'redeploy', 'hard-redeploy', 'restart']);
  const [orbitStatus, setOrbitStatus] = useState(null);

  // Fetch per-node orbit status once on mount
  useEffect(() => {
    if (!node.ip || !mgmtPort) return;
    fetchNodeOrbitStatus(node.ip, mgmtPort, apiKey)
      .then(setOrbitStatus)
      .catch(() => {});
  }, [node.ip, mgmtPort, apiKey]);

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
      return;
    }
    setConfirmAction(null);
    setLoadingAction(actionId);
    setActionResult(null);
    setProgressMsg(null);

    try {
      const result = await performNodeAction(nodeBase, actionId, appName, zaStr, setProgressMsg);
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
      setProgressMsg(null);
    }
  }

  async function runDeploy() {
    setLoadingAction('redeploy-orbit');
    setActionResult(null);
    try {
      const result = await triggerOrbitDeploy(node.ip, mgmtPort, webhookSecret, branch, false, apiKey);
      if (result?.status === 'ok') {
        toast.success('Pull & Build triggered. Checking for new commits.');
        setActionResult({ type: 'success', msg: 'Pull & Build triggered. Checking for new commits.' });
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
  const addonLogTabs = getAddonLogTabs(spec, appName);
  const logTabs = [...LOG_TABS, ...addonLogTabs];
  const selectedAddonLog = addonLogTabs.find((tab) => tab.id === activeTab);

  return (
    <div className="border border-border overflow-hidden">
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
                <span className={`ml-1 px-1.5 py-0.5 text-[10px] font-medium ${
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
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text "
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
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-40 border border-primary/40 text-primary hover:bg-primary/10`}
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
        {ACTION_BUTTONS.map(({ id, label, icon, variant }) => {
          const Icon = icon;
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
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${variantClass(isConfirm ? 'danger' : variant)}`}
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border text-text-muted hover:bg-surface-hover hover:text-text"
                >
                  Cancel
                </button>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Action result / progress ── */}
      {(progressMsg || actionResult) && (
        <div className={`mx-4 mb-3 flex items-start gap-2 p-2.5 text-xs ${
          progressMsg
            ? 'bg-surface-hover border border-border text-text-muted'
            : actionResult.type === 'success'
              ? 'bg-accent/10 border border-accent/20 text-accent'
              : 'bg-danger/10 border border-danger/20 text-danger'
        }`}>
          {progressMsg
            ? <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-spin" />
            : actionResult.type === 'success'
              ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              : <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          }
          <span className="break-all">{progressMsg ?? String(actionResult.msg)}</span>
        </div>
      )}

      {/* ── Log panel ── */}
      {logsOpen && (
        <div className="border-t border-border">
          {/* Tab bar */}
          <div className="flex border-b border-border bg-surface-hover">
            {logTabs.map(({ id, label, icon }) => {
              const Icon = icon;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 ${
                    activeTab === id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-text-muted hover:text-text'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          <LogsPanel
            key={`${node.ip}-${node.port}-${activeTab}`}
            nodeIp={node.ip}
            nodePort={node.port}
            appName={appName}
            zelidauth={zaStr}
            activeTab={activeTab}
            mgmtPort={mgmtPort}
            apiKey={apiKey}
            addonLog={selectedAddonLog}
          />
        </div>
      )}
    </div>
  );
}
