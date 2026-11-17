import { useEffect, useState } from 'react';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import { buildProtocolEntry } from '../utils/buildProtocolEntry';
import { PROTOCOL_TOOLS, getProtocolTool } from '../utils/protocolTools';
import { track } from '../utils/analytics';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { useBreathing, CYCLES_PER_ROUND } from '../hooks/useBreathing';
import { useCountdown } from '../hooks/useCountdown';
import { useOracleModal } from '../hooks/useOracleModal';
import OracleModal from './OracleModal';
import VoiceInputButton from './VoiceInputButton';
import { AppIcon } from './AppIcons';

// The Protocol: the grounding tools, run while the window between urge and
// action is open. Every tool runs to a finish (protocolTools.js); a tool
// counts as used only once it gets there. Two homes on The Signal:
//   mode="full"  — the header pill. Tools → check-in → a signal entry
//                  carrying a protocolRun → Oracle reading.
//   mode="tools" — opened from the post-save receipt. Tools only, nothing
//                  written: the signal it belongs to already exists.

const MANTRAS = [
  'Name what this is. A feeling, not an instruction.',
  'Urge ≠ action. 90 seconds and it passes.',
  'This is a craving, not a command. Wait it out.',
  'The craving will pass whether I act on it or not.',
  'Act against the urge once. Make it a pattern.',
];

const ACCENT = '#00d4aa';
const SECONDARY_BUTTON = 'flex-1 py-3 rounded-2xl bg-oura-card border border-oura-border text-white text-sm hover:bg-oura-darker transition-colors';
const PRIMARY_BUTTON = 'flex-1 py-3 rounded-2xl bg-[#00d4aa] text-black text-sm font-medium hover:bg-[#00e6b8] disabled:opacity-40 transition-colors';

export default function GroundingProtocol({ mode = 'full', source = 'signal', onLogged, onClose }) {
  const full = mode === 'full';
  const [view, setView] = useState('tools'); // tools | breathing | steps | timer | checkin | done
  const [activeToolId, setActiveToolId] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepsDone, setStepsDone] = useState(false);
  const [toolsUsed, setToolsUsed] = useState([]);
  const [mantra] = useState(() => MANTRAS[Math.floor(Math.random() * MANTRAS.length)]);
  const [intensity, setIntensity] = useState(5);
  const [trigger, setTrigger] = useState('');
  const [reflection, setReflection] = useState('');
  const [saving, setSaving] = useState(false);
  const [rounds, setRounds] = useState(0);
  const { breathPhase, breathCount, start, reset: resetBreathing, getInstruction, getColor } = useBreathing();
  const countdown = useCountdown();
  const activeTool = getProtocolTool(activeToolId);
  const { oracleModal, openLoading, openWithContent, close: closeOracle } = useOracleModal();

  useEffect(() => {
    track('protocol_opened', { source, mode });
  }, [source, mode]);

  // One round is CYCLES_PER_ROUND cycles; count rounds as they complete so
  // the entry records how much breathing actually happened.
  useEffect(() => {
    if (breathPhase === 'complete') {
      setRounds((r) => r + 1);
      markUsed('breathing');
    }
  }, [breathPhase]);

  // startTool clears the countdown before a tool becomes active, so `done`
  // here always belongs to the tool that is active now.
  useEffect(() => {
    if (countdown.done && activeToolId) markUsed(activeToolId);
  }, [countdown.done, activeToolId]);

  const markUsed = (toolId) => {
    setToolsUsed((prev) => (prev.includes(toolId) ? prev : [...prev, toolId]));
  };

  const startTool = (tool) => {
    track('protocol_tool_used', { tool: tool.id });
    countdown.reset();
    setActiveToolId(tool.id);
    if (tool.kind === 'breath') {
      setView('breathing');
      start();
    } else if (tool.kind === 'steps') {
      setStepIndex(0);
      setStepsDone(false);
      setView('steps');
    } else {
      countdown.start(tool.seconds);
      setView('timer');
    }
  };

  const startBreathing = () => startTool(getProtocolTool('breathing'));

  // Leaving a tool stops it: a run that was walked away from never reaches
  // its finish, so it is never counted as used.
  const backToTools = () => {
    countdown.reset();
    resetBreathing();
    setView('tools');
  };

  const advanceStep = () => {
    if (!activeTool) return;
    if (stepIndex >= activeTool.steps.length - 1) {
      setStepsDone(true);
      markUsed(activeTool.id);
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const handleLog = async () => {
    if (saving) return;
    setSaving(true);
    const breathingCycles = rounds * CYCLES_PER_ROUND;
    const entry = buildProtocolEntry({
      intensity,
      trigger,
      reflection,
      toolsUsed,
      breathingCycles,
    }, new Date().toISOString());

    let saved;
    try {
      saved = await writeData('relapseEntries', entry, { sensitive: true });
    } catch (error) {
      logger.error('Protocol log failed:', { code: error?.code, name: error?.name });
      ouraToast.error('Could not log. Try again.');
      setSaving(false);
      return;
    }

    track('protocol_logged', { intensity, breathingCycles, tools: toolsUsed.length });
    setSaving(false);
    setView('done');
    onLogged?.(saved?.id ?? null);

    openLoading();
    try {
      const toolsRun = toolsUsed.map((id) => getProtocolTool(id)?.name).filter(Boolean).join(', ') || 'none';
      const context = `Protocol run. Urge intensity ${intensity}/10. Tools run: ${toolsRun}. Trigger: ${trigger.trim() || 'unspecified'}. Reflection: ${reflection.trim() || 'none'}.`;
      const { text, provenance, fallbackReason } = await generateAIFeedback('emergency', context, []);
      openWithContent({ content: text, entryCount: getCachedTotalEntryCount(), provenance, fallbackReason });
    } catch (error) {
      logger.error('Protocol reading failed:', { code: error?.code, name: error?.name });
      openWithContent({ content: 'Oracle unavailable. Entry recorded.' });
    }
  };

  const circleScale =
    breathPhase === 'inhale' ? 'scale-100 opacity-100' :
    breathPhase === 'exhale' ? 'scale-75 opacity-70' :
    'scale-90 opacity-85';

  return (
    <>
      <div className={full ? 'oura-card p-5 border border-[#00d4aa]/20 animate-fade-in-up' : 'space-y-4'}>
        {full ? (
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-[#00d4aa] text-xs font-medium uppercase tracking-widest">Protocol</p>
              <p className="text-gray-400 text-sm mt-1">{mantra}</p>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close protocol"
                className="text-gray-400 hover:text-white text-2xl leading-none min-h-8 min-w-8 -mt-1"
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <p className="text-gray-400 text-sm italic">{mantra}</p>
            {onClose && (
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white text-xs shrink-0 min-h-8">
                Close
              </button>
            )}
          </div>
        )}

        {view === 'tools' && (
          <div className="space-y-5 animate-fade-in">
            {full && (
              <div className="oura-card p-4 border-l-4 border-[#00d4aa]">
                <label htmlFor="urge-intensity" className="text-gray-400 text-sm block mb-3">
                  Urge intensity, 1 to 10
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="urge-intensity"
                    type="range"
                    min="1"
                    max="10"
                    value={intensity}
                    onChange={(e) => setIntensity(parseInt(e.target.value, 10))}
                    className="flex-1 accent-[#00d4aa]"
                    aria-valuemin={1}
                    aria-valuemax={10}
                    aria-valuenow={intensity}
                    aria-valuetext={`${intensity} out of 10`}
                  />
                  <span aria-hidden="true" className="text-2xl font-light text-white tabular-nums w-8 text-right">{intensity}</span>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-white font-light mb-3">Run one now.</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROTOCOL_TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => startTool(tool)}
                    className="p-4 bg-oura-darker rounded-2xl border border-oura-border text-left w-full hover:border-[#00d4aa]/60 transition-colors"
                  >
                    <AppIcon name={tool.icon} size={20} color={ACCENT} glow={false} />
                    <h4 className="text-white text-sm font-medium mt-2">{tool.name}</h4>
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">{tool.description}</p>
                    <span className="block text-[#00d4aa] text-xs mt-2">
                      {toolsUsed.includes(tool.id) ? 'Run again →' : 'Start →'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {full && (
              <div className="flex flex-col sm:flex-row gap-3">
                <button type="button" onClick={startBreathing} className={PRIMARY_BUTTON}>
                  Start box breathing
                </button>
                <button type="button" onClick={() => setView('checkin')} className={SECONDARY_BUTTON}>
                  Check in
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'breathing' && (
          <div className="space-y-6 text-center animate-fade-in">
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 mx-auto">
              <div className={`absolute inset-0 rounded-full ${getColor()} transition-all duration-[4000ms] ease-in-out ${circleScale}`}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white text-xl font-light">{getInstruction()}</span>
                </div>
              </div>
            </div>
            <div className="text-gray-400 text-sm">
              Cycle {Math.min(breathCount + 1, CYCLES_PER_ROUND)} of {CYCLES_PER_ROUND}
            </div>

            {breathPhase === 'complete' ? (
              <div className="space-y-4 animate-fade-in">
                <p className="text-oura-cyan text-sm">Cycle complete. The urge is lower than it was.</p>
                <div className="flex gap-3">
                  <button type="button" onClick={start} className={SECONDARY_BUTTON}>
                    Another round
                  </button>
                  {full ? (
                    <button type="button" onClick={() => setView('checkin')} className={PRIMARY_BUTTON}>
                      Check in
                    </button>
                  ) : (
                    <button type="button" onClick={backToTools} className={SECONDARY_BUTTON}>
                      Back to tools
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button type="button" onClick={backToTools} className="text-gray-400 hover:text-white text-sm">
                ← Back to tools
              </button>
            )}
          </div>
        )}

        {view === 'steps' && activeTool && (
          <div className="space-y-6 text-center animate-fade-in">
            <p className="text-[#00d4aa] text-xs font-medium uppercase tracking-widest">{activeTool.name}</p>
            {stepsDone ? (
              <div className="space-y-4 animate-fade-in">
                <p className="text-oura-cyan text-sm">{activeTool.finish}</p>
                <div className="flex gap-3">
                  <button type="button" onClick={backToTools} className={SECONDARY_BUTTON}>
                    Back to tools
                  </button>
                  {full && (
                    <button type="button" onClick={() => setView('checkin')} className={PRIMARY_BUTTON}>
                      Check in
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div key={stepIndex} className="animate-fade-in">
                  <div className="text-7xl font-light text-white tabular-nums leading-none">{activeTool.steps[stepIndex].count}</div>
                  <p className="text-gray-300 text-base mt-3">{activeTool.steps[stepIndex].prompt}</p>
                  <p className="text-gray-400 text-xs mt-2">Name each one. Out loud if you can.</p>
                </div>
                <div className="text-gray-400 text-sm">
                  {stepIndex + 1} of {activeTool.steps.length}
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={backToTools} className={SECONDARY_BUTTON}>
                    Back to tools
                  </button>
                  <button type="button" onClick={advanceStep} className={PRIMARY_BUTTON}>
                    {stepIndex >= activeTool.steps.length - 1 ? 'Finish' : 'Next'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {view === 'timer' && activeTool && (
          <div className="space-y-6 text-center animate-fade-in">
            <p className="text-[#00d4aa] text-xs font-medium uppercase tracking-widest">{activeTool.name}</p>
            {countdown.done ? (
              <div className="space-y-4 animate-fade-in">
                <p className="text-oura-cyan text-sm">{activeTool.finish}</p>
                <div className="flex gap-3">
                  <button type="button" onClick={() => countdown.start(activeTool.seconds)} className={SECONDARY_BUTTON}>
                    Again
                  </button>
                  {full ? (
                    <button type="button" onClick={() => { countdown.reset(); setView('checkin'); }} className={PRIMARY_BUTTON}>
                      Check in
                    </button>
                  ) : (
                    <button type="button" onClick={backToTools} className={SECONDARY_BUTTON}>
                      Back to tools
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div
                  className="text-7xl font-light text-white tabular-nums leading-none"
                  role="timer"
                  aria-label={`${countdown.remaining} seconds remaining`}
                >
                  {countdown.remaining}
                </div>
                <p className="text-gray-300 text-sm leading-relaxed max-w-xs mx-auto">{activeTool.instruction}</p>
                <button type="button" onClick={backToTools} className="text-gray-400 hover:text-white text-sm">
                  ← Back to tools
                </button>
              </>
            )}
          </div>
        )}

        {view === 'checkin' && full && (
          <div className="space-y-5 animate-fade-in">
            <div>
              <label htmlFor="protocol-trigger" className="block text-gray-400 text-xs uppercase tracking-widest mb-2 font-medium">
                What triggered this?
              </label>
              <input
                id="protocol-trigger"
                type="text"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value)}
                maxLength={300}
                placeholder="The call. The third night alone. The decision I put off."
                className="w-full px-4 py-3 bg-oura-darker text-white rounded-2xl border border-oura-border focus:border-[#00d4aa] focus:outline-none text-sm transition-colors"
              />
            </div>
            <div>
              <label htmlFor="protocol-reflection" className="block text-gray-400 text-xs uppercase tracking-widest mb-2 font-medium">
                What were you about to do? Optional.
              </label>
              <div className="relative">
                <textarea
                  id="protocol-reflection"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  maxLength={20000}
                  placeholder="What were you avoiding? What story ran right before this?"
                  className="w-full h-24 p-4 pr-12 bg-oura-darker text-white rounded-2xl border border-oura-border focus:border-[#00d4aa] focus:outline-none resize-none text-sm transition-colors"
                />
                <div className="absolute right-2 top-2">
                  <VoiceInputButton
                    onTranscript={(t) => setReflection((prev) => prev + (prev ? ' ' : '') + t)}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setView('tools')} disabled={saving} className={SECONDARY_BUTTON}>
                Back
              </button>
              <button type="button" onClick={handleLog} disabled={saving} className={PRIMARY_BUTTON}>
                {saving ? 'Logging…' : 'Log'}
              </button>
            </div>
          </div>
        )}

        {view === 'done' && full && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-white text-sm leading-relaxed">
              Logged. A 72-hour window is open on this signal. It stays pending until you convert it to a Hard Lesson or close it.
            </p>
            <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} w-full sm:w-auto sm:px-6 sm:flex-none`}>
              Close
            </button>
          </div>
        )}
      </div>

      {full && (
        <OracleModal
          isOpen={oracleModal.isOpen}
          onClose={closeOracle}
          content={oracleModal.content}
          isLoading={oracleModal.isLoading}
          entryCount={oracleModal.entryCount}
          provenance={oracleModal.provenance}
          fallbackReason={oracleModal.fallbackReason}
        />
      )}
    </>
  );
}
