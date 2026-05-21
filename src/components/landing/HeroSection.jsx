import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  GitBranch,
  Info,
  Loader2,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FaGithub, FaGitlab, FaBitbucket } from 'react-icons/fa';
import {
  buildAuthHeaders,
  checkCompatibility,
  checkRepoAccess,
  fetchBranches,
  listDirectories,
  parseRepoUrl,
  testPrivateAuth,
} from '../../services/repoIntelligenceService';
import DashboardPreview from './DashboardPreview';
import { useAuth } from '../../context/AuthContext';

const HERO_PREFILL_KEY = 'orbitHeroDeployPrefill';

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

export default function HeroSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [repoUrl, setRepoUrl] = useState('');
  const [repoStatus, setRepoStatus] = useState('idle');
  const [compatibilityStatus, setCompatibilityStatus] = useState('idle');
  const [compatibilityMessage, setCompatibilityMessage] = useState('');
  
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState('main');
  const [branchOpen, setBranchOpen] = useState(false);
  
  const [directories, setDirectories] = useState([]);
  const [subdirectory, setSubdirectory] = useState('');
  const [subdirOpen, setSubdirOpen] = useState(false);
  const [dirLoading, setDirLoading] = useState(false);

  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [authTestStatus, setAuthTestStatus] = useState('idle');
  const [authTestError, setAuthTestError] = useState('');

  const debounceRef = useRef(null);
  const requestGenRef = useRef(0);
  const branchDropdownRef = useRef(null);
  const subdirDropdownRef = useRef(null);
  
  const parsed = useMemo(() => parseRepoUrl(repoUrl.trim()), [repoUrl]);
  const provider = parsed ? PROVIDER_LABELS[parsed.provider] : null;

  async function runCompatibilityChecks(parsedRepo, authHeaders = {}, gen) {
    setCompatibilityStatus('checking');

    const branchesResult = await fetchBranches(parsedRepo, authHeaders);
    if (requestGenRef.current !== gen) return;
    
    if (branchesResult.length > 0) {
      setBranches(branchesResult);
      const defaultBranch = branchesResult.find((b) => b.isDefault);
      const selectedBranch = defaultBranch?.name || branchesResult[0]?.name || 'main';

      // Fetch directories before calling setBranch — if setBranch triggers [branch]
      // effect it increments requestGenRef, which would kill this fn before setDirectories runs.
      setDirLoading(true);
      const dirs = await listDirectories(parsedRepo, selectedBranch, '', authHeaders);
      if (requestGenRef.current !== gen) return;

      // Batch dirs + branch together so [branch] effect sees populated directories
      setDirectories(dirs);
      setDirLoading(false);
      setBranch(selectedBranch);

      const compat = await checkCompatibility(parsedRepo, selectedBranch, '', authHeaders);
      if (requestGenRef.current !== gen) return; // [branch] effect may have taken over

      // If root is incompatible but directories exist, show helpful message
      if (compat.status === 'incompatible' && dirs.length > 0) {
        setCompatibilityStatus('warning');
        setCompatibilityMessage(`Multiple projects detected • Select a subdirectory below`);
      } else {
        setCompatibilityStatus(compat.status);
        setCompatibilityMessage(compat.message || '');
      }
    } else {
      setBranch('main');
      setBranches([]);
      setDirectories([]);
      setCompatibilityStatus('idle');
      setCompatibilityMessage('');
    }
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);

    const trimmed = repoUrl.trim();
    if (!trimmed) {
      setRepoStatus('idle');
      setCompatibilityStatus('idle');
      setCompatibilityMessage('');
      setBranch('main');
      setAuthTestStatus('idle');
      setAuthTestError('');
      return;
    }

    if (!trimmed.startsWith('http') || !parsed) {
      setRepoStatus('invalid');
      setCompatibilityStatus('idle');
      setCompatibilityMessage('');
      setBranch('main');
      setAuthTestStatus('idle');
      setAuthTestError('');
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const gen = ++requestGenRef.current;
      setRepoStatus('checking');
      setCompatibilityStatus('idle');
      setCompatibilityMessage('');
      setAuthTestStatus('idle');
      setAuthTestError('');

      const status = await checkRepoAccess(parsed);
      if (requestGenRef.current !== gen) return;
      setRepoStatus(status);

      if (status === 'public') {
        runCompatibilityChecks(parsed, {}, gen);
      }
    }, 700);

    return () => clearTimeout(debounceRef.current);
  }, [parsed, repoUrl]);

  async function handlePrivateAuthTest() {
    if (!parsed) return;
    setAuthTestStatus('testing');
    setAuthTestError('');

    const result = await testPrivateAuth(parsed, username.trim(), token.trim());
    if (!result.success) {
      setAuthTestStatus('error');
      setAuthTestError(result.error || 'Authentication failed');
      setCompatibilityStatus('idle');
      setCompatibilityMessage('');
      return;
    }

    setAuthTestStatus('success');
    const gen = ++requestGenRef.current;
    const authHeaders = buildAuthHeaders(parsed, username.trim(), token.trim());
    runCompatibilityChecks(parsed, authHeaders, gen);
  }

  function handleDeploy() {
    const finalRepo = repoUrl.trim();
    const finalBranch = branch || 'main';
    const finalSubdir = subdirectory || '';
    const isPrivate = repoStatus === 'inaccessible' && authTestStatus === 'success';

    const prefill = {
      url: finalRepo,
      branch: finalBranch,
      subdirectory: finalSubdir,
      username: isPrivate ? username.trim() : '',
      token: isPrivate ? token.trim() : '',
      isPrivate,
      repoStatus,
      authTestStatus: isPrivate ? 'success' : 'idle',
      compatibilityStatus,
      compatibilityMessage,
    };

    sessionStorage.setItem(HERO_PREFILL_KEY, JSON.stringify(prefill));

    const wizardParams = new URLSearchParams({ repo: finalRepo, branch: finalBranch });
    if (finalSubdir) wizardParams.set('subdirectory', finalSubdir);

    const dest = `/dashboard/deploy?${wizardParams.toString()}`;
    if (isAuthenticated) {
      navigate(dest);
    } else {
      navigate(`/login?redirect=${encodeURIComponent(dest)}`);
    }
  }

  // Re-run compatibility when branch or subdirectory changes
  useEffect(() => {
    if (!parsed || repoStatus === 'idle' || branches.length === 0) return;
    
    const gen = ++requestGenRef.current;
    const authHeaders = (repoStatus === 'inaccessible' && authTestStatus === 'success')
      ? buildAuthHeaders(parsed, username.trim(), token.trim())
      : {};
    
    setCompatibilityStatus('checking');
    checkCompatibility(parsed, branch, subdirectory, authHeaders)
      .then((compat) => {
        if (requestGenRef.current !== gen) return;
        
        // If root is incompatible but directories exist and no subdirectory selected, show helpful message
        if (compat.status === 'incompatible' && directories.length > 0 && !subdirectory) {
          setCompatibilityStatus('warning');
          setCompatibilityMessage(`Multiple projects detected • Select a subdirectory below`);
        } else {
          setCompatibilityStatus(compat.status);
          setCompatibilityMessage(compat.message || '');
        }
      });
  }, [branch, subdirectory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdowns on outside click
  useEffect(() => {
    function onOutside(e) {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(e.target)) {
        setBranchOpen(false);
      }
      if (subdirDropdownRef.current && !subdirDropdownRef.current.contains(e.target)) {
        setSubdirOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const compatible = compatibilityStatus === 'compatible' || compatibilityStatus === 'warning';
  const hasAccess =
    repoStatus === 'public' ||
    (repoStatus === 'inaccessible' && authTestStatus === 'success');
  const canDeploy = Boolean(parsed) && hasAccess && compatible;

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-20 lg:py-24">
      {/* Elegant background gradient */}
      <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-radial from-primary/8 via-primary/4 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-gradient-radial from-accent/6 via-accent/3 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Form */}
          <div>
            {/* Badge */}
            {/* Heading */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="font-heading font-light text-5xl lg:text-6xl xl:text-7xl text-text leading-[1.1] tracking-tight mb-6"
            >
              Deploy from Git.
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                Live in minutes.
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="text-lg text-text-secondary/70 mb-10 leading-relaxed font-light max-w-xl"
            >
              Paste your repository. Automatic framework detection, zero-config builds, and global deployment across 10,000+ Flux nodes.
            </motion.p>

            {/* Main card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="relative rounded-2xl border border-border/40 bg-gradient-to-b from-surface/80 to-surface/40 backdrop-blur-2xl shadow-2xl shadow-black/5 p-6 sm:p-8">
                {/* Subtle top border glow */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            
                {/* URL Input */}
                <div className="mb-5">
                  <div className="relative group">
                {/* Provider icon on the left */}
                {parsed?.provider && PROVIDER_ICONS[parsed.provider] && (() => {
                  const Icon = PROVIDER_ICONS[parsed.provider];
                  return (
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none z-10">
                      <Icon className="w-5 h-5" />
                    </span>
                  );
                })()}
                
                <input
                  type="url"
                  placeholder="https://github.com/username/repository"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  autoComplete="off"
                  spellCheck="false"
                  className={`w-full h-16 ${parsed?.provider && PROVIDER_ICONS[parsed.provider] ? 'pl-14' : 'pl-6'} pr-6 bg-background/60 border border-border/50 rounded-xl text-text text-base placeholder:text-text-muted/40 outline-none ring-0 focus:ring-0 focus:outline-none focus:bg-background/90 focus:border-primary/30 transition-[background-color,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] font-mono focus:shadow-[0_0_0_3px_rgba(99,102,241,0.06),0_1px_2px_0_rgba(0,0,0,0.05)]`}
                />
                
                {/* Provider badge on the right (removed - icon is enough) */}
              </div>

              {/* Status message */}
              <div className="mt-4 flex items-center px-1">
                {repoStatus === 'idle' && (
                  <p className="text-sm text-text-muted/50 flex items-center gap-2.5">
                    <Info className="w-4 h-4" />
                    GitHub, GitLab, and Bitbucket supported
                  </p>
                )}

                {repoStatus === 'invalid' && (
                  <p className="text-sm text-amber-400/90 flex items-center gap-2.5 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    Please provide a valid HTTPS repository URL
                  </p>
                )}

                {repoStatus === 'checking' && (
                  <p className="text-sm text-text-muted/70 flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying repository access...
                  </p>
                )}

                {repoStatus === 'inaccessible' && authTestStatus !== 'success' && (
                  <p className="text-sm text-amber-400/90 flex items-center gap-2.5 font-medium">
                    <Lock className="w-4 h-4" />
                    Private repository: authentication required
                  </p>
                )}

                {repoStatus === 'unknown' && (
                  <p className="text-sm text-red-400/90 flex items-center gap-2.5">
                    <XCircle className="w-4 h-4" />
                    Unable to access repository
                  </p>
                )}
              </div>
            </div>

            {/* Private auth section */}
            {repoStatus === 'inaccessible' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.4 }}
                className="mb-6"
              >
                <div className="p-6 border border-amber-500/20 rounded-xl bg-gradient-to-br from-amber-500/5 via-amber-500/3 to-transparent">
                  <div className="flex items-start gap-3 mb-5">
                    <ShieldCheck className="w-5 h-5 text-amber-400/80 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-300/80 mb-1 font-medium">
                        Private Repository Authentication
                      </p>
                      <p className="text-xs text-amber-300/60 leading-relaxed">
                        Provide read-only access credentials to validate and deploy your private repository.
                        {provider?.tokenUrl && (
                          <>
                            {' '}
                            <a
                              href={provider.tokenUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-amber-200/90 transition-colors font-medium"
                            >
                              Generate token →
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3.5 mb-5">
                    <input
                      type="text"
                      placeholder="Username or email"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setAuthTestStatus('idle');
                        setAuthTestError('');
                        setCompatibilityStatus('idle');
                      }}
                      className="w-full h-12 px-4 bg-background/50 border border-border/40 rounded-lg text-text text-sm placeholder:text-text-muted/40 outline-none ring-0 focus:ring-0 focus:outline-none focus:bg-background/80 focus:border-amber-400/25 transition-[background-color,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus:shadow-[0_0_0_3px_rgba(251,191,36,0.04),0_1px_2px_0_rgba(0,0,0,0.05)]"
                    />
                    <div className="relative">
                      <input
                        type={showToken ? 'text' : 'password'}
                        placeholder="Personal access token"
                        value={token}
                        onChange={(e) => {
                          setToken(e.target.value);
                          setAuthTestStatus('idle');
                          setAuthTestError('');
                          setCompatibilityStatus('idle');
                        }}
                        className="w-full h-12 px-4 pr-20 bg-background/50 border border-border/40 rounded-lg text-text text-sm placeholder:text-text-muted/40 outline-none ring-0 focus:ring-0 focus:outline-none focus:bg-background/80 focus:border-amber-400/25 transition-[background-color,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus:shadow-[0_0_0_3px_rgba(251,191,36,0.04),0_1px_2px_0_rgba(0,0,0,0.05)] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken((v) => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted/70 hover:text-text text-xs font-medium transition-colors"
                      >
                        {showToken ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={handlePrivateAuthTest}
                      disabled={!username.trim() || !token.trim() || authTestStatus === 'testing'}
                      className="px-5 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 hover:border-amber-500/40 text-amber-200 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed outline-none ring-0 focus:ring-0 focus:outline-none focus:shadow-[0_0_0_3px_rgba(251,191,36,0.12)]"
                    >
                      {authTestStatus === 'testing' ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Validating...
                        </span>
                      ) : (
                        'Validate Credentials'
                      )}
                    </button>

                    {authTestStatus === 'success' && (
                      <span className="text-sm text-emerald-400 flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-4 h-4" />
                        Authenticated
                      </span>
                    )}

                    {authTestStatus === 'error' && (
                      <span className="text-sm text-red-400/90 flex items-center gap-2 font-medium">
                        <XCircle className="w-4 h-4" />
                        {authTestError}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Branch & Subdirectory selectors (shown when repository is verified) */}
            {(repoStatus === 'public' || (repoStatus === 'inaccessible' && authTestStatus === 'success')) && branches.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                transition={{ duration: 0.3 }}
                className="mb-6 space-y-4"
              >
                {/* Branch selector */}
                <div ref={branchDropdownRef}>
                  <label className="block text-sm font-medium text-text/80 mb-2 flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5" /> Branch
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setBranchOpen((v) => !v)}
                      className="w-full h-12 px-4 bg-background/50 border border-border/40 rounded-lg text-text text-sm text-left flex items-center justify-between outline-none ring-0 focus:ring-0 focus:outline-none focus:bg-background/80 focus:border-primary/30 transition-[background-color,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.06),0_1px_2px_0_rgba(0,0,0,0.05)]"
                    >
                      <span className="flex items-center gap-2">
                        <GitBranch className="w-3.5 h-3.5 text-text-muted" />
                        {branch}
                        {branches.find((b) => b.name === branch && b.isDefault) && (
                          <span className="text-xs text-primary">★ default</span>
                        )}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 ${branchOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {branchOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute z-20 top-full mt-2 left-0 right-0 bg-surface/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl max-h-52 overflow-y-auto"
                        >
                          {branches.map((b) => (
                            <button
                              key={b.name}
                              type="button"
                              onClick={() => {
                                setBranch(b.name);
                                setBranchOpen(false);
                              }}
                              className={`flex items-center justify-between w-full px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors ${b.name === branch ? 'text-primary bg-primary/5' : 'text-text'}`}
                            >
                              <span className="flex items-center gap-2">
                                <GitBranch className="w-3.5 h-3.5 text-text-muted" />
                                {b.name}
                              </span>
                              {b.isDefault && <span className="text-xs text-primary">★</span>}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Subdirectory combobox (for monorepos) */}
                {directories.length > 0 && (
                  <div ref={subdirDropdownRef}>
                    <label className="block text-sm font-medium text-text/80 mb-2 flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" /> Subdirectory
                      <span className="text-text-muted/70 font-normal text-xs">(optional for monorepos)</span>
                      {dirLoading && <Loader2 className="w-3 h-3 animate-spin text-text-muted" />}
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="/ (root) or /apps/web"
                        value={subdirectory}
                        onChange={(e) => setSubdirectory(e.target.value)}
                        onFocus={() => setSubdirOpen(true)}
                        className="w-full h-12 px-4 pr-10 bg-background/50 border border-border/40 rounded-lg text-text text-sm placeholder:text-text-muted/40 outline-none ring-0 focus:ring-0 focus:outline-none focus:bg-background/80 focus:border-primary/30 transition-[background-color,border-color,box-shadow] duration-[400ms] ease-[cubic-bezier(0.4,0,0.2,1)] focus:shadow-[0_0_0_3px_rgba(99,102,241,0.06),0_1px_2px_0_rgba(0,0,0,0.05)] font-mono"
                      />
                      <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none transition-transform duration-200 ${subdirOpen ? 'rotate-180' : ''}`} />
                      
                      <AnimatePresence>
                        {subdirOpen && directories.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute z-20 top-full mt-2 left-0 right-0 bg-surface/95 backdrop-blur-xl border border-border rounded-lg shadow-2xl max-h-52 overflow-y-auto"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSubdirectory('');
                                setSubdirOpen(false);
                              }}
                              className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors ${!subdirectory ? 'text-primary bg-primary/5' : 'text-text'}`}
                            >
                              <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                              / <span className="text-xs text-text-muted ml-1">(root)</span>
                            </button>
                            {directories.map((dir) => (
                              <button
                                key={dir}
                                type="button"
                                onClick={() => {
                                  setSubdirectory(dir);
                                  setSubdirOpen(false);
                                }}
                                className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors ${dir === subdirectory ? 'text-primary bg-primary/5' : 'text-text'}`}
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-text-muted" />
                                {dir}
                              </button>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Compatibility status */}
            {compatibilityStatus !== 'idle' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-6 px-1 flex items-center"
              >
                {compatibilityStatus === 'checking' && (
                  <p className="text-sm text-text-muted/70 flex items-center gap-2.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing repository structure...
                  </p>
                )}
                {compatibilityStatus === 'compatible' && (
                  <p className="text-sm text-emerald-400 flex items-center gap-2.5 font-medium">
                    <CheckCircle2 className="w-4 h-4" />
                    Ready for deployment{compatibilityMessage ? ` • ${compatibilityMessage}` : ''}
                  </p>
                )}
                {compatibilityStatus === 'warning' && (
                  <p className="text-sm text-amber-400/90 flex items-center gap-2.5 font-medium">
                    <AlertTriangle className="w-4 h-4" />
                    {compatibilityMessage || 'Additional configuration required'}
                  </p>
                )}
                {compatibilityStatus === 'incompatible' && directories.length === 0 && (
                  <p className="text-sm text-red-400/90 flex items-center gap-2.5 font-medium">
                    <XCircle className="w-4 h-4" />
                    {compatibilityMessage}
                  </p>
                )}
              </motion.div>
            )}

            {/* Deploy button */}
            <button
              type="button"
              onClick={handleDeploy}
              disabled={!canDeploy}
              className="group relative w-full h-12 overflow-hidden bg-gradient-to-r from-primary via-primary to-accent hover:shadow-2xl hover:shadow-primary/30 text-white font-bold text-base rounded-xl transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-3 outline-none ring-0 focus:ring-0 focus:outline-none focus:shadow-[0_0_0_3px_rgba(99,102,241,0.25),0_8px_32px_-4px_rgba(99,102,241,0.4)]"
            >
              <span className="relative z-10">Deploy to Flux</span>
              <ArrowRight className="relative z-10 w-5 h-5 group-hover:translate-x-1 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-white/10 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            </button>

            <p className="mt-5 text-center text-xs text-text-muted/50 font-light">
              Secure authentication • Pre-configured deployment settings • Takes 60 seconds
            </p>
              </div>
            </motion.div>
          </div>

          {/* Right Column - Dashboard Preview */}
          <div className="hidden lg:block">
            <DashboardPreview frameless />
          </div>
        </div>
      </div>
    </section>
  );
}
