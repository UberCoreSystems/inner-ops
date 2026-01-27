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
import { getAuth } from '../firebase';

export const authService = {
  // Register new user
  async register(email, password, displayName = null) {
    try {
      logger.log("🔐 Creating new user account...");
      const auth = await getAuth();
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
      const auth = await getAuth();
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
      const auth = await getAuth();
      await signOut(auth);
      logger.log("✅ User signed out successfully");
    } catch (error) {
      logger.error("❌ Sign out failed:", error);
      throw error;
    }
  },

  // Get current user
  async getCurrentUser() {
    const auth = await getAuth();
    return auth.currentUser;
  },

  // Listen to auth state changes
  async onAuthStateChanged(callback) {
    const auth = await getAuth();
    return onAuthStateChanged(auth, callback);
  },

  // Check if user is authenticated
  async isAuthenticated() {
    const auth = await getAuth();
    return !!auth.currentUser;
  },

  // Get user display name or email
  async getUserDisplayName() {
    const auth = await getAuth();
    const user = auth.currentUser;
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
      'auth/invalid-credential': 'Invalid email or password combination.'
    };

    return {
      code: error.code,
      message: errorMessages[error.code] || error.message || 'Authentication failed'
    };
  }
};
