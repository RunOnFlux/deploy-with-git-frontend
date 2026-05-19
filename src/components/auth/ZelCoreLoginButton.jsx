import { useState, useEffect, useRef } from 'react';
import authService from '../../services/authService';
import zelcoreUrl from '../../assets/zelcore.svg';

const ZELCORE_TIMEOUT_MS = 3 * 60 * 1000;

export default function ZelCoreLoginButton({ onSuccess, onError, compact = false }) {
  const [status, setStatus] = useState('idle');
  const wsRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleClick() {
    if (status === 'waiting') return;
    setStatus('waiting');

    let loginPhrase, stickyBackend;
    try {
      ({ loginPhrase, stickyBackend } = await authService.getLoginPhraseWithSticky());
    } catch {
      setStatus('idle');
      onError?.(new Error('Failed to connect to Flux network. Please try again.'));
      return;
    }

    const wsUrl = stickyBackend.replace(/^https?/, 'wss');
    let ws;
    try {
      ws = new WebSocket(`${wsUrl}/ws/id/${loginPhrase}`);
      wsRef.current = ws;
    } catch {
      setStatus('idle');
      onError?.(new Error('Failed to open WebSocket to Flux node.'));
      return;
    }

    const iconUrl = encodeURIComponent(`${window.location.origin}/orbit-icon.svg`);
    const callbackUrl = encodeURIComponent(`${stickyBackend}/id/verifylogin`);
    window.location.href = `zel:?action=sign&message=${loginPhrase}&icon=${iconUrl}&callback=${callbackUrl}`;

    timeoutRef.current = setTimeout(() => {
      ws.close();
      setStatus('idle');
      onError?.(new Error('ZelCore sign request timed out. Please try again.'));
    }, ZELCORE_TIMEOUT_MS);

    ws.onmessage = async (event) => {
      clearTimeout(timeoutRef.current);
      ws.close();
      try {
        const parsed = new URLSearchParams(event.data);
        const wsStatus = parsed.get('status');
        const zelid = parsed.get('data[zelid]') || parsed.get('zelid');
        const signature = parsed.get('data[signature]') || parsed.get('signature');
        if (wsStatus !== 'success' || !zelid || !signature) throw new Error('Invalid ZelCore response');
        const zelidauth = await authService.finalizeZelCoreAuth({ zelid, signature, loginPhrase, stickyBackend });
        setStatus('success');
        onSuccess?.({ zelidauth });
      } catch (err) {
        setStatus('idle');
        onError?.(err);
      }
    };

    ws.onerror = () => {
      clearTimeout(timeoutRef.current);
      setStatus('idle');
      onError?.(new Error('WebSocket connection to Flux node failed.'));
    };
  }

  const waiting = status === 'waiting';
  const icon = <img src={zelcoreUrl} alt="" className={compact ? 'w-5 h-5' : 'w-5 h-5 shrink-0'} />;

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={waiting}
        className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 border border-border/50 rounded-lg text-xs text-text-secondary hover:text-text hover:border-border/80 hover:bg-white/4 transition-all duration-150 disabled:opacity-50 outline-none focus:border-primary/40"
      >
        {waiting ? <span className="w-5 h-5 border-2 border-border border-t-text-muted rounded-full animate-spin" /> : icon}
        <span>ZelCore</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={waiting}
      className="w-full flex items-center gap-3 h-11 px-4 border border-border/50 rounded-lg text-sm text-text-secondary hover:text-text hover:border-border/80 hover:bg-white/4 transition-all duration-150 disabled:opacity-50 outline-none focus:border-primary/40"
    >
      {icon}
      <span>{waiting ? 'Waiting for ZelCore…' : 'Continue with ZelCore'}</span>
    </button>
  );
}
