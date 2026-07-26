import { Link } from 'react-router-dom';

// PLACEHOLDER COPY — TODO: legal review before public launch / App Store
// submission. This states current data-handling behavior in plain language.
// It is not a substitute for a lawyer-reviewed privacy policy. Swap the
// wording (not the facts) once legal has signed off.
const LAST_UPDATED = '2026-07-26';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-light text-white">Privacy Policy</h1>
          <p className="text-[#858585] text-sm mt-1">
            What this app collects, where it goes, and the control you have over it.
            Last updated {LAST_UPDATED}.
          </p>
        </div>

        <Section title="What is collected">
          Three things. The email address and password you sign up with — the password is
          held by Firebase Authentication, never by this app. The content you choose to
          write: journal entries, relapse and signal logs, hard lessons, kill contracts,
          synthesis briefings, and the personal context you add in your profile and
          settings. And minimal operational data: non-content usage events and error
          diagnostics, described below. Nothing else is gathered — no contacts, no
          location, no browsing history.
        </Section>

        <Section title="Your account">
          You sign in with an email address and password through Firebase Authentication.
          Your email is used to sign you in and to send account emails — verification and
          password reset. It is not used for marketing and is not attached to your entries
          when they are processed. Your account is the boundary of your data: everything
          you write is stored under your user ID and readable only by you.
        </Section>

        <Section title="What you write is sensitive — and treated that way">
          Inner Ops stores material about your patterns, relapses, and rules. This is
          personal material. It is scoped to your account at the database level — other
          users cannot read or modify it, and there is no social layer, no sharing, no
          public surface.
        </Section>

        <Section title="Where your data lives">
          Your data is stored in Google Firebase (Firestore) in the United States. Access
          is enforced by database security rules keyed to your user ID. Data is encrypted
          in transit over TLS and at rest by Firestore (AES-256, managed by Google).
        </Section>

        <Section title="How the Oracle uses your entries">
          When you request Oracle feedback — or save an entry that generates it — the text
          of that entry, a short summary of your recent cross-module activity, and
          relevant quotes from your own past entries are sent to Anthropic&apos;s Claude
          API through a secure server-side function to generate the response. That is the
          only reason your text leaves the database. No advertising or analytics service
          ever receives your entry text.
        </Section>

        <Section title="Your entries are never used to train a model">
          Text sent to the Claude API is used to generate your response and is not used to
          train or improve any model. Anthropic processes it as a service provider, under
          its commercial API terms.
        </Section>

        <Section title="The Record is written by the server, not the client">
          The long-term memory the Oracle keeps — its themes and your own quoted receipts —
          is written exclusively server-side, under your verified account. The app cannot
          author or alter that record directly, and every stored quote is checked against
          your actual words before it is saved. You can edit or wipe it at any time.
        </Section>

        <Section title="Analytics & error reporting">
          The app may record usage events (for example, that an entry was saved) tied to
          your user ID, and, if enabled, error diagnostics. These never include the text
          of your entries or your email address.
        </Section>

        <Section title="Not sold. Not shared.">
          Your data is not sold, rented, or traded — to anyone, for any purpose. It is
          shared only with the services that make the app run: Google (authentication and
          database), Anthropic (Oracle responses), and, if enabled, the analytics and
          error-reporting services above. Each processes data solely to provide its
          function. There are no data brokers, no advertisers, no third-party marketing.
        </Section>

        <Section title="Retention">
          Your data is kept until you delete it. There is no automatic expiry and no
          shadow archive: deleting an entry removes it, and deleting your account removes
          everything.
        </Section>

        <Section title="Your rights: access, export, deletion">
          You can read everything you have stored — it is all visible in the app. You can
          download all of it as a JSON file, delete individual entries, wipe the
          Oracle&apos;s memory, or permanently delete your account and every associated
          record, all from{' '}
          <Link to="/settings" className="text-[#ababab] underline hover:text-white">Settings → Privacy &amp; Data</Link>.
          Account deletion is immediate and irreversible.
        </Section>

        <Section title="Children">
          Inner Ops is built for adults confronting their own patterns. It is not directed
          at children, and no data is knowingly collected from anyone under 18. If you
          believe a minor has an account, contact [CONTACT] and it will be deleted.
        </Section>

        <Section title="Changes to this policy">
          If data handling changes, this page changes with it, and the date at the top is
          updated. Material changes will be surfaced in the app, not buried here.
        </Section>

        <Section title="Contact">
          Questions about your data: [CONTACT].
        </Section>

        <p className="text-[#858585] text-xs pt-4 border-t border-[#1a1a1a]">
          This page describes current behavior and is pending formal legal review.
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
