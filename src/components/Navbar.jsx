import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authService } from '../utils/authService';

// Finding 5: Black Mirror is gated post-v1. Flag mirrors App.jsx.
const BLACK_MIRROR_ENABLED = import.meta.env.VITE_ENABLE_BLACK_MIRROR === 'true';

// Finding 20 remediation: Icons hoisted to module scope so the object is
// constructed once per module load rather than once per render.
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
  synthesis: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <circle cx="12" cy="5" r="2" />
      <line x1="7" y1="12" x2="17" y2="12" opacity="0.6" />
      <line x1="12" y1="7" x2="12" y2="19" opacity="0.6" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  ),
  profile: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" opacity="0.7" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
};

// Finding 20 remediation: nav config hoisted to module scope.
// Finding 5: Black Mirror entry omitted unless feature flag is enabled.
const NAV_ITEMS = [
  { path: '/dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: Icons.dashboard },
  { path: '/journal', label: 'Journal', mobileLabel: 'Journal', icon: Icons.journal },
  { path: '/ledger', label: 'General Ledger', mobileLabel: 'General Ledger', icon: Icons.killList },
  { path: '/hardlessons', label: 'Hard Lessons', mobileLabel: 'Lessons', icon: Icons.hardLessons },
  ...(BLACK_MIRROR_ENABLED
    ? [{ path: '/blackmirror', label: 'Black Mirror', mobileLabel: 'Mirror', icon: Icons.blackMirror }]
    : []),
  { path: '/relapse', label: 'The Signal', mobileLabel: 'Signal', icon: Icons.relapse },
  { path: '/synthesis', label: 'Synthesis', mobileLabel: 'Synth', icon: Icons.synthesis },
];

export default function Navbar({ onLogout, user }) {
  const location = useLocation();

  const navItems = NAV_ITEMS;
  // Mobile grid column count reflects actual item count (7 with Black Mirror,
  // 6 without). useMemo avoids re-building the class string on every render.
  const mobileGridClass = useMemo(
    () => `grid h-16 ${
      navItems.length === 7 ? 'grid-cols-7' :
      navItems.length === 6 ? 'grid-cols-6' :
      navItems.length === 5 ? 'grid-cols-5' :
      'grid-cols-7'
    }`,
    [navItems.length]
  );

  return (
    <>
      {/* Top bar */}
      <nav className="bg-black border-b border-oura-border sticky top-0 z-50 backdrop-blur-sm bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link to="/dashboard" className="flex items-center space-x-2 group">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-oura-cyan transition-all duration-300 group-hover:scale-105"
                  style={{ filter: 'drop-shadow(0 0 6px rgba(0, 212, 170, 0.45))' }}
                >
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
                  <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                </svg>
                <span className="text-xl font-light tracking-tight">
                  <span
                    className="text-oura-cyan"
                    style={{ textShadow: '0 0 12px rgba(0, 212, 170, 0.35)' }}
                  >
                    Inner
                  </span>
                  <span className="text-white ml-1">Ops</span>
                </span>
              </Link>
              {/* Desktop nav links */}
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
            <div className="flex items-center space-x-2 md:space-x-4">
              <Link
                to="/settings"
                aria-label="Settings"
                className={`text-sm font-light flex items-center justify-center px-3 py-2 rounded-xl cursor-pointer transition-all duration-200 border ${
                  location.pathname === '/settings'
                    ? 'bg-oura-card text-white border-oura-border'
                    : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500 hover:bg-oura-card'
                }`}
              >
                <span className="opacity-80">{Icons.settings}</span>
              </Link>
              <Link
                to="/profile"
                className={`text-sm font-light flex items-center space-x-2 px-3 md:px-4 py-2 rounded-xl cursor-pointer transition-all duration-200 border ${
                  location.pathname === '/profile'
                    ? 'bg-oura-card text-white border-oura-border'
                    : 'text-gray-400 border-transparent hover:text-white hover:border-gray-500 hover:bg-oura-card'
                }`}
              >
                <span className="opacity-80">{Icons.profile}</span>
                <span className="hidden sm:inline">{authService.getUserDisplayName() || 'Warrior'}</span>
              </Link>
              <button
                onClick={onLogout}
                aria-label="Sign out"
                className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-light px-3 md:px-4 py-2 border border-oura-border rounded-xl hover:border-gray-500 hover:bg-oura-card"
              >
                <span className="hidden sm:inline">Sign Out</span>
                {/* Mobile sign-out icon */}
                <span className="sm:hidden" aria-label="Sign out">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black border-t border-oura-border">
        <div className={mobileGridClass}>
          {navItems.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-0.5 transition-all duration-200 ${
                  isActive ? 'text-oura-cyan' : 'text-gray-500 active:text-white'
                }`}
              >
                <span className={`transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
                  {/* Render a slightly larger icon for mobile */}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {item.path === '/dashboard' && <>
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" opacity="0.5" />
                      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
                    </>}
                    {item.path === '/journal' && <>
                      <path d="M4 4h16v16H4z" />
                      <path d="M8 8h8M8 12h8M8 16h4" opacity="0.7" />
                    </>}
                    {item.path === '/ledger' && <>
                      <circle cx="12" cy="12" r="10" />
                      <circle cx="12" cy="12" r="6" opacity="0.5" />
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="6" y2="12" />
                      <line x1="18" y1="12" x2="22" y2="12" />
                    </>}
                    {item.path === '/hardlessons' && <>
                      <polygon points="12,2 15,10 23,10 17,15 19,23 12,18 5,23 7,15 1,10 9,10" />
                    </>}
                    {item.path === '/blackmirror' && <>
                      <rect x="3" y="3" width="18" height="18" rx="3" />
                      <circle cx="12" cy="12" r="4" opacity="0.5" />
                    </>}
                    {item.path === '/relapse' && <>
                      <path d="M12 2L2 22h20L12 2z" />
                      <line x1="12" y1="9" x2="12" y2="14" opacity="0.7" />
                      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
                    </>}
                    {item.path === '/synthesis' && <>
                      <circle cx="5" cy="12" r="2" />
                      <circle cx="19" cy="12" r="2" />
                      <circle cx="12" cy="5" r="2" />
                      <line x1="7" y1="12" x2="17" y2="12" opacity="0.6" />
                      <line x1="12" y1="7" x2="12" y2="19" opacity="0.6" />
                      <circle cx="12" cy="19" r="2" />
                    </>}
                  </svg>
                </span>
                <span className="text-[9px] font-light tracking-wide leading-none truncate w-full text-center px-0.5">{item.mobileLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </>
  );
}