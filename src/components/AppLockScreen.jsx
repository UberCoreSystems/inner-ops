import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { readLockSupport, verifyDeviceOwner } from '../utils/appLock';
import logger from '../utils/logger';

const HOW = {
  face: "Unlock with Face ID or this iPhone's passcode.",
  touch: "Unlock with Touch ID or this iPhone's passcode.",
  passcode: "Unlock with this iPhone's passcode.",
};

/**
 * The app lock's screen, in the iOS app only. It sits above everything else on
 * the page, including open modals and toasts.
 *
 * With `asking` it is the lock screen: it asks iOS to confirm the device owner
 * when it appears and each time the app returns, and otherwise waits on
 * Unlock. Nothing but a confirmation takes it down. Without `asking` it is a
 * blank cover, up while the app is in the background.
 */
export default function AppLockScreen({ asking, onUnlocked, onSignOut }) {
  const screenRef = useRef(null);
  const askingNowRef = useRef(false);
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // null until read: { available, method }
  const [support, setSupport] = useState(null);

  // Read around every attempt: Face ID or the passcode can be set up or
  // removed in the Settings app while this screen waits.
  const readSupport = useCallback(() => {
    readLockSupport().then(setSupport).catch((err) => {
      logger.warn('Failed to read lock support:', err?.message);
    });
  }, []);

  const ask = useCallback(async () => {
    if (askingNowRef.current) return;
    askingNowRef.current = true;
    setChecking(true);
    readSupport();
    const confirmed = await verifyDeviceOwner();
    askingNowRef.current = false;
    if (confirmed) {
      onUnlocked();
      return;
    }
    setChecking(false);
    readSupport();
  }, [onUnlocked, readSupport]);

  useEffect(() => {
    if (!asking) return undefined;
    ask();
    // Capacitor's foreground event: back at a screen that is still locked.
    document.addEventListener('resume', ask);
    return () => document.removeEventListener('resume', ask);
  }, [asking, ask]);

  // What the lock screen sits on can still be mounted. It must not take
  // focus, keystrokes or VoiceOver while the lock is up.
  useEffect(() => {
    if (!asking) return undefined;
    document.activeElement?.blur?.();
    const behind = [...document.body.children].filter(
      (element) => element !== screenRef.current && !element.hasAttribute('inert'),
    );
    behind.forEach((element) => element.setAttribute('inert', ''));
    return () => behind.forEach((element) => element.removeAttribute('inert'));
  }, [asking]);

  const signOut = async () => {
    setSigningOut(true);
    await onSignOut();
    setSigningOut(false);
  };

  if (!asking) {
    return createPortal(<div className="fixed inset-0 z-[10000] bg-[#111827]" />, document.body);
  }

  const unavailable = support?.available === false;

  return createPortal(
    <div
      ref={screenRef}
      className="fixed inset-0 z-[10000] bg-black overlay-safe flex items-center justify-center overflow-y-auto"
    >
      <div className="max-w-md w-full">
        <div className="oura-card p-8">
          <p className="text-xs font-medium text-[#858585] uppercase tracking-wider mb-3">
            Locked
          </p>
          <h1 className="text-2xl font-light text-white tracking-wide mb-4">
            Inner Ops is locked.
          </h1>
          <p className="text-sm text-[#858585] leading-relaxed mb-6" aria-live="polite">
            {unavailable
              ? 'This iPhone has no passcode, so it cannot confirm its owner. Set one in the Settings app, or sign out and sign in again with your password.'
              : HOW[support?.method || 'face']}
          </p>

          <button
            type="button"
            onClick={ask}
            disabled={checking || signingOut}
            className="w-full py-3.5 bg-[#4da6ff] text-black rounded-xl font-medium text-sm uppercase tracking-wider hover:bg-[#3d8fd9] focus:outline-none focus:ring-2 focus:ring-[#4da6ff]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {checking ? 'Checking…' : 'Unlock'}
          </button>

          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="w-full mt-6 min-h-11 text-xs text-[#858585] hover:text-white focus:outline-none focus:text-white disabled:opacity-50 transition-colors uppercase tracking-wider"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
