import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Download } from 'lucide-react';
import { fetchAppLogPolling, nodeBaseUrl, containerName, fetchNodeOrbitStatus, fetchNodeOrbitLogs, fetchNodeOrbitAppLogs } from '../../services/managementService';

const POLL_INTERVAL_MS = 60_000;

// SAID, NEVER SKIPPED OVER. A pane that is not showing everything the container wrote must not
// look like one that is, and the two reasons differ: rolled over means the node discarded the
// file holding the line we had read up to and those lines are gone for everyone; skipped means
// they still exist and the node declined to walk back that far, because reaching them costs a
// read of the whole retained log on every poll.
const ROLLED_OVER_NOTICE = '\u2014 earlier logs rolled over on this node and are no longer available \u2014';
const SKIPPED_NOTICE = '\u2014 the app logged faster than this panel could follow, and some lines were not delivered \u2014';

// WHAT THE PANE HOLDS. Every poll used to replace the view, so 200 lines was the bound by
// accident; now it appends, and a positioned poll is answered with everything written since the
// last one. The head is dropped rather than the tail: a log is read from the bottom.
const MAX_PANE_LINES = 5000;
const capPane = (lines) => (lines.length > MAX_PANE_LINES ? lines.slice(-MAX_PANE_LINES) : lines);

// Strip ANSI/VT100 escape codes (e.g. [0;32m, [0m)
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const stripAnsi = (s) => s.replace(ANSI_RE, '');

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Build-mode sub-panel ──────────────────────────────────────────────────────

function BuildLogsPanel({ appName, mgmtPort, nodeIp, apiKey }) {
  const [releases, setReleases] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [currentRelease, setCurrentRelease] = useState(null);
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bottomRef = useRef(null);

  // Fetch /status once → populate release list
  useEffect(() => {
    if (!mgmtPort || !nodeIp) { setStatusError('Management port not available'); setLoading(false); return; }
    let cancelled = false;
    fetchNodeOrbitStatus(nodeIp, mgmtPort, apiKey)
      .then(data => {
        if (cancelled) return;
        setReleases(data.releases ?? []);
        const cur = data.current_release ?? data.releases?.[0]?.id ?? null;
        setCurrentRelease(cur);
        setSelectedId(cur);
      })
      .catch(err => { if (!cancelled) setStatusError(err.message); });
    return () => { cancelled = true; };
  }, [nodeIp, mgmtPort, apiKey]);

  // Fetch logs whenever selected release or refreshKey changes
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);
    setLines([]);
    setError(null);

    fetchNodeOrbitLogs(nodeIp, mgmtPort, selectedId, apiKey)
      .then(text => { if (!cancelled) setLines(text.split('\n').filter(Boolean).map(stripAnsi)); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedId, refreshKey, nodeIp, mgmtPort, apiKey]);

  // Auto-scroll
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  function downloadLogs() {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-build-${selectedId}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (statusError) {
    return <div className="flex items-center justify-center h-full text-xs text-danger p-4">{statusError}</div>;
  }

  const selectedRelease = releases.find(r => r.id === selectedId);

  return (
    <div className="flex flex-1 min-h-0">
      {/* Release sidebar */}
      <div className="w-44 shrink-0 border-r border-border flex flex-col bg-surface-hover">
        {/* Sidebar header */}
        <div className="flex items-center px-2.5 py-1.5 border-b border-border shrink-0">
          <span className="text-xs font-medium text-text-secondary">Releases</span>
        </div>
        <div className="overflow-y-auto flex-1">
          {releases.length === 0 && (
            <div className="p-2 text-xs text-text-muted italic">Loading…</div>
          )}
          {releases.map(r => {
            const short = r.commit.slice(0, 7);
            const isCurrent = r.id === currentRelease;
            const isSelected = r.id === selectedId;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full px-2.5 py-2 text-left border-b border-border/50 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-muted hover:text-text hover:bg-surface'
                }`}
              >
                <span className="font-mono text-xs font-medium shrink-0">{short}</span>
                {isCurrent && (
                  <span className="w-1.5 h-1.5 bg-success shrink-0" title="Current" />
                )}
                <span className="text-[10px] opacity-60 ml-auto shrink-0">{fmtDate(r.deployed_at)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Log output */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-hover shrink-0">
          <div className="flex items-center gap-2 min-w-0 mr-2">
            {loading && <RefreshCw className="w-3 h-3 text-text-muted animate-spin shrink-0" />}
            {selectedRelease && !loading && (
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono text-xs text-text-secondary shrink-0">
                  {selectedRelease.commit.slice(0, 7)}
                </span>
                {selectedRelease.commit_message && (
                  <>
                    <span className="text-border shrink-0">·</span>
                    <span className="text-xs text-text-muted truncate">{selectedRelease.commit_message}</span>
                  </>
                )}
              </div>
            )}
            {error && <span className="text-xs text-danger truncate" title={error}>{error}</span>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setRefreshKey(k => k + 1)} className="text-text-muted hover:text-text " title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {lines.length > 0 && (
              <button onClick={downloadLogs} className="text-text-muted hover:text-text " title="Download">
                <Download className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#0d1117] font-mono text-xs leading-relaxed p-3 log-output">
          {loading && lines.length === 0 ? (
            <span className="text-gray-500 log-muted">Loading logs…</span>
          ) : lines.length === 0 ? (
            <span className="text-gray-500 log-muted">No log output yet.</span>
          ) : (
            <>
              {lines.map((line, i) => (
                <div key={i} className={`whitespace-pre-wrap break-all ${
                  /error|fail|fatal/i.test(line) ? 'text-red-400 log-error'
                    : /warn/i.test(line) ? 'text-yellow-400 log-warn'
                    : /success|done|ready|started|complete/i.test(line) ? 'text-green-400 log-success'
                    : 'text-gray-300 log-default'
                }`}>{line}</div>
              ))}
              <div ref={bottomRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Orbit app-logs sub-panel ─────────────────────────────────────────────────

function OrbitAppLogsPanel({ appName, mgmtPort, nodeIp, apiKey }) {
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!mgmtPort || !nodeIp) { setError('Management port not available'); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchNodeOrbitAppLogs(nodeIp, mgmtPort, apiKey)
      .then(data => {
        if (cancelled) return;
        const raw = Array.isArray(data) ? data : (data?.lines ?? data?.logs ?? []);
        setLines(raw.filter(Boolean).map(stripAnsi));
        setLastUpdated(new Date());
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [nodeIp, mgmtPort, apiKey, refreshKey]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  function downloadLogs() {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-applogs-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-hover shrink-0">
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-3 h-3 text-text-muted animate-spin" />}
          {lastUpdated && !loading && (
            <span className="text-xs text-text-muted">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          {error && <span className="text-xs text-danger truncate max-w-xs" title={error}>{error}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setRefreshKey(k => k + 1)} className="text-text-muted hover:text-text " title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {lines.length > 0 && (
            <button onClick={downloadLogs} className="text-text-muted hover:text-text " title="Download">
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0d1117] font-mono text-xs leading-relaxed p-3 log-output">
        {loading && lines.length === 0 ? (
          <span className="text-gray-500 log-muted">Loading logs…</span>
        ) : lines.length === 0 ? (
          <span className="text-gray-500 log-muted">No app log output yet.</span>
        ) : (
          <>
            {lines.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${
                /error|fail|fatal/i.test(line) ? 'text-red-400 log-error'
                  : /warn/i.test(line) ? 'text-yellow-400 log-warn'
                  : /success|done|ready|started|complete/i.test(line) ? 'text-green-400 log-success'
                  : 'text-gray-300 log-default'
              }`}>{line}</div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Container-logs sub-panel (Flux node API) ─────────────────────────────────

/**
 * The container's own log, off the Flux node.
 *
 * IT USED TO LOSE LINES. Every sixty seconds it asked for the last 200 and REPLACED the view
 * with them, so anything the app wrote beyond 200 in that minute was never shown to anyone and
 * could not be fetched afterwards — with nothing on screen to say it had happened. A build or a
 * crash loop writes far more than that in a minute, which is exactly when somebody is reading.
 *
 * The node is now asked for everything since the position it last handed back, and the pane
 * appends. Against a node that predates positions it returns no cursor and this behaves exactly
 * as it did before — no version check anywhere, because the network runs several FluxOS
 * versions at once and always will.
 */
function AppLogsPanel({ nodeIp, nodePort, appName, zelidauth, container, downloadName }) {
  const [lines, setLines] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const isMountedRef = useRef(true);
  const bottomRef = useRef(null);
  // Where this pane has read up to, as the node described it. A POSITION BELONGS TO ONE NODE'S
  // CONTAINER — the same app elsewhere has its own log with its own timestamps — so it is reset
  // by the effect below, whose dependencies are exactly the node and container it names.
  const cursorRef = useRef(null);

  const base = nodeBaseUrl(nodeIp, nodePort);
  const logContainer = container ?? containerName(appName);
  const filePrefix = downloadName ?? `${appName}-app`;

  useEffect(() => {
    isMountedRef.current = true;
    const ctrl = new AbortController();
    setLoading(true);
    setLines([]);
    setError(null);
    cursorRef.current = null;

    async function poll() {
      try {
        const hadPosition = cursorRef.current !== null;
        const data = await fetchAppLogPolling(base, logContainer, zelidauth, 200, 0, cursorRef.current);
        if (ctrl.signal.aborted) return;
        if (data?.status === 'success') {
          const fresh = Array.isArray(data.logs) ? data.logs.filter(Boolean).map(stripAnsi) : [];

          // A node that answers positions returns one. A node that predates them returns the
          // most recent lines and nothing else, which is what this pane has always shown — so
          // against that node it keeps showing exactly that.
          const positioned = typeof data.cursor === 'string';
          if (positioned) cursorRef.current = data.cursor;

          setLines(prev => {
            if (!positioned || !hadPosition) return capPane(fresh);
            const marker = [];
            if (data.rolledOver && prev.length) marker.push(ROLLED_OVER_NOTICE);
            if (data.skipped && prev.length) marker.push(SKIPPED_NOTICE);
            return capPane([...prev, ...marker, ...fresh]);
          });
          setError(null);
          setLastUpdated(new Date());
        } else {
          const msg = data?.data?.message || data?.data || 'Failed to fetch logs';
          setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (isMountedRef.current) setError(err.message);
      } finally {
        if (!ctrl.signal.aborted && isMountedRef.current) setLoading(false);
      }
    }

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      isMountedRef.current = false;
      ctrl.abort();
      clearInterval(interval);
    };
  }, [base, logContainer, zelidauth, refreshKey]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);

  function downloadLogs() {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filePrefix}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-hover shrink-0">
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-3 h-3 text-text-muted animate-spin" />}
          {lastUpdated && !loading && (
            <span className="text-xs text-text-muted">Updated {lastUpdated.toLocaleTimeString()}</span>
          )}
          {error && <span className="text-xs text-danger truncate max-w-xs" title={error}>{error}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setRefreshKey(k => k + 1)} className="text-text-muted hover:text-text " title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {lines.length > 0 && (
            <button onClick={downloadLogs} className="text-text-muted hover:text-text " title="Download">
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-[#0d1117] font-mono text-xs leading-relaxed p-3 log-output">
        {loading && lines.length === 0 ? (
          <span className="text-gray-500 log-muted">Loading logs…</span>
        ) : lines.length === 0 ? (
          <span className="text-gray-500 log-muted">No log output yet.</span>
        ) : (
          <>
            {lines.map((line, i) => (
              <div key={i} className={`whitespace-pre-wrap break-all ${
                /error|fail|fatal/i.test(line) ? 'text-red-400 log-error'
                  : /warn/i.test(line) ? 'text-yellow-400 log-warn'
                  : /success|done|ready|started|complete/i.test(line) ? 'text-green-400 log-success'
                  : 'text-gray-300 log-default'
              }`}>{line}</div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export default function LogsPanel({ nodeIp, nodePort, appName, zelidauth, activeTab, mgmtPort, apiKey, addonLog }) {
  return (
    <div className="flex h-64">
      {activeTab === 'build'
        ? <BuildLogsPanel appName={appName} mgmtPort={mgmtPort} nodeIp={nodeIp} apiKey={apiKey} />
        : activeTab === 'orbit-app'
          ? <OrbitAppLogsPanel appName={appName} mgmtPort={mgmtPort} nodeIp={nodeIp} apiKey={apiKey} />
          : <AppLogsPanel
              nodeIp={nodeIp}
              nodePort={nodePort}
              appName={appName}
              zelidauth={zelidauth}
              container={addonLog?.container}
              downloadName={addonLog?.downloadName}
            />
      }
    </div>
  );
}
