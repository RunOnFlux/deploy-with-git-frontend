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

/**
 * ── OFFERS PAUSED ───────────────────────────────────────────────────────────
 *
 * Both introductory offers are currently switched OFF, and the website says so rather than
 * hiding them: only a paying customer can register a new app.
 *
 *   FREE_TRIAL_AVAILABLE — the trial above (the "first month free" as customers still call it,
 *   now a week). While false, no registration ever asks for FREE_TRIAL_BLOCKS: every deployment
 *   registers a paid billing period and goes through checkout.
 *
 *   FREE_PLAN_AVAILABLE — the $0 plan. While false it cannot be selected for a NEW deployment.
 *   Apps ALREADY running on it are untouched: appsmonitor keeps renewing them month after month
 *   (fluxmonitormaster appsMonitor.js, isFreeOrbitPlan + isOnlyOrbitAppForOwner), which is the
 *   one part of the offer that stays on.
 *
 * The other half of this switch lives in appsmonitor: its freeOrbitApps service, which is what
 * actually pays a free registration on-chain, is off too (config.freeOffers.orbitOfferEnabled).
 * Turning either flag back on here without turning that service back on registers apps nothing
 * settles: they never install. Flip both sides together.
 */
export const FREE_TRIAL_AVAILABLE = false;

export const FREE_PLAN_AVAILABLE = false;

/**
 * Two files cannot read these flags and were edited by hand, so they need editing back when
 * the offers return: index.html (its three meta descriptions carry a comment saying what to
 * restore) and public/llms.txt (the Pricing section's note and the Free plan bullet).
 * Everything else in the app, prerender and JSON-LD included, follows the flags.
 */

/** True while either offer is off, for copy that advertised both at once. */
export const OFFERS_PAUSED = !FREE_TRIAL_AVAILABLE || !FREE_PLAN_AVAILABLE;
