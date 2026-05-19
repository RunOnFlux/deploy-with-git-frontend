import { motion } from 'framer-motion';
import {
  GitBranch, GitCommit, Cpu, HardDrive, Layers, ExternalLink,
  LayoutDashboard, Rocket, CreditCard, HelpCircle,
} from 'lucide-react';
import { FaGithub } from 'react-icons/fa';

const mockApps = [
  {
    name: 'flux-marketplace',
    status: 'running',
    repo: 'RunOnFlux/flux-marketplace',
    gitBranch: 'main',
    cpu: 2, ram: '1.0', hdd: 15, instances: 8,
    commit: 'a3f91bc',
  },
  {
    name: 'flux-api-server',
    status: 'running',
    repo: 'RunOnFlux/flux-api-server',
    gitBranch: 'production',
    cpu: 1, ram: '0.5', hdd: 10, instances: 6,
    commit: 'e72c4d1',
  },
  {
    name: 'flux-dashboard',
    status: 'installing',
    repo: 'RunOnFlux/flux-dashboard',
    gitBranch: 'feature/v2',
    cpu: 2, ram: '2.0', hdd: 20, instances: 3,
    commit: null,
  },
];

const STATUS_CONFIG = {
  running: {
    label: 'Running',
    dot: 'bg-accent animate-pulse',
    className: 'bg-accent/10 text-accent border-accent/20',
  },
  installing: {
    label: 'Installing',
    dot: 'bg-primary animate-pulse',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
};

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Overview',    active: true  },
  { icon: Rocket,          label: 'Deployments', active: false },
  { icon: CreditCard,      label: 'Billing',     active: false },
  { icon: HelpCircle,      label: 'Support',     active: false },
];

function AppShell({ minHeight }) {
  return (
    <div className="flex" style={{ minHeight }}>
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-border/30 flex flex-col bg-surface/20">
        <div className="px-4 py-4 border-b border-border/20">
          <img src="/orbit-logo.svg" alt="Orbit" style={{ height: '1.1rem', opacity: 0.7 }} />
        </div>
        <nav className="flex-1 p-2.5 space-y-0.5">
          {NAV_ITEMS.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium ${
                active ? 'bg-primary/10 text-primary' : 'text-text-secondary/50'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-border/20">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/20 shrink-0" />
            <div className="space-y-1 min-w-0">
              <div className="h-2 w-16 bg-border/40 rounded-sm" />
              <div className="h-1.5 w-10 bg-border/25 rounded-sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm font-semibold text-text">My Apps</div>
            <div className="text-xs text-text-muted mt-0.5">3 deployed</div>
          </div>
          <button className="px-3 py-1.5 border border-primary/40 text-primary text-xs font-medium rounded-lg hover:bg-primary/5 transition-colors">
            + New App
          </button>
        </div>

        {mockApps.map((app, index) => {
          const sc = STATUS_CONFIG[app.status];
          return (
            <motion.div
              key={app.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + index * 0.1 }}
              className="bg-surface/40 border border-border/40 rounded-xl p-3.5 hover:border-primary/25 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-text">{app.name}</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border shrink-0 ${sc.className}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                  {sc.label}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted mb-2.5">
                <FaGithub className="w-3 h-3 shrink-0" />
                <span className="truncate">{app.repo}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-text-muted mb-2.5">
                <span className="flex items-center gap-1"><Cpu className="w-3 h-3" />{app.cpu} vCPU</span>
                <span className="flex items-center gap-1"><Layers className="w-3 h-3" />{app.ram} GB</span>
                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{app.hdd} GB</span>
                <span className="ml-auto">×{app.instances} nodes</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-text-muted">
                <div className="flex items-center gap-2">
                  {app.commit && (
                    <>
                      <span className="flex items-center gap-1 font-mono">
                        <GitCommit className="w-3 h-3" />{app.commit}
                      </span>
                      <span className="text-border">·</span>
                    </>
                  )}
                  <span className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />{app.gitBranch}
                  </span>
                </div>
                <span className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer">
                  Manage <ExternalLink className="w-3 h-3" />
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export default function DashboardPreview({ frameless = false }) {
  if (frameless) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="relative w-full"
      >
        <div className="relative bg-background rounded-2xl border border-border/50 shadow-2xl overflow-hidden">
          <AppShell minHeight={400} />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3 pointer-events-none" />
        </div>
        <div className="absolute -inset-6 bg-gradient-to-br from-primary/10 via-transparent to-accent/8 blur-3xl -z-10 opacity-60" />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="relative w-full"
    >
      {/* Browser frame */}
      <div className="relative bg-background rounded-2xl border border-border/50 shadow-2xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-3 px-4 py-3 bg-surface/60 border-b border-border/40">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <div className="flex-1 flex justify-center">
            <div className="px-4 py-1 bg-background/70 border border-border/30 rounded-md text-xs text-text-muted font-mono">
              orbit/dashboard
            </div>
          </div>
        </div>

        <AppShell minHeight={400} />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3 pointer-events-none" />
      </div>

      {/* Glow */}
      <div className="absolute -inset-6 bg-gradient-to-br from-primary/10 via-transparent to-accent/8 blur-3xl -z-10 opacity-60" />
    </motion.div>
  );
}
