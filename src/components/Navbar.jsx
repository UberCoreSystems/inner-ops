import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authService } from '../utils/authService';

export default function Navbar({ onLogout, user }) {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/journal', label: 'Journal', icon: '📝' },
    { path: '/killlist', label: 'Kill List', icon: '🎯' },
    { path: '/hardlessons', label: 'Hard Lessons', icon: '⚡' },
    { path: '/blackmirror', label: 'Black Mirror', icon: '📱' },
    { path: '/relapse', label: 'Relapse', icon: '⚠️' },
  ];

  const getUserDisplayName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'Warrior';
  };

  return (
    <nav className="bg-gradient-to-r from-gray-900/90 to-gray-950/90 backdrop-blur-lg border-b border-gray-800/50 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="text-xl font-light text-red-400 tracking-wider hover:text-red-300 transition-all duration-300">
              ⚔️ Inner Ops
            </Link>
            <div className="flex space-x-2">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-xl text-sm font-light transition-all duration-300 tracking-wide ${
                    location.pathname === item.path
                      ? 'bg-gradient-to-r from-gray-700/60 to-gray-800/60 text-white shadow-lg shadow-gray-500/10'
                      : 'text-gray-300 hover:bg-gray-800/50 hover:text-white'
                  }`}
                >
                  <span className="mr-2 opacity-80">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          
          {/* User Info and Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-gray-300 text-sm font-light">
              <span className="mr-2">⚔️</span>
              {getUserDisplayName()}
            </div>
            <button
              onClick={onLogout}
              className="text-gray-300 hover:text-red-400 transition-all duration-300 text-sm font-light px-4 py-2 border border-gray-700/50 rounded-xl hover:border-red-500/50 hover:bg-red-500/10"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}