/**
 * Customer reviews — the single source of truth for schema.org AggregateRating /
 * Review structured data on the Orbit homepage.
 *
 * ┌─ IMPORTANT ─────────────────────────────────────────────────────────────┐
 * │ This array is EMPTY by design. Google's rating-snippet guidelines forbid │
 * │ marking up ratings that aren't genuine, and self-serving / invented      │
 * │ reviews are a manual-action risk. So the SEO pipeline emits AggregateRating│
 * │ and Review JSON-LD ONLY when this array actually contains real reviews.   │
 * │ While it is empty, NO rating markup is emitted at all — never ship fake   │
 * │ data here just to light up stars.                                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * HOW TO POPULATE (once you have real, verifiable reviews):
 *   1. Add one object per review to REVIEWS below, using this shape:
 *        {
 *          author: 'Jane Developer',        // real person or org name
 *          rating: 5,                        // integer/number 1..RATING_BEST
 *          body: 'Deployed our Django app…', // the reviewer's actual words
 *          datePublished: '2026-03-14',      // ISO 8601 (YYYY-MM-DD)
 *        }
 *   2. Only include reviews you can substantiate (e.g. from a public source such
 *      as G2, Trustpilot, Capterra, or collected first-party with consent).
 *   3. That's it — buildSeoContent.mjs (buildJsonLd) automatically computes the
 *      AggregateRating (average + count) and emits each Review on the homepage
 *      SoftwareApplication node. Rebuild (`npm run build`) to regenerate the HTML.
 *
 * Consumed by scripts/buildSeoContent.mjs (build-time JSON-LD). Keeping the data
 * here means the rating markup can never drift from a component copy.
 */

/** Best possible rating on the scale used by every review object above. */
export const RATING_BEST = 5;

/**
 * Real customer reviews. EMPTY BY DEFAULT — see the file header. Populate only
 * with genuine, verifiable reviews. While empty, no rating JSON-LD is emitted.
 * @type {Array<{ author: string, rating: number, body: string, datePublished: string }>}
 */
export const REVIEWS = [];
