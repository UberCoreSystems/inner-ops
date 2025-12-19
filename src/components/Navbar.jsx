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
    { path: '/firebase-test', label: 'Firebase Test', icon: '🔥' },
    { path: '/openai-test', label: 'OpenAI Test', icon: '🤖' },
  ];

  const getUserDisplayName = () => {
    if (user?.displayName) return user.displayName;
    if (user?.email) return user.email.split('@')[0];
    return 'Warrior';
  };

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="text-xl font-bold text-red-500">
              ⚔️ Inner Ops
            </Link>
            <div className="flex space-x-4">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          
          {/* User Info and Logout */}
          <div className="flex items-center space-x-4">
            <div className="text-gray-300 text-sm">
              <span className="mr-1">⚔️</span>
              {getUserDisplayName()}
            </div>
            <button
              onClick={onLogout}
              className="text-gray-300 hover:text-red-400 transition-colors text-sm font-medium px-3 py-1 border border-gray-600 rounded hover:border-red-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}