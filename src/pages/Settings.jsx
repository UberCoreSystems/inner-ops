import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmailAuthProvider, reauthenticateWithCredential, deleteUser } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from '../firebase';
import { readUserData, upsertUserSettings } from '../utils/firebaseUtils';
import { getUserProfile, saveUserProfile } from '../utils/userProfile';
import { readMemoryDocs } from '../utils/updateMemory';
import { buildExportPayload } from '../utils/exportData';
import { authService } from '../utils/authService';
import {
  ENGAGEMENT_TRIGGERS,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../utils/schema';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import BriefingScreen from '../components/onboarding/BriefingScreen';
import TheRecord from '../components/TheRecord';
import { parseLines, linesToText, PERSONAL_CONTEXT_LIMITS } from '../utils/personalContext';

// Collections that hold the user's own data — used by export + (mirrored
// server-side) by the deleteUserData function.
// Must mirror USER_DATA_COLLECTIONS in functions/index.js so an export
// contains everything account deletion erases (right-to-portability parity).
const EXPORTABLE_COLLECTIONS = [
  'journalEntries', 'killTargets', 'hardLessons', 'relapseEntries',
  'userSettings', 'syntheses', 'confrontations', 'confirmedKills',
  'compassChecks', 'emergencyLogs', 'dailyBriefs',
  'journalEntriesArchive', 'killTargetsArchive',
  'hardLessonsArchive', 'relapseEntriesArchive',
];

export default function Settings() {
  // Notifications state
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [savingNotifications, setSavingNotifications] = useState(false);

  // The Reckoning — optional periodic auto-generation (off by default).
  const [reckoningAuto, setReckoningAuto] = useState(false);
  const [savingReckoning, setSavingReckoning] = useState(false);

  // Personal context state — bound to textareas as raw text, parsed on save.
  const [activeSituationsText, setActiveSituationsText] = useState('');
  const [knownTriggersText, setKnownTriggersText] = useState('');
  const [operatingContext, setOperatingContext] = useState('');
  const [savingContext, setSavingContext] = useState(false);

  // Track loaded baseline so the Save button can detect dirty state.
  const [contextBaseline, setContextBaseline] = useState({
    activeSituationsText: '',
    knownTriggersText: '',
    operatingContext: '',
  });

  const [showBriefing, setShowBriefing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Privacy & data
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Deletion receipt: the manifest of what was erased, shown while the user is
  // still authenticated. Finalizing (deleteUser) is deferred to acknowledgment,
  // because deleteUser trips onAuthStateChanged → AuthGate and unmounts this
  // page, which would otherwise hide the receipt before it could be read.
  const [deletionReceipt, setDeletionReceipt] = useState(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settingsDocs, profile] = await Promise.all([
          readUserData('userSettings'),
          getUserProfile(),
        ]);
        if (cancelled) return;

        const settings = (settingsDocs || [])[0] || null;
        if (settings) {
          setNotificationPreferences({
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...(settings.notificationPreferences || {}),
          });
          setReckoningAuto(!!settings.reckoningAuto);
        }

        if (profile) {
          const a = linesToText(profile.activeSituations);
          const t = linesToText(profile.knownTriggers);
          const o = profile.operatingContext || '';
          setActiveSituationsText(a);
          setKnownTriggersText(t);
          setOperatingContext(o);
          setContextBaseline({
            activeSituationsText: a,
            knownTriggersText: t,
            operatingContext: o,
          });
        }
      } catch (err) {
        logger.error('Failed to load settings:', err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const contextDirty = useMemo(
    () =>
      activeSituationsText !== contextBaseline.activeSituationsText ||
      knownTriggersText !== contextBaseline.knownTriggersText ||
      operatingContext !== contextBaseline.operatingContext,
    [
      activeSituationsText,
      knownTriggersText,
      operatingContext,
      contextBaseline,
    ]
  );

  const persistNotificationPreferences = async (next) => {
    setSavingNotifications(true);
    try {
      const data = { notificationPreferences: next };
      await upsertUserSettings(data);
      setNotificationPreferences(next);
    } catch (err) {
      logger.error('Failed to save notification prefs:', err);
      ouraToast.error('Failed to save. Try again.');
    } finally {
      setSavingNotifications(false);
    }
  };

  const toggleTrigger = async (triggerId) => {
    const current = !!notificationPreferences[triggerId]?.enabled;
    const next = {
      ...notificationPreferences,
      [triggerId]: { ...(notificationPreferences[triggerId] || {}), enabled: !current },
    };
    await persistNotificationPreferences(next);
  };

  const toggleReckoningAuto = async () => {
    const next = !reckoningAuto;
    setReckoningAuto(next);
    setSavingReckoning(true);
    try {
      await upsertUserSettings({ reckoningAuto: next });
    } catch (err) {
      logger.error('Failed to save reckoning setting:', err);
      setReckoningAuto(!next); // revert on failure
      ouraToast.error('Failed to save. Try again.');
    } finally {
      setSavingReckoning(false);
    }
  };

  const saveContext = async () => {
    setSavingContext(true);
    try {
      const activeSituations = parseLines(activeSituationsText, PERSONAL_CONTEXT_LIMITS.ACTIVE_SITUATIONS);
      const knownTriggers = parseLines(knownTriggersText, PERSONAL_CONTEXT_LIMITS.KNOWN_TRIGGERS);
      await saveUserProfile({
        activeSituations,
        knownTriggers,
        operatingContext: operatingContext.trim(),
      });
      setContextBaseline({
        activeSituationsText: linesToText(activeSituations),
        knownTriggersText: linesToText(knownTriggers),
        operatingContext: operatingContext.trim(),
      });
      // Reflect parsed/trimmed values back into the textareas so the user
      // sees what was actually persisted (no trailing blank lines, etc.).
      setActiveSituationsText(linesToText(activeSituations));
      setKnownTriggersText(linesToText(knownTriggers));
      setOperatingContext(operatingContext.trim());
      ouraToast.success('Personal context saved.');
    } catch (err) {
      logger.error('Failed to save personal context:', err);
      ouraToast.error('Failed to save. Try again.');
    } finally {
      setSavingContext(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const errors = [];
      const collections = {};
      for (const name of EXPORTABLE_COLLECTIONS) {
        try { collections[name] = await readUserData(name); }
        catch { collections[name] = []; errors.push(name); }
      }
      let userProfile = null;
      try { userProfile = await getUserProfile(); } catch { errors.push('userProfile'); }
      let memory = {};
      try { memory = await readMemoryDocs({ useCache: false }); } catch { errors.push('memory'); }

      const data = buildExportPayload({
        exportedAt: new Date().toISOString(),
        collections,
        memory,
        userProfile,
        errors,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inner-ops-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (data.manifest.partial) {
        ouraToast.error('Exported, but some data failed to load — see "partial" in the file.');
      } else {
        ouraToast.success(`Exported ${data.manifest.totalDocuments} records.`);
      }
    } catch (err) {
      logger.error('Data export failed:', err);
      ouraToast.error('Export failed. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      ouraToast.error('Enter your password to confirm.');
      return;
    }
    setDeleting(true);
    try {
      const auth = await getAuth();
      const user = auth.currentUser;
      if (!user || !user.email) {
        ouraToast.error('You are not signed in.');
        return;
      }
      // Deletion is a sensitive operation — re-authenticate first.
      const cred = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(user, cred);
      // Wipe all Firestore data via the Admin-SDK function. The Firebase Auth
      // user is deleted only after the user acknowledges the receipt below.
      const functions = getFunctions();
      const res = await httpsCallable(functions, 'deleteUserData')();
      setDeletePassword('');
      setDeletionReceipt(res?.data?.manifest || {});
    } catch (err) {
      logger.error('Account deletion failed:', { code: err?.code });
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        ouraToast.error('Incorrect password.');
      } else {
        ouraToast.error('Could not delete your account. Please try again.');
      }
    } finally {
      setDeleting(false);
    }
  };

  // Final irreversible step: remove the auth user. Data is already erased; if
  // this fails (e.g. stale re-auth after a long read of the receipt) we sign
  // out anyway — the orphaned, data-empty auth record is harmless.
  const finishDeletion = async () => {
    setFinishing(true);
    try {
      const auth = await getAuth();
      const user = auth.currentUser;
      if (user) await deleteUser(user);
    } catch (err) {
      logger.error('Final account removal failed:', { code: err?.code });
      try { await authService.signOut(); } catch { /* swap to auth surface regardless */ }
    } finally {
      navigate('/auth');
    }
  };

  if (showBriefing) {
    return (
      <BriefingScreen
        onContinue={() => setShowBriefing(false)}
        primaryLabel="Close"
      />
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-light text-white">Settings</h1>
          <p className="text-[#858585] text-sm mt-1">
            How the system speaks to you, and what it knows about your operating context.
          </p>
        </div>

        {/* Notifications */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <div className="mb-5">
            <h2 className="text-lg font-light text-white">Notifications</h2>
            <p className="text-[#858585] text-xs mt-1">
              In-app banner prompts. Off by default except where journaling has stalled.
            </p>
          </div>

          <ToggleRow
            label="Journal prompt when input has stalled"
            description="Shows a banner at the top of the app when you have not written in 36 hours."
            enabled={!!notificationPreferences[ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]?.enabled}
            disabled={savingNotifications || !loaded}
            onToggle={() => toggleTrigger(ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS)}
          />

          <ToggleRow
            label="New synthesis ready"
            description="Shows a banner when a new cross-module synthesis briefing is waiting to be read. Not shown on the dashboard, which already surfaces it."
            enabled={!!notificationPreferences[ENGAGEMENT_TRIGGERS.SYNTHESIS_READY]?.enabled}
            disabled={savingNotifications || !loaded}
            onToggle={() => toggleTrigger(ENGAGEMENT_TRIGGERS.SYNTHESIS_READY)}
          />

          <ToggleRow
            label="Periodic Reckoning"
            description="Automatically runs The Reckoning on a cadence — laying your stated commitments against your logged behavior and naming the contradictions. Off by default; you can always run it on demand from Synthesis."
            enabled={reckoningAuto}
            disabled={savingReckoning || !loaded}
            onToggle={toggleReckoningAuto}
          />
        </div>

        {/* Briefing */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-light text-white">Briefing</h2>
              <p className="text-[#858585] text-xs mt-1">
                Re-read the system framing you saw on first run.
              </p>
            </div>
            <button
              onClick={() => setShowBriefing(true)}
              className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors"
            >
              Replay briefing
            </button>
          </div>
        </div>

        {/* Personal Context */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <div className="mb-5">
            <h2 className="text-lg font-light text-white">Personal Context</h2>
            <p className="text-[#858585] text-xs mt-1">
              What you are currently navigating, who matters, and where you historically fail. The Oracle reads this for context. The journal prompt references it when you go quiet.
            </p>
          </div>

          <ContextField
            label="What you are currently navigating"
            hint="One per line. Up to three."
            value={activeSituationsText}
            onChange={setActiveSituationsText}
            placeholder={'Career transition\nRebuilding after the breakup'}
            rows={4}
          />

          <ContextField
            label="Where you historically fail"
            hint="Times, places, or states that consistently precede failure. One per line. Up to five."
            value={knownTriggersText}
            onChange={setKnownTriggersText}
            placeholder={'Alone after 11pm\nAfter conflict with R.'}
            rows={5}
          />

          <ContextField
            label="Anything else the system should know"
            hint="Free-form. Constraints, history, current state."
            value={operatingContext}
            onChange={setOperatingContext}
            placeholder="e.g. Sober 18 months. Don't soften when I'm rationalizing."
            rows={5}
          />

          <div className="flex justify-end mt-2">
            <button
              onClick={saveContext}
              disabled={savingContext || !loaded || !contextDirty}
              className="px-5 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors"
            >
              {savingContext ? 'Saving...' : 'Save personal context'}
            </button>
          </div>
        </div>

        {/* The Record — long-term AI memory */}
        <TheRecord />

        {/* Privacy & Data */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <div className="mb-5">
            <h2 className="text-lg font-light text-white">Privacy & Data</h2>
            <p className="text-[#858585] text-xs mt-1">
              What this app stores, how to take your data with you, and how to erase it.
            </p>
          </div>

          {deletionReceipt ? (
            <DeletionReceipt
              manifest={deletionReceipt}
              finishing={finishing}
              onFinish={finishDeletion}
            />
          ) : (
          <div className="space-y-3">
            <Link
              to="/privacy"
              className="block text-sm text-[#ababab] hover:text-white transition-colors"
            >
              How your data is handled →
            </Link>

            <div className="flex items-center justify-between gap-4">
              <p className="text-[#858585] text-xs">
                Download everything you have written as a JSON file.
              </p>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="shrink-0 px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors"
              >
                {exporting ? 'Exporting…' : 'Export my data'}
              </button>
            </div>

            <div className="border-t border-[#1a1a1a] pt-4">
              {!showDelete ? (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[#858585] text-xs">
                    Permanently delete your account and every entry. This cannot be undone.
                  </p>
                  <button
                    onClick={() => setShowDelete(true)}
                    className="shrink-0 px-4 py-2 text-xs bg-transparent text-[#ef4444] hover:bg-[#ef4444]/10 border border-[#ef4444]/40 rounded-xl transition-colors"
                  >
                    Delete account
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-white text-sm">
                    This erases your account and all data permanently. There is no recovery.
                  </p>
                  <label htmlFor="delete-confirm-password" className="block text-[#858585] text-xs">
                    Confirm your password to continue
                  </label>
                  <input
                    id="delete-confirm-password"
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#2a2a2a] focus:border-[#ef4444] focus:outline-none text-sm placeholder-[#828282] transition-colors"
                    placeholder="Your password"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => { setShowDelete(false); setDeletePassword(''); }}
                      disabled={deleting}
                      className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting || !deletePassword}
                      className="px-4 py-2 text-xs bg-[#ef4444] text-white hover:bg-[#dc2626] disabled:opacity-40 rounded-xl transition-colors"
                    >
                      {deleting ? 'Deleting…' : 'Permanently delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Human-readable label for a manifest key. camelCase → spaced; a couple of
// keys get explicit names so the receipt reads in product voice.
const RECEIPT_LABELS = {
  memory: 'Memory records',
  userProfile: 'Profile record',
};
function receiptLabel(key) {
  if (RECEIPT_LABELS[key]) return RECEIPT_LABELS[key];
  const spaced = key.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Receipt of exactly what account deletion erased. Shown while the user is
// still authenticated; the auth user is removed only on acknowledgment.
function DeletionReceipt({ manifest, finishing, onFinish }) {
  const rows = Object.entries(manifest || {})
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-white text-sm">Your data has been erased.</p>
        <p className="text-[#858585] text-xs mt-1">
          What was removed from the record:
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-[#858585] text-sm">No stored records were found.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(([key, count]) => (
            <li key={key} className="flex justify-between text-sm border-b border-[#1a1a1a] py-1.5">
              <span className="text-[#ababab]">{receiptLabel(key)}</span>
              <span className="text-white tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={onFinish}
        disabled={finishing}
        className="w-full px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors"
      >
        {finishing ? 'Signing out…' : 'Finish — sign out'}
      </button>
    </div>
  );
}

function ToggleRow({ label, description, enabled, disabled, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-white text-sm">{label}</p>
        {description && <p className="text-[#858585] text-xs mt-1">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${
          enabled ? 'bg-[#00d4aa]' : 'bg-[#2a2a2a]'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

function ContextField({ label, hint, value, onChange, placeholder, rows }) {
  return (
    <div className="mb-5">
      <label className="block text-[#858585] text-xs uppercase tracking-widest mb-2">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#2a2a2a] focus:border-[#5a5a5a] focus:outline-none resize-none text-sm placeholder-[#828282] transition-colors"
      />
      {hint && <p className="text-[#858585] text-xs mt-1">{hint}</p>}
    </div>
  );
}
