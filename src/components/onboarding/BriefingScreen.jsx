/**
 * Standalone briefing screen. Renders the system framing without any data
 * capture. Used as step 0 of the onboarding wizard and as the "Replay
 * briefing" surface from Settings.
 *
 * Props:
 *   onContinue — called when the primary action is pressed
 *   onSkip     — called when the secondary action is pressed (optional)
 *   primaryLabel — primary button text (defaults to "Continue")
 *   secondaryLabel — secondary action text (defaults to "Skip")
 *   showProgress — when true, renders a progress bar above the content
 *   stepIndex / totalSteps — progress-bar inputs (only used when showProgress)
 *   eyebrow / heading — optional copy overrides (default to the onboarding framing)
 *   paragraphs — optional array of body strings; when provided, replaces the
 *                default multi-paragraph body (used for the pre-auth intro)
 *   sample — optional { context, response } shown as a quoted Oracle example
 *            below the body. Used only on the pre-auth surface to demonstrate
 *            the Oracle's voice before signup; omitted during onboarding.
 */
export default function BriefingScreen({
  onContinue,
  onSkip,
  primaryLabel = 'Continue',
  secondaryLabel = 'Skip',
  showProgress = false,
  stepIndex = 0,
  totalSteps = 1,
  eyebrow = 'Inner Operations',
  heading = 'This is your inner command center.',
  paragraphs = null,
  sample = null,
}) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="max-w-xl w-full">
        {showProgress && (
          <div className="flex gap-1.5 mb-10">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i <= stepIndex ? 'bg-white' : 'bg-[#1a1a1a]'}`}
              />
            ))}
          </div>
        )}

        <div className="animate-fade-in-up">
          <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">{eyebrow}</p>
          <h1 className="text-4xl font-light text-white mb-6 leading-tight">
            {heading}
          </h1>
          {paragraphs ? (
            paragraphs.map((text, i) => (
              <p key={i} className="text-[#ababab] text-lg leading-relaxed mb-4">
                {text}
              </p>
            ))
          ) : (
            <>
              <p className="text-[#ababab] text-lg leading-relaxed mb-4">
                Every module — your journal, General Ledger, hard lessons, relapse tracking — feeds an AI advisor called the Oracle.
              </p>
              <p className="text-[#ababab] text-lg leading-relaxed mb-4">
                The Oracle reads what you actually write and responds to it directly. No generic advice. No comfort. The more honest you are, the more useful it becomes.
              </p>
              <p className="text-[#858585] text-sm leading-relaxed mb-2">
                <span className="text-[#ababab] font-medium">Where to start:</span> Ledger first — name what needs to die. Then journal daily. When something costs you badly, Hard Lessons. The Signal when you slip.
              </p>
              <p className="text-[#858585] text-sm mt-6">External enforcement is not self-governance. Self-command cannot be outsourced. This system is built on that distinction.</p>
            </>
          )}

          {sample && (
            <div className="mt-8 border-l-2 border-[#a855f7]/40 pl-4">
              <p className="text-[#828282] text-xs uppercase tracking-widest mb-2">What someone wrote</p>
              <p className="text-[#858585] text-sm italic leading-relaxed mb-4">{sample.context}</p>
              <p className="text-[#828282] text-xs uppercase tracking-widest mb-2">The Oracle</p>
              <p className="text-[#ababab] text-sm leading-relaxed">{sample.response}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center mt-12">
          {onSkip ? (
            <button
              onClick={onSkip}
              className="text-[#858585] hover:text-white transition-colors text-sm"
            >
              {secondaryLabel}
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={onContinue}
            className="px-8 py-3 bg-white text-black font-medium rounded-2xl hover:bg-gray-100 transition-all duration-200 text-sm"
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
