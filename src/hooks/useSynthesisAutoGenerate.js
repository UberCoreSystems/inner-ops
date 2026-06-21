import { useEffect, useRef } from 'react';
import { readUserData } from '../utils/firebaseUtils';
import { generateSynthesisBriefing } from '../utils/generateSynthesisBriefing';
import { COLLECTIONS } from '../utils/schema';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

const CADENCE_DAYS = { weekly: 7, biweekly: 14 };

/**
 * Silently auto-generates a Synthesis Briefing when the cadence period has elapsed
 * and no current-period briefing exists. Fires at most once per app session.
 *
 * @param {string|null} userId
 */
export function useSynthesisAutoGenerate(userId) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!userId || firedRef.current) return;
    firedRef.current = true;

    const run = async () => {
      try {
        const userSettings = await readUserData(COLLECTIONS.USER_SETTINGS).catch(() => []);
        const cadence = userSettings?.[0]?.synthesisCadence || 'weekly';
        const cadenceDays = CADENCE_DAYS[cadence] ?? 7;

        const syntheses = await readUserData(COLLECTIONS.SYNTHESES).catch(() => []);
        // Only synthesis briefings gate the synthesis cadence — reckoning docs
        // live in the same collection but are a different type.
        const sorted = (syntheses || [])
          .filter((d) => (d.type || 'synthesis') === 'synthesis')
          .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
        const lastBriefing = sorted[0];

        const dueForSynthesis = !lastBriefing?.generatedAt ||
          (Date.now() - new Date(lastBriefing.generatedAt).getTime()) / (1000 * 60 * 60 * 24) >= cadenceDays;

        if (dueForSynthesis) {
          // Finding 13: discriminated result instead of thrown CADENCE_LOCK string.
          const result = await generateSynthesisBriefing(userId, cadence);
          // Pass 3 New Finding 9 remediation: surface the auto-generated
          // briefing so the user understands why SynthesisGuard may redirect
          // them. Toast is grounded, not motivational, per CLAUDE.md.
          if (result?.status === 'ok') {
            ouraToast.info('New synthesis briefing ready.');
          }
          // 'locked' / 'insufficient-data' → skip silently.
        }

        // Optional periodic Reckoning — off by default, toggled in Settings.
        // Uses its own cadence and the engine's own type-scoped cadence gate.
        if (userSettings?.[0]?.reckoningAuto) {
          const reckoningCadence = userSettings?.[0]?.reckoningCadence || 'biweekly';
          const reckoning = await generateSynthesisBriefing(userId, reckoningCadence, { mode: 'reckoning' });
          if (reckoning?.status === 'ok') {
            ouraToast.info('The Reckoning is ready.');
          }
        }
      } catch (err) {
        logger.warn('useSynthesisAutoGenerate: silent generation failed:', err?.message);
      }
    };

    run();
  }, [userId]);
}
