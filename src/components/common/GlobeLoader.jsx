import { useEffect, useRef } from 'react';

const S  = 120;           // canvas logical px
const CX = S / 2;
const CY = S / 2;

const ORBITS = [
  { r: 26, speed: 1.7,  color: '#22d3ee', start: 0 },
  { r: 37, speed: 1.15, color: '#a78bfa', start: Math.PI * 0.8 },
  { r: 48, speed: 0.72, color: '#818cf8', start: Math.PI * 1.6 },
];

const TRAIL_STEPS = 36;
const TRAIL_ARC   = Math.PI * 1.15;   // ~207°  of trail behind each dot

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

export default function GlobeLoader() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = S * dpr;
    canvas.height = S * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const angles = ORBITS.map(o => o.start);
    let last = null, lastDraw = null, raf;
    const FRAME_MS = 1000 / 30; // cap at 30fps

    const frame = (ts) => {
      if (last != null) {
        const dt = (ts - last) / 1000;
        ORBITS.forEach((o, i) => { angles[i] += o.speed * dt; });
      }
      last = ts;

      // Skip rendering if under 30fps budget
      if (lastDraw != null && ts - lastDraw < FRAME_MS) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = ts;
      ctx.clearRect(0, 0, S, S);

      // ── globe ───────────────────────────────────────────────────
      const GLOBE_R = 15;

      // atmosphere halo
      const halo = ctx.createRadialGradient(CX, CY, GLOBE_R - 2, CX, CY, GLOBE_R + 7);
      halo.addColorStop(0, 'rgba(34,211,238,0.25)');
      halo.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.beginPath();
      ctx.arc(CX, CY, GLOBE_R + 7, 0, 2 * Math.PI);
      ctx.fillStyle = halo;
      ctx.fill();

      // globe body
      ctx.beginPath();
      ctx.arc(CX, CY, GLOBE_R, 0, 2 * Math.PI);
      ctx.fillStyle = '#080c18';
      ctx.fill();
      ctx.strokeStyle = 'rgba(34,211,238,0.7)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // top-down grid: concentric latitude rings + radial meridians
      for (const lr of [5, 10]) {
        ctx.beginPath();
        ctx.arc(CX, CY, lr, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(34,211,238,0.18)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.moveTo(CX + GLOBE_R * Math.cos(a), CY + GLOBE_R * Math.sin(a));
        ctx.lineTo(CX - GLOBE_R * Math.cos(a), CY - GLOBE_R * Math.sin(a));
        ctx.strokeStyle = 'rgba(34,211,238,0.18)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // ── orbits + trails + dots ──────────────────────────────────
      ORBITS.forEach(({ r, color }, i) => {
        const angle = angles[i];

        // dotted orbit path
        ctx.beginPath();
        ctx.arc(CX, CY, r, 0, 2 * Math.PI);
        ctx.strokeStyle = hexAlpha(color, 0.20);
        ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // comet trail (individual dots, quadratic fade)
        for (let j = 0; j < TRAIL_STEPS; j++) {
          const p = j / (TRAIL_STEPS - 1);           // 0=tail, 1=head
          const trailA = angle - TRAIL_ARC * (1 - p);
          const tx = CX + r * Math.cos(trailA);
          const ty = CY + r * Math.sin(trailA);
          const alpha  = p * p * 0.85;
          const radius = 0.8 + p * 2.2;
          ctx.beginPath();
          ctx.arc(tx, ty, radius, 0, 2 * Math.PI);
          ctx.fillStyle = hexAlpha(color, alpha);
          ctx.fill();
        }

        // dot glow
        const x = CX + r * Math.cos(angle);
        const y = CY + r * Math.sin(angle);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 9);
        glow.addColorStop(0, hexAlpha(color, 0.55));
        glow.addColorStop(1, hexAlpha(color, 0));
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, 2 * Math.PI);
        ctx.fillStyle = glow;
        ctx.fill();

        // dot core
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
      });

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-5">
      <canvas ref={ref} style={{ width: S, height: S }} aria-hidden="true" />
      <div className="text-center">
        <p className="font-heading font-bold text-text tracking-widest uppercase text-sm">Orbit</p>
        <p className="text-text-muted text-xs mt-1">Loading…</p>
      </div>
    </div>
  );
}
