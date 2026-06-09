import { useState } from 'react';
import { authService } from '../utils/authService';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

// Animated ring background component
const AnimatedRings = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* Large outer ring */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-[#00d4aa]/10 animate-pulse" style={{ animationDuration: '4s' }} />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-[#4da6ff]/10 animate-pulse" style={{ animationDuration: '3s', animationDelay: '0.5s' }} />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-[#a855f7]/10 animate-pulse" style={{ animationDuration: '3.5s', animationDelay: '1s' }} />
    {/* Glow effect */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-gradient-radial from-[#00d4aa]/5 to-transparent" />
  </div>
);

// Logo component
const Logo = () => (
  <div className="flex items-center justify-center gap-3 mb-8">
    <div className="relative">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="animate-pulse" style={{ animationDuration: '3s' }}>
        <circle cx="24" cy="24" r="22" stroke="url(#logoGradient)" strokeWidth="2" fill="none" />
        <circle cx="24" cy="24" r="16" stroke="#00d4aa" strokeWidth="1.5" fill="none" opacity="0.6" />
        <circle cx="24" cy="24" r="10" stroke="#00d4aa" strokeWidth="1" fill="none" opacity="0.3" />
        <circle cx="24" cy="24" r="4" fill="#00d4aa" />
        <defs>
          <linearGradient id="logoGradient" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor="#00d4aa" />
            <stop offset="50%" stopColor="#4da6ff" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
    </div>
    <span className="text-2xl font-light tracking-[0.3em] text-white">INNER OPS</span>
  </div>
);

export default function AuthForm({ onAuthSuccess }) {
  const [isSignIn, setIsSignIn] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [resetting, setResetting] = useState(false);

  const handleForgotPassword = async () => {
    if (resetting) return;
    const email = (formData.email || '').trim();
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?"');
      return;
    }
    setError('');
    setResetting(true);
    try {
      await authService.resetPassword(email);
      ouraToast.success('Reset email sent — check your inbox.');
    } catch (err) {
      logger.error('Password reset error:', err);
      const msg = err?.message || 'Could not send reset email';
      setError(msg);
      ouraToast.error(msg);
    } finally {
      setResetting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      if (!isSignIn) {
        // Registration validation
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (formData.password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }
      }

      const result = isSignIn 
        ? await authService.signIn(formData.email, formData.password)
        : await authService.register(formData.email, formData.password, formData.displayName);

      logger.log("✅ Authentication successful:", result);
      ouraToast.success(isSignIn ? 'Welcome back!' : 'Account created successfully!');
      
      if (onAuthSuccess) {
        onAuthSuccess(result);
      }
    } catch (error) {
      logger.error("❌ Authentication error:", error);
      setError(error.message || 'Authentication failed');
      ouraToast.error(error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 relative">
      {/* Animated background rings */}
      <AnimatedRings />
      
      <div className="max-w-md w-full relative z-10">
        {/* Logo and Header */}
        <div className="text-center animate-fade-in-up">
          <Logo />
          
          {/* Mode indicator pills */}
          <div className="inline-flex bg-[#0a0a0a] rounded-2xl p-1 border border-[#1a1a1a] mb-8">
            <button
              type="button"
              onClick={() => {
                setIsSignIn(true);
                setError('');
              }}
              className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                isSignIn 
                  ? 'bg-[#00d4aa] text-black' 
                  : 'text-[#858585] hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignIn(false);
                setError('');
                setFormData(prev => ({ ...prev, confirmPassword: '', displayName: '' }));
              }}
              className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
                !isSignIn 
                  ? 'bg-[#00d4aa] text-black' 
                  : 'text-[#858585] hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          <h2 className="text-2xl font-light text-white mb-2 tracking-wide">
            {isSignIn ? 'Welcome Back' : 'Open your command center.'}
          </h2>
          <p className="text-[#858585] text-sm mb-8">
            {isSignIn
              ? 'Pick up where the work left off.'
              : 'Create the account only you will see.'
            }
          </p>
        </div>

        {/* Form Card */}
        <div className="oura-card p-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-xs font-medium text-[#858585] uppercase tracking-wider">
                Email Address
              </label>
              <div className={`relative transition-all duration-300 ${focusedField === 'email' ? 'transform scale-[1.01]' : ''}`}>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full px-4 py-3.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl text-white placeholder-[#828282] focus:border-[#00d4aa] focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/30 transition-all duration-300"
                  placeholder="you@example.com"
                />
                {focusedField === 'email' && (
                  <div className="absolute inset-0 rounded-xl bg-[#00d4aa]/5 pointer-events-none" />
                )}
              </div>
            </div>

            {/* Display Name (Register only) */}
            {!isSignIn && (
              <div className="space-y-2 animate-fade-in-up">
                <label htmlFor="displayName" className="block text-xs font-medium text-[#858585] uppercase tracking-wider">
                  Your Name
                </label>
                <div className={`relative transition-all duration-300 ${focusedField === 'displayName' ? 'transform scale-[1.01]' : ''}`}>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    value={formData.displayName}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('displayName')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full px-4 py-3.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl text-white placeholder-[#828282] focus:border-[#00d4aa] focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/30 transition-all duration-300"
                    placeholder="What name does the Oracle use?"
                  />
                  {focusedField === 'displayName' && (
                    <div className="absolute inset-0 rounded-xl bg-[#00d4aa]/5 pointer-events-none" />
                  )}
                </div>
              </div>
            )}

            {/* Password */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="block text-xs font-medium text-[#858585] uppercase tracking-wider">
                  Password
                </label>
                {isSignIn && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetting}
                    className="text-xs text-[#858585] hover:text-[#00d4aa] focus:outline-none focus:text-[#00d4aa] transition-colors disabled:opacity-50"
                  >
                    {resetting ? 'Sending…' : 'Forgot password?'}
                  </button>
                )}
              </div>
              <div className={`relative transition-all duration-300 ${focusedField === 'password' ? 'transform scale-[1.01]' : ''}`}>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className="w-full px-4 py-3.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl text-white placeholder-[#828282] focus:border-[#00d4aa] focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/30 transition-all duration-300"
                  placeholder="••••••••"
                />
                {focusedField === 'password' && (
                  <div className="absolute inset-0 rounded-xl bg-[#00d4aa]/5 pointer-events-none" />
                )}
              </div>
            </div>

            {/* Confirm Password (Register only) */}
            {!isSignIn && (
              <div className="space-y-2 animate-fade-in-up">
                <label htmlFor="confirmPassword" className="block text-xs font-medium text-[#858585] uppercase tracking-wider">
                  Confirm Password
                </label>
                <div className={`relative transition-all duration-300 ${focusedField === 'confirmPassword' ? 'transform scale-[1.01]' : ''}`}>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    required
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                    className="w-full px-4 py-3.5 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl text-white placeholder-[#828282] focus:border-[#00d4aa] focus:outline-none focus:ring-1 focus:ring-[#00d4aa]/30 transition-all duration-300"
                    placeholder="••••••••"
                  />
                  {focusedField === 'confirmPassword' && (
                    <div className="absolute inset-0 rounded-xl bg-[#00d4aa]/5 pointer-events-none" />
                  )}
                </div>
                {/* Pass 2 Finding 17 remediation: live password-match indicator
                    so users see the mismatch before submitting. Only renders
                    once the user has typed something in the confirm field. */}
                {formData.confirmPassword.length > 0 && (
                  <div
                    className={`text-xs ${
                      formData.password === formData.confirmPassword
                        ? 'text-[#00d4aa]'
                        : 'text-[#ef4444]'
                    }`}
                    aria-live="polite"
                  >
                    {formData.password === formData.confirmPassword
                      ? '✓ Passwords match'
                      : 'Passwords do not match yet'}
                  </div>
                )}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl animate-fade-in-up">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#ef4444] animate-pulse" />
                  <span className="text-[#ef4444] text-sm">{error}</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#00d4aa] text-black rounded-xl font-medium text-sm uppercase tracking-wider hover:bg-[#00e6b8] focus:outline-none focus:ring-2 focus:ring-[#00d4aa]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99]"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  <span>{isSignIn ? 'Signing In...' : 'Creating Account...'}</span>
                </div>
              ) : (
                isSignIn ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-center gap-2 text-[#858585] text-xs mb-4">
            <div className="w-8 h-px bg-[#1a1a1a]" />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[#858585]">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div className="w-8 h-px bg-[#1a1a1a]" />
          </div>
          <p className="text-[#858585] text-xs">Your data is private, encrypted, and user-scoped — no one else sees it</p>
          <p className="text-[#858585] text-xs mt-1">Nothing here works until you tell it the truth</p>
        </div>
      </div>
    </div>
  );
}
