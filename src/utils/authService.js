// Authentication System for Inner Ops
// Provides email/password authentication for persistent user identity

import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile 
} from 'firebase/auth';
import logger from './logger';
import { getCachedAuth, getAuth } from '../firebase';

export const authService = {
  // Register new user
  async register(email, password, displayName = null) {
    try {
      logger.log("🔐 Creating new user account...");
      const auth = getCachedAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update display name if provided
      if (displayName) {
        await updateProfile(user, { displayName });
        logger.log(`✅ Display name set to: ${displayName}`);
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

  // Sign in existing user
  async signIn(email, password) {
    try {
      logger.log("🔐 Signing in user...");
      const auth = getCachedAuth();
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
      const auth = getCachedAuth();
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

  // Listen to auth state changes - with async initialization
  onAuthStateChanged(callback) {
    const auth = getCachedAuth();
    if (!auth) {
      // If not initialized yet, initialize first then listen
      getAuth().then(authInstance => {
        onAuthStateChanged(authInstance, callback);
      }).catch(err => {
        logger.error("Failed to initialize auth for listener:", err);
        callback(null);
      });
      return () => {}; // Return empty unsubscribe
    }
    return onAuthStateChanged(auth, callback);
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
    
    return user.displayName || user.email?.split('@')[0] || 'Warrior';
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
