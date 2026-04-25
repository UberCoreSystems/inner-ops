import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { authService } from './utils/authService';
import { toasterConfig } from './utils/toast';
import logger from './utils/logger';
import { checkFirebaseConnection } from './firebase';
import { identify } from './utils/analytics';
import { useSynthesisAutoGenerate } from './hooks/useSynthesisAutoGenerate';
import { useSynthesisNewFlag } from './hooks/useSynthesisNewFlag';
import SynthesisGuard from './components/SynthesisGuard';
import './App.css';

// Core components (loaded immediately)
import Navbar from './components/Navbar';
import AuthForm from './components/AuthForm';
import EmergencyButton from './components/EmergencyButton';
import { InlineErrorBoundary } from './components/ErrorBoundary';

// Finding 5 remediation: Black Mirror is deferred (post-v1). The route is
// gated behind an env flag so it can be re-enabled without a code change.
// Default: off. Beta deploys must not ship with VITE_ENABLE_BLACK_MIRROR=true.
const BLACK_MIRROR_ENABLED = import.meta.env.VITE_ENABLE_BLACK_MIRROR === 'true';

// Lazy-loaded pages (code splitting)
const BlackMirror = BLACK_MIRROR_ENABLED
  ? React.lazy(() => import('./components/BlackMirror'))
  : null;
const KillList = React.lazy(() => import('./pages/KillList'));
const Journal = React.lazy(() => import('./pages/Journal'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Relapse = React.lazy(() => import('./pages/Relapse'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Onboarding = React.lazy(() => import('./pages/Onboarding'));
const HardLessons = React.lazy(() => import('./pages/HardLessons'));
const SynthesisBriefing = React.lazy(() => import('./pages/SynthesisBriefing'));
const OuraCallback = React.lazy(() => import('./pages/OuraCallback'));

// Fallback loader
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-black text-white">
    <div className="text-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto"></div>
      <p className="mt-4 text-lg">Loading...</p>
    </div>
  </div>
);

// Lazy-initialize Firebase when needed — primes the auth cache so
// authService.onAuthStateChanged gets a synchronous subscription with a
// valid unsubscribe. Auth must only be accessed through authService after this.
const lazyInitializeFirebase = async () => {
  try {
    const { getAuth } = await import('./firebase');
    await getAuth();
    logger.log("✅ Firebase initialized");
  } catch (error) {
    logger.warn("Firebase initialization error:", error.message);
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useSynthesisAutoGenerate(user?.uid || null);
  const latestSynthesisIsNew = useSynthesisNewFlag(user?.uid || null);

  useEffect(() => {
    // Finding 9: boot-time env diagnostic removed. firebase.js fails fast on
    // missing config, so this log was duplicative and also trained the team
    // to log sensitive fields the same way.
    const firebaseStatus = checkFirebaseConnection();
    logger.log("🔍 Firebase Status on App Load:", firebaseStatus);

    // Initialize Firebase FIRST before setting up auth listener
    const setupAuth = async () => {
      try {
        await lazyInitializeFirebase();
        logger.log("✅ Firebase initialized, checking for existing login...");
        
        // NOW set up the auth listener after Firebase is initialized
        // This will check if user is already logged in
        const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
          if (firebaseUser) {
            logger.log("🔐 Existing user found:", firebaseUser.uid, firebaseUser.email);
            identify(firebaseUser.uid, { email: firebaseUser.email });
          } else {
            logger.log("🔐 No authenticated user - waiting for login");
          }
          setUser(firebaseUser);
          setLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        logger.error("❌ Firebase initialization failed:", error);
        setLoading(false);
        return () => {};
      }
    };

    let cleanup = null;
    let isMounted = true;

    setupAuth().then(unsub => {
      if (isMounted) {
        cleanup = unsub;
      } else {
        // Component unmounted before Promise resolved — unsubscribe immediately
        unsub();
      }
    });

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  const handleAuthSuccess = (authResult) => {
    logger.log("✅ Authentication successful:", authResult);
    // User state will be updated automatically by onAuthStateChanged listener
    
    if (authResult.migrationReport?.success?.length > 0) {
      logger.log("🚀 Data migration completed during authentication");
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      logger.log("✅ Logged out successfully");
    } catch (error) {
      logger.error("❌ Logout failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto"></div>
          <p className="mt-4 text-lg">Initializing Inner Ops...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white pb-16 md:pb-0">
        <Toaster {...toasterConfig} />
        <InlineErrorBoundary name="Navbar">
          {user && <Navbar onLogout={handleLogout} user={user} />}
        </InlineErrorBoundary>
        <InlineErrorBoundary name="EmergencyButton">
          {user && <EmergencyButton />}
        </InlineErrorBoundary>
        <SynthesisGuard latestSynthesisIsNew={latestSynthesisIsNew}>
        <Routes>
          <Route
            path="/auth"
            element={
              <InlineErrorBoundary name="Auth">
                {user ? 
                  <Navigate to="/dashboard" /> : 
                  <AuthForm onAuthSuccess={handleAuthSuccess} />
                }
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/onboarding" 
            element={
              <InlineErrorBoundary name="Onboarding">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <Onboarding />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <InlineErrorBoundary name="Dashboard">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <Dashboard />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/journal" 
            element={
              <InlineErrorBoundary name="Journal">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <Journal />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/relapse" 
            element={
              <InlineErrorBoundary name="Relapse">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <Relapse />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/hardlessons" 
            element={
              <InlineErrorBoundary name="HardLessons">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <HardLessons />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <InlineErrorBoundary name="Profile">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <Profile />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/ledger"
            element={
              <InlineErrorBoundary name="KillList">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <KillList />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          {BLACK_MIRROR_ENABLED && (
            <Route
              path="/blackmirror"
              element={
                <InlineErrorBoundary name="BlackMirror">
                  {user ? (
                    <Suspense fallback={<PageLoader />}>
                      <BlackMirror />
                    </Suspense>
                  ) : <Navigate to="/auth" />}
                </InlineErrorBoundary>
              }
            />
          )}

          <Route
            path="/synthesis"
            element={
              <InlineErrorBoundary name="SynthesisBriefing">
                {user ? (
                  <Suspense fallback={<PageLoader />}>
                    <SynthesisBriefing />
                  </Suspense>
                ) : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            }
          />

          <Route
            path="/oura/callback"
            element={
              <InlineErrorBoundary name="OuraCallback">
                <Suspense fallback={<PageLoader />}>
                  <OuraCallback />
                </Suspense>
              </InlineErrorBoundary>
            }
          />

          {/* Default Routes */}
          <Route path="/login" element={<Navigate to="/auth" />} />
          <Route path="/killlist" element={<Navigate to="/ledger" replace />} />
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/auth" />} />
          {/* Catch-all: unmapped URLs go home (or to auth if signed-out). */}
          <Route path="*" element={<Navigate to={user ? '/dashboard' : '/auth'} replace />} />
        </Routes>
        </SynthesisGuard>
      </div>
    </Router>
  );
}

export default App;
