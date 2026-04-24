import {
  loginWithEmail as firebaseLoginWithEmail,
  createEmailAccount as firebaseCreateEmailAccount,
  loginWithGoogle as firebaseLoginWithGoogle,
  getUser,
  signOut as firebaseSignOut,
  sendVerificationEmail,
  updateUserProfile,
  reloadUser,
} from '../utils/firebase';
import secureStorage from '../utils/secureStorage';

// zelidauth sessions are valid for 85 minutes (just under the 90min auto-logout)
const ZELIDAUTH_TTL_MS = 85 * 60 * 1000;

// Cache the server config (SSO_PROVIDER) so we only fetch it once per page load.
let _serverConfig = null;
async function getServerConfig() {
  if (!_serverConfig) {
    const resp = await fetch('/api/config');
    _serverConfig = await resp.json();
  }
  return _serverConfig;
}

/**
 * Parse the `fluxnode` response header into a sticky backend URL.
 * Header format: "server78_65.109.86.26" → "https://65-109-86-26-16127.node.api.runonflux.io"
 */
function parseStickyBackend(fluxnodeHeader) {
  if (!fluxnodeHeader) return null;
  try {
    const ip = fluxnodeHeader.includes('_') ? fluxnodeHeader.split('_')[1] : fluxnodeHeader;
    const dashedIp = ip.trim().replace(/\./g, '-');
    return `https://${dashedIp}-16127.node.api.runonflux.io`;
  } catch {
    return null;
  }
}

/**
 * Fetch a fresh login phrase from Flux API via the BFF.
 * Returns { loginPhrase, stickyBackend } — both travel together through the auth flow.
 */
async function getLoginPhraseWithSticky() {
  const resp = await fetch('/api/flux/id/loginphrase');
  const stickyBackend = parseStickyBackend(resp.headers.get('fluxnode'));
  const json = await resp.json();

  if (json.status !== 'success' || !json.data) {
    throw new Error('Failed to retrieve login phrase from Flux network');
  }

  // NOTE: json.data IS the phrase string, not json.data.loginPhrase
  return { loginPhrase: json.data, stickyBackend };
}

class AuthService {
  /**
   * Register with email.
   * Creates Firebase account, sends verification email.
   * Does NOT store zelidauth — verification must happen first.
   */
  async registerWithEmail(email, password, name) {
    try {
      const result = await firebaseCreateEmailAccount(email, password);
      const user = result.user;

      if (name?.trim()) {
        await updateUserProfile(user, { displayName: name.trim() });
      }

      await sendVerificationEmail(user);

      return { uid: user.uid, email: user.email };
    } catch (error) {
      throw this.handleFirebaseError(error);
    }
  }

  /**
   * Login with email.
   * Verifies email is confirmed before continuing.
   * AuthContext handles storeZelidAuth via onAuthStateChanged.
   */
  async loginWithEmail(email, password) {
    try {
      const result = await firebaseLoginWithEmail(email, password);
      const user = result.user;

      if (!user.emailVerified) {
        const err = new Error(
          'Please verify your email before signing in. Check your inbox for the verification link.',
        );
        err.code = 'auth/email-not-verified';
        throw err;
      }

      return { uid: user.uid, email: user.email };
    } catch (error) {
      throw this.handleFirebaseError(error);
    }
  }

  /**
   * Trigger Google OAuth popup.
   * AuthContext handles storeZelidAuth via onAuthStateChanged after popup resolves.
   */
  async loginWithGoogle() {
    return firebaseLoginWithGoogle();
  }

  /**
   * Store zelidauth for a Firebase user.
   * Called by AuthContext when a new Firebase auth is detected.
   *
   * Safe refresh: if an existing zelidauth is valid for the same Firebase uid,
   * we reuse it to avoid fetching a new loginPhrase (which can cause clock-drift
   * 401s on nodes that are slightly behind).
   *
   * @param {import('firebase/auth').User} firebaseUser
   * @param {{ force?: boolean }} options
   */
  async storeZelidAuth(firebaseUser, { force = false } = {}) {
    if (!firebaseUser?.emailVerified && firebaseUser?.providerData?.[0]?.providerId === 'password') {
      throw new Error('Email not verified');
    }

    // Try to reuse stored zelidauth on page refresh (same uid + within TTL)
    if (!force) {
      const stored = await secureStorage.getItem('zelidauth').catch(() => null);
      if (
        stored?._uid === firebaseUser.uid &&
        stored?._issuedAt &&
        Date.now() - stored._issuedAt < ZELIDAUTH_TTL_MS
      ) {
        return stored;
      }
    }

    const idToken = await firebaseUser.getIdToken();
    const { loginPhrase, stickyBackend } = await getLoginPhraseWithSticky();

    let zelid, signature;

    const { ssoProvider } = await getServerConfig();

    if (ssoProvider === 'fluxcore') {
      // FluxCore SSO: service.fluxcore.ai signs the loginPhrase on the user's behalf.
      // Requires the Firebase project to be 'fluxcore-prod'.
      const resp = await fetch('/api/fluxcore/signInOrUp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ message: loginPhrase }),
      });
      const data = await resp.json();
      if (data?.status !== 'success') throw new Error(data?.message || 'FluxCore authentication failed');
      zelid = data.public_address;
      signature = data.signature;
    } else {
      // Self-hosted SSO: server derives a deterministic Flux keypair per Firebase UID.
      // Works with any Firebase project. Configured via SSO_SIGNING_SECRET in .env.
      const resp = await fetch('/api/sso/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ message: loginPhrase }),
      });
      const data = await resp.json();
      if (data?.status !== 'success' || !data.zelid || !data.signature) {
        throw new Error(data?.message || 'SSO sign-in failed');
      }
      zelid = data.zelid;
      signature = data.signature;
    }

    const zelidauth = {
      zelid,
      signature,
      loginPhrase,
      // Metadata (stripped before building zelidauth headers in axiosInstance)
      _uid: firebaseUser.uid,
      _issuedAt: Date.now(),
      _loginType: 'firebase',
      _stickyBackend: stickyBackend,
    };

    await secureStorage.setItem('zelidauth', zelidauth);
    localStorage.setItem('loginType', 'firebase');

    return zelidauth;
  }

  /**
   * Complete ZelCore login after WS success.
   * ZelCoreLoginButton already has zelid + signature + loginPhrase from the WS message.
   */
  async finalizeZelCoreAuth({ zelid, signature, loginPhrase, stickyBackend }) {
    const zelidauth = {
      zelid,
      signature,
      loginPhrase,
      _issuedAt: Date.now(),
      _loginType: 'zelcore',
      _stickyBackend: stickyBackend,
    };

    await secureStorage.setItem('zelidauth', zelidauth);
    localStorage.setItem('loginType', 'zelcore');

    return zelidauth;
  }

  /**
   * Complete SSP login: sign loginPhrase, verify via BFF proxy, store zelidauth.
   */
  async finalizeSSPAuth({ zelid, signature, loginPhrase, stickyBackend }) {
    // Verify the signature on the sticky node via BFF proxy
    const verifyResp = await fetch('/api/node-verifylogin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zelid, signature, loginPhrase, stickyBackend }),
    });

    const verifyData = await verifyResp.json();

    if (verifyData?.status !== 'success') {
      throw new Error(verifyData?.data || 'SSP verification failed');
    }

    const zelidauth = {
      zelid,
      signature,
      loginPhrase,
      _issuedAt: Date.now(),
      _loginType: 'ssp',
      _stickyBackend: stickyBackend,
    };

    await secureStorage.setItem('zelidauth', zelidauth);
    localStorage.setItem('loginType', 'ssp');

    return zelidauth;
  }

  /**
   * Check if current Firebase user's email is verified.
   * Used by the verification polling loop after registration.
   */
  async checkEmailVerified() {
    try {
      const user = await reloadUser();
      if (!user?.emailVerified) return { verified: false };

      // Email is now verified — store zelidauth
      const zelidauth = await this.storeZelidAuth(user, { force: true });
      return {
        verified: true,
        user: { uid: user.uid, email: user.email, displayName: user.displayName },
        zelidauth,
      };
    } catch {
      return { verified: false };
    }
  }

  /**
   * Resend verification email.
   */
  async resendVerificationEmail(email, password) {
    try {
      const result = await firebaseLoginWithEmail(email, password);
      const user = result.user;

      if (user.emailVerified) {
        throw new Error('Email is already verified');
      }

      await sendVerificationEmail(user);
      await firebaseSignOut();

      return { success: true };
    } catch (error) {
      throw this.handleFirebaseError(error);
    }
  }

  /**
   * Get the utility function for fetching loginPhrase.
   * Exposed so ZelCoreLoginButton and SSPLoginButton can use the same logic.
   */
  getLoginPhraseWithSticky() {
    return getLoginPhraseWithSticky();
  }

  getCurrentUser() {
    return getUser();
  }

  async logout() {
    secureStorage.removeItem('zelidauth');
    await firebaseSignOut().catch(() => {});
  }

  handleFirebaseError(error) {
    const messages = {
      'auth/email-already-in-use':
        'This email is already registered. Please sign in instead.',
      'auth/invalid-email': 'Invalid email address format.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/weak-password': 'Password must be at least 8 characters.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/email-not-verified':
        'Please verify your email before signing in.',
      'auth/network-request-failed':
        'Network error. Please check your connection.',
      'auth/popup-closed-by-user': 'Sign-in cancelled.',
      'auth/cancelled-popup-request': 'Sign-in cancelled.',
      'auth/popup-blocked':
        'Pop-up blocked. Please allow pop-ups for this site.',
    };

    const message = messages[error.code] || error.message || 'Authentication failed.';
    const custom = new Error(message);
    custom.code = error.code;
    return custom;
  }
}

export default new AuthService();
