import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { fetchAppLogPolling, nodeBaseUrl, containerName } from '../../services/managementService';

// App logs poll every 5s; build logs are static so we fetch once
const POLL_INTERVAL_MS = 5000;

/**
 * Fetch build logs directly from the Orbit webhook server CDN domain.
 * CORS is open on the webhook server, so no BFF proxy needed.
 */
async function loadBuildLogs(appName, mgmtPort) {
  const base = `https://${appName}_${mgmtPort}.app.runonflux.io`;
  const statusRes = await fetch(`${base}/status`, { signal: AbortSignal.timeout(10000) });
  if (!statusRes.ok) throw new Error(`Status fetch failed: HTTP ${statusRes.status}`);
  const status = await statusRes.json();

  const releaseId = status?.current_release;
  if (!releaseId) throw new Error('No release found yet');

  const logsRes = await fetch(`${base}/logs/${encodeURIComponent(releaseId)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!logsRes.ok) throw new Error(`Logs fetch failed: HTTP ${logsRes.status}`);
  const text = await logsRes.text();
  return text.split('\n');
}

export default function LogsPanel({ nodeIp, nodePort, appName, zelidauth, activeTab, mgmtPort }) {
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const bottomRef = useRef(null);
  const isMountedRef = useRef(true);

  const container = containerName(appName);
  const base = nodeBaseUrl(nodeIp, nodePort);

  const fetchLogs = useCallback(async () => {
    try {
      let logLines = [];

      if (activeTab === 'build') {
        if (!mgmtPort) {
          setError('Management port not available');
          setLoading(false);
          return;
        }
        logLines = await loadBuildLogs(appName, mgmtPort);
      } else {
        // App logs via applogpolling — returns { status, logs: string[], sinceTimestamp, ... }
        const data = await fetchAppLogPolling(base, container, zelidauth, 200, 0);
        if (!isMountedRef.current) return;
        if (data?.status === 'success') {
          logLines = Array.isArray(data.logs) ? data.logs : [];
        } else {
          const msg = data?.data?.message || data?.data || 'Failed to fetch logs';
          setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
          return;
        }
      }

      if (!isMountedRef.current) return;
      setLines(logLines.filter(Boolean));
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (isMountedRef.current) setError(err.message);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [base, container, zelidauth, activeTab, mgmtPort, appName]);

  // Auto-scroll on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  // Poll app logs; fetch build logs once (they don't change)
  useEffect(() => {
    if (!nodeIp || !nodePort || !appName) return;
    isMountedRef.current = true;
    setLoading(true);
    setLines([]);
    setError(null);

    fetchLogs();
    // Only poll for app logs; build logs are static
    const interval = activeTab === 'app' ? setInterval(fetchLogs, POLL_INTERVAL_MS) : null;

    return () => {
      isMountedRef.current = false;
      if (interval) clearInterval(interval);
    };
  }, [fetchLogs]);

  function downloadLogs() {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-${activeTab}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-64">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-hover shrink-0">
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-3 h-3 text-text-muted animate-spin" />}
          {lastUpdated && !loading && (
            <span className="text-xs text-text-muted">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {error && <span className="text-xs text-danger truncate max-w-xs" title={error}>{error}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="text-text-muted hover:text-text transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {lines.length > 0 && (
            <button
              onClick={downloadLogs}
              className="text-text-muted hover:text-text transition-colors"
              title="Download logs"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-auto bg-[#0d1117] font-mono text-xs leading-relaxed p-3">
        {loading && lines.length === 0 ? (
          <span className="text-gray-500">Loading logs…</span>
        ) : lines.length === 0 ? (
          <span className="text-gray-500">No log output yet.</span>
        ) : (
          <>
            {lines.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${
                /error|fail|fatal/i.test(line) ? 'text-red-400'
                  : /warn/i.test(line) ? 'text-yellow-400'
                  : /success|done|ready|started|complete/i.test(line) ? 'text-green-400'
                  : 'text-gray-300'
              }`}>
                {line}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
