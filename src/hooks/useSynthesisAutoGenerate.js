import { useEffect, useRef } from 'react';
import { readUserData } from '../utils/firebaseUtils';
import { generateSynthesisBriefing } from '../utils/generateSynthesisBriefing';
import { COLLECTIONS } from '../utils/schema';
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
        const sorted = (syntheses || []).sort(
          (a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)
        );
        const lastBriefing = sorted[0];

        if (lastBriefing?.generatedAt) {
          const daysSince =
            (Date.now() - new Date(lastBriefing.generatedAt).getTime()) /
            (1000 * 60 * 60 * 24);
          if (daysSince < cadenceDays) return;
        }

        // Finding 13: discriminated result instead of thrown CADENCE_LOCK string.
        const result = await generateSynthesisBriefing(userId, cadence);
        if (result?.status === 'locked') return;
      } catch (err) {
        logger.warn('useSynthesisAutoGenerate: silent generation failed:', err?.message);
      }
    };

    run();
  }, [userId]);
}
