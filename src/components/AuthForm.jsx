import React, { useState } from 'react';
import { authService } from '../utils/authService';

export default function AuthForm({ onAuthSuccess, hasLocalData = false }) {
  const [isSignIn, setIsSignIn] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
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

      console.log("✅ Authentication successful:", result);
      
      if (onAuthSuccess) {
        onAuthSuccess(result);
      }
    } catch (error) {
      console.error("❌ Authentication error:", error);
      setError(error.message || 'Authentication failed');
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
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-red-500 mb-2">⚔️ INNER OPS</h1>
          <h2 className="text-2xl font-bold text-white mb-4">
            {isSignIn ? 'Welcome Back, Warrior' : 'Join the Battle'}
          </h2>
          <p className="text-gray-400">
            {isSignIn 
              ? 'Sign in to continue your journey of self-mastery'
              : 'Create your account to begin the inner war'
            }
          </p>
          
          {hasLocalData && !isSignIn && (
            <div className="mt-4 p-3 bg-green-900/50 border border-green-500 rounded-lg">
              <p className="text-green-400 text-sm">
                🎯 We found your existing data! Creating an account will preserve all your entries.
              </p>
            </div>
          )}
        </div>

        {/* Form */}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="warrior@example.com"
              />
            </div>

            {/* Display Name (Register only) */}
            {!isSignIn && (
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-300 mb-1">
                  Display Name (Optional)
                </label>
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Shadow Warrior"
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleInputChange}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {/* Confirm Password (Register only) */}
            {!isSignIn && (
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-400 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {isSignIn ? 'Signing In...' : 'Creating Account...'}
              </div>
            ) : (
              isSignIn ? 'Sign In' : 'Create Account'
            )}
          </button>

          {/* Toggle Sign In/Register */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignIn(!isSignIn);
                setError('');
                setFormData(prev => ({ ...prev, confirmPassword: '', displayName: '' }));
              }}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              {isSignIn 
                ? "Don't have an account? Create one" 
                : 'Already have an account? Sign in'
              }
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="text-center text-gray-500 text-xs">
          <p>Your data is encrypted and secure.</p>
          <p>The Oracle awaits your commitment to growth.</p>
        </div>
      </div>
    </div>
  );
}
