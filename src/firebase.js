import { initializeApp } from "firebase/app";
import logger from './utils/logger';

// Firebase configuration - only include required services
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo-project.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-project",
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

// Lazy-load Auth and Firestore only when needed
let auth;
let db;

const initializeAuth = async () => {
  if (!auth) {
    const { getAuth, signInAnonymously: signInAnon } = await import('firebase/auth');
    auth = getAuth(app);
    logger.log("✅ Firebase Auth initialized");
    return { auth, signInAnonymously: signInAnon };
  }
  const { signInAnonymously: signInAnon } = await import('firebase/auth');
  return { auth, signInAnonymously: signInAnon };
};

const initializeFirestore = async () => {
  if (!db) {
    const { getFirestore } = await import('firebase/firestore');
    db = getFirestore(app);
    logger.log("✅ Firebase Firestore initialized");
  }
  return db;
};

// Enable anonymous authentication for testing
export const enableAnonymousAuth = async () => {
  try {
    const { auth: authInstance, signInAnonymously } = await initializeAuth();
    if (!authInstance.currentUser) {
      const userCredential = await signInAnonymously(authInstance);
      logger.log("✅ Anonymous user signed in:", userCredential.user.uid);
      return userCredential.user;
    }
    return authInstance.currentUser;
  } catch (error) {
    logger.error("❌ Anonymous auth failed:", error);
    
    if (error.code === 'auth/admin-restricted-operation') {
      logger.error("🚫 Anonymous authentication is disabled in Firebase Console");
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
export const getCurrentUserOrMock = async () => {
  const { auth: authInstance } = await initializeAuth();
  if (authInstance.currentUser) {
    return authInstance.currentUser;
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

// Export lazy-loading functions
export { initializeAuth, initializeFirestore };

// Get auth (lazy init)
export const getAuth = async () => {
  const { auth: authInstance } = await initializeAuth();
  return authInstance;
};

// Get database (lazy init)
export const getDb = async () => {
  return await initializeFirestore();
};

export default app;
