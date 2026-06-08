// Synthesis briefing visibility is handled by a non-blocking banner on the
// Dashboard ([src/pages/Dashboard.jsx]: "Synthesis Briefing — Open Briefing").
// The previous hard-redirect approach broke module navigation when an unread
// briefing existed: every click on a module link bounced to /dashboard,
// including legitimate cases where the user wanted to journal or check the
// Ledger before reading the briefing.
//
// This component is a passthrough. It is kept (rather than inlined) so guarded
// routes can be re-enabled in one place if that UX is ever revisited.

export default function SynthesisGuard({ children }) {
  return children;
}
