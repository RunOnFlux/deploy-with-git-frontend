import { useState, useEffect } from 'react';
import { EnvelopeIcon, LockClosedIcon, UserIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import GoogleLoginButton from './GoogleLoginButton';
import authService from '../../services/authService';

// Views within the modal
const VIEW = {
  CHOOSE: 'choose',       // Method selection
  EMAIL_LOGIN: 'email_login',
  EMAIL_REGISTER: 'email_register',
  VERIFY_EMAIL: 'verify_email', // Post-registration email check
};

/**
 * Full-screen login modal supporting:
 * - Google OAuth
 * - Email / password (register + verify + login)
 */
export default function LoginModal({ isOpen, onClose, onSuccess }) {
  const [view, setView] = useState(VIEW.CHOOSE);
  const [error, setError] = useState('');

  // Email form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  // Email verification polling
  const [verifyEmail, setVerifyEmail] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Prefetch dashboard chunks while the user is signing in so navigation
  // after auth is instant (no Suspense fallback delay).
  useEffect(() => {
    if (!isOpen) return;
    import('../../pages/dashboard/DashboardLayout');
    import('../../pages/dashboard/Overview');
  }, [isOpen]);

  // Reset view when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView(VIEW.CHOOSE);
      setError('');
      setEmail('');
      setPassword('');
      setName('');
    }
  }, [isOpen]);

  // Poll for email verification every 5s
  useEffect(() => {
    if (view !== VIEW.VERIFY_EMAIL) return;
    const id = setInterval(async () => {
      const result = await authService.checkEmailVerified();
      if (result.verified) {
        clearInterval(id);
        onSuccess?.({ user: result.user, zelidauth: result.zelidauth });
        onClose();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [view, onSuccess, onClose]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  function clearError() {
    if (error) setError('');
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  async function handleEmailLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authService.loginWithEmail(email, password);
      // AuthContext's onAuthStateChanged will fire and storeZelidAuth → navigate
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailRegister(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { email: confirmedEmail } = await authService.registerWithEmail(email, password, name);
      setVerifyEmail(confirmedEmail);
      setVerifyPassword(password);
      setView(VIEW.VERIFY_EMAIL);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    if (resendCooldown > 0) return;
    try {
      await authService.resendVerificationEmail(verifyEmail, verifyPassword);
      setResendCooldown(60);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleAuthSuccess() {
    onSuccess?.();
    onClose();
  }

  function handleAuthError(err) {
    setError(err?.message || 'Sign in failed. Please try again.');
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const divider = (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-text-muted">or</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm">
      {/* ── Method selection ── */}
      {view === VIEW.CHOOSE && (
        <div className="flex flex-col gap-4">
          <div className="text-center mb-3">
            <h2 className="text-2xl font-semibold text-text mb-2">Sign in to Orbit</h2>
            <p className="text-sm text-text-secondary/70">
              Deploy your apps to the Flux decentralized cloud
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-center">
              {error}
            </p>
          )}

          <GoogleLoginButton onSuccess={handleAuthSuccess} onError={handleAuthError} />

          {divider}

          <Button
            variant="secondary"
            fullWidth
            onClick={() => { clearError(); setView(VIEW.EMAIL_LOGIN); }}
            className="!justify-start pl-14 gap-3 !h-12"
          >
            <EnvelopeIcon className="w-5 h-5 shrink-0" />
            Continue with Email
          </Button>

          <p className="text-center text-xs text-text-muted/70 pt-2">
            Don't have an account?{' '}
            <button
              className="text-primary hover:text-primary/80 font-medium transition-colors"
              onClick={() => { clearError(); setView(VIEW.EMAIL_REGISTER); }}
            >
              Sign up free
            </button>
          </p>
        </div>
      )}

      {/* ── Email login ── */}
      {view === VIEW.EMAIL_LOGIN && (
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-5">
          <button
            type="button"
            onClick={() => { clearError(); setView(VIEW.CHOOSE); }}
            className="text-sm text-text-secondary hover:text-text text-left transition-colors flex items-center gap-1"
          >
            ← Back
          </button>

          <div className="mb-1">
            <h2 className="text-2xl font-semibold text-text mb-2">Welcome back</h2>
            <p className="text-sm text-text-secondary/70">Sign in to your Orbit account</p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={EnvelopeIcon}
            placeholder="you@example.com"
            required
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPass ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={LockClosedIcon}
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 bottom-3 text-text-muted hover:text-text transition-colors"
              tabIndex={-1}
            >
              {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>

          <Button type="submit" fullWidth loading={loading} className="!h-12 !text-base">
            Sign in
          </Button>

          <p className="text-center text-xs text-text-muted/70">
            Don't have an account?{' '}
            <button
              type="button"
              className="text-primary hover:text-primary/80 font-medium transition-colors"
              onClick={() => { clearError(); setView(VIEW.EMAIL_REGISTER); }}
            >
              Sign up free
            </button>
          </p>
        </form>
      )}

      {/* ── Email register ── */}
      {view === VIEW.EMAIL_REGISTER && (
        <form onSubmit={handleEmailRegister} className="flex flex-col gap-5">
          <button
            type="button"
            onClick={() => { clearError(); setView(VIEW.CHOOSE); }}
            className="text-sm text-text-secondary hover:text-text text-left transition-colors flex items-center gap-1"
          >
            ← Back
          </button>

          <div className="mb-1">
            <h2 className="text-2xl font-semibold text-text mb-2">Create your account</h2>
            <p className="text-sm text-text-secondary/70">
              Free forever • No credit card required
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <Input
            label="Name (optional)"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            leftIcon={UserIcon}
            placeholder="Your name"
          />

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={EnvelopeIcon}
            placeholder="you@example.com"
            required
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPass ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={LockClosedIcon}
              placeholder="Create a strong password"
              hint="Minimum 8 characters"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 bottom-3 text-text-muted hover:text-text transition-colors"
              tabIndex={-1}
            >
              {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>

          <Button type="submit" fullWidth loading={loading} className="!h-12 !text-base">
            Create account
          </Button>

          <p className="text-center text-xs text-text-muted/70">
            Already have an account?{' '}
            <button
              type="button"
              className="text-primary hover:text-primary/80 font-medium transition-colors"
              onClick={() => { clearError(); setView(VIEW.EMAIL_LOGIN); }}
            >
              Sign in
            </button>
          </p>
        </form>
      )}

      {/* ── Email verification pending ── */}
      {view === VIEW.VERIFY_EMAIL && (
        <div className="flex flex-col items-center gap-4 text-center py-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <EnvelopeIcon className="w-7 h-7 text-primary" />
          </div>

          <div>
            <h2 className="text-xl font-bold text-text">Check your inbox</h2>
            <p className="text-sm text-text-secondary mt-1">
              We sent a verification link to{' '}
              <span className="text-text font-medium">{verifyEmail}</span>
            </p>
          </div>

          <p className="text-xs text-text-muted">
            This page will sign you in automatically once your email is verified.
          </p>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 w-full">
              {error}
            </p>
          )}

          <Button
            variant="secondary"
            onClick={handleResendVerification}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
          </Button>

          <button
            className="text-xs text-text-muted hover:text-text transition-colors"
            onClick={() => { clearError(); setView(VIEW.CHOOSE); }}
          >
            Use a different method
          </button>
        </div>
      )}
    </Modal>
  );
}
