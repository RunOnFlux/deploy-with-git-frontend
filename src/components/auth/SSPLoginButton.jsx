import { useState } from 'react';
import authService from '../../services/authService';
import sspUrl from '../../assets/ssp.svg';

export default function SSPLoginButton({ onSuccess, onError, compact = false }) {
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
      if (!address || !signature) throw new Error('SSP returned an incomplete response. Please try again.');
      const zelidauth = await authService.finalizeSSPAuth({ zelid: address, signature, loginPhrase, stickyBackend });
      onSuccess?.({ zelidauth });
    } catch (error) {
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }

  const icon = <img src={sspUrl} alt="" className={compact ? 'w-5 h-5' : 'w-5 h-5 shrink-0'} />;

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 border border-border/50 rounded-lg text-xs text-text-secondary hover:text-text hover:border-border/80 hover:bg-white/4 transition-all duration-150 disabled:opacity-50 outline-none focus:border-primary/40"
      >
        {loading ? <span className="w-5 h-5 border-2 border-border border-t-text-muted rounded-full animate-spin" /> : icon}
        <span>SSP</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full flex items-center gap-3 h-11 px-4 border border-border/50 rounded-lg text-sm text-text-secondary hover:text-text hover:border-border/80 hover:bg-white/4 transition-all duration-150 disabled:opacity-50 outline-none focus:border-primary/40"
    >
      {icon}
      <span>{loading ? 'Connecting…' : 'Continue with SSP Wallet'}</span>
    </button>
  );
}
