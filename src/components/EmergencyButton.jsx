import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import OracleModal from './OracleModal';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { useBreathing } from '../hooks/useBreathing';
import { useOracleModal } from '../hooks/useOracleModal';
import { useFocusTrap } from '../hooks/useFocusTrap';

// Quick grounding techniques
const groundingTechniques = [
  {
    name: "5-4-3-2-1 Grounding",
    icon: "👁️",
    description: "Name 5 things you see, 4 you hear, 3 you feel, 2 you smell, 1 you taste"
  },
  {
    name: "Box Breathing",
    icon: "🫁",
    description: "Breathe in 4 sec → Hold 4 sec → Out 4 sec → Hold 4 sec"
  },
  {
    name: "Cold Water Reset",
    icon: "💧",
    description: "Splash cold water on your face or hold ice cubes"
  },
  {
    name: "Physical Movement",
    icon: "🏃",
    description: "10 jumping jacks, walk around the block, or stretch"
  }
];

// Quick mantras
const mantras = [
  "Name what this is. A feeling, not an instruction.",
  "Urge ≠ action. 90 seconds and it passes.",
  "This is a craving, not a command. Wait it out.",
  "The craving will pass whether I act on it or not.",
  "Act against the urge once. Make it a pattern."
];

const EmergencyButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useFocusTrap(isOpen);
  const [step, setStep] = useState('main'); // main, breathing, reflection, complete
  const [reflection, setReflection] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [trigger, setTrigger] = useState('');
  const [loading, setLoading] = useState(false);
  const [randomMantra, setRandomMantra] = useState('');
  const { breathPhase, breathCount, start: startBreathCycle, reset: resetBreathing, getInstruction: getBreathingInstruction, getColor: getBreathingColor } = useBreathing();
  const { oracleModal, openLoading: openOracleLoading, openWithContent: openOracleWithContent, close: closeOracle } = useOracleModal();
  const navigate = useNavigate();

  // Get random mantra when modal opens
  useEffect(() => {
    if (isOpen) {
      setRandomMantra(mantras[Math.floor(Math.random() * mantras.length)]);
    }
  }, [isOpen]);

  // Escape closes the modal (mirrors OracleModal). The focus trap keeps focus
  // inside while open; this gives keyboard users a way out.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') resetAndClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const startBreathing = () => {
    setStep('breathing');
    startBreathCycle();
  };

  const handleQuickLog = async () => {
    setLoading(true);
    try {
      // Log a quick emergency entry
      const emergencyEntry = {
        type: 'emergency',
        intensity,
        trigger: trigger || 'Not specified',
        reflection: reflection || 'Used emergency button',
        groundingUsed: true,
        timestamp: new Date().toISOString()
      };

      // Finding 8 remediation: crisis entries contain sensitive free-form
      // text. Pass `sensitive: true` so writeData suppresses payload logging.
      await writeData('emergencyLogs', emergencyEntry, { sensitive: true });

      ouraToast.success('Emergency moment logged');

      // Get Oracle guidance
      openOracleLoading();

      const context = `Emergency struggle moment. Intensity: ${intensity}/10. Trigger: ${trigger || 'unspecified'}. Reflection: ${reflection || 'none provided'}`;
      const { text: oracleFeedback } = await generateAIFeedback('emergency', context, []);

      openOracleWithContent(oracleFeedback, getCachedTotalEntryCount());
      setStep('complete');
    } catch (error) {
      // Finding 8: never log the error object directly — it may contain the
      // stringified payload. Surface only code + name for diagnostics.
      logger.error('Error logging emergency:', { code: error.code, name: error.name });
      openOracleWithContent("Oracle unavailable. Entry recorded.");
      setStep('complete');
    } finally {
      setLoading(false);
    }
  };

  const goToRelapseRadar = () => {
    setIsOpen(false);
    navigate('/relapse');
  };

  const resetAndClose = () => {
    setIsOpen(false);
    setStep('main');
    resetBreathing();
    setReflection('');
    setIntensity(5);
    setTrigger('');
  };

  return (
    <>
      {/* Floating Emergency Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-6 z-50 bottom-6 max-sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] w-14 h-14 rounded-full bg-gradient-to-br from-red-600 to-red-800 text-white shadow-lg hover:shadow-red-500/50 hover:scale-110 transition-all duration-300 flex items-center justify-center group animate-pulse hover:animate-none"
        title="I'm Struggling"
        aria-label="I'm struggling — open emergency support"
      >
        <span className="text-xl">🆘</span>
        <span className="absolute -top-12 right-0 bg-black text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-red-500">
          I'm Struggling
        </span>
      </button>

      {/* Emergency Modal */}
      {isOpen && (
        <div role="dialog" aria-modal="true" aria-label="Emergency support" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fade-in">
          <div ref={modalRef} className="bg-oura-card border border-red-500/50 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-red-500/20">
            {/* Header */}
            <div className="p-6 border-b border-oura-border">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-light text-white tracking-tight">
                    {step === 'main' && "You're Not Alone"}
                    {step === 'breathing' && "Box Breathing"}
                    {step === 'reflection' && "Quick Check-In"}
                    {step === 'complete' && "Protocol Complete"}
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">{randomMantra}</p>
                </div>
                <button
                  onClick={resetAndClose}
                  aria-label="Close emergency modal"
                  className="text-gray-400 hover:text-white transition-colors text-2xl"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Main Step - Quick Tools */}
              {step === 'main' && (
                <div className="space-y-6 animate-fade-in-up">
                  {/* Intensity Check */}
                  <div className="oura-card p-4 border-l-4 border-red-500">
                    {/* Finding 19 remediation: accessible slider with
                        visible numeric readout and explicit ARIA metadata. */}
                    <label htmlFor="urge-intensity" className="text-gray-400 text-sm block mb-3">
                      How intense is this urge? (1-10) — current: {intensity}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="urge-intensity"
                        type="range"
                        min="1"
                        max="10"
                        value={intensity}
                        onChange={(e) => setIntensity(parseInt(e.target.value))}
                        className="flex-1 accent-red-500"
                        aria-label="Urge intensity"
                        aria-valuemin={1}
                        aria-valuemax={10}
                        aria-valuenow={intensity}
                        aria-valuetext={`${intensity} out of 10`}
                      />
                      <span
                        aria-hidden="true"
                        className={`text-2xl font-bold ${
                          intensity >= 8 ? 'text-red-500' :
                          intensity >= 5 ? 'text-yellow-500' :
                          'text-green-500'
                        }`}
                      >
                        {intensity}
                      </span>
                    </div>
                  </div>

                  {/* Grounding Techniques */}
                  <div>
                    <h3 className="text-white font-light mb-3">Quick Grounding Tools</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {groundingTechniques.map((technique, idx) => {
                        // Only "Box Breathing" triggers an action — render it as a
                        // real keyboard-focusable button. The rest are informational
                        // and stay non-interactive (no misleading cursor/hover).
                        const isActionable = technique.name === "Box Breathing";
                        const tileClass = `p-4 bg-oura-darker rounded-2xl border border-oura-border transition-colors text-left ${isActionable ? 'hover:border-oura-cyan cursor-pointer' : ''}`;
                        const inner = (
                          <>
                            <span className="text-2xl" aria-hidden="true">{technique.icon}</span>
                            <h4 className="text-white text-sm font-medium mt-2">{technique.name}</h4>
                            <p className="text-gray-400 text-xs mt-1">{technique.description}</p>
                          </>
                        );
                        return isActionable ? (
                          <button key={idx} type="button" onClick={startBreathing} className={`${tileClass} block w-full`}>
                            {inner}
                          </button>
                        ) : (
                          <div key={idx} className={tileClass}>
                            {inner}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={startBreathing}
                      className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-2xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-2"
                    >
                      <span>🫁</span> Start Box Breathing (1 min)
                    </button>
                    
                    <button
                      onClick={() => setStep('reflection')}
                      className="w-full py-4 bg-oura-amber text-black rounded-2xl font-medium hover:bg-amber-500 transition-all flex items-center justify-center gap-2"
                    >
                      <span>✍️</span> Quick Check-In
                    </button>

                    <button
                      onClick={goToRelapseRadar}
                      className="w-full py-4 bg-oura-card border border-oura-border text-white rounded-2xl font-medium hover:bg-oura-darker transition-all flex items-center justify-center gap-2"
                    >
                      <span>📡</span> Full Signal
                    </button>
                  </div>
                </div>
              )}

              {/* Breathing Step */}
              {step === 'breathing' && (
                <div className="space-y-8 animate-fade-in-up text-center">
                  <div className="relative w-48 h-48 mx-auto">
                    {/* Breathing circle */}
                    <div className={`absolute inset-0 rounded-full ${getBreathingColor()} transition-all duration-[4000ms] ease-in-out ${
                      breathPhase === 'inhale' ? 'scale-100 opacity-100' :
                      breathPhase === 'exhale' ? 'scale-75 opacity-70' :
                      'scale-90 opacity-85'
                    }`}>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white text-xl font-light">{getBreathingInstruction()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-gray-400">
                    Cycle {breathCount + 1} of 4
                  </div>

                  {breathPhase === 'complete' && (
                    <div className="space-y-4 animate-fade-in-up">
                      <p className="text-oura-cyan">Excellent work. Your nervous system thanks you.</p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => resetBreathing()}
                          className="flex-1 py-3 bg-oura-card border border-oura-border text-white rounded-2xl"
                        >
                          Another Round
                        </button>
                        <button
                          onClick={() => setStep('reflection')}
                          className="flex-1 py-3 bg-oura-amber text-black rounded-2xl font-medium"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  )}

                  {breathPhase !== 'complete' && breathPhase !== 'ready' && (
                    <button
                      onClick={() => setStep('main')}
                      className="text-gray-400 hover:text-white text-sm"
                    >
                      ← Back to tools
                    </button>
                  )}
                </div>
              )}

              {/* Reflection Step */}
              {step === 'reflection' && (
                <div className="space-y-6 animate-fade-in-up">
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">What triggered this?</label>
                    <input
                      type="text"
                      value={trigger}
                      onChange={(e) => setTrigger(e.target.value)}
                      placeholder="e.g., shame spiral after a bad decision, craving 3 hours into avoidance..."
                      className="w-full p-4 bg-oura-darker text-white rounded-2xl border border-oura-border focus:border-oura-amber focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-gray-400 text-sm block mb-2">Quick reflection (optional)</label>
                    <textarea
                      value={reflection}
                      onChange={(e) => setReflection(e.target.value)}
                      placeholder="What were you avoiding? What story did you tell yourself right before this?"
                      className="w-full h-24 p-4 bg-oura-darker text-white rounded-2xl border border-oura-border focus:border-oura-amber focus:outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep('main')}
                      className="flex-1 py-3 bg-oura-card border border-oura-border text-white rounded-2xl"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleQuickLog}
                      disabled={loading}
                      className="flex-1 py-3 bg-oura-amber text-black rounded-2xl font-medium disabled:opacity-50"
                    >
                      {loading ? 'Logging...' : 'Log & Get Guidance'}
                    </button>
                  </div>
                </div>
              )}

              {/* Complete Step */}
              {step === 'complete' && (
                <div className="space-y-6 animate-fade-in-up text-center">
                  <div className="text-6xl">✓</div>
                  <h3 className="text-2xl font-light text-white">Session complete. You controlled it.</h3>
                  <p className="text-gray-400">Your struggle has been logged. The Oracle has guidance for you.</p>
                  
                  <div className="flex gap-3">
                    <button
                      onClick={resetAndClose}
                      className="flex-1 py-3 bg-oura-card border border-oura-border text-white rounded-2xl"
                    >
                      Close
                    </button>
                    <button
                      onClick={goToRelapseRadar}
                      className="flex-1 py-3 bg-oura-amber text-black rounded-2xl font-medium"
                    >
                      Full Signal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={closeOracle}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        entryCount={oracleModal.entryCount}
      />
    </>
  );
};

export default EmergencyButton;
