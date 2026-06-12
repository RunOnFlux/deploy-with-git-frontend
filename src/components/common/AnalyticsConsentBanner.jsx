import { useState } from 'react';
import { getRuntimeConfig } from '../../config/runtimeConfig';
import { setAnalyticsConsent, shouldShowAnalyticsConsent } from '../../services/analytics';

export default function AnalyticsConsentBanner() {
  const analytics = getRuntimeConfig().analytics;
  const [visible, setVisible] = useState(() => shouldShowAnalyticsConsent(analytics));

  if (!visible) return null;

  function accept() {
    setAnalyticsConsent(true);
    setVisible(false);
  }

  function decline() {
    setAnalyticsConsent(false);
    setVisible(false);
  }

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 p-4 pointer-events-none"
      role="dialog"
      aria-label="Analytics consent"
    >
      <div className="max-w-3xl mx-auto pointer-events-auto rounded-xl border border-border bg-surface shadow-lg px-4 py-3 sm:px-5 sm:py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <p className="text-xs sm:text-sm text-text-secondary flex-1">
          We use Google Analytics to understand how Orbit is used. Accept to enable anonymous usage statistics.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={decline} className="btn-secondary text-xs sm:text-sm px-3 py-1.5">
            Decline
          </button>
          <button type="button" onClick={accept} className="btn-primary text-xs sm:text-sm px-3 py-1.5">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
