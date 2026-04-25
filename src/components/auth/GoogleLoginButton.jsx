import { useState } from 'react';
import Button from '../common/Button';
import authService from '../../services/authService';

/**
 * Google OAuth login button.
 * Triggers a Firebase popup and calls onSuccess({ user }) on completion.
 */
export default function GoogleLoginButton({ onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await authService.loginWithGoogle();
      onSuccess?.(result);
    } catch (error) {
      // User closing the popup is not an error worth surfacing
      if (
        error?.code !== 'auth/popup-closed-by-user' &&
        error?.code !== 'auth/cancelled-popup-request'
      ) {
        onError?.(error);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="secondary"
      fullWidth
      disabled={loading}
      onClick={handleClick}
      className="!justify-start pl-16 gap-3"
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Continue with Google
      {loading && (
        <svg className="ml-auto w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </Button>
  );
}
