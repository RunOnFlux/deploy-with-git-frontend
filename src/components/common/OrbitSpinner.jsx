/**
 * OrbitSpinner — mimics the "O" glyph from the Orbit logo:
 *   • outer partial arc (≈300° visible, ~60° gap at top-right) — matches the C-like
 *     open ring of the logo's O
 *   • small filled dot at center — matches the inner circle of the logo's O
 *   • ratio: inner dot ≈ 23% of outer ring radius (same as in the SVG artwork)
 *
 * Uses currentColor so it inherits text color from the parent.
 * Spins via the `orbit-spin` CSS keyframe defined in index.css.
 */
export default function OrbitSpinner({ size = 64, className = '' }) {
  const cx = size / 2;
  const cy = size / 2;
  const ringR = size * 0.40;          // outer ring radius
  const dotR  = size * 0.13;          // inner dot radius (bigger)
  const strokeW = size * 0.115;       // ring stroke width (thicker)

  // strokeDasharray trick: show 300° (5/6 of circumference), hide remaining 60°
  const circ   = 2 * Math.PI * ringR;
  const visArc = circ * (300 / 360);
  const gapArc = circ - visArc;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      className={className}
      style={{ animation: 'orbit-spin 1.1s linear infinite', display: 'block' }}
    >
      {/* outer partial ring — the C-shape of the O */}
      <circle
        cx={cx}
        cy={cy}
        r={ringR}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={`${visArc} ${gapArc}`}
        /* rotate -90° so the gap sits at top-right, matching the logo's open */
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* inner filled dot */}
      <circle cx={cx} cy={cy} r={dotR} fill="currentColor" />
    </svg>
  );
}
