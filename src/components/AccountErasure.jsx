import { useState } from 'react';

const RECEIPT_LABELS = {
  memory: 'Memory records',
  userProfile: 'Profile record',
};

// camelCase manifest key → sentence-case label ("journalEntries" → "Journal entries").
function receiptLabel(key) {
  if (RECEIPT_LABELS[key]) return RECEIPT_LABELS[key];
  const spaced = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const HEADING = 'text-2xl font-light text-white tracking-wide mb-4';
const BODY = 'text-sm text-[#858585] leading-relaxed mb-6';
const BUTTON = 'w-full py-3.5 rounded-xl font-medium text-sm uppercase tracking-wider focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300';

/**
 * Full-screen surface App renders in place of the whole app from the moment an
 * account erasure starts. Nothing behind it is mounted, so no listener reacts
 * to the data disappearing and nothing can be written into a wiped account.
 */
export default function AccountErasure({ erasure, onRetry, onSignOut }) {
  const [signingOut, setSigningOut] = useState(false);

  // A full page load, not a route change: every in-memory cache goes with it.
  const leave = () => window.location.replace('/auth');

  const signOut = async () => {
    setSigningOut(true);
    await onSignOut();
    leave();
  };

  const rows = Object.entries(erasure.manifest || {})
    .filter(([, v]) => typeof v === 'number' && v > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-[100dvh] bg-black flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full">
        <div className="oura-card p-8" aria-live="polite">
          <p className="text-xs font-medium text-[#858585] uppercase tracking-wider mb-3">
            Account deletion
          </p>

          {erasure.status === 'erasing' && (
            <>
              <h1 className={HEADING}>Erasing your account.</h1>
              <p className={BODY}>
                Everything stored under this account is being removed, then the
                account itself. Keep this window open until it finishes.
              </p>
              <div
                role="status"
                aria-label="Erasing"
                className="animate-spin rounded-full h-8 w-8 border-b-2 border-oura-cyan"
              />
            </>
          )}

          {erasure.status === 'erased' && (
            <>
              <h1 className={HEADING}>Account erased.</h1>
              <p className={BODY}>
                Your account and all data have been erased. You are signed out.
              </p>
              {rows.length > 0 && (
                <>
                  <p className="text-xs text-[#858585] mb-2">What was removed:</p>
                  <ul className="space-y-1 mb-6">
                    {rows.map(([key, count]) => (
                      <li key={key} className="flex justify-between text-sm border-b border-[#1a1a1a] py-1.5">
                        <span className="text-[#ababab]">{receiptLabel(key)}</span>
                        <span className="text-white tabular-nums">{count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <button
                type="button"
                onClick={leave}
                className={`${BUTTON} bg-[#4da6ff] text-black hover:bg-[#3d8fd9] focus:ring-[#4da6ff]/50`}
              >
                Done
              </button>
            </>
          )}

          {erasure.status === 'failed' && (
            <>
              <h1 className={HEADING}>Erasure not confirmed.</h1>
              <p className={BODY}>
                The server did not confirm the erasure. Some of your data may
                already be removed. Run it again to finish.
              </p>
              <button
                type="button"
                onClick={onRetry}
                disabled={signingOut}
                className={`${BUTTON} bg-[#ef4444] text-white hover:bg-[#dc2626] focus:ring-[#ef4444]/50`}
              >
                Run erasure again
              </button>
              <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                className="w-full mt-3 py-3 text-xs text-[#858585] hover:text-white focus:outline-none focus:text-white disabled:opacity-50 transition-colors uppercase tracking-wider"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
