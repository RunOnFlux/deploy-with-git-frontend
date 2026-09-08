/**
 * The introductory offer, in one place.
 *
 * A customer new to Flux Cloud gets one free trial per ACCOUNT (not per app, not per repo) on
 * a PAID plan. The trial takes no card: the app is registered on-chain for exactly the trial
 * length and paid for by us, and when it runs out the app expires unless the customer renews.
 * Anyone who prefers to skip the trial and pay from day one can, at any billing period.
 *
 * THE FREE PLAN IS NOT THIS. It is free for as long as it stays the owner's only Orbit app:
 * it registers a normal month and appsmonitor renews it, month after month, for good
 * (fluxmonitormaster appsMonitor.js, isFreeOrbitPlan + isOnlyOrbitAppForOwner). Nothing in
 * this file applies to it, and shortening its grant would turn "free forever" into a week.
 *
 * FREE_TRIAL_BLOCKS is a contract with appsmonitor's freeOrbitApps service, which pays a
 * paid-plan registration on-chain only when `expire` is one of the grants it knows about.
 * Change one side and the trial silently stops being paid for: the app registers, nothing
 * settles, and it never installs.
 *
 * Blocks are 30s since the PON fork, so a day is 2880 blocks.
 */
export const FREE_TRIAL_DAYS = 7;

export const FREE_TRIAL_BLOCKS = FREE_TRIAL_DAYS * 2880; // 20160

/** Money-back guarantee on the first PAID period, trial or no trial. */
export const MONEY_BACK_DAYS = 30;
