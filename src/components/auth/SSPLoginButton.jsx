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
      loading={loading}
      onClick={handleClick}
      className="gap-3"
    >
      <img src="/ssp.svg" alt="" className="w-4 h-4 shrink-0" />
      Continue with SSP Wallet
    </Button>
  );
}
