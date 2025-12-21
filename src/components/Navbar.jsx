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
    <nav className="bg-black border-b border-oura-border sticky top-0 z-50 backdrop-blur-sm bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="flex items-center space-x-2 group">
              <span className="text-2xl">⚔️</span>
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
                  className={`px-4 py-2 rounded-xl text-sm font-light transition-all duration-200 flex items-center space-x-2 ${
                    location.pathname === item.path
                      ? 'bg-oura-card text-white border border-oura-border'
                      : 'text-gray-400 hover:text-white hover:bg-oura-darker'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
          
          {/* User Info and Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-gray-400 text-sm font-light flex items-center space-x-2">
              <span>⚔️</span>
              <span>{getUserDisplayName()}</span>
            </div>
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