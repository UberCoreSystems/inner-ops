// Authentication System for Inner Ops
// Provides email/password authentication for persistent user identity

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail
} from 'firebase/auth';
import logger from './logger';
import { getCachedAuth, getAuth } from '../firebase';

export const authService = {
  // Register new user
  async register(email, password, displayName = null) {
    try {
      logger.log("🔐 Creating new user account...");
      const auth = getCachedAuth() || await getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Update display name if provided
      if (displayName) {
        await updateProfile(user, { displayName });
        logger.log(`✅ Display name set to: ${displayName}`);
      }

      // Fire-and-forget verification email. We intentionally do NOT gate
      // features on emailVerified for v1 — the email is informational only.
      // A failure here must not block registration.
      try {
        await sendEmailVerification(user);
        logger.log("✉️  Verification email sent to:", user.email);
      } catch (verifyErr) {
        logger.warn("Verification email send failed:", verifyErr?.code || verifyErr?.message);
      }

      logger.log("✅ User registered successfully:", user.uid);

      return {
        user,
        isNewUser: true
      };
    } catch (error) {
      logger.error("❌ Registration failed:", error);
      throw this.handleAuthError(error);
    }
  },

  // Send password reset email. Routes errors through handleAuthError for the
  // same friendly messages the sign-in form uses. Does NOT reveal whether
  // the account exists — Firebase returns success even if the email is
  // unregistered (correct anti-enumeration behavior).
  async resetPassword(email) {
    try {
      logger.log("🔐 Sending password reset email...");
      const auth = getCachedAuth() || await getAuth();
      await sendPasswordResetEmail(auth, email);
      logger.log("✅ Password reset email dispatched");
      return { sent: true };
    } catch (error) {
      logger.error("❌ Password reset failed:", error);
      throw this.handleAuthError(error);
    }
  },

  // Sign in existing user
  async signIn(email, password) {
    try {
      logger.log("🔐 Signing in user...");
      const auth = getCachedAuth() || await getAuth();
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      logger.log("✅ User signed in successfully:", user.uid);
      return { 
        user,
        isNewUser: false 
      };
    } catch (error) {
      logger.error("❌ Sign in failed:", error);
      throw this.handleAuthError(error);
    }
  },

  // Sign out
  async signOut() {
    try {
      const auth = getCachedAuth() || await getAuth();
      await signOut(auth);
      logger.log("✅ User signed out successfully");
    } catch (error) {
      logger.error("❌ Sign out failed:", error);
      throw error;
    }
  },

  // Get current user (synchronous - uses cached instance)
  getCurrentUser() {
    const auth = getCachedAuth();
    return auth?.currentUser || null;
  },

  // Listen to auth state changes - with async initialization.
  //
  // Pass 3 New Finding 5 remediation: previously, an init failure invoked
  // `callback(null)`, which the App interpreted as "user is signed out" and
  // bounced the user to /auth. Now an init failure logs the error but does
  // NOT call the callback — the loading screen stays up rather than
  // false-logging the user out. A retry button or page reload will re-arm.
  //
  // The unsubscribe handle is wired through a ref so the caller's cleanup
  // works whether or not init has completed.
  onAuthStateChanged(callback) {
    const auth = getCachedAuth();
    if (auth) return onAuthStateChanged(auth, callback);

    let realUnsub = null;
    let cancelled = false;
    getAuth().then(authInstance => {
      if (cancelled) return;
      realUnsub = onAuthStateChanged(authInstance, callback);
    }).catch(err => {
      logger.error("Failed to initialize auth for listener:", err);
      // Intentionally do NOT call callback(null) — that would masquerade as
      // a sign-out. Caller stays in its loading state until init recovers.
    });
    return () => {
      cancelled = true;
      if (realUnsub) realUnsub();
    };
  },

  // Check if user is authenticated
  isAuthenticated() {
    const auth = getCachedAuth();
    return !!auth?.currentUser;
  },

  // Get user display name or email
  getUserDisplayName() {
    const auth = getCachedAuth();
    const user = auth?.currentUser;
    if (!user) return null;
    
    return user.displayName || user.email?.split('@')[0] || 'Operator';
  },

  // Handle authentication errors with user-friendly messages
  handleAuthError(error) {
    const errorMessages = {
      'auth/email-already-in-use': 'This email is already registered. Try signing in instead.',
      'auth/weak-password': 'Password should be at least 6 characters long.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email. Try registering first.',
      'auth/wrong-password': 'Incorrect password. Please try again.',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Please check your connection.',
      'auth/invalid-credential': 'Invalid email or password combination.',
      'auth/api-key-not-valid': 'Firebase is not configured correctly. Add valid VITE_FIREBASE_* values in your .env file and restart the dev server.'
    };
    
    if (typeof error?.code === 'string' && error.code.includes('api-key-not-valid')) {
      return {
        code: error.code,
        message: errorMessages['auth/api-key-not-valid']
      };
    }

    return {
      code: error.code,
      message: errorMessages[error.code] || error.message || 'Authentication failed'
    };
  }
};
