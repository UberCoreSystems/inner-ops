import { useEffect, useState } from 'react';
import { authService } from '../utils/authService';
import logger from '../utils/logger';

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Full-screen gate rendered by App for any signed-in user with
 * emailVerified === false. Nothing behind it mounts until the address is
 * confirmed; firestore.rules enforce the same boundary server-side via the
 * email_verified token claim, so this screen is UX, not the security layer.
 */
export default function VerifyEmailGate({ user, onVerified, onSignOut }) {
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [notice, setNotice] = useState(null); // { tone: 'error' | 'info', text }

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleCheck = async () => {
    if (checking) return;
    setChecking(true);
    setNotice(null);
    try {
      // The cached user object does not learn about a link clicked in another
      // tab on its own — reload before reading emailVerified.
      await user.reload();
      if (user.emailVerified) {
        // Force a token refresh so Firestore requests carry the
        // email_verified=true claim the rules check.
        await user.getIdToken(true);
        onVerified();
        return;
      }
      setNotice({ tone: 'error', text: 'Not verified. Open the link in the email, then confirm here.' });
    } catch (err) {
      logger.error('Verification check failed:', err);
      setNotice({ tone: 'error', text: 'Check failed. Verify your connection and retry.' });
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (sending || cooldown > 0) return;
    setSending(true);
    setNotice(null);
    try {
      await authService.resendVerification();
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice({ tone: 'info', text: `Sent to ${user.email}.` });
    } catch (err) {
      setNotice({ tone: 'error', text: err?.message || 'Send failed. Retry after the cooldown.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="oura-card p-8">
          <p className="text-xs font-medium text-[#858585] uppercase tracking-wider mb-3">
            Access locked
          </p>
          <h1 className="text-2xl font-light text-white tracking-wide mb-4">
            Verify your email.
          </h1>
          <p className="text-sm text-[#858585] leading-relaxed mb-2">
            A verification link was sent to{' '}
            <span className="text-white break-all">{user.email}</span>.
          </p>
          <p className="text-sm text-[#858585] leading-relaxed mb-6">
            The system opens when the address is confirmed. Nothing is stored or
            read until then. Check spam if it hasn&apos;t landed.
          </p>

          {notice && (
            <div
              className={`p-3 mb-5 rounded-xl border text-sm ${
                notice.tone === 'error'
                  ? 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#ef4444]'
                  : 'bg-[#4da6ff]/10 border-[#4da6ff]/30 text-[#4da6ff]'
              }`}
              aria-live="polite"
            >
              {notice.text}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleCheck}
              disabled={checking}
              className="w-full py-3.5 bg-[#4da6ff] text-black rounded-xl font-medium text-sm uppercase tracking-wider hover:bg-[#3d8fd9] focus:outline-none focus:ring-2 focus:ring-[#4da6ff]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
            >
              {checking ? 'Checking…' : "I've verified"}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={sending || cooldown > 0}
              className="w-full py-3.5 bg-[#0a0a0a] border border-[#1a1a1a] text-white rounded-xl font-medium text-sm uppercase tracking-wider hover:border-[#4da6ff]/50 focus:outline-none focus:ring-2 focus:ring-[#4da6ff]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
            >
              {sending ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend email'}
            </button>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="w-full mt-6 text-xs text-[#858585] hover:text-white focus:outline-none focus:text-white transition-colors uppercase tracking-wider"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
