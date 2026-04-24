// Soft bokeh orbs — drop inside any `relative overflow-hidden` section
export default function BokehBackground({ orbs }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {orbs.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left:      orb.x,
            top:       orb.y,
            width:     orb.size,
            height:    orb.size,
            background: orb.color,
            filter:    `blur(${orb.blur}px)`,
            opacity:   orb.opacity,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}

// ─── Per-section palettes ────────────────────────────────────────────────────

export const BOKEH_FEATURES = [
  { x: '10%',  y: '20%',  size: 420, blur: 90, opacity: 0.12, color: 'radial-gradient(circle, #818cf8, transparent)' },
  { x: '80%',  y: '60%',  size: 500, blur: 110, opacity: 0.10, color: 'radial-gradient(circle, #6366f1, transparent)' },
  { x: '50%',  y: '90%',  size: 350, blur: 80,  opacity: 0.08, color: 'radial-gradient(circle, #a78bfa, transparent)' },
];

export const BOKEH_PRICING = [
  { x: '15%',  y: '30%',  size: 460, blur: 100, opacity: 0.11, color: 'radial-gradient(circle, #06b6d4, transparent)' },
  { x: '75%',  y: '20%',  size: 380, blur: 85,  opacity: 0.10, color: 'radial-gradient(circle, #3b82f6, transparent)' },
  { x: '55%',  y: '80%',  size: 500, blur: 110, opacity: 0.09, color: 'radial-gradient(circle, #0ea5e9, transparent)' },
];

export const BOKEH_FAQ = [
  { x: '20%',  y: '50%',  size: 440, blur: 95,  opacity: 0.10, color: 'radial-gradient(circle, #10b981, transparent)' },
  { x: '70%',  y: '25%',  size: 360, blur: 80,  opacity: 0.09, color: 'radial-gradient(circle, #14b8a6, transparent)' },
  { x: '85%',  y: '75%',  size: 420, blur: 100, opacity: 0.08, color: 'radial-gradient(circle, #34d399, transparent)' },
];

export const BOKEH_CTA = [
  { x: '20%',  y: '40%',  size: 480, blur: 100, opacity: 0.12, color: 'radial-gradient(circle, #f97316, transparent)' },
  { x: '70%',  y: '60%',  size: 420, blur: 90,  opacity: 0.11, color: 'radial-gradient(circle, #fb923c, transparent)' },
  { x: '50%',  y: '10%',  size: 340, blur: 80,  opacity: 0.09, color: 'radial-gradient(circle, #fbbf24, transparent)' },
];
