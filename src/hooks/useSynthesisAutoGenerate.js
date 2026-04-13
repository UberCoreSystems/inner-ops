import { useEffect, useRef } from 'react';
import { readUserData } from '../utils/firebaseUtils';
import { generateSynthesisBriefing } from '../utils/generateSynthesisBriefing';
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
        const userSettings = await readUserData('userSettings').catch(() => []);
        const cadence = userSettings?.[0]?.synthesisCadence || 'weekly';
        const cadenceDays = CADENCE_DAYS[cadence] ?? 7;

        const syntheses = await readUserData('syntheses').catch(() => []);
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

        await generateSynthesisBriefing(userId, cadence);
      } catch (err) {
        if (err.message?.startsWith('CADENCE_LOCK:')) return;
        logger.warn('useSynthesisAutoGenerate: silent generation failed:', err?.message);
      }
    };

    run();
  }, [userId]);
}
