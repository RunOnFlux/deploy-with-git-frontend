import { AlertTriangle } from 'lucide-react';
import { FREE_PLAN_AVAILABLE, FREE_TRIAL_AVAILABLE, FREE_TRIAL_DAYS, MONEY_BACK_DAYS } from '../../config/offer';

/**
 * Says, wherever a customer is about to pick a plan, that the introductory offers are off.
 *
 * It renders nothing while the offers are on, so the flags in src/config/offer.js are the only
 * thing to flip when they come back. Apps already on the free plan keep renewing, and the copy
 * says so: the notice is about NEW deployments only.
 */
export default function OfferPausedNotice({ className = '', rounded = false }) {
  if (FREE_TRIAL_AVAILABLE && FREE_PLAN_AVAILABLE) return null;

  const shape = rounded ? 'rounded-xl' : '';

  let heading;
  if (!FREE_TRIAL_AVAILABLE && !FREE_PLAN_AVAILABLE) {
    heading = 'The Free plan and the free trial are currently unavailable';
  } else if (!FREE_PLAN_AVAILABLE) {
    heading = 'The Free plan is currently unavailable';
  } else {
    heading = 'The free trial is currently unavailable';
  }

  return (
    <div
      className={`flex items-start gap-2.5 border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-amber-200 ${shape} ${className}`}
    >
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-medium">{heading}</p>
        <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
          {!FREE_TRIAL_AVAILABLE && (
            <>
              New deployments start on a paid plan, so the free {FREE_TRIAL_DAYS}-day trial is not
              offered at checkout for now.{' '}
            </>
          )}
          {!FREE_PLAN_AVAILABLE && (
            <>
              Apps already running on the Free plan are not affected and keep renewing as usual.{' '}
            </>
          )}
          Your {MONEY_BACK_DAYS}-day money-back guarantee still covers your first paid period.
        </p>
      </div>
    </div>
  );
}
