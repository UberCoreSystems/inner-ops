import { initializeApp } from "firebase/app";
import logger from './utils/logger.js';

// Vite injects `import.meta.env`; Node (test runner) does not. Guard here so
// utility modules that transitively import firebase.js can be loaded under
// `node --test` without Vite's compile-time constants. In a Node context we
// treat env as empty and skip initialization — the firebase singleton is
// never actually exercised in unit tests.
const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const isNodeTestContext = !viteEnv || Object.keys(viteEnv).length === 0;

const isDevEnvironment = viteEnv.DEV;

// Validate required environment variables
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID'
];
const missingVars = requiredEnvVars.filter((varName) => !viteEnv[varName]);

// Finding 9 remediation: fail fast on missing config, never log API key status
// at boot. In production the app refuses to initialize; in dev the thrown
// error surfaces the exact missing variable to the developer.
// In a Node test context (no Vite env) we skip the guard — tests must not
// require production Firebase credentials to run pure utility checks.
if (missingVars.length > 0 && !isNodeTestContext) {
  throw new Error(
    `Firebase configuration is missing required environment variables: ${missingVars.join(', ')}`
  );
}

// Firebase configuration (no placeholder fallbacks)
const firebaseConfig = {
  apiKey: viteEnv.VITE_FIREBASE_API_KEY,
  authDomain: viteEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: viteEnv.VITE_FIREBASE_PROJECT_ID,
  appId: viteEnv.VITE_FIREBASE_APP_ID
};

// Initialize Firebase app. Skipped in Node test context so transitive imports
// don't attempt real Firebase initialization without credentials.
let app;
if (!isNodeTestContext) {
  try {
    app = initializeApp(firebaseConfig);
  } catch (error) {
    logger.error("❌ Firebase initialization failed:", error);
    throw new Error("Failed to initialize Firebase app");
  }
}

// Lazy-load Auth and Firestore only when needed
let auth;
let db;
let authInitialized = false;
let dbInitialized = false;

const initializeAuth = async () => {
  if (!authInitialized) {
    const { getAuth, signInAnonymously: signInAnon } = await import('firebase/auth');
    auth = getAuth(app);
    authInitialized = true;
    logger.log("✅ Firebase Auth initialized");
    return { auth, signInAnonymously: signInAnon };
  }
  const { signInAnonymously: signInAnon } = await import('firebase/auth');
  return { auth, signInAnonymously: signInAnon };
};

const initializeFirestore = async () => {
  if (!dbInitialized) {
    const { getFirestore } = await import('firebase/firestore');
    db = getFirestore(app);
    dbInitialized = true;
    logger.log("✅ Firebase Firestore initialized");
  }
  return db;
};

// Synchronous getters for cached instances (initialize on first async call)
const getCachedAuth = () => {
  if (!auth) {
    logger.warn("⚠️ Auth not yet initialized - call getAuth() async first");
    return null;
  }
  return auth;
};

const getCachedDb = () => {
  if (!db) {
    logger.warn("⚠️ Firestore not yet initialized - call getDb() async first");
    return null;
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

// Get auth (lazy init with async, returns cached instance)
export const getAuth = async () => {
  const { auth: authInstance } = await initializeAuth();
  return authInstance;
};

// Get database (lazy init with async, returns cached instance)
export const getDb = async () => {
  return await initializeFirestore();
};

// Export cached getters for synchronous access (after lazy init)
export { getCachedAuth, getCachedDb };

export default app;
