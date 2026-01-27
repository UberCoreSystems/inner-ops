import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { authService } from './utils/authService';
import { toasterConfig } from './utils/toast';
import logger from './utils/logger';
import { checkFirebaseConnection } from './firebase';
import './App.css';

// Core components (loaded immediately)
import Navbar from './components/Navbar';
import BlackMirror from './components/BlackMirror';
import AuthForm from './components/AuthForm';
import EmergencyButton from './components/EmergencyButton';
import { InlineErrorBoundary } from './components/ErrorBoundary';

// Lazy-loaded pages (code splitting)
const KillList = React.lazy(() => import('./pages/KillList'));
const Journal = React.lazy(() => import('./pages/Journal'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Relapse = React.lazy(() => import('./pages/Relapse'));
const Profile = React.lazy(() => import('./pages/Profile'));
const Onboarding = React.lazy(() => import('./pages/Onboarding'));
const HardLessons = React.lazy(() => import('./pages/HardLessons'));

// Fallback loader
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen bg-black text-white">
    <div className="text-center">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-red-500 mx-auto"></div>
      <p className="mt-4 text-lg">Loading...</p>
    </div>
  </div>
);

// Lazy-initialize Firebase when needed
const lazyInitializeFirebase = async () => {
  try {
    const { enableAnonymousAuth } = await import('./firebase');
    await enableAnonymousAuth();
    logger.log("✅ Firebase initialized on first use");
  } catch (error) {
    logger.warn("Firebase initialization deferred:", error.message);
  }
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Log API key to confirm Vite environment variables are loading
    logger.log("🔥 VITE_FIREBASE_API_KEY:", import.meta.env.VITE_FIREBASE_API_KEY ? "✅ Present" : "❌ Missing");
    
    // Check Firebase connection status
    const firebaseStatus = checkFirebaseConnection();
    logger.log("🔍 Firebase Status on App Load:", firebaseStatus);

    // Initialize Firebase FIRST before setting up auth listener
    const setupAuth = async () => {
      try {
        await lazyInitializeFirebase();
        logger.log("✅ Firebase initialized, setting up auth listener");
        
        // NOW set up the auth listener after Firebase is initialized
        const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
          logger.log("🔐 Auth state changed:", firebaseUser?.uid || 'No user');
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

    let unsubscribe;
    setupAuth().then(unsub => { unsubscribe = unsub; });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
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
      <div className="min-h-screen bg-gray-900 text-white">
        <Toaster {...toasterConfig} />
        <InlineErrorBoundary name="Navbar">
          {user && <Navbar onLogout={handleLogout} user={user} />}
        </InlineErrorBoundary>
        <InlineErrorBoundary name="EmergencyButton">
          {user && <EmergencyButton />}
        </InlineErrorBoundary>
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
            path="/killlist" 
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
          
          {/* Default Routes */}
          <Route path="/login" element={<Navigate to="/auth" />} />
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/auth" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
