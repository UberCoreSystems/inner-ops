import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { authService } from './utils/authService';
import KillList from './pages/KillList';
import Journal from './pages/Journal';
import Dashboard from './pages/Dashboard';
import Relapse from './pages/Relapse';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import HardLessons from './pages/HardLessons';
import Navbar from './components/Navbar';
import BlackMirror from './components/BlackMirror';
import FirestoreTest from './components/FirestoreTest';
import OpenAITest from './components/OpenAITest';
import AuthForm from './components/AuthForm';
import { checkFirebaseConnection } from './firebase';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Log API key to confirm Vite environment variables are loading
    console.log("🔥 VITE_FIREBASE_API_KEY:", import.meta.env.VITE_FIREBASE_API_KEY ? "✅ Present" : "❌ Missing");
    
    // Check Firebase connection status
    const firebaseStatus = checkFirebaseConnection();
    console.log("🔍 Firebase Status on App Load:", firebaseStatus);

    // Listen for authentication state changes
    const unsubscribe = authService.onAuthStateChanged((firebaseUser) => {
      console.log("🔐 Auth state changed:", firebaseUser?.uid || 'No user');
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleAuthSuccess = (authResult) => {
    console.log("✅ Authentication successful:", authResult);
    // User state will be updated automatically by onAuthStateChanged listener
    
    if (authResult.migrationReport?.success?.length > 0) {
      console.log("🚀 Data migration completed during authentication");
    }
  };

  const handleLogout = async () => {
    try {
      await authService.signOut();
      console.log("✅ Logged out successfully");
    } catch (error) {
      console.error("❌ Logout failed:", error);
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
        {user && <Navbar onLogout={handleLogout} user={user} />}
        <Routes>
          <Route 
            path="/auth" 
            element={
              user ? 
                <Navigate to="/dashboard" /> : 
                <AuthForm onAuthSuccess={handleAuthSuccess} />
            } 
          />
          <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/auth" />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/auth" />} />
          <Route path="/journal" element={user ? <Journal /> : <Navigate to="/auth" />} />
          <Route path="/relapse" element={user ? <Relapse /> : <Navigate to="/auth" />} />
          <Route path="/hardlessons" element={user ? <HardLessons /> : <Navigate to="/auth" />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/auth" />} />
          <Route path="/killlist" element={user ? <KillList /> : <Navigate to="/auth" />} />
          <Route path="/blackmirror" element={user ? <BlackMirror /> : <Navigate to="/auth" />} />
          
          {/* Dev/Test Routes */}
          <Route path="/firebase-test" element={<FirestoreTest />} />
          <Route path="/openai-test" element={<OpenAITest />} />
          
          {/* Default Routes */}
          <Route path="/login" element={<Navigate to="/auth" />} />
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/auth" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
