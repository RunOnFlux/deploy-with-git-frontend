import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Bot, Check, Clipboard, KeyRound, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';

import { PageHeader } from '../../components/dashboard';
import { createMcpConnection } from '../../services/mcpConnection.js';
import { getUser } from '../../utils/firebase.js';

const TOOL_GROUPS = [
  ['Inspect', 'plans, repositories, apps, instances, deployment status, capacity, and bounded logs'],
  ['Deploy', 'validate and register apps, then create authoritative Stripe checkout sessions'],
  ['Operate', 'trigger builds and control an app instance on its assigned Flux nodes'],
  ['Maintain', 'apply constrained app updates and renew subscriptions'],
];

export default function AgentConnect() {
  const [connection, setConnection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => () => setConnection(null), []);

  async function generate() {
    setLoading(true);
    setError('');
    setCopied(false);
    try {
      setConnection(await createMcpConnection(getUser(), window.location.origin));
    } catch (cause) {
      setConnection(null);
      setError(cause.message || 'Could not create the connection configuration');
    } finally {
      setLoading(false);
    }
  }

  async function copyConfig() {
    if (!connection) return;
    await navigator.clipboard.writeText(JSON.stringify(connection.config, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Helmet><title>Connect an agent — Orbit</title></Helmet>
      <div className="p-6">
        <PageHeader icon={Bot} title="Connect an agent" subtitle="Let an MCP-compatible agent deploy and manage your Orbit apps." />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
          <section className="card p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 flex items-center justify-center shrink-0"><KeyRound className="w-5 h-5 text-primary" /></div>
              <div>
                <h2 className="font-semibold text-text">Short-lived Firebase connection</h2>
                <p className="text-sm text-text-muted mt-1">
                  Orbit uses your current Google or email session. The MCP server creates a fresh Flux session for each request and stores no agent account or deployment data.
                </p>
              </div>
            </div>

            <div className="p-4 border border-amber-500/30 bg-amber-500/10 flex gap-3 text-sm">
              <TriangleAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <p className="text-text-secondary">
                The generated configuration contains a bearer credential. Treat it like a password, do not commit or share it, and reconnect after it expires. Review every mutating tool call in your agent client.
              </p>
            </div>

            {!connection ? (
              <button type="button" onClick={generate} disabled={loading} className="btn-primary disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                {loading ? 'Creating connection…' : 'Generate connection config'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-text-muted">Expires</p>
                    <p className="text-sm text-text">{new Date(connection.expiresAt).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={generate} disabled={loading} className="btn-secondary"><RefreshCw className="w-4 h-4" /> Refresh</button>
                    <button type="button" onClick={copyConfig} className="btn-primary">
                      {copied ? <Check className="w-4 h-4" /> : <Clipboard className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy config'}
                    </button>
                  </div>
                </div>
                <pre className="bg-background border border-border/50 p-4 overflow-x-auto text-xs text-text-secondary whitespace-pre-wrap break-all">
                  {JSON.stringify(connection.config, null, 2)}
                </pre>
              </div>
            )}

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </section>

          <aside className="card p-6">
            <div className="flex items-center gap-2 mb-4"><ShieldCheck className="w-5 h-5 text-primary" /><h2 className="font-semibold text-text">Agent capabilities</h2></div>
            <div className="space-y-4">
              {TOOL_GROUPS.map(([title, description]) => (
                <div key={title}>
                  <p className="text-sm font-medium text-text">{title}</p>
                  <p className="text-xs text-text-muted mt-1">{description}.</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
