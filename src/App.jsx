import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { localStorageUtils } from './utils/localStorage';
import KillList from './components/KillList';
import Journal from './pages/Journal';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Relapse from './pages/Relapse';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import Navbar from './components/Navbar';
import BlackMirror from './components/BlackMirror';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Log API key to confirm Vite environment variables are loading
    console.log("🔥 VITE_FIREBASE_API_KEY:", import.meta.env.VITE_FIREBASE_API_KEY);

    const storedUser = localStorageUtils.getUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setLoading(false);
  }, []);

  const handleLogin = (userData) => {
    const user = { id: 'local_user', email: userData.email, ...userData };
    localStorageUtils.setUser(user);
    setUser(user);
  };

  const handleLogout = () => {
    localStorageUtils.removeUser();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white">
        {user && <Navbar onLogout={handleLogout} />}
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login onLogin={handleLogin} />} />
          <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/login" />} />
          <Route path="/dashboard" element={user ? <Dashboard /> : <Navigate to="/login" />} />
          <Route path="/journal" element={user ? <Journal /> : <Navigate to="/login" />} />
          <Route path="/relapse" element={user ? <Relapse /> : <Navigate to="/login" />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" />} />
          <Route path="/killlist" element={user ? <KillList /> : <Navigate to="/login" />} />
          <Route path="/blackmirror" element={user ? <BlackMirror /> : <Navigate to="/login" />} />
          <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
