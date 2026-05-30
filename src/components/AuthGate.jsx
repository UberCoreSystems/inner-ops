import { useState } from 'react';
import AuthForm from './AuthForm';
import BriefingScreen from './onboarding/BriefingScreen';

const INTRO_SEEN_KEY = 'io_intro_seen';

/**
 * Unauthenticated entry surface. On a visitor's first arrival it states what
 * Inner Ops is before asking for a signup, then reveals the auth form. Returning
 * visitors (intro already seen) go straight to the form.
 */
export default function AuthGate({ onAuthSuccess }) {
  const [showAuth, setShowAuth] = useState(() => {
    try {
      return localStorage.getItem(INTRO_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  });

  const enterAuth = () => {
    try {
      localStorage.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // localStorage unavailable (private mode) — proceed without persisting
    }
    setShowAuth(true);
  };

  if (showAuth) {
    return <AuthForm onAuthSuccess={onAuthSuccess} />;
  }

  return (
    <BriefingScreen
      onContinue={enterAuth}
      primaryLabel="Enter"
      eyebrow="Inner Operations"
      heading="Self-command cannot be outsourced."
      paragraphs={[
        'A private system for turning self-awareness into self-command. Journal, name what needs to die, log the lessons you refuse to pay for twice, catch the drift before it lands.',
        "One advisor — the Oracle — reads across all of it and tells you what you're avoiding. No comfort. No generic advice.",
      ]}
    />
  );
}
