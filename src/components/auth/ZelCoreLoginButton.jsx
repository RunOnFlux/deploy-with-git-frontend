import { useState, useEffect, useRef } from 'react';
import Button from '../common/Button';
import authService from '../../services/authService';
import zelcoreUrl from '../../assets/zelcore.svg';

const ZELCORE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minute window

/**
 * ZelCore wallet login button.
 *
 * Flow:
 * 1. Fetches loginPhrase + stickyBackend from BFF
 * 2. Opens ZelCore deep link (zel:?action=sign…) on the device
 * 3. Listens on WebSocket for the signed response from ZelCore
 * 4. Calls onSuccess({ zelidauth }) when signature verified
 */
export default function ZelCoreLoginButton({ onSuccess, onError }) {
  const [status, setStatus] = useState('idle'); // idle | waiting | success | error
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
      setStatus('error');
      onError?.(new Error('Failed to connect to Flux network. Please try again.'));
      setStatus('idle');
      return;
    }

    // WebSocket to the sticky node
    const wsUrl = stickyBackend.replace(/^https?/, 'wss');
    let ws;
    try {
      ws = new WebSocket(`${wsUrl}/ws/id/${loginPhrase}`);
      wsRef.current = ws;
    } catch {
      setStatus('error');
      onError?.(new Error('Failed to open WebSocket to Flux node.'));
      setStatus('idle');
      return;
    }

    // Open ZelCore deep link
    const iconUrl = encodeURIComponent(`${window.location.origin}/orbit-icon.svg`);
    const callbackUrl = encodeURIComponent(`${stickyBackend}/id/verifylogin`);
    window.location.href = `zel:?action=sign&message=${loginPhrase}&icon=${iconUrl}&callback=${callbackUrl}`;

    // Timeout if ZelCore doesn't respond
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

        if (wsStatus !== 'success' || !zelid || !signature) {
          throw new Error('Invalid ZelCore response');
        }

        const zelidauth = await authService.finalizeZelCoreAuth({
          zelid,
          signature,
          loginPhrase,
          stickyBackend,
        });

        setStatus('success');
        onSuccess?.({ zelidauth });
      } catch (err) {
        setStatus('error');
        onError?.(err);
        setStatus('idle');
      }
    };

    ws.onerror = () => {
      clearTimeout(timeoutRef.current);
      setStatus('error');
      onError?.(new Error('WebSocket connection to Flux node failed.'));
      setStatus('idle');
    };
  }

  const labels = {
    idle: 'Continue with ZelCore',
    waiting: 'Waiting for ZelCore…',
    success: 'Signed in!',
    error: 'Try again',
  };

  return (
    <Button
      variant="secondary"
      fullWidth
      disabled={status === 'waiting'}
      onClick={handleClick}
      className="!justify-start pl-16 gap-3"
    >
      <img src={zelcoreUrl} alt="" className="w-6 h-6 shrink-0 rounded-full" />
      {labels[status]}
      {status === 'waiting' && (
        <svg className="ml-auto w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
    </Button>
  );
}
