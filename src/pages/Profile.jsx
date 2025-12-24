
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../utils/authService';
import { updateProfile } from 'firebase/auth';
import ouraToast from '../utils/toast';

export default function Profile() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setDisplayName(currentUser.displayName || '');
    }
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        await updateProfile(currentUser, {
          displayName: displayName
        });
        ouraToast.success('Profile updated successfully');
        // Navigate back to dashboard after short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 1000);
      } else {
        ouraToast.error('No user is currently signed in');
      }
    } catch (error) {
      ouraToast.error('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <h1 className="text-2xl font-bold text-white mb-6">Profile Settings</h1>
          
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#8a8a8a] mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#2a2a2a] focus:border-[#00d4aa] focus:outline-none transition-colors"
                placeholder="Enter your display name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#8a8a8a] mb-2">
                Email
              </label>
              <input
                type="email"
                value={authService.getCurrentUser()?.email || ''}
                disabled
                className="w-full p-3 bg-[#0a0a0a] text-[#5a5a5a] rounded-xl border border-[#1a1a1a]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00d4aa] hover:bg-[#00b894] disabled:bg-[#2a2a2a] disabled:text-[#5a5a5a] text-black font-medium py-3 px-4 rounded-xl transition-colors"
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
