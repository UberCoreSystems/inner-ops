// Synthesis briefing visibility is now handled by a non-blocking banner on
// the Dashboard ([src/pages/Dashboard.jsx]: "Synthesis Briefing — Open
// Briefing"). The previous hard-redirect approach broke module navigation
// when an unread briefing existed: every click on a module link bounced to
// /dashboard, including legitimate cases where the user wanted to journal
// or check the Ledger before reading the briefing.
//
// This component is now a passthrough that preserves the public API
// (latestSynthesisIsNew prop) so callers don't need to change. The forced-
// state UX lives entirely in the Dashboard banner, which the user can see
// every time they return to the dashboard until the briefing is opened.

export default function SynthesisGuard({ latestSynthesisIsNew, children }) {
  // latestSynthesisIsNew is intentionally unused — kept for API stability
  // and to make future re-enablement of guarded routes a one-line change.
  void latestSynthesisIsNew;
  return children;
}
