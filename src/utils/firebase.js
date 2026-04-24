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
  updateProfile,
} from 'firebase/auth';

// FluxOS Firebase Configuration (shared across all Flux apps).
// Override any value via VITE_FIREBASE_* environment variables in .env
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? 'AIzaSyAtMsozWwJhhPIOd9BGkZxk5D6Wr8jVGVM',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? 'fluxcore-prod.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? 'fluxcore-prod',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? 'fluxcore-prod.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '468366888401',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? '1:468366888401:web:56eb34ebe93751527ea4f0',
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     ?? 'G-SEGT3X2737',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Failed to set auth persistence:', error);
});

export function getUser() {
  try {
    return auth.currentUser;
  } catch {
    return null;
  }
}

export async function reloadUser() {
  try {
    const user = auth.currentUser;
    if (user) {
      await user.reload();
      return auth.currentUser;
    }
    return null;
  } catch (error) {
    console.error('Reload user error:', error);
    throw error;
  }
}

export async function loginWithGoogle() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return await signInWithPopup(auth, provider);
  } catch (error) {
    console.error('Google login error:', error);
    throw error;
  }
}

export async function loginWithEmail(email, password) {
  try {
    await setPersistence(auth, browserLocalPersistence);
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error('Email login error:', error);
    throw error;
  }
}

export async function createEmailAccount(email, password) {
  try {
    return await createUserWithEmailAndPassword(auth, email, password);
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
    await auth.signOut();
  } catch (error) {
    console.error('Sign out error:', error);
    throw error;
  }
}

export { auth, onAuthStateChanged };
export default auth;
