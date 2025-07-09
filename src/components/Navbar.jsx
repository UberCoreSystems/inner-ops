import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar({ onLogout }) {
  const location = useLocation();

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/journal', label: 'Journal', icon: '📝' },
    { path: '/killlist', label: 'Kill List', icon: '🎯' },
    { path: '/blackmirror', label: 'Black Mirror', icon: '📱' },
    { path: '/relapse', label: 'Relapse', icon: '⚠️' },
    { path: '/firebase-test', label: 'Firebase Test', icon: '🔥' },
    { path: '/openai-test', label: 'OpenAI Test', icon: '🤖' },
  ];

  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/dashboard" className="text-xl font-bold text-white">
              Inner Ops
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
          <button
            onClick={onLogout}
            className="text-gray-300 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}