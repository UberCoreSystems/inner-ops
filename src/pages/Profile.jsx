
import React, { useState, useEffect } from 'react';
import { authService } from '../utils/authService';
import { updateProfile } from 'firebase/auth';

export default function Profile() {
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setDisplayName(currentUser.displayName || '');
    }
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        await updateProfile(currentUser, {
          displayName: displayName
        });
        setMessage('Profile updated successfully!');
      } else {
        setMessage('Error: No user is currently signed in');
      }
    } catch (error) {
      setMessage('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-8 border border-gray-800/50 oura-card">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-light text-white mb-2 tracking-wide">Profile Settings</h1>
          </div>
          
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div>
              <label className="block text-sm font-light text-gray-300 mb-3 tracking-wide">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full p-4 bg-gradient-to-br from-gray-800/50 to-gray-900/50 text-white rounded-2xl border border-gray-700/50 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all duration-300 backdrop-blur-sm"
                placeholder="Enter your display name"
              />
            </div>

            <div>
              <label className="block text-sm font-light text-gray-300 mb-3 tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={authService.getCurrentUser()?.email || ''}
                disabled
                className="w-full p-4 bg-gradient-to-br from-gray-700/30 to-gray-800/30 text-gray-400 rounded-2xl border border-gray-700/50 backdrop-blur-sm"
              />
            </div>

            {message && (
              <div className={`text-sm p-4 rounded-2xl ${message.includes('Error') ? 'text-red-400 bg-red-900/20 border border-red-500/20' : 'text-green-400 bg-green-900/20 border border-green-500/20'}`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-700 disabled:to-gray-800 text-white py-4 rounded-2xl transition-all duration-300 font-light tracking-wide shadow-lg hover:shadow-xl transform hover:scale-[1.02] disabled:hover:scale-100"
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
