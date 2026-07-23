const STATUS_CONFIG = {
  running: {
    label: 'Running',
    dot: 'bg-accent ',
    className: 'bg-accent/10 text-accent border-accent/20',
  },
  partial: {
    label: 'Partial',
    dot: 'bg-warning',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
  stopped: {
    label: 'Stopped',
    dot: 'bg-danger',
    className: 'bg-danger/10 text-danger border-danger/20',
  },
  installing: {
    label: 'Installing',
    dot: 'bg-primary ',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  loading: {
    label: 'Checking…',
    dot: 'bg-text-muted ',
    className: 'bg-surface-hover text-text-muted border-border',
  },
  unknown: {
    label: 'Deploying',
    dot: 'bg-text-muted ',
    className: 'bg-surface-hover text-text-muted border-border',
  },
};

export default function StatusBadge({ status = 'unknown', className = '' }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium border ${config.className} ${className}`}
    >
      <span className={`w-1.5 h-1.5 shrink-0 ${config.dot}`} />
      {config.label}
    </span>
  );
}
