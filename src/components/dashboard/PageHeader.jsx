import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * PageHeader — shared header for all dashboard pages.
 *
 * Props:
 * icon — lucide or react-icons component
 * title — string
 * subtitle — string (optional)
 * badge — ReactNode (optional, rendered right of title)
 * actions — ReactNode (optional, rendered on the right side)
 * backTo — path string (optional, renders a back arrow link)
 */
export default function PageHeader({ icon: Icon, title, subtitle, badge, actions, backTo }) {
  return (
    <div className="flex items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {backTo && (
          <Link to={backTo} className="text-text-muted hover:text-text shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        )}
        {Icon && (
          <div className="w-9 h-9 bg-surface-hover flex items-center justify-center shrink-0 border border-border/50">
            <Icon className="w-4 h-4 text-text-muted" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="font-heading text-xl font-bold text-text leading-tight">{title}</h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-xs text-text-muted mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
