import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import { loadRuntimeConfig } from './config/runtimeConfig.js';
import { initAnalytics } from './services/analytics.js';
import { initFirebase } from './utils/firebase.js';

function renderConfigError(message) {
  const container = document.getElementById('root');
  // If the server already rendered real content into #root, keep it. A non-fatal
  // bootstrap error must never blank a page that is already painted and readable —
  // that "full page → almost empty" wipe is exactly the regression we're fixing.
  if (container && container.hasChildNodes()) {
    console.error('Bootstrap error (keeping server-rendered content):', message);
    return;
  }
  createRoot(container).render(
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'system-ui, sans-serif',
      color: '#e2e8f0',
      background: '#080c18',
    }}
    >
      <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.75rem' }}>Unable to start Orbit</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.5 }}>{message}</p>
      </div>
    </div>,
  );
}

// Bootstrap runs in an async function, NOT via top-level await. A top-level await in
// the entry module makes its chunk async, and Vite/Rollup then deadlocks a later
// dynamic import() of a code-split route chunk that shares dependencies with the
// entry: the import promise never resolves, so the app never hydrates (the whole
// page stays as static SSR markup — no effects, no data fetches, no animations).
async function bootstrap() {
  const config = await loadRuntimeConfig();
  initAnalytics(config.analytics);
  initFirebase(config.firebase);

  const { default: App, preloadRoute } = await import('./App.jsx');

  const container = document.getElementById('root');

  const tree = (
    <StrictMode>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </StrictMode>
  );

  // Prerendered routes (scripts/prerender.mjs) ship real server-rendered markup in
  // #root and tag it with the path it was rendered for. Hydrate it instead of
  // calling createRoot(), which wipes the DOM and re-renders from scratch — that
  // wipe is the visible "page loads, then reloads".
  //
  // The check is per-path because the Express SPA fallback serves dist/index.html
  // (the HOME markup) for any route without its own prerendered file: hydrating
  // /login against the homepage's DOM would be a mismatch, so those still take the
  // createRoot path, exactly as before. In dev #root is empty, same story.
  //
  // The route's chunk must be loaded before hydrating: an unresolved React.lazy
  // would render the Suspense fallback on the first client pass, which wouldn't
  // match the server markup, and React would discard the server HTML anyway.
  const ssrPath = container.dataset.ssrPath;
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';

  if (ssrPath && ssrPath === currentPath && container.hasChildNodes()) {
    try {
      // The route chunk must resolve before hydrating so the first client render
      // matches the server markup. If it 404s (e.g. an old cached index.html points
      // at chunks a redeploy has purged), DON'T blank the page: the server HTML is
      // already painted and readable. Leave it in place and skip hydration.
      await preloadRoute(currentPath);
      hydrateRoot(container, tree);
    } catch (err) {
      console.error('Hydration preload failed; keeping server-rendered HTML:', err);
    }
  } else {
    createRoot(container).render(tree);
  }
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  renderConfigError(err?.message || 'Failed to load application configuration.');
});
