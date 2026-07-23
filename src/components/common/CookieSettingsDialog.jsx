import { useState, useEffect } from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { getAnalyticsConsent, setAnalyticsConsent } from '../../services/analytics';

/**
 * Cookie Settings dialog — lets users view and change their analytics consent
 * after the initial banner has been dismissed. Wired into the existing
 * analytics consent service (setAnalyticsConsent dispatches the event that
 * loads/holds GA), so there's no inline gtag duplication here.
 */
export default function CookieSettingsDialog({ isOpen, onClose }) {
  // null = not yet chosen, 'granted' | 'denied' otherwise
  const [consent, setConsent] = useState(null);

  // Sync local state with the stored choice each time the dialog opens
  useEffect(() => {
    if (isOpen) setConsent(getAnalyticsConsent());
  }, [isOpen]);

  if (!isOpen) return null;

  function handleSave() {
    if (consent === 'granted') setAnalyticsConsent(true);
    else if (consent === 'denied') setAnalyticsConsent(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Cookie settings"
    >
      <div className="relative w-full max-w-md bg-surface border border-border/50 shadow-2xl p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-text-muted hover:text-text hover:bg-surface-hover "
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <h2 className="font-heading text-lg font-semibold text-text">Cookie Settings</h2>
          <p className="text-sm text-text-muted mt-0.5">Manage your tracking preferences.</p>
        </div>

        {/* Categories */}
        <div className="space-y-3 mb-6">
          {/* Essential — always on */}
          <div className=" border border-border/40 bg-background/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-text">Essential Cookies</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Required for authentication and core functionality. Always enabled.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-primary shrink-0">
                <ShieldCheck className="w-4 h-4" />
                Always on
              </div>
            </div>
          </div>

          {/* Analytics — toggleable */}
          <div className=" border border-border/40 bg-background/40 p-4">
            <div className="min-w-0 mb-3">
              <h3 className="text-sm font-medium text-text">Analytics</h3>
              <p className="text-xs text-text-muted mt-0.5">
                Google Analytics helps us understand how Orbit is used so we can improve it.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConsent('granted')}
                aria-pressed={consent === 'granted'}
                className={`flex-1 px-4 py-2 text-sm font-medium ${
                  consent === 'granted'
                    ? 'bg-primary/10 border border-primary/50 text-primary ring-1 ring-primary/20'
                    : 'bg-background/40 border border-border/40 text-text-secondary hover:border-border/70'
                }`}
              >
                Allow
              </button>
              <button
                type="button"
                onClick={() => setConsent('denied')}
                aria-pressed={consent === 'denied'}
                className={`flex-1 px-4 py-2 text-sm font-medium ${
                  consent === 'denied'
                    ? 'bg-red-500/10 border border-red-500/50 text-red-400 ring-1 ring-red-500/20'
                    : 'bg-background/40 border border-border/40 text-text-secondary hover:border-border/70'
                }`}
              >
                Deny
              </button>
            </div>
            <p className="text-xs text-text-muted text-center mt-3">
              Current:{' '}
              <span className={consent === 'granted' ? 'text-primary' : consent === 'denied' ? 'text-red-400' : 'text-text-muted'}>
                {consent === 'granted' ? 'Analytics enabled' : consent === 'denied' ? 'Analytics disabled' : 'Not set'}
              </span>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="button" onClick={handleSave} className="btn-primary flex-1">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
