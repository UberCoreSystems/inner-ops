import { useState, useEffect, useRef } from 'react';
import { subscribeToUserData } from '../utils/firebaseUtils';

/**
 * Realtime listener for the Synthesis Briefing `isNew` flag.
 * Returns true when the latest briefing has isNew === true.
 * Automatically clears when SynthesisBriefing marks the briefing as read in Firestore.
 *
 * @param {string|null} userId
 * @returns {boolean}
 */
export function useSynthesisNewFlag(userId) {
  const [isNew, setIsNew] = useState(false);
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!userId) {
      setIsNew(false);
      return;
    }

    let active = true;

    subscribeToUserData('syntheses', (data) => {
      if (!active) return;
      const sorted = [...data].sort(
        (a, b) => new Date(b.generatedAt) - new Date(a.generatedAt)
      );
      setIsNew(sorted[0]?.isNew === true);
    }).then((unsub) => {
      if (!active) {
        unsub();
        return;
      }
      unsubRef.current = unsub;
    });

    return () => {
      active = false;
      if (unsubRef.current) {
        unsubRef.current();
        unsubRef.current = null;
      }
    };
  }, [userId]);

  return isNew;
}
