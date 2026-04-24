import { useState, useEffect } from 'react';
import Button from '../common/Button';
import authService from '../../services/authService';

/**
 * SSP Wallet login button.
 *
 * Shown only when window.ssp is available (browser extension installed).
 * Flow:
 * 1. Fetch loginPhrase + stickyBackend from BFF
 * 2. Request signature from SSP extension
 * 3. POST to /api/node-verifylogin via BFF (avoids CORS)
 * 4. Store zelidauth + call onSuccess
 */
export default function SSPLoginButton({ onSuccess, onError }) {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check after a short delay to give the extension time to inject
    const id = setTimeout(() => {
      setAvailable(typeof window.ssp !== 'undefined');
    }, 500);
    return () => clearTimeout(id);
  }, []);

  if (!available) return null;

  async function handleClick() {
    setLoading(true);
    try {
      const { loginPhrase, stickyBackend } = await authService.getLoginPhraseWithSticky();

      // SSP extension API: window.ssp.request('sign', { message }) → { address, signature }
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
      <span className="text-base leading-none">🔑</span>
      Continue with SSP Wallet
    </Button>
  );
}
