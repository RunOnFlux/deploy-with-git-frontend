import { useState, useEffect, useCallback } from 'react';
import { ClockIcon, XMarkIcon } from '@heroicons/react/24/outline';

const SESSION_DURATION_MS = 90 * 60 * 1000; // 90 minutes
const WARN_BEFORE_MS = 2 * 60 * 1000; // warn at 2 minutes remaining

/**
 * Session countdown timer.
 * Shows a dismissible warning banner when < 2 minutes remain.
 * Fires onExpired() when the session time runs out.
 */
export default function SessionTimer({ onExpired }) {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const tick = useCallback(() => {
    const loginTime = localStorage.getItem('loginTime');
    if (!loginTime) return;

    const elapsed = Date.now() - parseInt(loginTime, 10);
    const remaining = Math.max(0, SESSION_DURATION_MS - elapsed);
    setSecondsLeft(Math.ceil(remaining / 1000));

    if (remaining === 0) {
      onExpired?.();
    }
  }, [onExpired]);

  useEffect(() => {
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tick]);

  if (secondsLeft === null) return null;

  const isWarning = secondsLeft <= WARN_BEFORE_MS / 1000;
  if (!isWarning || dismissed) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, '0');
  const label = mins > 0 ? `${mins}:${secs}` : `${secondsLeft}s`;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 rounded-xl px-4 py-3 shadow-lg backdrop-blur-sm max-w-sm">
      <ClockIcon className="w-5 h-5 shrink-0" />
      <p className="text-sm font-medium flex-1">
        Session expires in <span className="font-mono font-bold">{label}</span>
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 rounded-md hover:bg-yellow-500/10 transition-colors"
        aria-label="Dismiss"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
