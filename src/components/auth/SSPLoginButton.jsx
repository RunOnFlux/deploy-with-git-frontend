import { useState } from 'react';
import Button from '../common/Button';
import authService from '../../services/authService';

/**
 * SSP Wallet login button.
 * Always rendered — shows an install prompt if the extension is not detected.
 */
export default function SSPLoginButton({ onSuccess, onError }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (typeof window.ssp === 'undefined') {
      onError?.(new Error('SSP wallet extension not found. Install it from ssp.runonflux.io and try again.'));
      return;
    }
    setLoading(true);
    try {
      const { loginPhrase, stickyBackend } = await authService.getLoginPhraseWithSticky();

      let signResult;
      try {
        signResult = await window.ssp.request('sign', { message: loginPhrase });
      } catch {
        throw new Error('SSP sign request was cancelled or failed.');
      }

      const { address, signature } = signResult;
      if (!address || !signature) {
        throw new Error('SSP returned an incomplete response. Please try again.');
      }

      const zelidauth = await authService.finalizeSSPAuth({
        zelid: address,
        signature,
        loginPhrase,
        stickyBackend,
      });

      onSuccess?.({ zelidauth });
    } catch (error) {
      onError?.(error);
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
      <img src="/ssp.svg" alt="" className="w-6 h-6 shrink-0" />
      Continue with SSP Wallet
      {loading && (
        <svg className="ml-auto w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </Button>
  );
}
