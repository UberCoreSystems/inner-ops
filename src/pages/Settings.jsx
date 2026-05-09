import React, { useEffect, useMemo, useState } from 'react';
import { readUserData, writeData, updateData } from '../utils/firebaseUtils';
import { getUserProfile, saveUserProfile } from '../utils/userProfile';
import {
  ENGAGEMENT_TRIGGERS,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../utils/schema';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import BriefingScreen from '../components/onboarding/BriefingScreen';
import { parseLines, linesToText, PERSONAL_CONTEXT_LIMITS } from '../utils/personalContext';

export default function Settings() {
  // Notifications state
  const [settingsId, setSettingsId] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Personal context state — bound to textareas as raw text, parsed on save.
  const [activeSituationsText, setActiveSituationsText] = useState('');
  const [keyPeopleText, setKeyPeopleText] = useState('');
  const [knownTriggersText, setKnownTriggersText] = useState('');
  const [operatingContext, setOperatingContext] = useState('');
  const [savingContext, setSavingContext] = useState(false);

  // Track loaded baseline so the Save button can detect dirty state.
  const [contextBaseline, setContextBaseline] = useState({
    activeSituationsText: '',
    keyPeopleText: '',
    knownTriggersText: '',
    operatingContext: '',
  });

  const [showBriefing, setShowBriefing] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
          setSettingsId(settings.id);
          setNotificationPreferences({
            ...DEFAULT_NOTIFICATION_PREFERENCES,
            ...(settings.notificationPreferences || {}),
          });
        }

        if (profile) {
          const a = linesToText(profile.activeSituations);
          const k = linesToText(profile.keyPeople);
          const t = linesToText(profile.knownTriggers);
          const o = profile.operatingContext || '';
          setActiveSituationsText(a);
          setKeyPeopleText(k);
          setKnownTriggersText(t);
          setOperatingContext(o);
          setContextBaseline({
            activeSituationsText: a,
            keyPeopleText: k,
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
      keyPeopleText !== contextBaseline.keyPeopleText ||
      knownTriggersText !== contextBaseline.knownTriggersText ||
      operatingContext !== contextBaseline.operatingContext,
    [
      activeSituationsText,
      keyPeopleText,
      knownTriggersText,
      operatingContext,
      contextBaseline,
    ]
  );

  const persistNotificationPreferences = async (next) => {
    setSavingNotifications(true);
    try {
      const data = { notificationPreferences: next };
      if (settingsId) {
        await updateData('userSettings', settingsId, data);
      } else {
        const saved = await writeData('userSettings', data);
        setSettingsId(saved.id);
      }
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

  const saveContext = async () => {
    setSavingContext(true);
    try {
      const activeSituations = parseLines(activeSituationsText, PERSONAL_CONTEXT_LIMITS.ACTIVE_SITUATIONS);
      const keyPeople = parseLines(keyPeopleText, PERSONAL_CONTEXT_LIMITS.KEY_PEOPLE);
      const knownTriggers = parseLines(knownTriggersText, PERSONAL_CONTEXT_LIMITS.KNOWN_TRIGGERS);
      await saveUserProfile({
        activeSituations,
        keyPeople,
        knownTriggers,
        operatingContext: operatingContext.trim(),
      });
      setContextBaseline({
        activeSituationsText: linesToText(activeSituations),
        keyPeopleText: linesToText(keyPeople),
        knownTriggersText: linesToText(knownTriggers),
        operatingContext: operatingContext.trim(),
      });
      // Reflect parsed/trimmed values back into the textareas so the user
      // sees what was actually persisted (no trailing blank lines, etc.).
      setActiveSituationsText(linesToText(activeSituations));
      setKeyPeopleText(linesToText(keyPeople));
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
            label="Who matters in this moment"
            hint="Initials — role — current state. One per line. Up to five. Stays on your profile only."
            value={keyPeopleText}
            onChange={setKeyPeopleText}
            placeholder={'M. — partner — rebuilding trust\nDad — parent — health declining'}
            rows={5}
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
        className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#2a2a2a] focus:border-[#5a5a5a] focus:outline-none resize-none text-sm placeholder-[#6a6a6a] transition-colors"
      />
      {hint && <p className="text-[#858585] text-xs mt-1">{hint}</p>}
    </div>
  );
}
