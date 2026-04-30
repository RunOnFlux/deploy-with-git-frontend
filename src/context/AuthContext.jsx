import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, onAuthStateChanged } from '../utils/firebase';
import authService from '../services/authService';
import SessionTimer from '../components/auth/SessionTimer';

const AuthContext = createContext(null);

const SESSION_DURATION_MS = 90 * 60 * 1000;
const ZELIDAUTH_TTL_MS = 85 * 60 * 1000;
const WALLET_SESSION_KEY = 'wallet_session';

function formatUser(firebaseUser) {
  if (!firebaseUser) return null;
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    emailVerified: firebaseUser.emailVerified,
  };
}

function walletUser(zelid, loginType) {
  return {
    uid: zelid,
    email: null,
    displayName: zelid.slice(0, 8) + '…',
    photoURL: null,
    emailVerified: true,
    loginType,
  };
}

function saveWalletSession(za, loginType) {
  try {
    localStorage.setItem(WALLET_SESSION_KEY, JSON.stringify({
      zelidauth: za,
      loginType,
      loginTime: Date.now(),
    }));
  } catch { /* storage full */ }
}

function loadWalletSession() {
  try {
    const raw = localStorage.getItem(WALLET_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearWalletSession() {
  localStorage.removeItem(WALLET_SESSION_KEY);
  localStorage.removeItem('loginTime');
  localStorage.removeItem('loginType');
  localStorage.removeItem('zelidauth');
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [zelidauth, setZelidauth] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginType, setLoginType] = useState(null);

  const zelidFetchInFlight = useRef(false);

  /** Persist sticky backend to sessionStorage so services can read it without context */
  function applyStickyBackend(za) {
    if (za?._stickyBackend) {
      sessionStorage.setItem('stickyBackendDNS', za._stickyBackend);
    }
  }

  function handleLogout() {
    authService.logout();
    clearWalletSession();
    sessionStorage.removeItem('stickyBackendDNS');
    setUser(null);
    setZelidauth(null);
    setLoginType(null);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // ── No Firebase session ──────────────────────────────────────────────
      if (!firebaseUser) {
        const session = loadWalletSession();

        if (session?.zelidauth?.zelid && session.loginType) {
          const sessionExpired = Date.now() - (session.loginTime || 0) > SESSION_DURATION_MS;
          const tokenExpired =
            !session.zelidauth._issuedAt ||
            Date.now() - session.zelidauth._issuedAt > ZELIDAUTH_TTL_MS;

          if (!sessionExpired && !tokenExpired) {
            applyStickyBackend(session.zelidauth);
            setZelidauth(session.zelidauth);
            setLoginType(session.loginType);
            setUser(walletUser(session.zelidauth.zelid, session.loginType));
          } else {
            clearWalletSession();
          }
        }

        setAuthLoading(false);
        return;
      }

      // ── Firebase session ─────────────────────────────────────────────────
      if (!firebaseUser.emailVerified &&
          firebaseUser.providerData?.[0]?.providerId === 'password') {
        setUser(null);
        setZelidauth(null);
        setAuthLoading(false);
        return;
      }

      setUser(formatUser(firebaseUser));
      setLoginType('firebase');

      if (zelidFetchInFlight.current) {
        setAuthLoading(false);
        return;
      }
      zelidFetchInFlight.current = true;

      try {
        const za = await authService.storeZelidAuth(firebaseUser);
        applyStickyBackend(za);
        setZelidauth(za);
      } catch (err) {
        console.error('Failed to obtain zelidauth:', err);
      } finally {
        zelidFetchInFlight.current = false;
        setAuthLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  function onWalletAuthSuccess({ zelidauth: za }) {
    if (!za) return;
    const lt = za._loginType || 'zelcore';
    const zaWithMeta = { ...za, _issuedAt: za._issuedAt ?? Date.now() };
    applyStickyBackend(zaWithMeta);
    setZelidauth(zaWithMeta);
    setLoginType(lt);
    setUser(walletUser(za.zelid, lt));
    saveWalletSession(zaWithMeta, lt);
  }

  const value = {
    user,
    zelidauth,
    authLoading,
    loginType,
    isAuthenticated: Boolean(user),
    onWalletAuthSuccess,
    logout: handleLogout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {Boolean(user) && <SessionTimer onExpired={handleLogout} />}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export default AuthContext;
