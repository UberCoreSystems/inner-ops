import { useEffect, useRef, useState } from 'react';
import { subscribeToUserData } from '../utils/firebaseUtils';
import { isNativePlatform } from '../utils/platform';
import {
  REMINDER_ROUTE,
  readJournalReminderPreference,
  syncJournalReminder,
  clearJournalReminder,
  onJournalReminderTap,
} from '../utils/journalReminder';
import logger from '../utils/logger';

/**
 * The daily journal reminder in the iOS app. Does nothing on the web.
 *
 * Keeps what iOS has scheduled in line with the stored preference and the
 * newest journal entry, and reports a tapped reminder as a route to open.
 *
 * @param {string|null|undefined} userId undefined while auth is unresolved,
 *   null when nobody is signed in with a verified address, otherwise the uid
 * @returns {[string|null, Function]} the route a tap asked for, and its setter
 */
export function useJournalReminder(userId) {
  const [route, setRoute] = useState(null);
  const listeningRef = useRef(false);

  // Registered once and never removed. Capacitor hands the tap that launched
  // the app to the first listener only, and the page forgets a removed
  // listener at once, so add-remove-add (Strict Mode) would lose that tap.
  useEffect(() => {
    if (!isNativePlatform() || listeningRef.current) return;
    listeningRef.current = true;
    onJournalReminderTap(() => setRoute(REMINDER_ROUTE)).catch((err) => {
      logger.error('Journal reminder tap listener failed:', err?.message);
    });
  }, []);

  useEffect(() => {
    if (!isNativePlatform() || userId === undefined) return undefined;
    if (userId === null) {
      clearJournalReminder();
      return undefined;
    }

    let active = true;
    let settings;
    let newestEntryAt;
    const unsubscribes = [];

    // Waits for both answers: acting on one alone would briefly put back a
    // day that is rightly skipped.
    const sync = () => {
      if (!active || settings === undefined || newestEntryAt === undefined) return;
      syncJournalReminder({ preference: readJournalReminderPreference(settings), newestEntryAt });
    };

    const keep = (subscription) => {
      subscription
        .then((unsubscribe) => {
          if (active) unsubscribes.push(unsubscribe);
          else unsubscribe();
        })
        .catch((err) => logger.warn('Journal reminder subscribe failed:', err?.message));
    };

    // Both queries are the ones BannerStack already listens to; the Firestore
    // SDK serves an identical query from the listener that is already open.
    keep(subscribeToUserData('userSettings', (docs) => {
      // No document means "not known" (an offline cold start answers empty),
      // never "off": a working reminder is left as it is.
      if (!docs?.[0]) return;
      settings = docs[0];
      sync();
    }));
    keep(subscribeToUserData('journalEntries', (docs) => {
      newestEntryAt = docs?.[0]?.createdAt ?? null;
      sync();
    }, { orderByField: 'timestamp', orderDirection: 'desc', limit: 1 }));

    // Capacitor's own event for the app returning to the foreground: the day,
    // or the permission in iOS Settings, may have changed meanwhile.
    document.addEventListener('resume', sync);

    return () => {
      active = false;
      document.removeEventListener('resume', sync);
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [userId]);

  return [route, setRoute];
}
