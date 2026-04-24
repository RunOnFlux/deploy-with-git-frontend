import { useState, useEffect } from 'react';
import { EnvelopeIcon, LockClosedIcon, UserIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import GoogleLoginButton from './GoogleLoginButton';
import ZelCoreLoginButton from './ZelCoreLoginButton';
import SSPLoginButton from './SSPLoginButton';
import authService from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

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
 * - ZelCore wallet (deep link + WS)
 * - SSP wallet (browser extension)
 * - Email / password (register + verify + login)
 */
export default function LoginModal({ isOpen, onClose, onSuccess }) {
  const { onWalletAuthSuccess } = useAuth();
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

  function handleAuthSuccess({ zelidauth } = {}) {
    // For wallet logins (ZelCore/SSP), zelidauth is set but no Firebase user exists.
    // We must update AuthContext state so isAuthenticated becomes true.
    if (zelidauth) {
      onWalletAuthSuccess({ zelidauth });
    }
    onSuccess?.({ zelidauth });
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
        <div className="flex flex-col gap-3">
          <div className="text-center mb-2">
            <h2 className="text-xl font-bold text-text">Sign in to Orbit</h2>
            <p className="text-sm text-text-secondary mt-1">
              Deploy your apps to the Flux network
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
              {error}
            </p>
          )}

          <GoogleLoginButton onSuccess={handleAuthSuccess} onError={handleAuthError} />
          <ZelCoreLoginButton onSuccess={handleAuthSuccess} onError={handleAuthError} />
          <SSPLoginButton onSuccess={handleAuthSuccess} onError={handleAuthError} />

          {divider}

          <Button
            variant="secondary"
            fullWidth
            onClick={() => { clearError(); setView(VIEW.EMAIL_LOGIN); }}
          >
            <EnvelopeIcon className="w-4 h-4" />
            Continue with Email
          </Button>

          <p className="text-center text-xs text-text-muted pt-1">
            No account?{' '}
            <button
              className="text-primary hover:underline"
              onClick={() => { clearError(); setView(VIEW.EMAIL_REGISTER); }}
            >
              Create one free
            </button>
          </p>
        </div>
      )}

      {/* ── Email login ── */}
      {view === VIEW.EMAIL_LOGIN && (
        <form onSubmit={handleEmailLogin} className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => { clearError(); setView(VIEW.CHOOSE); }}
            className="text-xs text-text-secondary hover:text-text text-left"
          >
            ← Back
          </button>

          <div>
            <h2 className="text-xl font-bold text-text">Welcome back</h2>
            <p className="text-sm text-text-secondary mt-0.5">Sign in with your email</p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
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
              placeholder="Password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 bottom-2.5 text-text-muted hover:text-text transition-colors"
              tabIndex={-1}
            >
              {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Sign in
          </Button>

          <p className="text-center text-xs text-text-muted">
            No account?{' '}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => { clearError(); setView(VIEW.EMAIL_REGISTER); }}
            >
              Create one free
            </button>
          </p>
        </form>
      )}

      {/* ── Email register ── */}
      {view === VIEW.EMAIL_REGISTER && (
        <form onSubmit={handleEmailRegister} className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => { clearError(); setView(VIEW.CHOOSE); }}
            className="text-xs text-text-secondary hover:text-text text-left"
          >
            ← Back
          </button>

          <div>
            <h2 className="text-xl font-bold text-text">Create account</h2>
            <p className="text-sm text-text-secondary mt-0.5">
              Free forever, no credit card required
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
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
              placeholder="At least 8 characters"
              hint="Minimum 8 characters"
              required
              minLength={8}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-3 bottom-2.5 text-text-muted hover:text-text transition-colors"
              tabIndex={-1}
            >
              {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>

          <Button type="submit" fullWidth loading={loading}>
            Create account
          </Button>

          <p className="text-center text-xs text-text-muted">
            Already have one?{' '}
            <button
              type="button"
              className="text-primary hover:underline"
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
