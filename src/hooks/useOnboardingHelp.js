import { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '../firebase';
import { readOnboardingHelp, markModuleSeen, markWalkthrough } from '../utils/onboardingHelp';

/**
 * Reads first-run help state once per signed-in user.
 *
 * A one-shot read rather than a realtime subscription: this state only ever
 * changes because of the user's own action in the current tab, and the local
 * setters below already update optimistically. A second live userSettings
 * listener would cost a stream to learn things this hook already knows.
 *
 * `ready` is false until the read settles. Callers must render nothing while
 * it is false, otherwise an already-dismissed panel flashes on every load.
 */
export function useOnboardingHelp() {
  const [state, setState] = useState({ modules: {}, walkthroughs: {}, ready: false });
  const activeRef = useRef(true);
  // The uid this state belongs to. Held in a ref so the setters below write
  // under the same identity the read used — deriving it separately at write
  // time is what previously let a dismissal be recorded under a null uid.
  const uidRef = useRef(null);

  useEffect(() => {
    activeRef.current = true;
    let unsubscribe = null;

    const attach = async () => {
      const auth = await getAuth();
      if (!activeRef.current) return;
      const unsub = onAuthStateChanged(auth, async (user) => {
        if (!activeRef.current) return;
        if (!user) {
          // Signed out: ready, with nothing seen, so no panel renders against
          // another account's dismissals.
          uidRef.current = null;
          setState({ modules: {}, walkthroughs: {}, ready: true });
          return;
        }
        uidRef.current = user.uid;
        const next = await readOnboardingHelp(user.uid);
        if (activeRef.current && uidRef.current === user.uid) setState(next);
      });
      if (activeRef.current) unsubscribe = unsub;
      else unsub();
    };

    attach();

    return () => {
      activeRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const dismissModule = useCallback((moduleId) => {
    // Optimistic: the panel must disappear on tap regardless of the network.
    setState((prev) => ({
      ...prev,
      modules: { ...prev.modules, [moduleId]: new Date().toISOString() },
    }));
    markModuleSeen(uidRef.current, moduleId);
  }, []);

  const completeWalkthrough = useCallback((tourId, outcome) => {
    setState((prev) => ({
      ...prev,
      walkthroughs: { ...prev.walkthroughs, [tourId]: { ...outcome, at: new Date().toISOString() } },
    }));
    markWalkthrough(uidRef.current, tourId, outcome);
  }, []);

  return {
    ready: state.ready,
    hasSeenModule: (id) => !!state.modules[id],
    hasSeenWalkthrough: (id) => !!state.walkthroughs[id],
    dismissModule,
    completeWalkthrough,
  };
}

export default useOnboardingHelp;
