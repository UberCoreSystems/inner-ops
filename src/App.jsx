import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { authService } from './utils/authService';
import { toasterConfig } from './utils/toast';
import logger from './utils/logger';
import KillList from './pages/KillList';
import Journal from './pages/Journal';
import Dashboard from './pages/Dashboard';
import Relapse from './pages/Relapse';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import HardLessons from './pages/HardLessons';
import Navbar from './components/Navbar';
import BlackMirror from './components/BlackMirror';
import AuthForm from './components/AuthForm';
import EmergencyButton from './components/EmergencyButton';
import { InlineErrorBoundary } from './components/ErrorBoundary';
import { checkFirebaseConnection } from './firebase';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Log API key to confirm Vite environment variables are loading
    logger.log("🔥 VITE_FIREBASE_API_KEY:", import.meta.env.VITE_FIREBASE_API_KEY ? "✅ Present" : "❌ Missing");
    
    // Check Firebase connection status
    const firebaseStatus = checkFirebaseConnection();
    logger.log("🔍 Firebase Status on App Load:", firebaseStatus);

    // Listen for authentication state changes
    const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
      logger.log("🔐 Auth state changed:", firebaseUser?.uid || 'No user');
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
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
                {user ? <Onboarding /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/dashboard" 
            element={
              <InlineErrorBoundary name="Dashboard">
                {user ? <Dashboard /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/journal" 
            element={
              <InlineErrorBoundary name="Journal">
                {user ? <Journal /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/relapse" 
            element={
              <InlineErrorBoundary name="Relapse">
                {user ? <Relapse /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/hardlessons" 
            element={
              <InlineErrorBoundary name="HardLessons">
                {user ? <HardLessons /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <InlineErrorBoundary name="Profile">
                {user ? <Profile /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/killlist" 
            element={
              <InlineErrorBoundary name="KillList">
                {user ? <KillList /> : <Navigate to="/auth" />}
              </InlineErrorBoundary>
            } 
          />
          <Route 
            path="/blackmirror" 
            element={
              <InlineErrorBoundary name="BlackMirror">
                {user ? <BlackMirror /> : <Navigate to="/auth" />}
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
