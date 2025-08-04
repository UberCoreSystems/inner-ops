// Authentication System for Inner Ops
// Provides email/password authentication for persistent user identity

import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile 
} from 'firebase/auth';
import { auth } from '../firebase';
import { migrateLocalStorageToFirebase } from './dataMigration';

export const authService = {
  // Register new user
  async register(email, password, displayName = null) {
    try {
      console.log("🔐 Creating new user account...");
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Update display name if provided
      if (displayName) {
        await updateProfile(user, { displayName });
        console.log(`✅ Display name set to: ${displayName}`);
      }
      
      console.log("✅ User registered successfully:", user.uid);
      
      // Check if there's localStorage data to migrate
      console.log("🔍 Checking for data to migrate...");
      const migrationReport = await migrateLocalStorageToFirebase(user.uid);
      
      if (migrationReport.success.length > 0) {
        console.log("🚀 Successfully migrated existing data to new account!");
      }
      
      return { 
        user, 
        migrationReport,
        isNewUser: true 
      };
    } catch (error) {
      console.error("❌ Registration failed:", error);
      throw this.handleAuthError(error);
    }
  },

  // Sign in existing user
  async signIn(email, password) {
    try {
      console.log("🔐 Signing in user...");
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      console.log("✅ User signed in successfully:", user.uid);
      return { 
        user,
        isNewUser: false 
      };
    } catch (error) {
      console.error("❌ Sign in failed:", error);
      throw this.handleAuthError(error);
    }
  },

  // Sign out
  async signOut() {
    try {
      await signOut(auth);
      console.log("✅ User signed out successfully");
    } catch (error) {
      console.error("❌ Sign out failed:", error);
      throw error;
    }
  },

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  },

  // Listen to auth state changes
  onAuthStateChanged(callback) {
    return onAuthStateChanged(auth, callback);
  },

  // Check if user is authenticated
  isAuthenticated() {
    return !!auth.currentUser;
  },

  // Get user display name or email
  getUserDisplayName() {
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

// Helper to check if we should migrate data for a new user
export const shouldMigrateData = () => {
  const hasLocalData = ['journalEntries', 'killTargets', 'relapseEntries']
    .some(key => {
      const data = localStorage.getItem(key);
      return data && JSON.parse(data).length > 0;
    });
  
  return hasLocalData;
};
