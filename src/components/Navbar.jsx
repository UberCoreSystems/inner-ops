import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authService } from '../utils/authService';

// Oura-style minimalist icons
const Icons = {
  dashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),
  journal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h8M8 12h8M8 16h4" opacity="0.7" />
    </svg>
  ),
  killList: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  ),
  hardLessons: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15,10 23,10 17,15 19,23 12,18 5,23 7,15 1,10 9,10" />
    </svg>
  ),
  blackMirror: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="4" opacity="0.5" />
    </svg>
  ),
  relapse: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z" />
      <line x1="12" y1="9" x2="12" y2="14" opacity="0.7" />
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" opacity="0.7" />
    </svg>
  )
};

export default function Navbar({ onLogout, user }) {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: Icons.dashboard },
    { path: '/journal', label: 'Journal', icon: Icons.journal },
    { path: '/killlist', label: 'Kill List', icon: Icons.killList },
    { path: '/hardlessons', label: 'Hard Lessons', icon: Icons.hardLessons },
    { path: '/blackmirror', label: 'Black Mirror', icon: Icons.blackMirror },
    { path: '/relapse', label: 'Relapse', icon: Icons.relapse },
  ];

  const getUserDisplayName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'Warrior';
  };

  return (
    <nav className="bg-black border-b border-oura-border sticky top-0 z-50 backdrop-blur-sm bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="flex items-center space-x-2 group">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-oura-cyan">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
                <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
              </svg>
              <span className="text-xl font-light tracking-tight">
                <span className="text-oura-cyan">Inner</span>
                <span className="text-white ml-1">Ops</span>
              </span>
            </Link>
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-xl text-sm font-light transition-all duration-200 flex items-center space-x-2 border ${
                    location.pathname === item.path
                      ? 'bg-oura-card text-white border-oura-border'
                      : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500 hover:bg-oura-card'
                  }`}
                >
                  <span className="opacity-80">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
          
          {/* User Info and Logout */}
          <div className="flex items-center space-x-4">
            <Link 
              to="/profile"
              className={`text-sm font-light flex items-center space-x-2 px-4 py-2 rounded-xl cursor-pointer transition-all duration-200 border ${
                location.pathname === '/profile'
                  ? 'bg-oura-card text-white border-oura-border'
                  : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500 hover:bg-oura-card'
              }`}
            >
              <span className="opacity-80">{Icons.profile}</span>
              <span>{getUserDisplayName()}</span>
            </Link>
            <button
              onClick={onLogout}
              className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-light px-4 py-2 border border-oura-border rounded-xl hover:border-gray-500 hover:bg-oura-card"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}