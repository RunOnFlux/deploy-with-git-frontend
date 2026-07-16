import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import { GitBranch, Globe, ShieldCheck } from 'lucide-react';
import GoogleLoginButton from '../components/auth/GoogleLoginButton';
import DashboardPreview from '../components/landing/DashboardPreview';
import authService from '../services/authService';
import { useAuth } from '../context/AuthContext';
import { useNetworkStats, formatNodeCount, formatCountryCount } from '../hooks/useNetworkStats';

const TAB = { SIGNIN: 'signin', SIGNUP: 'signup' };

const inputCls =
  'w-full h-11 px-4 rounded-lg border border-white/10 bg-white/5 text-text text-sm ' +
  'placeholder:text-text-muted/40 outline-none focus:border-primary/50 focus:bg-white/8 transition-colors';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, authLoading } = useAuth();
  const { stats } = useNetworkStats();

  const redirectTo = searchParams.get('redirect') || '/dashboard';

  const [tab, setTab]                 = useState(TAB.SIGNIN);
  const [error, setError]             = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [name, setName]               = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifying, setVerifying]     = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!authLoading && isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, authLoading, navigate]);

  // Login page is always dark regardless of dashboard theme preference.
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) document.documentElement.setAttribute('data-theme', prev);
    };
  }, []);

  useEffect(() => {
    import('./dashboard/DashboardLayout');
    import('./dashboard/Overview');
  }, []);

  useEffect(() => {
    if (!verifying) return;
    const id = setInterval(async () => {
      const result = await authService.checkEmailVerified();
      if (result.verified) { clearInterval(id); navigate(redirectTo); }
    }, 5000);
    return () => clearInterval(id);
  }, [verifying, navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  function switchTab(t) { setTab(t); setError(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (tab === TAB.SIGNIN) {
        await authService.loginWithEmail(email, password);
        navigate(redirectTo);
      } else {
        const { email: confirmed } = await authService.registerWithEmail(email, password, name);
        setVerifyEmail(confirmed);
        setVerifyPassword(password);
        setVerifying(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    try {
      await authService.resendVerificationEmail(verifyEmail, verifyPassword);
      setResendCooldown(60);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAuthSuccess() {
    navigate(redirectTo);
  }
  function handleAuthError(err) {
    setError(err?.message || 'Sign in failed. Please try again.');
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#080c18' }}>

      {/* ── LEFT PANEL ── */}
      <div className="relative w-full lg:w-[480px] xl:w-[520px] shrink-0 flex flex-col"
           style={{ borderRight: '1px solid rgba(30,41,59,0.6)' }}>

        {/* subtle left-panel bg gradient */}
        <div className="absolute inset-0 pointer-events-none"
             style={{ background: 'linear-gradient(160deg, rgba(99,102,241,0.04) 0%, transparent 60%)' }} />

        {/* Logo */}
        <div className="relative z-10 p-10 pb-0">
          <Link to="/">
            <img src="/orbit-logo.svg" alt="Orbit" style={{ height: '1.3rem', opacity: 0.9 }} />
          </Link>
        </div>

        {/* Form — vertically centered in remaining space */}
        <div className="relative z-10 flex-1 flex items-center justify-center px-10 py-10">
          <div className="w-full" style={{ maxWidth: 400 }}>

            {verifying ? (
              /* ── email verify waiting state ── */
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center"
                     style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                  <EnvelopeIcon className="w-6 h-6" style={{ color: '#6366f1' }} />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-text">Check your inbox</h2>
                  <p className="text-sm text-text-muted mt-1">
                    Link sent to <span className="text-text font-medium">{verifyEmail}</span>
                  </p>
                </div>
                {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</p>}
                <button onClick={handleResend} disabled={resendCooldown > 0}
                        className="text-sm text-primary hover:underline disabled:opacity-40">
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
                </button>
                <br />
                <button onClick={() => { setVerifying(false); setError(''); }}
                        className="text-xs text-text-muted hover:text-text transition-colors">
                  Use a different method
                </button>
              </div>
            ) : (
              <>
                {/* Heading */}
                <p className="text-sm font-semibold mb-1" style={{ color: '#818cf8' }}>Welcome back</p>
                <h1 className="text-[1.85rem] font-bold text-text leading-tight mb-1">Sign in to Orbit</h1>
                <p className="text-sm text-text-muted mb-8">
                  Deploy apps on the Flux decentralized cloud.<br />Your code, your nodes, your way.
                </p>

                {/* Sign in / Sign up tabs */}
                <div className="flex gap-1 p-1 rounded-xl mb-6"
                     style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(30,41,59,0.8)' }}>
                  {[TAB.SIGNIN, TAB.SIGNUP].map(t => (
                    <button key={t} onClick={() => switchTab(t)}
                      className="flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-150"
                      style={tab === t
                        ? { background: '#fff', color: '#0f172a', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }
                        : { color: '#64748b' }}>
                      {t === TAB.SIGNIN ? 'Sign in' : 'Sign up'}
                    </button>
                  ))}
                </div>

                {/* Provider buttons */}
                <div className="mb-5">
                  <GoogleLoginButton onSuccess={handleAuthSuccess} onError={handleAuthError} />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px" style={{ background: 'rgba(30,41,59,0.8)' }} />
                  <span className="text-xs text-text-muted">or use email</span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(30,41,59,0.8)' }} />
                </div>

                {error && (
                  <p className="text-sm text-red-400 text-center mb-5 px-4 py-3 rounded-lg"
                     style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    {error}
                  </p>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  {tab === TAB.SIGNUP && (
                    <div>
                      <label className="block text-sm font-medium text-text mb-1.5">
                        Name <span className="text-text-muted font-normal">(optional)</span>
                      </label>
                      <input type="text" autoComplete="name" value={name}
                             onChange={e => setName(e.target.value)}
                             placeholder="Your name" className={inputCls} />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-text mb-1.5">Email</label>
                    <input type="email" autoComplete="email" value={email}
                           onChange={e => setEmail(e.target.value)}
                           placeholder="you@example.com" required className={inputCls} />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-medium text-text">Password</label>
                      {tab === TAB.SIGNIN && (
                        <button type="button" className="text-xs text-text-muted hover:text-primary transition-colors">
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        autoComplete={tab === TAB.SIGNIN ? 'current-password' : 'new-password'}
                        value={password} onChange={e => setPassword(e.target.value)}
                        placeholder={tab === TAB.SIGNUP ? 'Min. 8 characters' : 'Password'}
                        required minLength={tab === TAB.SIGNUP ? 8 : undefined}
                        className={`${inputCls} pr-10`} />
                      <button type="button" tabIndex={-1}
                              onClick={() => setShowPass(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors">
                        {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={loading}
                          className="w-full h-11 rounded-lg text-white text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#6366f1,#818cf8)', marginTop: 16 }}>
                    {loading
                      ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : (tab === TAB.SIGNIN ? 'Sign in' : 'Create account')}
                  </button>
                </form>

                <p className="text-sm text-text-muted text-center mt-5">
                  {tab === TAB.SIGNIN
                    ? <>No account?{' '}<button onClick={() => switchTab(TAB.SIGNUP)} className="text-primary hover:underline font-medium">Sign up free</button></>
                    : <>Already signed up?{' '}<button onClick={() => switchTab(TAB.SIGNIN)} className="text-primary hover:underline font-medium">Sign in</button></>
                  }
                </p>

                {/* Footer */}
                <div className="flex items-center justify-center gap-5 mt-10 pt-6"
                     style={{ borderTop: '1px solid rgba(30,41,59,0.5)' }}>
                  {[['Home', '/'], ['Docs', 'https://github.com/RunOnFlux/deploy-with-git-samples'], ['Privacy', '/privacy'], ['Terms', '/terms']].map(([label, href]) => (
                    <a key={label} href={href} className="text-xs text-text-muted/40 hover:text-text-muted transition-colors">{label}</a>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL: dashboard only ── */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center">

        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-[140px]"
               style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, rgba(167,139,250,0.06) 50%, transparent 70%)' }} />
        </div>

        {/* Content: heading + dashboard + bullets */}
        <div className="relative z-10 w-full py-12 flex flex-col gap-6" style={{ paddingLeft: '6rem', paddingRight: '6rem' }}>

          {/* Heading */}
          <h2 className="text-4xl font-bold text-text leading-tight">
            Your apps, running on<br />the world's most<br />resilient network.
          </h2>

          {/* Dashboard preview */}
          <DashboardPreview frameless />

          {/* Bullet points */}
          <div className="flex items-start gap-6">
            {[
              { Icon: GitBranch,   title: 'Git-native deploys', desc: 'Push to deploy. Auto-rollback on failure.' },
              { Icon: Globe,       title: `${formatNodeCount(stats)} nodes`, desc: `${formatCountryCount(stats)} countries, zero single point of failure.` },
              { Icon: ShieldCheck, title: 'You own it',         desc: 'No vendor lock-in, no platform risk.' },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex-1 flex items-start gap-2.5">
                <Icon className="w-8 h-8 text-primary shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text mb-0.5">{title}</p>
                  <p className="text-[11px] text-text-muted leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

    </div>
  );
}
