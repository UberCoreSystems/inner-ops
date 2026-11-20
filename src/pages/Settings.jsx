import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { getAuth } from '../firebase';
import { readUserData, upsertUserSettings } from '../utils/firebaseUtils';
import { getUserProfile, saveUserProfile } from '../utils/userProfile';
import { readMemoryDocs } from '../utils/updateMemory';
import { buildExportPayload } from '../utils/exportData';
import { shareExportFile } from '../utils/shareExportFile';
import { localDateKey } from '../utils/dateUtils';
import {
  ENGAGEMENT_TRIGGERS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  USER_SETTINGS_FIELDS,
} from '../utils/schema';
import {
  isReminderTime,
  readJournalReminderPreference,
  readReminderPermission,
  requestReminderPermission,
} from '../utils/journalReminder';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { resetHelp } from '../utils/onboardingHelp';
import { track } from '../utils/analytics';
import { isNativePlatform } from '../utils/platform';
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

export default function Settings({ onEraseAccount }) {
  // Notifications state
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [savingNotifications, setSavingNotifications] = useState(false);

  // The Reckoning — optional periodic auto-generation (off by default).
  const [reckoningAuto, setReckoningAuto] = useState(false);
  const [savingReckoning, setSavingReckoning] = useState(false);

  // Daily journal reminder — iOS app only. The preference follows the
  // account; the permission is this iPhone's ('granted' | 'denied' | 'prompt',
  // null until read).
  const [journalReminder, setJournalReminder] = useState(() => readJournalReminderPreference());
  const [reminderPermission, setReminderPermission] = useState(null);
  const [savingReminder, setSavingReminder] = useState(false);

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

  // First-run help resets
  const [resettingHelp, setResettingHelp] = useState(false);

  /**
   * Unlike a dismissal — which fails toward staying dismissed and is
   * deliberately fire-and-forget — a reset MUST reach Firestore to work.
   * readOnboardingHelp merges remote over the local mirror, so clearing the
   * mirror alone leaves the remote record saying "seen" and the reset silently
   * does nothing. That is why these two report failure instead of swallowing
   * it, and why they do not navigate on error.
   */
  const withHelpReset = async (scope, onSuccess) => {
    setResettingHelp(true);
    try {
      const auth = await getAuth();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('Not signed in');
      await resetHelp(uid, scope);
      track('help_reset', { scope });
      onSuccess();
    } catch (err) {
      logger.warn('Failed to reset first-run help:', err);
      ouraToast.error('Could not reset. Try again.');
    } finally {
      setResettingHelp(false);
    }
  };

  const restartWalkthrough = () =>
    withHelpReset('walkthroughs', () =>
      navigate('/dashboard', { state: { startWalkthrough: true } })
    );

  const showModuleIntrosAgain = () =>
    withHelpReset('modules', () =>
      ouraToast.success('Module intros will show again on your next visit.')
    );

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
          setJournalReminder(readJournalReminderPreference(settings));
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

  useEffect(() => {
    if (!isNativePlatform()) return undefined;
    let cancelled = false;
    const readPermission = () => {
      readReminderPermission()
        .then((permission) => { if (!cancelled) setReminderPermission(permission); })
        .catch((err) => logger.warn('Failed to read notification permission:', err?.message));
    };
    readPermission();
    // Capacitor's foreground event: the user may be back from iOS Settings.
    document.addEventListener('resume', readPermission);
    return () => {
      cancelled = true;
      document.removeEventListener('resume', readPermission);
    };
  }, []);

  // Saving is all Settings does: useJournalReminder sees the write and
  // schedules or cancels on the phone.
  const saveJournalReminder = async (next) => {
    setSavingReminder(true);
    try {
      await upsertUserSettings({ [USER_SETTINGS_FIELDS.JOURNAL_REMINDER]: next });
      setJournalReminder(next);
      return true;
    } catch (err) {
      logger.error('Failed to save journal reminder:', err);
      ouraToast.error('Failed to save. Try again.');
      return false;
    } finally {
      setSavingReminder(false);
    }
  };

  // The one place notification permission is asked for. A refusal saves nothing.
  const allowJournalReminder = async () => {
    setSavingReminder(true);
    let permission;
    try {
      permission = await requestReminderPermission();
      setReminderPermission(permission);
    } catch (err) {
      logger.error('Notification permission request failed:', err?.message);
      ouraToast.error('Could not ask iOS for notifications. Try again.');
    } finally {
      setSavingReminder(false);
    }
    if (permission === 'granted') await saveJournalReminder({ ...journalReminder, enabled: true });
  };

  const toggleJournalReminder = () => (
    journalReminder.enabled
      ? saveJournalReminder({ ...journalReminder, enabled: false })
      : allowJournalReminder()
  );

  // Runs when the iOS time picker closes. If nothing was saved (an empty
  // field, or a failed save), the field goes back to showing the stored time.
  const commitReminderTime = async (input) => {
    const time = input.value;
    const saved = isReminderTime(time)
      && time !== journalReminder.time
      && await saveJournalReminder({ ...journalReminder, time });
    if (!saved) input.value = journalReminder.time;
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
      const json = JSON.stringify(data, null, 2);
      const filename = `inner-ops-export-${localDateKey()}.json`;
      if (isNativePlatform()) {
        // Dismissing the share sheet is not a failure: nothing left the app.
        if (!(await shareExportFile({ filename, json }))) return;
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
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
    } catch (err) {
      logger.error('Password confirmation failed:', { code: err?.code });
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        ouraToast.error('Incorrect password.');
      } else {
        ouraToast.error('Could not confirm your password. Try again.');
      }
      return;
    } finally {
      setDeleting(false);
    }
    // App replaces the whole app with the erasure surface; this page unmounts.
    onEraseAccount();
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

          {isNativePlatform() && (
            <div className="border-t border-[#1a1a1a] mt-5 pt-5 space-y-4">
              <ToggleRow
                label="Daily journal reminder"
                description="One notification a day on this iPhone at the time you set. None on a day this iPhone already knows has an entry."
                enabled={journalReminder.enabled}
                disabled={savingReminder || !loaded}
                onToggle={toggleJournalReminder}
              />

              {journalReminder.enabled && (
                <div className="flex items-center justify-between gap-4">
                  <label htmlFor="journal-reminder-time" className="text-white text-sm">Time</label>
                  {/* Saved when the picker closes, not on every turn of the wheel. */}
                  <input
                    id="journal-reminder-time"
                    key={journalReminder.time}
                    type="time"
                    defaultValue={journalReminder.time}
                    disabled={savingReminder}
                    onBlur={(e) => commitReminderTime(e.target)}
                    className="appearance-none min-h-11 px-3 bg-[#050505] text-white rounded-xl border border-[#2a2a2a] focus:border-[#5a5a5a] focus:outline-none text-sm transition-colors disabled:opacity-40"
                  />
                </div>
              )}

              {journalReminder.enabled && reminderPermission === 'prompt' && (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[#858585] text-xs">Not active on this iPhone.</p>
                  <button
                    onClick={allowJournalReminder}
                    disabled={savingReminder}
                    className="shrink-0 px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] disabled:opacity-40 rounded-xl transition-colors min-h-11"
                  >
                    Allow notifications
                  </button>
                </div>
              )}

              {reminderPermission === 'denied' && (
                <p className="text-[#858585] text-xs">
                  Notifications are off for Inner Ops on this iPhone. Turn them on in the Settings app: Notifications, Inner Ops, Allow Notifications.
                </p>
              )}
            </div>
          )}
        </div>

        {/* First-run help — the only way back to anything dismissed once.
            Every surface here shows exactly once and a skip is permanent, so
            without these three buttons the content would be unreachable. */}
        <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
          <div className="mb-5">
            <h2 className="text-lg font-light text-white">First-run help</h2>
            <p className="text-[#858585] text-xs mt-1">
              Re-show the framing, the guided walkthrough, or the per-module explainers.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
            <button
              onClick={() => setShowBriefing(true)}
              className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors min-h-11"
            >
              Replay briefing
            </button>
            <button
              onClick={restartWalkthrough}
              disabled={resettingHelp}
              className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors min-h-11 disabled:opacity-50"
            >
              Restart dashboard walkthrough
            </button>
            <button
              onClick={showModuleIntrosAgain}
              disabled={resettingHelp}
              className="px-4 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors min-h-11 disabled:opacity-50"
            >
              Show module intros again
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
                      {deleting ? 'Confirming…' : 'Permanently delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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
