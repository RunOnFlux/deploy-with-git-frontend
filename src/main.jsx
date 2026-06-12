import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import { loadRuntimeConfig } from './config/runtimeConfig.js';
import { initAnalytics } from './services/analytics.js';
import { initFirebase } from './utils/firebase.js';

function renderConfigError(message) {
  createRoot(document.getElementById('root')).render(
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

try {
  const config = await loadRuntimeConfig();
  initAnalytics(config.analytics);
  initFirebase(config.firebase);

  const { default: App } = await import('./App.jsx');

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <HelmetProvider>
        <App />
      </HelmetProvider>
    </StrictMode>,
  );
} catch (err) {
  console.error('Bootstrap failed:', err);
  renderConfigError(err?.message || 'Failed to load application configuration.');
}
