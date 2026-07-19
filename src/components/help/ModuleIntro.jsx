import { Link } from 'react-router-dom';
import { getModuleIntro } from '../../config/moduleIntros';
import { useOnboardingHelp } from '../../hooks/useOnboardingHelp';
import { track } from '../../utils/analytics';
import { useEffect, useRef } from 'react';

/**
 * First-visit explainer for a module page. Shows once, under the page header,
 * then never again after dismissal.
 *
 * Deliberately not routed through the engagementTriggers/BannerStack system:
 * that pipeline keys dismissal on a single triggerId (so six modules would
 * mean six notification-preference toggles in Settings for things that are not
 * notifications), and BannerRow is a one-line strip in the top bar rather than
 * a multi-sentence panel in the content column.
 *
 * @param {string} moduleId  key into MODULE_INTROS
 * @param {string} className extra classes — needed on KillList, whose column
 *   is `flex flex-col` with explicit order-*, so an unordered child would
 *   render ABOVE the page header.
 * @param {Function} onAction in-page action handler; required when the config
 *   has no actionRoute.
 */
export default function ModuleIntro({ moduleId, className = '', onAction = null }) {
  const intro = getModuleIntro(moduleId);
  const { ready, hasSeenModule, dismissModule } = useOnboardingHelp();
  const shownAtRef = useRef(null);
  const trackedRef = useRef(false);

  const visible = !!intro && ready && !hasSeenModule(moduleId);

  useEffect(() => {
    // Ref latch: StrictMode double-mounts effects in development, which would
    // otherwise double every shown-count.
    if (visible && !trackedRef.current) {
      trackedRef.current = true;
      shownAtRef.current = Date.now();
      track('module_intro_shown', { moduleId });
    }
  }, [visible, moduleId]);

  if (!visible) return null;

  const secondsVisible = () =>
    shownAtRef.current ? Math.round((Date.now() - shownAtRef.current) / 1000) : null;

  const handleDismiss = () => {
    track('module_intro_dismissed', { moduleId, secondsVisible: secondsVisible() });
    dismissModule(moduleId);
  };

  const handleAction = () => {
    track('module_intro_action_clicked', { moduleId });
    dismissModule(moduleId);
    if (onAction) onAction();
  };

  return (
    <div
      className={`oura-card p-4 border-l-4 mb-8 animate-fade-in-up ${className}`}
      style={{ borderLeftColor: intro.accent }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[#858585] text-xs uppercase tracking-widest">{intro.eyebrow}</p>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="text-[#858585] hover:text-white transition-colors -mt-1 -mr-1 p-2 min-h-11 min-w-11 flex items-center justify-center rounded-lg shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p className="text-[#ababab] text-sm leading-relaxed mt-2">{intro.what}</p>

      {/* Sample entry. Same treatment as the briefing screen's quoted sample —
          it shows the expected shape of an answer, which is what new users
          most often get wrong. */}
      <div className="mt-4 border-l-2 pl-4" style={{ borderLeftColor: `${intro.accent}66` }}>
        <p className="text-[#858585] text-sm leading-relaxed italic">“{intro.example}”</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {intro.actionRoute ? (
          <Link
            to={intro.actionRoute}
            onClick={handleAction}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: intro.accent }}
          >
            {intro.actionLabel}
          </Link>
        ) : (
          <button
            onClick={handleAction}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-black transition-opacity hover:opacity-90 min-h-11"
            style={{ backgroundColor: intro.accent }}
          >
            {intro.actionLabel}
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="text-[#858585] hover:text-[#ababab] text-sm transition-colors min-h-11 px-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
