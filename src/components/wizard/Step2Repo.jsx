import { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle, Eye, EyeOff, GitBranch, FolderOpen, Lock, Globe,
  CheckCircle, XCircle, Loader2, ChevronDown, Info, Zap, Layers, ShieldCheck,
} from 'lucide-react';
import {
  parseRepoUrl,
  checkRepoAccess,
  fetchBranches,
  detectPortFromRepo,
  detectMonorepo,
  checkCompatibility,
  testPrivateAuth,
  buildAuthHeaders,
  listDirectories,
} from '../../services/repoIntelligenceService';
import { loadRepoDeploymentConfig } from '../../services/repoConfigImportService';

import { FaGithub, FaGitlab, FaBitbucket } from 'react-icons/fa';

const PROVIDER_ICONS = {
  'github.com': FaGithub,
  'gitlab.com': FaGitlab,
  'bitbucket.org': FaBitbucket,
};

const PROVIDER_LABELS = {
  'github.com': { label: 'GitHub', color: 'text-white bg-[#24292e]', tokenUrl: 'https://github.com/settings/tokens/new?scopes=repo&description=Orbit+Deploy' },
  'gitlab.com': { label: 'GitLab', color: 'text-white bg-orange-600', tokenUrl: 'https://gitlab.com/-/profile/personal_access_tokens' },
  'bitbucket.org': { label: 'Bitbucket', color: 'text-white bg-blue-600', tokenUrl: 'https://bitbucket.org/account/settings/app-passwords/new' },
};

export default function Step2Repo({ repo, onChange, onPortDetected, onConfigImported }) {
  const [showToken, setShowToken] = useState(false);

  // Stable refs for parent callbacks — prevents stale closures in async intelligence
  const onPortDetectedRef = useRef(onPortDetected);
  const onConfigImportedRef = useRef(onConfigImported);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onPortDetectedRef.current = onPortDetected; }, [onPortDetected]);
  useEffect(() => { onConfigImportedRef.current = onConfigImported; }, [onConfigImported]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Local detection state
  const [repoStatus, setRepoStatus] = useState('idle'); // idle|checking|public|inaccessible|unknown
  const [authTestStatus, setAuthTestStatus] = useState('idle'); // idle|testing|success|error
  const [authTestError, setAuthTestError] = useState('');
  const [branches, setBranches] = useState([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [subdirOpen, setSubdirOpen] = useState(false);
  const [monorepo, setMonorepo] = useState(null);
  const [compatibilityStatus, setCompatibilityStatus] = useState('idle');
  const [compatibilityMessage, setCompatibilityMessage] = useState('');
  const [detectedFramework, setDetectedFramework] = useState(null);
  const [portAutoDetected, setPortAutoDetected] = useState(false);
  const [configImportSource, setConfigImportSource] = useState('');
  const [requiresRunCommand, setRequiresRunCommand] = useState(false);
  const [isRunningIntelligence, setIsRunningIntelligence] = useState(false);

  const evalGenRef = useRef(0);
  const urlDebounceRef = useRef(null);
  const branchDropdownRef = useRef(null);
  const subdirDropdownRef = useRef(null);

  const parsed = parseRepoUrl(repo.url);
  const provider = parsed ? PROVIDER_LABELS[parsed.provider] : null;

  const showBranchAndPath =
    repoStatus === 'public' ||
    (repoStatus === 'inaccessible' && authTestStatus === 'success');

  useEffect(() => {
    if (repo.authTestStatus === 'success') {
      setAuthTestStatus('success');
      setAuthTestError('');
    }
  }, [repo.authTestStatus]);

  // ── Intelligence pipeline ────────────────────────────────────────────────────
  // Not memoized — generation counter prevents stale results from being applied.
  // branchTouched passed as arg to avoid stale closure.
  async function runIntelligence(parsedRepo, branch, projectPath, headers, gen, branchTouched) {
    setIsRunningIntelligence(true);
    const controller = new AbortController();
    const { signal } = controller;
    const isCurrent = () => evalGenRef.current === gen && !signal.aborted;

    try {
      // 1. Branch listing
      const branchList = await fetchBranches(parsedRepo, headers);
      if (!isCurrent()) return;
      setBranches(branchList);

      // Auto-fill default branch if user hasn't manually selected one
      if (!branchTouched && branchList.length > 0) {
        const defaultBranch = branchList.find((b) => b.isDefault);
        if (defaultBranch && defaultBranch.name !== branch) {
          onChangeRef.current({ branch: defaultBranch.name });
          branch = defaultBranch.name; // update locally for subsequent fetches
        }
      }

      // 2. Config import + port detection + monorepo in parallel
      const [configResult, portResult, monoResult] = await Promise.all([
        loadRepoDeploymentConfig(parsedRepo, branch, projectPath, headers, signal),
        detectPortFromRepo(parsedRepo, branch, projectPath, headers, signal),
        detectMonorepo(parsedRepo, branch, headers, signal),
      ]);
      if (!isCurrent()) return;

      if (configResult?.payload) {
        setConfigImportSource(configResult.filePath);
        onConfigImportedRef.current?.(configResult.payload);
        if (configResult.payload.appPort) setPortAutoDetected(true);
      } else {
        setConfigImportSource('');
        if (portResult?.port) {
          setPortAutoDetected(true);
          setDetectedFramework(portResult.framework || null);
          onPortDetectedRef.current?.(portResult.port);
        } else {
          setPortAutoDetected(false);
          setDetectedFramework(null);
        }
      }

      setMonorepo(monoResult);

      // 3. Compatibility check
      setCompatibilityStatus('checking');
      const compat = await checkCompatibility(parsedRepo, branch, projectPath, headers, signal);
      if (!isCurrent()) return;
      setCompatibilityStatus(compat.status);
      setCompatibilityMessage(compat.message);
      if (compat.framework && !detectedFramework) setDetectedFramework(compat.framework);

      const needsRun =
        compat.status !== 'incompatible' &&
        !compat.framework &&
        compat.markerFile !== 'Dockerfile' &&
        compat.markerFile !== 'package.json';
      setRequiresRunCommand(needsRun);
    } catch {
      // silently ignore — don't block the user
    } finally {
      if (isCurrent()) setIsRunningIntelligence(false);
    }
  }

  async function fetchDirs(parsedRepo, branch, headers) {
    setDirLoading(true);
    try {
      const dirs = await listDirectories(parsedRepo, branch, '', headers);
      setDirectories(dirs);
    } catch {
      setDirectories([]);
    } finally {
      setDirLoading(false);
    }
  }

  // ── URL change → access check + intelligence ─────────────────────────────────
  useEffect(() => {
    clearTimeout(urlDebounceRef.current);

    if (!repo.url?.startsWith('http')) {
      setRepoStatus('idle');
      setBranches([]);
      setDirectories([]);
      setMonorepo(null);
      setCompatibilityStatus('idle');
      setCompatibilityMessage('');
      setPortAutoDetected(false);
      setConfigImportSource('');
      setDetectedFramework(null);
      setRequiresRunCommand(false);
      setAuthTestStatus('idle');
      setAuthTestError('');
      onChangeRef.current({ isPrivate: false });
      return;
    }

    const p = parseRepoUrl(repo.url);
    if (!p) return;

    urlDebounceRef.current = setTimeout(async () => {
      const gen = ++evalGenRef.current;
      setRepoStatus('checking');
      setAuthTestStatus('idle');
      setAuthTestError('');
      setBranches([]);
      setDirectories([]);
      setMonorepo(null);
      setCompatibilityStatus('idle');
      setPortAutoDetected(false);
      setConfigImportSource('');
      setDetectedFramework(null);
      setRequiresRunCommand(false);
      onChangeRef.current({ isPrivate: false });

      const status = await checkRepoAccess(p);
      if (evalGenRef.current !== gen) return;

      setRepoStatus(status);
      if (status === 'public') {
        const branch = repo.branch || 'main';
        runIntelligence(p, branch, repo.subdirectory || '', {}, gen, repo.branchTouched);
        fetchDirs(p, branch, {});
      } else if (
        status === 'inaccessible' &&
        repo.authTestStatus === 'success' &&
        repo.token
      ) {
        setAuthTestStatus('success');
        onChangeRef.current({ isPrivate: true });
        const headers = buildAuthHeaders(p, repo.username, repo.token);
        const branch = repo.branch || 'main';
        runIntelligence(p, branch, repo.subdirectory || '', headers, gen, repo.branchTouched);
        fetchDirs(p, branch, headers);
      }
    }, 800);

    return () => clearTimeout(urlDebounceRef.current);
  }, [repo.url]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run intelligence when branch changes
  useEffect(() => {
    if (!showBranchAndPath || !parsed) return;
    const gen = ++evalGenRef.current;
    const headers = repo.isPrivate ? buildAuthHeaders(parsed, repo.username, repo.token) : {};
    runIntelligence(parsed, repo.branch || 'main', repo.subdirectory || '', headers, gen, repo.branchTouched);
    fetchDirs(parsed, repo.branch || 'main', headers);
  }, [repo.branch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run port/compat intelligence when subdirectory changes
  useEffect(() => {
    if (!showBranchAndPath || !parsed) return;
    const gen = ++evalGenRef.current;
    const headers = repo.isPrivate ? buildAuthHeaders(parsed, repo.username, repo.token) : {};
    runIntelligence(parsed, repo.branch || 'main', repo.subdirectory || '', headers, gen, repo.branchTouched);
  }, [repo.subdirectory]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Private repo auth test ────────────────────────────────────────────────────
  async function handleTestAuth() {
    if (!parsed) return;
    setAuthTestStatus('testing');
    setAuthTestError('');
    const result = await testPrivateAuth(parsed, repo.username, repo.token);
    if (!result.success) {
      setAuthTestStatus('error');
      setAuthTestError(result.error || 'Authentication failed');
    } else {
      setAuthTestStatus('success');
      // Confirmed private repo — mark in wizard state (triggers enterprise mode)
      onChangeRef.current({ isPrivate: true });
      const headers = buildAuthHeaders(parsed, repo.username, repo.token);
      const gen = ++evalGenRef.current;
      runIntelligence(parsed, repo.branch || 'main', repo.subdirectory || '', headers, gen, repo.branchTouched);
      fetchDirs(parsed, repo.branch || 'main', headers);
    }
  }

  // Close dropdowns on outside click
  useEffect(() => {
    function onOutside(e) {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target)) setBranchOpen(false);
      if (subdirDropdownRef.current && !subdirDropdownRef.current.contains(e.target)) setSubdirOpen(false);
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <GitBranch className="w-5 h-5 text-primary" />
        <h2 className="font-heading text-xl font-bold text-text">Repository</h2>
      </div>
      <p className="text-sm text-text-secondary mb-6">
        Connect the Git repository you want to deploy.
      </p>

      {/* ── Repo URL ── */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-text mb-1">
          Repository URL <span className="text-red-400">*</span>
        </label>
        <div className="relative flex items-center">
          {parsed?.provider && PROVIDER_ICONS[parsed.provider] && (() => {
            const Icon = PROVIDER_ICONS[parsed.provider];
            return <span className="absolute left-3 text-text-muted pointer-events-none"><Icon className="w-4 h-4" /></span>;
          })()}
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            value={repo.url}
            onChange={(e) => onChange({ ...repo, url: e.target.value })}
            className={`input-base w-full pr-24 ${parsed?.provider && PROVIDER_ICONS[parsed.provider] ? 'pl-9' : ''}`}
            required
          />
          {provider && (
            <span className={`absolute right-2 px-2 py-0.5 rounded text-xs font-semibold ${provider.color}`}>
              {provider.label}
            </span>
          )}
        </div>

        {/* Status */}
        <div className="mt-1.5 flex items-center gap-2">
          {repoStatus === 'checking' && (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking repository…
            </span>
          )}
          {repoStatus === 'public' && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <Globe className="w-3.5 h-3.5" /> Public repository
              {isRunningIntelligence && <Loader2 className="w-3 h-3 animate-spin ml-1 text-text-muted" />}
            </span>
          )}
          {repoStatus === 'inaccessible' && authTestStatus === 'success' && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <ShieldCheck className="w-3.5 h-3.5" /> Private: Enterprise mode active
              {isRunningIntelligence && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
            </span>
          )}
          {repoStatus === 'inaccessible' && authTestStatus !== 'success' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400">
              <Lock className="w-3.5 h-3.5" /> Private or inaccessible. Enter credentials below.
            </span>
          )}
          {repoStatus === 'unknown' && (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <Info className="w-3.5 h-3.5" /> Could not check repository (network issue)
            </span>
          )}
          {repoStatus === 'idle' && (
            <p className="text-xs text-text-muted">
              HTTPS Git URL (GitHub, GitLab, Bitbucket). SSH not supported.
            </p>
          )}
        </div>

        {/* Config import badge */}
        {configImportSource && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-primary">
            <Zap className="w-3.5 h-3.5" />
            Config imported from <code className="font-mono">{configImportSource}</code>
          </div>
        )}
      </div>

      {/* ── Private repo credentials ── */}
      {(repoStatus === 'inaccessible' || repo.isPrivate) && (
        <div className="border border-amber-500/30 rounded-xl p-4 bg-amber-500/5 mb-5">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300 space-y-1">
              <p>
                The Git URL (with credentials) will be stored in the Flux blockchain.
                Use a <strong>disposable, read-only</strong> access token.{' '}
                {provider?.tokenUrl && (
                  <a href={provider.tokenUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Generate {provider.label} token ↗
                  </a>
                )}
              </p>
              <p className="flex items-center gap-1 text-primary/90">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                Private repos use Enterprise mode. App specs and env vars are end-to-end encrypted.
              </p>
            </div>
          </div>

          {authTestStatus !== 'success' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-text mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="username"
                    value={repo.username}
                    onChange={(e) => onChange({ ...repo, username: e.target.value })}
                    className="input-base w-full text-sm"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text mb-1">Access Token</label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder="token / app password"
                      value={repo.token}
                      onChange={(e) => {
                        onChange({ ...repo, token: e.target.value });
                        setAuthTestStatus('idle');
                        setAuthTestError('');
                      }}
                      className="input-base w-full text-sm pr-9"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                      tabIndex={-1}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestAuth}
                  disabled={!repo.token || authTestStatus === 'testing'}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    authTestStatus === 'error'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/15'
                      : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 disabled:opacity-40 disabled:cursor-not-allowed'
                  }`}
                >
                  {authTestStatus === 'testing' ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                  ) : 'Test connection'}
                </button>
                {authTestError && <span className="text-xs text-red-400">{authTestError}</span>}
              </div>
            </>
          )}

          {authTestStatus === 'success' && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <CheckCircle className="w-4 h-4" /> Connected
              {isRunningIntelligence && (
                <span className="text-xs text-text-muted flex items-center gap-1 ml-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Analyzing repo…
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Branch + Subdirectory (shown after access confirmed) ── */}
      {showBranchAndPath && (
        <>
          {/* Branch selector */}
          <div className="mb-4" ref={branchDropdownRef}>
            <label className="block text-sm font-medium text-text mb-1 flex items-center gap-1.5">
              <GitBranch className="w-3.5 h-3.5" /> Branch
            </label>
            {branches.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setBranchOpen((v) => !v)}
                  className="input-base w-full text-left flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-text-muted" />
                    {repo.branch || 'main'}
                    {branches.find((b) => b.name === repo.branch && b.isDefault) && (
                      <span className="text-xs text-primary">★ default</span>
                    )}
                  </span>
                  <ChevronDown className="w-4 h-4 text-text-muted" />
                </button>
                {branchOpen && (
                  <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-surface border border-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {branches.map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => {
                          onChange({ ...repo, branch: b.name, branchTouched: true });
                          setBranchOpen(false);
                        }}
                        className={`flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-surface-hover transition-colors ${b.name === repo.branch ? 'text-primary' : 'text-text'}`}
                      >
                        <span className="flex items-center gap-2">
                          <GitBranch className="w-3.5 h-3.5 text-text-muted" />
                          {b.name}
                        </span>
                        {b.isDefault && <span className="text-xs text-primary">★</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                placeholder="main"
                value={repo.branch}
                onChange={(e) => onChange({ ...repo, branch: e.target.value, branchTouched: true })}
                className="input-base w-full"
              />
            )}
          </div>

          {/* Subdirectory combobox */}
          <div className="mb-5" ref={subdirDropdownRef}>
            <label className="block text-sm font-medium text-text mb-1 flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" /> Subdirectory{' '}
              <span className="text-text-muted font-normal">(optional)</span>
              {dirLoading && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="/apps/web"
                value={repo.subdirectory}
                onChange={(e) => onChange({ ...repo, subdirectory: e.target.value })}
                onFocus={() => directories.length > 0 && setSubdirOpen(true)}
                className="input-base w-full pr-8"
              />
              {directories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSubdirOpen((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                  tabIndex={-1}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              )}
              {subdirOpen && directories.length > 0 && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {directories.map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => {
                        onChange({ ...repo, subdirectory: `/${dir}` });
                        setSubdirOpen(false);
                      }}
                      className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-surface-hover transition-colors ${
                        repo.subdirectory === `/${dir}` || repo.subdirectory === dir
                          ? 'text-primary'
                          : 'text-text'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                      /{dir}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-text-muted mt-1">
              For monorepos: path to the app within the repo.
            </p>
          </div>
        </>
      )}

      {/* ── Monorepo project picker ── */}
      {monorepo && monorepo.projects.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-text">
              Monorepo detected ({monorepo.type})
            </span>
          </div>
          <p className="text-xs text-text-muted mb-2">
            Select the project to deploy, or type the subdirectory above.
          </p>
          <div className="flex flex-wrap gap-2">
            {monorepo.projects.map((proj) => (
              <button
                key={proj.path}
                type="button"
                onClick={() =>
                  onChange({
                    ...repo,
                    subdirectory: proj.path.startsWith('/') ? proj.path : `/${proj.path}`,
                  })
                }
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  repo.subdirectory === proj.path || repo.subdirectory === `/${proj.path}`
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
                }`}
              >
                {proj.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Detection badges ── */}
      <div className="space-y-2">
        {requiresRunCommand && (
          <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              No start command detected. Add a{' '}
              <code className="font-mono bg-surface px-1 rounded">RUN_COMMAND</code> env var in
              Configure (e.g. <code className="font-mono bg-surface px-1 rounded">node server.js</code>).
            </span>
          </div>
        )}

        {compatibilityStatus === 'checking' && (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking compatibility…
          </div>
        )}
        {compatibilityStatus === 'incompatible' && (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-400/5 border border-red-400/20 rounded-lg px-3 py-2">
            <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {compatibilityMessage}
          </div>
        )}
        {compatibilityStatus === 'warning' && (
          <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {compatibilityMessage}. You can still deploy, but you may need to set{' '}
            <code className="font-mono bg-surface px-1 rounded">RUN_COMMAND</code>.
          </div>
        )}
      </div>
    </div>
  );
}
