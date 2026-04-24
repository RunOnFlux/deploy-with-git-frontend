import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  CreditCard, Cpu, MemoryStick, HardDrive, Server,
  Clock, AlertTriangle, CheckCircle, RefreshCw, Plus,
  ChevronRight, Zap, Box,
} from 'lucide-react';
import { useApps } from '../../hooks/useApps';
import { fetchCurrentBlock } from '../../services/appsService';
import { PLANS, BILLING_PERIODS } from '../../services/deployService';

// Flux blocks are ~2 minutes each (post-halving era)
const BLOCKS_PER_DAY = 720;

function detectPlan(app) {
  for (const p of PLANS) {
    if (p.cpu === null) continue;
    if (app.cpu === p.cpu && app.ram === p.ram && app.hdd === p.hdd) return p;
  }
  return PLANS.find((p) => p.id === 'custom');
}

function detectBillingPeriod(expireBlocks) {
  // Find the nearest matching period
  const sorted = [...BILLING_PERIODS].sort(
    (a, b) => Math.abs(a.months * 88000 - expireBlocks) - Math.abs(b.months * 88000 - expireBlocks),
  );
  return sorted[0];
}

function ExpiryBadge({ daysLeft }) {
  if (daysLeft === null) return null;
  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/25">
        <AlertTriangle className="w-3 h-3" /> Expired
      </span>
    );
  }
  if (daysLeft <= 14) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
        <AlertTriangle className="w-3 h-3" /> {daysLeft}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/25">
      <CheckCircle className="w-3 h-3" /> {daysLeft}d left
    </span>
  );
}

function PlanBadge({ plan }) {
  const colors = {
    free: 'bg-surface-hover text-text-muted border-border/40',
    standard: 'bg-primary/15 text-primary border-primary/30',
    pro: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    custom: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${colors[plan.id] ?? colors.custom}`}>
      <Zap className="w-3 h-3" /> {plan.label}
    </span>
  );
}

function AppBillingCard({ app, currentBlock }) {
  const plan = detectPlan(app);
  const period = detectBillingPeriod(app.expire);

  // expiry block = registration block + expire duration
  const expiryBlock = app.height + app.expire;
  const blocksLeft = currentBlock != null ? expiryBlock - currentBlock : null;
  const daysLeft = blocksLeft != null ? Math.floor(blocksLeft / BLOCKS_PER_DAY) : null;

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Box className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-text truncate">{app.name}</p>
            <p className="text-xs text-text-muted truncate">{app.gitRepo || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <PlanBadge plan={plan} />
          <ExpiryBadge daysLeft={daysLeft} />
        </div>
      </div>

      {/* Resource row */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { icon: Cpu, label: 'CPU', value: `${app.cpu} vCPU`, color: 'text-blue-400' },
          { icon: MemoryStick, label: 'RAM', value: `${(app.ram / 1000).toFixed(1)} GB`, color: 'text-purple-400' },
          { icon: HardDrive, label: 'SSD', value: `${app.hdd} GB`, color: 'text-amber-400' },
          { icon: Server, label: 'Nodes', value: `×${app.instances}`, color: 'text-green-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="bg-background/40 rounded-lg px-2 py-2">
            <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />
            <p className="text-xs font-semibold text-text">{value}</p>
            <p className="text-[10px] text-text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Billing period + expiry */}
      <div className="flex items-center justify-between text-xs text-text-muted border-t border-border/30 pt-3">
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {period.label} plan
          {daysLeft !== null && daysLeft >= 0 && (
            <span className="ml-1 text-text-secondary">
              · expires ~{new Date(Date.now() + daysLeft * 86400000).toLocaleDateString()}
            </span>
          )}
        </span>
        <Link
          to="/dashboard/deploy"
          className="inline-flex items-center gap-1 px-3 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-colors"
        >
          Renew <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
}

export default function Billing() {
  const { apps, loading, refresh } = useApps();
  const [currentBlock, setCurrentBlock] = useState(null);
  const [blockLoading, setBlockLoading] = useState(true);

  useEffect(() => {
    fetchCurrentBlock().then((b) => {
      setCurrentBlock(b);
      setBlockLoading(false);
    });
  }, []);

  const expiringSoon = apps.filter((a) => {
    const blocksLeft = currentBlock != null ? (a.height + a.expire) - currentBlock : null;
    return blocksLeft != null && blocksLeft / BLOCKS_PER_DAY <= 14;
  });

  return (
    <>
      <Helmet>
        <title>Billing — Orbit</title>
      </Helmet>

      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-heading text-2xl font-bold text-text">Billing</h1>
            <p className="text-text-secondary text-sm mt-0.5">
              Subscription status for your deployed apps.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { refresh(); fetchCurrentBlock().then(setCurrentBlock); }}
              disabled={loading}
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <Link to="/dashboard/deploy" className="btn-primary">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Deployment</span>
            </Link>
          </div>
        </div>

        {/* Expiring-soon alert */}
        {expiringSoon.length > 0 && (
          <div className="flex items-start gap-3 p-4 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">
                {expiringSoon.length} app{expiringSoon.length > 1 ? 's' : ''} expiring within 14 days
              </p>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Renew soon to avoid downtime —{' '}
                {expiringSoon.map((a) => a.name).join(', ')}.
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {(loading || blockLoading) && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-9 w-9 rounded-lg bg-surface-hover mb-3" />
                <div className="h-4 w-32 rounded bg-surface-hover mb-2" />
                <div className="h-3 w-48 rounded bg-surface-hover mb-4" />
                <div className="grid grid-cols-4 gap-2">
                  {[1,2,3,4].map(j => <div key={j} className="h-12 rounded-lg bg-surface-hover" />)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !blockLoading && apps.length === 0 && (
          <div className="card border-dashed flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CreditCard className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-text mb-2">No active deployments</h3>
            <p className="text-text-secondary text-sm max-w-xs mb-4">
              Deploy your first app to see billing information here.
            </p>
            <Link to="/dashboard/deploy" className="btn-primary">
              <Plus className="w-4 h-4" />
              New Deployment
            </Link>
          </div>
        )}

        {/* App cards */}
        {!loading && !blockLoading && apps.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {apps.map((app) => (
              <AppBillingCard key={app.name} app={app} currentBlock={currentBlock} />
            ))}
          </div>
        )}

        {/* Info footer */}
        {!loading && apps.length > 0 && (
          <div className="mt-8 p-4 rounded-xl bg-surface/50 border border-border/20 text-sm text-text-muted">
            <p>
              Flux apps are prepaid for a fixed period. To extend your app&apos;s life, create a new
              deployment with the same name and a fresh billing period.{' '}
              <a
                href="https://docs.runonflux.io"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Learn more →
              </a>
            </p>
          </div>
        )}
      </div>
    </>
  );
}
