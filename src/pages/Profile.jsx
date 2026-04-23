
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../utils/authService';
import { updateProfile } from 'firebase/auth';
import { readUserData, writeData, updateData } from '../utils/firebaseUtils';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

const QUARTERLY_DAYS = 90;

export default function Profile() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  // BER-137: identity direction
  const [settingsId, setSettingsId] = useState(null);
  const [identityDirection, setIdentityDirection] = useState('');
  const [identityDirectionDraft, setIdentityDirectionDraft] = useState('');
  const [identityDirectionSetAt, setIdentityDirectionSetAt] = useState(null);
  const [identityDirectionHistory, setIdentityDirectionHistory] = useState([]);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [quarterlyReviewDue, setQuarterlyReviewDue] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setDisplayName(currentUser.displayName || '');
      loadSettings();
    }
  }, []);

  const loadSettings = async () => {
    try {
      const docs = await readUserData('userSettings');
      const settings = (docs || [])[0] || null;
      if (settings) {
        setSettingsId(settings.id);
        setIdentityDirection(settings.identityDirection || '');
        setIdentityDirectionDraft(settings.identityDirection || '');
        setIdentityDirectionSetAt(settings.identityDirectionSetAt || null);
        setIdentityDirectionHistory(settings.identityDirectionHistory || []);

        // Check quarterly review
        if (settings.identityDirectionSetAt) {
          const daysSinceSet = (Date.now() - new Date(settings.identityDirectionSetAt).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceSet >= QUARTERLY_DAYS) setQuarterlyReviewDue(true);
        }
      } else {
        setEditingIdentity(true); // First time — open the field immediately
      }
    } catch (err) {
      logger.error('Failed to load user settings:', err);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        await updateProfile(currentUser, { displayName });
        ouraToast.success('Profile updated successfully');
        setTimeout(() => navigate('/dashboard'), 1000);
      } else {
        ouraToast.error('No user is currently signed in');
      }
    } catch (error) {
      ouraToast.error('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const saveIdentityDirection = async (newStatement, isReview = false) => {
    const trimmed = newStatement.trim();
    if (trimmed.length < 20 || trimmed.length > 200) {
      ouraToast.error('Identity direction must be 20–200 characters. Use "Clear" to remove.');
      return;
    }
    // Pass 3 New Finding 1 remediation: re-check auth immediately before the
    // write so a token expiry / sign-out in another tab doesn't produce a
    // false-success toast with no underlying Firestore update.
    if (!authService.getCurrentUser()) {
      ouraToast.error('Please sign in to save.');
      return;
    }
    setSavingIdentity(true);
    try {
      const now = new Date().toISOString();
      const newHistory = identityDirection
        ? [...identityDirectionHistory, { statement: identityDirection, setAt: identityDirectionSetAt, supersededAt: now }]
        : identityDirectionHistory;

      const data = {
        identityDirection: trimmed,
        identityDirectionSetAt: now,
        identityDirectionHistory: newHistory,
      };

      if (settingsId) {
        await updateData('userSettings', settingsId, data);
      } else {
        const saved = await writeData('userSettings', data);
        setSettingsId(saved.id);
      }

      // Local state mutations moved AFTER the await so a failed write does
      // not leave the UI in an "optimistically saved" state.
      setIdentityDirection(trimmed);
      setIdentityDirectionSetAt(now);
      setIdentityDirectionHistory(newHistory);
      setEditingIdentity(false);
      setQuarterlyReviewDue(false);
      ouraToast.success('Identity direction saved.');
    } catch (err) {
      logger.error('Failed to save identity direction:', err);
      ouraToast.error('Failed to save. Try again.');
    } finally {
      setSavingIdentity(false);
    }
  };

  // Pass 2 Finding 15 remediation: explicit "clear" path for identity direction.
  // The 20–200 char validation makes the field non-removable through the Save
  // path, so users get stuck with a stale statement. This appends the cleared
  // value to history (so the audit trail is preserved) and nulls out the
  // current direction.
  const clearIdentityDirection = async () => {
    if (!identityDirection) return;
    if (!window.confirm('Clear your current identity direction? Your previous statements remain in your history.')) {
      return;
    }
    setSavingIdentity(true);
    try {
      const now = new Date().toISOString();
      const newHistory = [
        ...identityDirectionHistory,
        { statement: identityDirection, setAt: identityDirectionSetAt, supersededAt: now },
      ];
      const data = {
        identityDirection: null,
        identityDirectionSetAt: null,
        identityDirectionHistory: newHistory,
      };
      if (settingsId) {
        await updateData('userSettings', settingsId, data);
      } else {
        const saved = await writeData('userSettings', data);
        setSettingsId(saved.id);
      }
      setIdentityDirection(null);
      setIdentityDirectionSetAt(null);
      setIdentityDirectionHistory(newHistory);
      setEditingIdentity(false);
      setQuarterlyReviewDue(false);
      ouraToast.success('Identity direction cleared.');
    } catch (err) {
      logger.error('Failed to clear identity direction:', err);
      ouraToast.error('Failed to clear. Try again.');
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleConfirmReview = async () => {
    // Confirm unchanged — just reset the timer
    setSavingIdentity(true);
    try {
      const now = new Date().toISOString();
      const data = { identityDirectionSetAt: now };
      if (settingsId) await updateData('userSettings', settingsId, data);
      setIdentityDirectionSetAt(now);
      setQuarterlyReviewDue(false);
      ouraToast.success('Identity direction confirmed.');
    } catch (err) {
      ouraToast.error('Failed to confirm. Try again.');
    } finally {
      setSavingIdentity(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Display name form */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <h1 className="text-2xl font-bold text-white mb-6">Profile Settings</h1>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#ababab] mb-2">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#2a2a2a] focus:border-[#00d4aa] focus:outline-none transition-colors"
                placeholder="Enter your display name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#ababab] mb-2">Email</label>
              <input
                type="email"
                value={authService.getCurrentUser()?.email || ''}
                disabled
                className="w-full p-3 bg-[#0a0a0a] text-[#858585] rounded-xl border border-[#1a1a1a]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00d4aa] hover:bg-[#00b894] disabled:bg-[#2a2a2a] disabled:text-[#858585] text-black font-medium py-3 px-4 rounded-xl transition-colors"
            >
              {loading ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>

        {/* BER-137: Identity Direction */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-light text-white">Identity Direction</h2>
              <p className="text-[#858585] text-xs mt-1">Who you are in the process of becoming.</p>
            </div>
            {identityDirection && !editingIdentity && !quarterlyReviewDue && (
              <button
                onClick={() => { setIdentityDirectionDraft(identityDirection); setEditingIdentity(true); }}
                className="text-xs text-[#858585] hover:text-[#ababab] transition-colors"
              >
                Revise
              </button>
            )}
          </div>

          {/* Quarterly review prompt */}
          {quarterlyReviewDue && identityDirection && !editingIdentity && (
            <div className="mb-5 p-4 border border-[#2a2a2a] rounded-xl space-y-3">
              <p className="text-[#ababab] text-sm">Does this still describe who you are becoming?</p>
              <p className="text-white text-sm font-light italic">"{identityDirection}"</p>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmReview}
                  disabled={savingIdentity}
                  className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors"
                >
                  Still accurate
                </button>
                <button
                  onClick={() => { setIdentityDirectionDraft(identityDirection); setEditingIdentity(true); }}
                  className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors"
                >
                  Rewrite it
                </button>
              </div>
            </div>
          )}

          {/* Current statement (not in review/edit mode) */}
          {identityDirection && !editingIdentity && !quarterlyReviewDue && (
            <div className="mb-4 p-4 bg-[#050505] border border-[#1a1a1a] rounded-xl">
              <p className="text-[#d1d1d1] text-sm font-light leading-relaxed">"{identityDirection}"</p>
              {identityDirectionSetAt && (
                <p className="text-[#6a6a6a] text-xs mt-2">
                  Set {new Date(identityDirectionSetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          )}

          {/* Edit / first-time entry */}
          {editingIdentity && (
            <div className="space-y-3">
              <label className="block text-[#858585] text-xs uppercase tracking-widest">
                In one sentence: who are you in the process of becoming?
              </label>
              <textarea
                value={identityDirectionDraft}
                onChange={(e) => setIdentityDirectionDraft(e.target.value)}
                maxLength={200}
                rows={2}
                className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#2a2a2a] focus:border-[#5a5a5a] focus:outline-none resize-none text-sm placeholder-[#6a6a6a] transition-colors"
                placeholder="One sentence. Plain text. Present tense."
              />
              <div className="flex items-center justify-between">
                <span className="text-[#6a6a6a] text-xs">{identityDirectionDraft.trim().length}/200</span>
                <div className="flex gap-2">
                  {identityDirection && (
                    <>
                      {/* Pass 2 Finding 15 remediation: explicit Clear button
                          so users can remove the field instead of being
                          forced into a 20-char minimum forever. */}
                      <button
                        onClick={clearIdentityDirection}
                        disabled={savingIdentity}
                        className="px-4 py-2 text-xs text-[#ef4444] hover:text-white transition-colors disabled:opacity-40"
                      >
                        Clear
                      </button>
                      <button
                        onClick={() => { setEditingIdentity(false); setIdentityDirectionDraft(identityDirection); }}
                        className="px-4 py-2 text-xs text-[#858585] hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => saveIdentityDirection(identityDirectionDraft)}
                    disabled={savingIdentity || identityDirectionDraft.trim().length < 20}
                    className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors"
                  >
                    {savingIdentity ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* History */}
          {identityDirectionHistory.length > 0 && (
            <div className="mt-5 pt-4 border-t border-[#1a1a1a]">
              <button
                onClick={() => setShowHistory(p => !p)}
                className="text-[#6a6a6a] text-xs hover:text-[#858585] transition-colors"
              >
                {showHistory ? 'Hide' : 'Show'} prior statements ({identityDirectionHistory.length})
              </button>
              {showHistory && (
                <div className="mt-3 space-y-3">
                  {[...identityDirectionHistory].reverse().map((h, i) => (
                    <div key={i} className="p-3 bg-[#050505] border border-[#0f0f0f] rounded-xl">
                      <p className="text-[#858585] text-xs italic">"{h.statement}"</p>
                      <p className="text-[#2a2a2a] text-[10px] mt-1">
                        Set {new Date(h.setAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {h.supersededAt && ` · Superseded ${new Date(h.supersededAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
