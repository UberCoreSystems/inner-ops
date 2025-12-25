import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import logger from './utils/logger';

// Firebase configuration with fallbacks and validation
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demo-project.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abcdef"
};

// Log Firebase configuration for debugging
logger.log("🔥 Firebase Configuration Check:");
logger.log("Project ID:", firebaseConfig.projectId);
logger.log("API Key:", firebaseConfig.apiKey ? "✅ Present" : "❌ Missing");
logger.log("Auth Domain:", firebaseConfig.authDomain);

// Validate required environment variables
const requiredEnvVars = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID'];
const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);

if (missingVars.length > 0) {
  logger.error("❌ Missing Firebase environment variables:", missingVars);
  logger.warn("🚧 Using fallback values for development - this may cause issues in production");
} else {
  logger.log("✅ All Firebase environment variables are present");
}

// Initialize Firebase app
let app;
try {
  app = initializeApp(firebaseConfig);
  logger.log("✅ Firebase app initialized successfully");
  logger.log("🎯 Connected to project:", app.options.projectId);
} catch (error) {
  logger.error("❌ Firebase initialization failed:", error);
  throw new Error("Failed to initialize Firebase app");
}

// Initialize Auth with the app instance
let auth;
try {
  auth = getAuth(app);
  logger.log("✅ Firebase Auth initialized");
} catch (error) {
  logger.error("❌ Firebase Auth initialization failed:", error);
  throw new Error("Failed to initialize Firebase Auth");
}

// Initialize Firestore with the app instance
let db;
try {
  db = getFirestore(app);
  logger.log("✅ Firebase Firestore initialized");
} catch (error) {
  logger.error("❌ Firebase Firestore initialization failed:", error);
  throw new Error("Failed to initialize Firebase Firestore");
}

// Enable anonymous authentication for testing
export const enableAnonymousAuth = async () => {
  try {
    if (!auth.currentUser) {
      const userCredential = await signInAnonymously(auth);
      logger.log("✅ Anonymous user signed in:", userCredential.user.uid);
      return userCredential.user;
    }
    return auth.currentUser;
  } catch (error) {
    logger.error("❌ Anonymous auth failed:", error);
    
    if (error.code === 'auth/admin-restricted-operation') {
      logger.error("🚫 Anonymous authentication is disabled in Firebase Console");
      logger.error("💡 To enable it:");
      logger.error("   1. Go to Firebase Console → Authentication → Sign-in method");
      logger.error("   2. Click on 'Anonymous' provider");
      logger.error("   3. Enable the toggle and save");
      logger.error("🔧 Alternative: Use email/password auth or bypass auth for testing");
    }
    
    throw error;
  }
};

// Create a mock user for testing when auth is disabled
export const createMockUser = () => {
  const mockUser = {
    uid: 'mock-user-' + Date.now(),
    isAnonymous: true,
    email: null,
    displayName: 'Test User',
    isMock: true
  };
  logger.log("🧪 Created mock user for testing:", mockUser.uid);
  return mockUser;
};

// Enable development mode (bypass auth for testing)
export const enableDevMode = () => {
  logger.log("🚧 DEVELOPMENT MODE: Bypassing authentication for testing");
  logger.warn("⚠️ This should NEVER be used in production!");
  return createMockUser();
};

// Helper to get current user or create mock user for testing
export const getCurrentUserOrMock = () => {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  
  logger.warn("🚧 No authenticated user found, using mock user for testing");
  return createMockUser();
};

// Helper function to check if Firebase is properly configured
export const checkFirebaseConnection = () => {
  const status = {
    app: !!app,
    auth: !!auth,
    db: !!db,
    projectId: app?.options?.projectId,
    isConfigured: !!app && !!auth && !!db
  };
  
  logger.log("🔍 Firebase Connection Status:", status);
  return status;
};

export { auth, db };
export default app;
