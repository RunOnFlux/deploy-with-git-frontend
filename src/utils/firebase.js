import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendEmailVerification,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
} from 'firebase/auth';

/** @type {import('firebase/auth').Auth | null} */
let auth = null;

/**
 * Initialize Firebase with runtime config from /api/config.
 * Must be called once before the React app mounts.
 * @param {import('../config/runtimeConfig.js').RuntimeConfig['firebase']} firebaseConfig
 */
export function initFirebase(firebaseConfig) {
  if (auth) return auth;

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);

  setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error('Failed to set auth persistence:', error);
  });

  return auth;
}

function requireAuth() {
  if (!auth) throw new Error('Firebase not initialized — call initFirebase() during bootstrap');
  return auth;
}

export function getUser() {
  try {
    return requireAuth().currentUser;
  } catch {
    return null;
  }
}

export async function reloadUser() {
  try {
    const instance = requireAuth();
    const user = instance.currentUser;
    if (user) {
      await user.reload();
      return instance.currentUser;
    }
    return null;
  } catch (error) {
    console.error('Reload user error:', error);
    throw error;
  }
}

export async function loginWithGoogle() {
  try {
    const instance = requireAuth();
    await setPersistence(instance, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return await signInWithPopup(instance, provider);
  } catch (error) {
    console.error('Google login error:', error);
    throw error;
  }
}

export async function loginWithEmail(email, password) {
  try {
    const instance = requireAuth();
    await setPersistence(instance, browserLocalPersistence);
    return await signInWithEmailAndPassword(instance, email, password);
  } catch (error) {
    console.error('Email login error:', error);
    throw error;
  }
}

export async function createEmailAccount(email, password) {
  try {
    return await createUserWithEmailAndPassword(requireAuth(), email, password);
  } catch (error) {
    console.error('Email signup error:', error);
    throw error;
  }
}

export async function sendVerificationEmail(user) {
  try {
    await sendEmailVerification(user);
    return { success: true };
  } catch (error) {
    console.error('Send verification email error:', error);
    throw error;
  }
}

/**
 * Send a password reset email. The link in the mail points at the Firebase
 * project's own hosted action handler, so there is no reset page to serve here.
 */
export async function sendPasswordReset(email) {
  try {
    await sendPasswordResetEmail(requireAuth(), email);
    return { success: true };
  } catch (error) {
    console.error('Send password reset email error:', error);
    throw error;
  }
}

/**
 * Change the signed-in user's password.
 *
 * Firebase only allows this on a recent login, so the current password is used
 * to reauthenticate first. That doubles as proof the person typing is the
 * account owner and not someone who walked up to an unlocked machine.
 */
export async function changePassword(currentPassword, newPassword) {
  const user = requireAuth().currentUser;
  if (!user?.email) {
    const error = new Error('You must be signed in to change your password');
    error.code = 'auth/no-current-user';
    throw error;
  }

  try {
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    return { success: true };
  } catch (error) {
    console.error('Change password error:', error);
    throw error;
  }
}

export async function updateUserProfile(user, profile) {
  try {
    await updateProfile(user, profile);
    return { success: true };
  } catch (error) {
    console.error('Update profile error:', error);
    throw error;
  }
}

export async function signOut() {
  try {
    await requireAuth().signOut();
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

export { auth, onAuthStateChanged };
export default auth;
