import { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, GitBranch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import LoginModal from '../auth/LoginModal';
import { useAuth } from '../../context/AuthContext';
import {
  SiNextdotjs, SiReact, SiDjango, SiFastapi, SiNestjs, SiVuedotjs,
  SiRemix, SiAstro, SiRubyonrails, SiLaravel, SiGo, SiRust,
  SiSpring, SiSvelte, SiFlask, SiNuxt, SiHono, SiBlazor,
} from 'react-icons/si';

import { geoGraticule } from 'd3-geo';
import { feature } from 'topojson-client';
import worldTopo from 'world-atlas/countries-50m.json';
import {
  WebGLRenderer, Scene, Group, Mesh, LineSegments,
  OrthographicCamera, SphereGeometry, BufferGeometry,
  ShaderMaterial, Float32BufferAttribute,
} from 'three';

// Pre-process GeoJSON once at module load (geometry never changes)
const COUNTRIES = feature(worldTopo, worldTopo.objects.countries);
const GRATICULE = geoGraticule().step([20, 20])();

// ---------------------------------------------------------------------------
// Helpers — convert GeoJSON → flat Float32 vertex arrays for Three.js
// ---------------------------------------------------------------------------
function lonLatToVec3(lon, lat, r) {
  const phi   = (90 - lat) * Math.PI / 180;
  const theta = lon * Math.PI / 180;
  return [
    r * Math.sin(phi) * Math.sin(theta),  // x: lon=90°E → +X (East = right)
    r * Math.cos(phi),                     // y: north pole → +Y
    r * Math.sin(phi) * Math.cos(theta),  // z: lon=0° → +Z (faces camera)
  ];
}

function pushRing(ring, r, out) {
  for (let i = 0; i < ring.length - 1; i++) {
    if (Math.abs(ring[i + 1][0] - ring[i][0]) > 180) continue; // skip antimeridian seam
    out.push(...lonLatToVec3(ring[i][0],     ring[i][1],     r));
    out.push(...lonLatToVec3(ring[i + 1][0], ring[i + 1][1], r));
  }
}

function geojsonToPositions(geojson, r) {
  const pos  = [];
  const geoms = geojson.features ? geojson.features.map(f => f.geometry) : [geojson];
  for (const g of geoms) {
    if (!g) continue;
    if      (g.type === 'LineString')      pushRing(g.coordinates, r, pos);
    else if (g.type === 'MultiLineString') g.coordinates.forEach(c => pushRing(c, r, pos));
    else if (g.type === 'Polygon')         g.coordinates.forEach(c => pushRing(c, r, pos));
    else if (g.type === 'MultiPolygon')    g.coordinates.forEach(p => p.forEach(c => pushRing(c, r, pos)));
  }
  return pos;
}

// ---------------------------------------------------------------------------
// Wireframe Earth Globe — WebGL via Three.js, d3-geo geometry data
// ---------------------------------------------------------------------------
function WireframeGlobe({ paused }) {
  const canvasRef   = useRef(null);
  const clustersRef = useRef([]);

  // Fetch live Flux node geolocations → density-binned clusters
  useEffect(() => {
    let alive = true;
    fetch('https://stats.runonflux.io/fluxinfo?projection=geolocation')
      .then(r => r.json())
      .then(({ data }) => {
        if (!alive) return;
        const BIN = 1, bins = new Map();
        for (const n of data) {
          const g = n.geolocation;
          if (g?.lat == null || g?.lon == null) continue;
          const bLon = Math.round(g.lon / BIN) * BIN;
          const bLat = Math.round(g.lat / BIN) * BIN;
          const key  = `${bLon},${bLat}`;
          bins.set(key, bins.get(key) ?? { lon: bLon, lat: bLat, count: 0 });
          bins.get(key).count++;
        }
        const cells    = Array.from(bins.values());
        const maxCount = Math.max(...cells.map(c => c.count));
        clustersRef.current = cells.map(({ lon, lat, count }) => ({
          lon: lon + (Math.random() - 0.5),
          lat: lat + (Math.random() - 0.5),
          h: 15 + Math.sqrt(count / maxCount) * 45,
        }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Build and animate the Three.js WebGL scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || paused) return;

    const SIZE   = 900;
    const RADIUS = SIZE * 0.43;
    const dpr    = Math.min(window.devicePixelRatio || 1, 2);

    // Renderer ──────────────────────────────────────────────────────────────
    const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);

    // Scene + orthographic camera positioned 10° above the equatorial plane,
    // always aimed at the globe centre — gives a natural "looking down" perspective.
    const scene  = new Scene();
    const half   = SIZE / 2;
    const camera = new OrthographicCamera(-half, half, half, -half, 1, 2000);
    const ELEV   = 10 * Math.PI / 180;
    const DIST   = 1000;
    camera.position.set(0, DIST * Math.sin(ELEV), DIST * Math.cos(ELEV));
    camera.lookAt(0, 0, 0);

    // rotation.y = +30° starts with lon = -30° (30°W, mid-Atlantic) facing the camera
    const globe = new Group();
    globe.rotation.y = 30 * Math.PI / 180;
    scene.add(globe);

    // Shared GLSL snippet: discard fragments on the back hemisphere.
    // The interpolated world-space Z of a line vertex goes negative the moment
    // that part of the geometry is behind the globe centre from the camera (+Z).
    const BACK_DISCARD = `if (vWorldZ < 0.0) discard;`;

    // Reusable vertex shader that passes world-space Z to the fragment stage
    const vsWorldZ = `
      varying float vWorldZ;
      void main() {
        vWorldZ = (modelMatrix * vec4(position, 1.0)).z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    // 1. Globe sphere — opaque so it renders in the opaque pass first, writes
    //    depth cleanly, and lets transparent lines render on top without artifacts.
    globe.add(new Mesh(
      new SphereGeometry(RADIUS, 64, 64),
      new ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            vec3 light = normalize(vec3(-0.25, 0.25, 1.0));
            float d    = clamp(dot(vNormal, light) * 0.5 + 0.5, 0.0, 1.0);
            vec4 dark  = vec4(0.008, 0.006, 0.045, 1.0);
            vec4 lite  = vec4(0.055, 0.045, 0.16, 1.0);
            gl_FragColor = mix(dark, lite, d);
          }
        `,
      }),
    ));


    const LINE_R = RADIUS + 0.5;

    // 2. Graticule grid lines (every 20°) — back hemisphere clipped in shader
    const gratGeo = new BufferGeometry();
    gratGeo.setAttribute('position', new Float32BufferAttribute(geojsonToPositions(GRATICULE, LINE_R), 3));
    globe.add(new LineSegments(
      gratGeo,
      new ShaderMaterial({
        transparent: true,
        depthWrite:  false,
        vertexShader: vsWorldZ,
        fragmentShader: `
          varying float vWorldZ;
          void main() {
            ${BACK_DISCARD}
            gl_FragColor = vec4(0.353, 0.353, 0.784, 0.18);
          }
        `,
      }),
    ));

    // 3. Country / continent outlines — same clipping
    const countryGeo = new BufferGeometry();
    countryGeo.setAttribute('position', new Float32BufferAttribute(geojsonToPositions(COUNTRIES, LINE_R), 3));
    globe.add(new LineSegments(
      countryGeo,
      new ShaderMaterial({
        transparent: true,
        depthWrite:  false,
        vertexShader: vsWorldZ,
        fragmentShader: `
          varying float vWorldZ;
          void main() {
            ${BACK_DISCARD}
            gl_FragColor = vec4(0.549, 0.549, 1.0, 0.75);
          }
        `,
      }),
    ));

    // 4. Density bars — gradient white (base) → light-blue (tip).
    //    No worldZ discard here: the opaque sphere writes depth, so depth-testing
    //    naturally hides bar segments behind the sphere surface while still
    //    showing tips that protrude above the silhouette at the limb.
    const barsMat = new ShaderMaterial({
      transparent: true,
      depthWrite:  false,
      vertexShader: `
        attribute float aT;
        varying float vT;
        void main() {
          vT          = aT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying float vT;
        void main() {
          vec3 base = vec3(1.0, 1.0, 1.0);
          vec3 tip  = vec3(0.47, 0.78, 1.0);
          gl_FragColor = vec4(mix(tip, base, vT), vT * 0.9);
        }
      `,
    });
    const barsGeo  = new BufferGeometry();
    // Initialise with empty attributes so Three.js doesn't warn on first render
    barsGeo.setAttribute('position', new Float32BufferAttribute([], 3));
    barsGeo.setAttribute('aT',       new Float32BufferAttribute([], 1));
    const barsMesh = new LineSegments(barsGeo, barsMat);
    barsMesh.renderOrder = 3;
    globe.add(barsMesh);

    let lastClustersLen = -1;
    function rebuildBars() {
      const clusters = clustersRef.current;
      const pos = [], ts = [];
      for (const { lon, lat, h } of clusters) {
        pos.push(...lonLatToVec3(lon, lat, LINE_R));
        pos.push(...lonLatToVec3(lon, lat, LINE_R + h));
        ts.push(1.0, 0.0); // base white, tip fades
      }
      barsGeo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      barsGeo.setAttribute('aT',       new Float32BufferAttribute(ts,  1));
      barsGeo.computeBoundingSphere();
      lastClustersLen = clusters.length;
    }

    // Animation loop — runs at native display rate (GPU renders cheaply) ───
    let lastTs  = 0;
    let visible = true;
    let raf;

    function animate(ts) {
      raf = requestAnimationFrame(animate);
      if (!visible) return;
      const dt = lastTs ? Math.min(ts - lastTs, 100) : 0; // cap at 100 ms
      lastTs = ts;

      if (clustersRef.current.length !== lastClustersLen) rebuildBars();

      globe.rotation.y += 0.005 * (dt / 1000); // eastward drift
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(animate);

    // Pause when scrolled out of viewport
    const io = new IntersectionObserver(
      ([e]) => { visible = e.isIntersecting; },
      { threshold: 0 },
    );
    io.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      // Dispose all GPU resources
      scene.traverse(obj => {
        obj.geometry?.dispose();
        const mat = obj.material;
        if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.dispose());
      });
      renderer.dispose();
    };
  }, [paused]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '900px', height: '900px' }}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[53%] opacity-40 pointer-events-none select-none"
      aria-hidden="true"
    />
  );
}

// Terminal lines — fixed set, card height never changes
const TERMINAL_LINES = [
  { prefix: '$',  prefixColor: 'text-accent',   text: ' git push origin main' },
  { prefix: '',   prefixColor: '',               text: 'Enumerating objects: 5, done.', dim: true },
  { prefix: '',   prefixColor: '',               text: 'Writing objects: 100% (5/5), 1.2 KiB', dim: true },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Orbit detected push → triggering build…' },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Framework: ', highlight: '__FRAMEWORK__' },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Build complete in 23s' },
  { prefix: '●',  prefixColor: 'text-primary',   text: ' Deploying to Flux network…' },
  { prefix: '✓',  prefixColor: 'text-accent',    text: ' Live: ', highlight: '__LIVE__' },
];

// Frameworks that cycle in the terminal on each loop
const FRAMEWORK_CYCLE = [
  { name: 'Next.js 14',  slug: 'my-nextjs-app'  },
  { name: 'React 18',    slug: 'my-react-app'   },
  { name: 'Vue 3',       slug: 'my-vue-app'     },
  { name: 'Django 5',    slug: 'my-django-app'  },
  { name: 'FastAPI',     slug: 'my-fastapi-app' },
  { name: 'NestJS',      slug: 'my-nestjs-app'  },
  { name: 'Svelte 5',    slug: 'my-svelte-app'  },
  { name: 'Astro 4',     slug: 'my-astro-app'   },
  { name: 'Laravel 11',  slug: 'my-laravel-app' },
  { name: 'Go / Gin',    slug: 'my-go-app'      },
];

const FRAMEWORKS_MARQUEE = [
  { name: 'Next.js',     color: '#e2e8f0', Icon: SiNextdotjs   },
  { name: 'React',       color: '#61dafb', Icon: SiReact       },
  { name: 'Django',      color: '#44b78b', Icon: SiDjango      },
  { name: 'FastAPI',     color: '#009688', Icon: SiFastapi     },
  { name: 'NestJS',      color: '#e0234e', Icon: SiNestjs      },
  { name: 'Vue',         color: '#42d392', Icon: SiVuedotjs    },
  { name: 'Remix',       color: '#a78bfa', Icon: SiRemix       },
  { name: 'Astro',       color: '#ff7b35', Icon: SiAstro       },
  { name: 'Rails',       color: '#cc0000', Icon: SiRubyonrails },
  { name: 'Laravel',     color: '#ff2d20', Icon: SiLaravel     },
  { name: 'Gin',         color: '#00acd7', Icon: SiGo          },
  { name: 'Actix Web',   color: '#f74c00', Icon: SiRust        },
  { name: 'Spring Boot', color: '#6db33f', Icon: SiSpring      },
  { name: 'Svelte',      color: '#ff3e00', Icon: SiSvelte      },
  { name: 'Flask',       color: '#94a3b8', Icon: SiFlask       },
  { name: 'Nuxt',        color: '#00dc82', Icon: SiNuxt        },
  { name: 'Hono',        color: '#f97316', Icon: SiHono        },
  { name: 'Blazor',      color: '#9b72d0', Icon: SiBlazor      },
];
const MARQUEE_ITEMS = [...FRAMEWORKS_MARQUEE, ...FRAMEWORKS_MARQUEE];

// Typewriter: reveals lines one by one, then loops
function useTypewriter(lines, { paused = false } = {}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [loopCount, setLoopCount] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (paused) {
      setVisibleCount(lines.length);
      return;
    }

    function step(count) {
      if (count < lines.length) {
        timerRef.current = setTimeout(() => {
          setVisibleCount(count + 1);
          step(count + 1);
        }, 420);
      } else {
        // Pause at end, fade out, then swap framework + restart
        timerRef.current = setTimeout(() => {
          setVisibleCount(0); // triggers fade-out (300ms transition)
          timerRef.current = setTimeout(() => {
            setLoopCount(c => c + 1); // switch framework only after fade is done
            step(0);
          }, 350);
        }, 3200);
      }
    }

    step(visibleCount);
    return () => clearTimeout(timerRef.current);
  }, [paused]); // eslint-disable-line react-hooks/exhaustive-deps

  return { visibleCount, loopCount };
}

function GradientWord({ children, gradient = 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)' }) {
  return (
    <span
      style={{
        backgroundImage: gradient,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        color: '#3b82f6',
      }}
    >
      {children}
    </span>
  );
}

export default function HeroSection({ onLoginSuccess }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loginOpen, setLoginOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  const { visibleCount: visibleLines, loopCount } = useTypewriter(TERMINAL_LINES, { paused: reducedMotion });
  const currentFramework = FRAMEWORK_CYCLE[loopCount % FRAMEWORK_CYCLE.length];

  function handleCTA() {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      setLoginOpen(true);
    }
  }

  return (
    <>
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">

        {/* ── Background ─────────────────────────────────────────────────── */}
        <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
          {/* Wireframe globe */}
          <WireframeGlobe paused={reducedMotion} />
          {/* Primary glow */}
          <motion.div
            className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px]"
            animate={reducedMotion ? {} : { scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Accent glow */}
          <div className="absolute top-1/3 left-[15%] w-[260px] h-[260px] bg-accent/6 rounded-full blur-[70px]" />
          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {/* Bottom fade to next section */}
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-5 sm:px-6 text-center pt-28 pb-10">

          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-indigo-200 text-xs font-medium mb-7"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Git-native deployment for the Flux network
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-heading font-light text-text leading-[1.2] tracking-tight mb-5
                       text-3xl sm:text-4xl md:text-5xl lg:text-6xl"
          >
            Deploy to <GradientWord>Flux</GradientWord>
            <br />
            <span className="block mt-3">
              with <GradientWord gradient="linear-gradient(90deg, #f97316 0%, #ef4444 100%)">Git</GradientWord>
            </span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-text-secondary leading-relaxed max-w-2xl mx-auto mb-9
                       text-base sm:text-lg md:text-xl"
          >
            Push your code. Orbit handles the rest: builds, deploys, and scales your app
            across 10,000+ Flux nodes worldwide. Free tier, no credit card required.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12"
          >
            <button
              onClick={handleCTA}
              className="btn-cta text-sm sm:text-base px-6 py-3 sm:px-8 sm:py-3.5 w-full sm:w-auto"
            >
              Start Deploying Free
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#how-it-works"
              className="btn-terminal px-5 py-3 w-full sm:w-auto justify-center"
            >
              <span className="prompt">$</span>
              <span>how-it-works</span>
            </a>
          </motion.div>

          {/* Framework logos marquee */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.45 }}
            className="w-full overflow-hidden"
            aria-label="Supported frameworks"
          >
            <div className="text-center mb-3">
              <a
                href="https://github.com/RunOnFlux/deploy-with-git"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-transparent
                           text-xs text-indigo-200 transition-all duration-200
                           hover:border-indigo-400/60 hover:text-white"
              >
                Deploy any stack.{' '}
                <span>view all framework guides →</span>
              </a>
            </div>
            <div className="relative">
              <div className="absolute left-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-r from-background to-transparent" />
              <div className="absolute right-0 top-0 bottom-0 w-16 z-10 pointer-events-none bg-gradient-to-l from-background to-transparent" />
              <div className="marquee-track flex" style={{ width: 'max-content' }}>
                {MARQUEE_ITEMS.map((fw, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-md border border-border/60
                               bg-surface/50 text-xs font-mono whitespace-nowrap select-none mr-2"
                    style={{ color: fw.color }}
                  >
                    <fw.Icon className="w-4 h-4 flex-shrink-0" style={{ color: fw.color }} />
                    {fw.name}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Terminal mockup ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.55, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-xl sm:max-w-2xl mx-auto px-5 sm:px-6 pb-20 -mt-6"
          aria-hidden="true"
        >
          <div
            className="rounded-2xl border border-border bg-surface/80 backdrop-blur
                        overflow-hidden shadow-2xl shadow-primary/10"
          >
            {/* Chrome bar */}
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-white/[0.025]">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              <span className="ml-3 text-xs text-text-muted font-mono">orbit — bash</span>
            </div>

            {/* Fixed-height body prevents layout shift during typewriter */}
            <div className="p-4 sm:p-5 font-mono text-[11px] sm:text-xs leading-[1.75] h-[168px] sm:h-[186px] overflow-hidden">
              {TERMINAL_LINES.map((line, i) => (
                <div
                  key={i}
                  className={`transition-opacity duration-300 ${
                    i < visibleLines ? 'opacity-100' : 'opacity-0'
                  } ${line.dim ? 'text-text-muted' : 'text-text-secondary'}`}
                >
                  {line.prefix && (
                    <span className={`${line.prefixColor} mr-1`}>{line.prefix}</span>
                  )}
                  {line.text}
                  {line.highlight && (
                    <span className="text-accent font-semibold">
                      {line.highlight === '__FRAMEWORK__'
                        ? currentFramework.name
                        : line.highlight === '__LIVE__'
                        ? `${currentFramework.slug}.app.runonflux.io`
                        : line.highlight}
                    </span>
                  )}
                  {/* Blinking cursor on last visible line */}
                  {i === visibleLines - 1 && !reducedMotion && (
                    <motion.span
                      className="inline-block w-[7px] h-[13px] bg-text-secondary ml-0.5 align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

      </section>

      <LoginModal
        isOpen={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={() => {
          setLoginOpen(false);
          onLoginSuccess?.();
        }}
      />
    </>
  );
}
