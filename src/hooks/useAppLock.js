import { useCallback, useEffect, useReducer, useRef } from 'react';
import { flushSync } from 'react-dom';
import { isNativePlatform } from '../utils/platform';
import {
  LOCK_BEAT_MS,
  initialLockState,
  lockReducer,
  leftForegroundAt,
  readAppLockEnabled,
  writeAppLockEnabled,
  setSwitcherCover,
} from '../utils/appLock';
import logger from '../utils/logger';

/**
 * The app lock in the iOS app. Always off and open on the web.
 *
 * Locked from the first render when the setting is on, covered the moment the
 * app goes to the background, and locked again on return once the grace
 * period has passed.
 *
 * @returns {{ enabled: boolean, phase: 'open'|'covered'|'locked', opened: boolean,
 *   enable: () => boolean, disable: () => void, unlock: () => void }}
 */
export function useAppLock() {
  const [state, dispatch] = useReducer(lockReducer, undefined, () => initialLockState(readAppLockEnabled()));
  const { enabled } = state;

  // iOS forgets the switcher cover at every launch and starts without it, so
  // it is set whenever the setting differs from what this launch last asked.
  const coverRef = useRef(false);
  useEffect(() => {
    if (enabled === coverRef.current) return;
    coverRef.current = enabled;
    setSwitcherCover(enabled).catch((err) => {
      logger.error('App switcher cover failed:', err?.message);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    let lastBeat = Date.now();
    const beat = setInterval(() => { lastBeat = Date.now(); }, LOCK_BEAT_MS);

    // Capacitor's events for the app entering the background and coming back.
    // The Face ID sheet only makes the app inactive and fires neither.
    const onPause = () => {
      // Committed before the handler returns: the cover has to be in place
      // before iOS freezes the page, or the return would show a frame of it.
      flushSync(() => dispatch({ type: 'pause', at: leftForegroundAt(Date.now(), lastBeat) }));
    };
    const onResume = () => {
      lastBeat = Date.now();
      dispatch({ type: 'resume', now: lastBeat });
    };

    document.addEventListener('pause', onPause);
    document.addEventListener('resume', onResume);
    return () => {
      clearInterval(beat);
      document.removeEventListener('pause', onPause);
      document.removeEventListener('resume', onResume);
    };
  }, [enabled]);

  const enable = useCallback(() => {
    if (!writeAppLockEnabled(true)) return false;
    dispatch({ type: 'enable' });
    return true;
  }, []);

  const disable = useCallback(() => {
    if (!isNativePlatform()) return;
    writeAppLockEnabled(false);
    dispatch({ type: 'disable' });
  }, []);

  const unlock = useCallback(() => dispatch({ type: 'verified' }), []);

  return { enabled, phase: state.phase, opened: state.opened, enable, disable, unlock };
}
