import { Link } from 'react-router-dom';

// PLACEHOLDER COPY — TODO: legal review before public launch.
// This states current data-handling behavior in plain language. It is not a
// substitute for a lawyer-reviewed privacy policy. Swap the wording (not the
// facts) once legal has signed off.
export default function Privacy() {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-light text-white">Privacy &amp; Data Handling</h1>
          <p className="text-[#858585] text-sm mt-1">
            What this app stores, where it goes, and the control you have over it.
          </p>
        </div>

        <Section title="What you write is sensitive — and treated that way">
          Inner Ops stores journal entries, relapse and signal logs, hard lessons, and
          kill contracts. This is personal material. It is stored under your account and
          is readable only by you.
        </Section>

        <Section title="Where your data lives">
          Your entries are stored in Google Firebase (Firestore) under your authenticated
          account. Access is scoped to your user ID at the database level — other users
          cannot read or modify your data.
        </Section>

        <Section title="How the Oracle uses your entries">
          When you request Oracle feedback, the text of that entry — and a short summary of
          your recent cross-module activity — is sent to Anthropic&apos;s Claude API through a
          secure server-side function to generate a response. No third-party advertising or
          analytics service receives your entry text.
        </Section>

        <Section title="Your entries are never used to train a model">
          What you write is not training data. Text sent to the Claude API is used only to
          generate your response and is not used to train or improve any model.
        </Section>

        <Section title="The Record is written by the server, not the client">
          The long-term memory the Oracle keeps — its themes and your own quoted receipts —
          is written exclusively server-side, under your verified account. The app cannot
          author or alter that record directly, and every stored quote is checked against
          your actual words before it is saved. You can edit or wipe it at any time.
        </Section>

        <Section title="Encrypted at rest">
          All data is encrypted at rest by the database (Firestore, AES-256, managed by
          Google) and in transit over TLS. No entry is stored in plaintext on disk.
        </Section>

        <Section title="Analytics & error reporting">
          The app may record anonymous, non-content usage events (for example, that an
          entry was saved) and, if enabled, error diagnostics. These never include the text
          of your entries or your email.
        </Section>

        <Section title="Exporting your data">
          You can download everything you have written as a JSON file at any time from{' '}
          <Link to="/settings" className="text-[#ababab] underline hover:text-white">Settings → Privacy &amp; Data</Link>.
        </Section>

        <Section title="Deleting your data">
          You can permanently delete your account and all associated data from{' '}
          <Link to="/settings" className="text-[#ababab] underline hover:text-white">Settings → Privacy &amp; Data</Link>.
          Deletion is immediate and irreversible: every entry, log, and profile record tied
          to your account is removed.
        </Section>

        <p className="text-[#858585] text-xs pt-4 border-t border-[#1a1a1a]">
          This page describes current behavior and is pending formal legal review. For
          questions, contact the operator of this instance.
        </p>

        <div>
          <Link
            to="/settings"
            className="inline-block px-5 py-2 text-xs bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#2a2a2a] rounded-xl transition-colors"
          >
            Back to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-[#0a0a0a] rounded-2xl p-6 border border-[#1a1a1a]">
      <h2 className="text-lg font-light text-white mb-2">{title}</h2>
      <p className="text-[#ababab] text-sm leading-relaxed">{children}</p>
    </div>
  );
}
