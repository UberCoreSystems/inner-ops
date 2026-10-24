
import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { generateAIFeedback, PROVENANCE, isRateLimitCode } from '../utils/aiFeedback';
import {
  buildFollowUpEntryText,
  buildLandedEntryText,
  FOLLOW_UP_ANSWER_MAX_CHARS,
  FOLLOW_UP_PUSHBACK_MAX_CHARS,
} from '../utils/buildFollowUpEntryText';
import { ARC_COPY, ARC_INTENT, ARC_OUTCOME, arcOutcomeBadge, setAsideLine, sitLine } from '../utils/followUpArc';
import { resolveTriggeredCriterion } from '../utils/confrontationCriteria';
import logger from '../utils/logger';
import { memoryModuleForName } from '../utils/memoryConstants';
import { ouraToast } from '../utils/toast';
import { InlineErrorBoundary } from './ErrorBoundary';
import { useFocusTrap } from '../hooks/useFocusTrap';

const REACTIONS = [
  { id: 'landed',   label: 'This landed',           color: '#22c55e', icon: '◉' },
  { id: 'disagree', label: 'I disagree',             color: '#ef4444', icon: '✕' },
  { id: 'sit',      label: 'I need to sit with this', color: '#f59e0b', icon: '◎' },
  { id: 'missed',   label: 'This missed',            color: '#5a5a5a', icon: '○' },
];

const MAX_REGEN = 3;
// The counter resets at UTC midnight (functions/rateLimit.js keys the day in
// UTC), which is not midnight for most users.
const LIMIT_LINE = 'Daily Oracle limit reached. Resets at 00:00 UTC.';

// The follow-up arc. Stages:
//   idle      no exchange; the responses to the reading are available
//   pushback  his turn-1 box is open — a pushback or a direction, by intent
//             (Cancel returns to idle)
//   answer    the Oracle replied and asked its question; the answer box is open
//   closed    the closing read landed, with its verdict and the commitment
//   left      he left the question unanswered
//   landed    "It landed": the receipt and its commitment; the arc ends here
//   sit       "Sit with this": no call; the reading returns in SIT_DAYS
// `intent` is which of the four responses he chose. `reading` is the judgment
// the arc answers, frozen at turn 1 so turn 2 is built from the same text
// whatever the display shows by then.
const IDLE_ARC = Object.freeze({
  stage: 'idle',
  intent: null,
  reading: null,
  pushback: null,
  reply: null,
  question: null,
  answer: null,
  close: null,
  commitment: null,
  outcome: null,
});

// The reply closes on its question. When the tagged question is the reply's
// last sentence it is shown once — as the heading of the answer box — and the
// body is the reply without it.
function splitReply(reply, question) {
  const body = String(reply || '').trimEnd();
  const q = String(question || '').trim();
  if (!body || !q || !body.endsWith(q)) return { body, heading: null };
  return { body: body.slice(0, body.length - q.length).trimEnd(), heading: q };
}

// The reading's own voice. Every Oracle turn renders in it, so the exchange
// reads as one voice continuing.
const PROSE_CLASS = 'text-[#e0e0e0] text-[15px] leading-[1.75] font-light whitespace-pre-line';
const CHOICE_CLASS = 'px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#2a2a2a] text-[#ababab] hover:border-[#3a3a3a] hover:text-white transition-all disabled:opacity-40';

// His turns: an indented quote in a muted tone, no label. Not a bubble.
function Quote({ text }) {
  return (
    <blockquote className="border-l-2 border-[#2a2a2a] pl-4 text-[#9a9a9a] text-[15px] leading-[1.75] font-light whitespace-pre-line">
      {text}
    </blockquote>
  );
}

// The Oracle at work: two counter-rotating rings. Full size while the first
// reading is written; compact inside the exchange while a turn is read.
function Ring({ compact = false }) {
  const inset = compact ? 'inset-[3px]' : 'inset-[6px]';
  return (
    <div className={`relative ${compact ? 'w-7 h-7' : 'w-16 h-16 mb-6'}`} aria-hidden="true">
      <div className="absolute inset-0 rounded-full border border-[#2a2a2a]" />
      <div
        className="absolute inset-0 rounded-full border border-[#d1d1d1]"
        style={{
          borderTopColor: 'transparent',
          borderRightColor: 'transparent',
          animation: 'spin 2s linear infinite',
        }}
      />
      <div className={`absolute ${inset} rounded-full border border-[#1a1a1a]`} />
      <div
        className={`absolute ${inset} rounded-full border border-[#5a5a5a]`}
        style={{
          borderBottomColor: 'transparent',
          borderLeftColor: 'transparent',
          animation: 'spin 3s linear infinite reverse',
        }}
      />
    </div>
  );
}

// A turn is being read. Sits in the exchange where the reply will land, so the
// column reads: he spoke, the Oracle is reading, it answered.
const ReadingIndicator = ({ innerRef }) => (
  <div ref={innerRef} className="flex items-center gap-3 py-1" role="status" aria-live="polite">
    <Ring compact />
    <span className="text-[#858585] text-xs uppercase tracking-widest">Reading</span>
  </div>
);

// BER-136: call oracle CF directly for regen/follow-up.
// BER-229: accept entryModuleName so journal regen gets DEPTH instruction from CF.
// Finding 3 remediation: the system-prompt fragment is now requested by key,
// not supplied as free text. The server-side registry owns the template.
// BER-194 follow-up: entryCount is forwarded so the server's trust-calibration
// gate reads the same record density the modal was opened with. Omitting it
// made every regen/retry run as if the user had zero entries logged.
async function callOracleRaw(entryText, promptContext, entryModuleName, entryCount = null, memoryModule = null) {
  try {
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 35000 });
    const result = await oracleFn({
      entryText,
      moduleName: entryModuleName === 'journal' ? 'journal' : 'oracle',
      userContext: {},
      tone: 'stoic',
      ...(typeof entryCount === 'number' ? { entryCount } : {}),
      ...(memoryModule ? { memoryModule } : {}),
      ...(promptContext?.key
        ? {
            promptContextKey: promptContext.key,
            promptContextParams: promptContext.params || {},
          }
        : {}),
    });
    return {
      feedback: result.data?.feedback?.trim() || null,
      metacognitiveDepth: result.data?.metacognitiveDepth || null,
      closingQuestion: result.data?.closingQuestion || null,
      // Set only by the closing turn of a follow-up arc (oracle_close).
      commitment: result.data?.commitment ?? null,
      verdict: result.data?.verdict || null,
      errorCode: null,
    };
  } catch (err) {
    logger.warn('Oracle raw call failed:', err?.message);
    return {
      feedback: null,
      metacognitiveDepth: null,
      closingQuestion: null,
      commitment: null,
      verdict: null,
      errorCode: err?.code || 'unknown',
    };
  }
}

const OracleModal = ({
  isOpen,
  onClose,
  feedback,
  content,
  isLoading = false,
  target = null,
  moduleName = '',
  context = '',
  onFeedbackGenerated = null,
  onReaction = null,
  // BER-136: entry context for regeneration and follow-up
  entryText = '',
  entryModuleName = '',
  // Receives the whole arc so far after every turn that changes the record.
  onFollowUpStored = null,
  // Receives the follow-up commitment when the user chooses to make it a Kill
  // Contract. Supplied by pages that can open the Ledger prefilled (Journal);
  // without it the commitment block renders with no action.
  onMakeContract = null,
  // Called when a retry or regeneration replaces the displayed reading, so the
  // owning page can persist it. Follow-ups are already persisted; without this
  // a reload paired a stored follow-up with the judgment it replaced.
  onFeedbackReplaced = null,
  // A question he leaves unanswered returns as Today's Reflection — true only
  // where the arc is persisted somewhere the dashboard reads (Journal).
  returnsToDashboard = false,
  // The four responses to a reading — Push back, Go further, It landed, Sit
  // with this — in place of the reaction row and Go deeper. Journal only;
  // every other caller keeps the row.
  intentChoices = false,
  // Sit with this: records the deferral on the entry and resolves to the sit
  // on record ({ count, until }). The Sit choice renders only with it.
  onSit = null,
  // The sit this reading is returning from, when it is ({ count, until }).
  sitRecord = null,
  // BER-194: data-depth calibration — null = unknown (no constraint applied)
  entryCount = null,
  // BER-225: metacognitive depth classification (journal entries only)
  metacognitiveDepth = null,
  // Origin of `content`/`feedback`. 'oracle' = Claude answered. 'local' = the
  // call failed and this text was composed from the entry alone. null = not
  // Oracle output (a system message) or a document written before the field
  // existed — in both cases no claim is made either way.
  provenance = null,
  fallbackReason = null,
  // The Oracle call failed outright and no reading was recorded. `content` is
  // then a system message, not prose — so it carries no provenance, but the
  // retry machinery still applies: the entry exists and can still be read.
  oracleUnavailable = false,
}) => {
  // BER-200: resolved asynchronously on open — display the triggered criterion
  const [resolvedCriterion, setResolvedCriterion] = useState(null);
  const [oracleFeedback, setOracleFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState(null);

  // BER-136: regeneration state
  const [displayFeedback, setDisplayFeedback] = useState('');
  // BER-229: local depth state so regen can update it (prop only reflects initial load)
  const [displayDepth, setDisplayDepth] = useState(metacognitiveDepth);
  const [regenCount, setRegenCount] = useState(0);
  const [regenLoading, setRegenLoading] = useState(false);
  // Local copy so a successful retry can clear the "Local" label without the
  // parent having to re-render with a new prop.
  const [displayProvenance, setDisplayProvenance] = useState(provenance);
  const [retryLoading, setRetryLoading] = useState(false);

  // The "Go deeper" arc (see IDLE_ARC).
  const [arc, setArc] = useState(IDLE_ARC);
  const [draft, setDraft] = useState('');
  // The text turn the Oracle is reading. It leaves the box the moment it is
  // sent and shows as his quote; on failure it returns to the box.
  const [sentTurn, setSentTurn] = useState(null);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  // Submit is withheld until the daily Oracle limit resets.
  const [limitReached, setLimitReached] = useState(false);
  // Which tap-only response is in flight ('landed' | 'sit'), and the sit
  // recorded in this session ({ count, until }) once onSit resolved.
  const [pendingChoice, setPendingChoice] = useState(null);
  const [sitState, setSitState] = useState(null);
  // An Oracle turn is in flight: his sent text or It landed. The box and the
  // choices step aside and the exchange shows the Oracle reading.
  const turnInFlight = sentTurn !== null || pendingChoice === 'landed';
  // Bumped on every reset: a result that lands for an older arc is dropped.
  const arcIdRef = useRef(0);
  // Writes are chained so a slow turn-1 write can never land over turn 2.
  const persistChainRef = useRef(Promise.resolve());
  const latestTurnRef = useRef(null);

  const currentFeedback = displayFeedback || feedback || content || oracleFeedback;

  const resetArc = () => {
    arcIdRef.current += 1;
    setArc(IDLE_ARC);
    setDraft('');
    setSentTurn(null);
    setFollowUpLoading(false);
    setLimitReached(false);
    setPendingChoice(null);
    setSitState(null);
  };

  useEffect(() => {
    if (isOpen && target && moduleName && !feedback && !content) {
      generateOracleFeedback();
    } else if (isOpen && (feedback || content)) {
      setOracleFeedback(feedback || content);
    }
    if (isOpen) {
      setSelectedReaction(null);
      // Reset regen/follow-up on each new open
      setRegenCount(0);
      resetArc();
      setDisplayFeedback('');
      // BER-229: reset depth to prop value on each open
      setDisplayDepth(metacognitiveDepth);
      setDisplayProvenance(provenance);
      // BER-200: resolve confrontation criterion for this user
      setResolvedCriterion(null);
      try {
        const uid = getAuth().currentUser?.uid;
        if (uid) {
          resolveTriggeredCriterion(uid)
            .then((result) => setResolvedCriterion(result))
            .catch(() => {});
        }
      } catch { /* no-op */ }
    }
    // generateOracleFeedback and resetArc are unmemoized closures (new each
    // render) — adding them would regenerate on every render. metacognitiveDepth
    // is intentionally re-applied only on open, not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, target, moduleName, feedback, content]);

  // Sync displayFeedback whenever the base feedback changes
  useEffect(() => {
    const base = feedback || content || oracleFeedback;
    if (base) setDisplayFeedback(base);
  }, [feedback, content, oracleFeedback]);

  // Each new turn scrolls into view. The answer box is never auto-focused, so
  // the phone keyboard does not open while he is still reading.
  useEffect(() => {
    if (turnInFlight || ['answer', 'closed', 'left', 'landed', 'sit'].includes(arc.stage)) {
      latestTurnRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    }
  }, [arc.stage, turnInFlight]);

  const generateOracleFeedback = async () => {
    if (!target || !moduleName) return;

    setIsGenerating(true);
    try {
      const feedbackContext = context || `Kill Target: ${target.title}
Description: ${target.description}
Status: ${target.status}
Priority: ${target.priority}
Reflection: ${target.reflectionNotes || 'No reflection yet'}`;

      const {
        text: generatedFeedback,
        provenance: generatedProvenance,
      } = await generateAIFeedback(moduleName, feedbackContext, []);
      setOracleFeedback(generatedFeedback);
      // This path generates inside the modal, so the parent has no provenance
      // prop to pass — take it from the call itself.
      setDisplayProvenance(generatedProvenance ?? null);

      if (onFeedbackGenerated) {
        onFeedbackGenerated(generatedFeedback);
      }
    } catch (error) {
      logger.error('Error generating Oracle feedback:', error);
      setOracleFeedback('The Oracle encounters interference... Please try again in a moment.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Retry after a local fallback. Deliberately does NOT consume a regeneration
  // credit — the first attempt never reached the Oracle, so charging the user
  // for it would penalize them for an outage.
  const handleRetry = async () => {
    if (retryLoading || !entryText) return;
    setRetryLoading(true);
    try {
      const {
        feedback: retryFeedback,
        metacognitiveDepth: retryDepth,
        closingQuestion: retryQuestion,
      } = await callOracleRaw(entryText, null, entryModuleName, entryCount);
      if (retryFeedback) {
        setDisplayFeedback(retryFeedback);
        setDisplayDepth(retryDepth);
        setDisplayProvenance(PROVENANCE.ORACLE);
        resetArc();
        onFeedbackReplaced?.(retryFeedback, PROVENANCE.ORACLE, {
          metacognitiveDepth: retryDepth,
          closingQuestion: retryQuestion,
        });
      } else {
        ouraToast.error('Oracle still unreachable.');
      }
    } finally {
      setRetryLoading(false);
    }
  };

  // BER-136: regenerate from a different confrontational angle
  const handleRegenerate = async () => {
    if (regenCount >= MAX_REGEN || regenLoading || !entryText || arc.stage !== 'idle') return;
    setRegenLoading(true);
    try {
      // Finding 3: template lives server-side. The server interprets
      // entryCount (a number) to include or omit the data-depth caveat.
      // BER-229: pass entryModuleName so journal regen gets DEPTH from CF
      const {
        feedback: regenFeedback,
        metacognitiveDepth: regenDepth,
        closingQuestion: regenQuestion,
      } = await callOracleRaw(
        entryText,
        { key: 'oracle_regen', params: { entryCount } },
        entryModuleName,
        entryCount
      );
      if (regenFeedback) {
        setDisplayFeedback(regenFeedback);
        setDisplayDepth(regenDepth);
        setDisplayProvenance(PROVENANCE.ORACLE);
        setRegenCount(prev => prev + 1);
        resetArc();
        onFeedbackReplaced?.(regenFeedback, PROVENANCE.ORACLE, {
          metacognitiveDepth: regenDepth,
          closingQuestion: regenQuestion,
        });
      } else {
        ouraToast.error('Oracle unavailable. Try again.');
      }
    } finally {
      setRegenLoading(false);
    }
  };

  const persistArc = (next) => {
    if (!onFollowUpStored) return;
    persistChainRef.current = persistChainRef.current
      .then(() => onFollowUpStored(next))
      .catch((err) => logger.warn('Follow-up persist failed:', err?.message));
  };

  // One Oracle call per turn. Returns the parsed result, or null after a
  // failure — the draft stays and nothing is used up. Module deliberately left
  // unset: a follow-up is not a journal entry and must not pick up the DEPTH
  // directive. entryCount still applies, and memory is scoped to the entry's
  // own module so its receipts ride along.
  const runTurn = async (key, turnEntryText) => {
    const arcId = arcIdRef.current;
    setFollowUpLoading(true);
    setLimitReached(false);
    try {
      const result = await callOracleRaw(
        turnEntryText, { key }, undefined, entryCount, memoryModuleForName(entryModuleName)
      );
      if (arcIdRef.current !== arcId) return null;
      if (result.feedback) return result;
      if (isRateLimitCode(result.errorCode)) setLimitReached(true);
      else ouraToast.error('Oracle unavailable. Try again.');
      return null;
    } finally {
      if (arcIdRef.current === arcId) setFollowUpLoading(false);
    }
  };

  // A text turn. His words leave the box as soon as they are sent and stand in
  // the exchange while the Oracle reads them; a failed call puts them back.
  const sendTurn = async (text, key, turnEntryText) => {
    const arcId = arcIdRef.current;
    setSentTurn(text);
    setDraft('');
    const result = await runTurn(key, turnEntryText);
    if (arcIdRef.current !== arcId) return null;
    setSentTurn(null);
    if (!result) setDraft(text);
    return result;
  };

  // The Oracle's own prior reading rides along so it can hold, concede or
  // deepen on the record — but only when that reading is Oracle output. A
  // locally composed fallback is not a position the Oracle took.
  const readingOnRecord = () => (displayProvenance === PROVENANCE.ORACLE ? currentFeedback : null);

  // Turn 1: his pushback (the Oracle holds or concedes on the record) or his
  // direction (the Oracle deepens from where it points). Either closes on the
  // question he answers next.
  const handleTurnOneSubmit = async () => {
    const pushback = draft.trim();
    if (!pushback || arc.stage !== 'pushback' || followUpLoading || !entryText) return;
    const intent = arc.intent === ARC_INTENT.GO_FURTHER ? ARC_INTENT.GO_FURTHER : ARC_INTENT.PUSH_BACK;
    const reading = readingOnRecord();
    const result = await sendTurn(
      pushback,
      intent === ARC_INTENT.GO_FURTHER ? 'oracle_further' : 'oracle_pushback',
      buildFollowUpEntryText({ entryText, priorReading: reading, pushback, intent })
    );
    if (!result) return;
    const next = {
      ...IDLE_ARC,
      stage: 'answer',
      intent,
      reading,
      pushback,
      reply: result.feedback,
      question: result.closingQuestion,
    };
    setArc(next);
    persistArc(next);
  };

  // "It landed": one turn. The Oracle writes the receipt of what he accepted
  // and closes on the commitment. The arc ends here.
  const handleLanded = async () => {
    if (arc.stage !== 'idle' || followUpLoading || !entryText) return;
    const reading = readingOnRecord();
    setPendingChoice('landed');
    try {
      const result = await runTurn(
        'oracle_landed',
        buildLandedEntryText({ entryText, priorReading: reading })
      );
      if (!result) return;
      const next = {
        ...IDLE_ARC,
        stage: 'landed',
        intent: ARC_INTENT.LANDED,
        reading,
        reply: result.feedback,
        commitment: result.commitment,
      };
      setArc(next);
      persistArc(next);
    } finally {
      setPendingChoice(null);
    }
  };

  // "Sit with this": no call. The deferral is written first, so the line only
  // claims a return date the entry carries.
  const handleSit = async () => {
    if (arc.stage !== 'idle' || followUpLoading || !onSit) return;
    const arcId = arcIdRef.current;
    setPendingChoice('sit');
    setFollowUpLoading(true);
    try {
      const sit = await onSit();
      if (arcIdRef.current !== arcId) return;
      setSitState(sit?.until ? sit : { count: (sitRecord?.count || 0) + 1, until: null });
      setArc({ ...IDLE_ARC, stage: 'sit', intent: ARC_INTENT.SIT });
    } catch (err) {
      logger.warn('Sit not saved:', err?.message);
      ouraToast.error('Not saved. Try again.');
    } finally {
      if (arcIdRef.current === arcId) {
        setFollowUpLoading(false);
        setPendingChoice(null);
      }
    }
  };

  // Turn 2: his answer. The Oracle judges it, closes on the commitment, and
  // the exchange ends.
  const handleAnswerSubmit = async () => {
    const answer = draft.trim();
    if (!answer || arc.stage !== 'answer' || followUpLoading || !entryText) return;
    const result = await sendTurn(
      answer,
      'oracle_close',
      buildFollowUpEntryText({
        entryText,
        priorReading: arc.reading,
        pushback: arc.pushback,
        reply: arc.reply,
        answer,
        intent: arc.intent,
      })
    );
    if (!result) return;
    const next = {
      ...arc,
      stage: 'closed',
      answer,
      close: result.feedback,
      commitment: result.commitment,
      outcome: result.verdict,
    };
    setArc(next);
    persistArc(next);
  };

  // Leaving the question is a choice on the record: no call, outcome
  // 'unanswered'. Reached from the button (the line below shows) and from
  // closing the modal with the question open (it does not).
  const leaveUnanswered = () => {
    if (arc.stage !== 'answer' || followUpLoading) return;
    const next = { ...arc, stage: 'left', outcome: ARC_OUTCOME.UNANSWERED };
    setArc(next);
    setDraft('');
    persistArc(next);
  };

  // Every way out passes here. Unsent text asks first; an open question is
  // left unanswered on the record. A turn still in flight is left to land —
  // its result persists even after the modal has closed.
  const requestClose = () => {
    const boxOpen = arc.stage === 'pushback' || arc.stage === 'answer';
    if (boxOpen && draft.trim() && !followUpLoading
      && !window.confirm('Close without sending? What you wrote will be lost.')) return;
    leaveUnanswered();
    onClose?.();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  const handleReaction = async (reactionId) => {
    const previousReaction = selectedReaction;
    setSelectedReaction(reactionId);
    if (onReaction) {
      try {
        await onReaction(reactionId);
        ouraToast.success('Reaction saved', { duration: 1500 });
      } catch (error) {
        logger.error('Failed to save Oracle reaction:', error);
        setSelectedReaction(previousReaction);
        ouraToast.error('Reaction not saved.');
      }
    }
  };

  const isCurrentlyLoading = isLoading || isGenerating;
  // While the entry has no reading at all there is nothing to regenerate from
  // and nothing to push back on — only the retry below applies. A successful
  // retry clears the flag by setting real prose + Oracle provenance.
  const isUnanswered = oracleUnavailable && !isCurrentlyLoading && displayProvenance !== PROVENANCE.ORACLE;
  // Once the exchange starts, the reading it answers stays put: Retry,
  // Regenerate and Go deeper leave while a box is open and for good once the
  // Oracle has answered the challenge.
  const arcStarted = arc.stage !== 'idle';
  const canRegen = !arcStarted && !isUnanswered && !!entryText && regenCount < MAX_REGEN && !regenLoading && !isCurrentlyLoading && !!currentFeedback;
  const canFollowUp = !arcStarted && !isUnanswered && !!entryText && !regenLoading && !retryLoading && !isCurrentlyLoading && !!currentFeedback;
  // Sit needs a reading and a place to record it, and waits for any call in
  // flight. It does not need the entry text: nothing is sent.
  const canSit = !!onSit && !arcStarted && !isUnanswered && !!currentFeedback && !regenLoading && !retryLoading && !isCurrentlyLoading && !followUpLoading;

  const isLocal = displayProvenance === PROVENANCE.LOCAL && !!currentFeedback && !isCurrentlyLoading;
  const isRateLimited = isRateLimitCode(fallbackReason);
  // Retrying a rate-limited call cannot succeed until the counter resets, so
  // the affordance is withheld rather than offered and failed.
  const showRetry = !arcStarted && (isLocal || isUnanswered);
  const canRetry = showRetry && !!entryText && !isRateLimited && !retryLoading;

  const { body: replyBody, heading: questionHeading } = splitReply(arc.reply, arc.question);
  // While the answer box is open its heading carries the question; otherwise
  // the reply is shown whole, the question where it was asked.
  const replyText = arc.stage === 'answer' && !turnInFlight ? replyBody : arc.reply;
  const outcomeBadge = arcOutcomeBadge(arc.outcome);
  const sitText = arc.stage === 'sit' ? sitLine(sitState || {}) : null;
  // The reading came back from a sit: said once, above the responses.
  const setAsideText = intentChoices && arc.stage === 'idle' && sitRecord?.count > 0 ? setAsideLine(sitRecord) : null;
  const goingFurther = arc.intent === ARC_INTENT.GO_FURTHER;
  // Pages that pass no onFollowUpStored discard the exchange on close, so
  // they must not claim it stays on the record.
  const leftLine = onFollowUpStored
    ? `${ARC_COPY.leftUnanswered} It stays on the record${returnsToDashboard ? ' and comes back on the dashboard' : ''}.`
    : ARC_COPY.leftUnanswered;
  // The arc's one input box, by stage. The answer box is headed by the
  // question itself when the reply ended on it. Gone while a turn is read.
  const box = turnInFlight
    ? null
    : arc.stage === 'pushback'
    ? {
        label: goingFurther ? 'Go further' : 'Push back',
        question: null,
        rows: 2,
        maxLength: FOLLOW_UP_PUSHBACK_MAX_CHARS,
        placeholder: goingFurther ? 'Point at the thread you want taken deeper...' : 'State your specific pushback...',
        onSubmit: handleTurnOneSubmit,
        secondaryLabel: 'Cancel',
        onSecondary: resetArc,
        secondaryDisabled: false,
      }
    : arc.stage === 'answer'
      ? {
          label: ARC_COPY.answer,
          question: questionHeading,
          rows: 3,
          maxLength: FOLLOW_UP_ANSWER_MAX_CHARS,
          placeholder: 'Answer it...',
          onSubmit: handleAnswerSubmit,
          secondaryLabel: 'Leave it unanswered',
          onSecondary: leaveUnanswered,
          secondaryDisabled: followUpLoading,
        }
      : null;
  const canSubmit = !!draft.trim() && !followUpLoading && !limitReached;

  // a11y: trap keyboard focus inside the modal while open and restore focus on close.
  const trapRef = useFocusTrap(isOpen);

  // a11y: Esc closes the modal — through the same guard as the buttons.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') requestCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <InlineErrorBoundary name="OracleModal">
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Oracle feedback"
      className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
    >
      <div ref={trapRef} className="bg-black rounded-2xl max-w-2xl w-full max-h-[calc(100dvh-2rem)] overflow-hidden shadow-2xl flex flex-col border border-[#1a1a1a]">

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isCurrentlyLoading ? (
            /* ── Loading state ── */
            <div className="flex flex-col items-center justify-center py-16 relative">
              {/* Dismiss button — always visible so user is never trapped on Oracle failure */}
              <button
                onClick={requestClose}
                aria-label="Close Oracle"
                className="absolute top-0 right-0 text-[#858585] hover:text-[#ababab] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              <Ring />
              <div className="text-[#858585] text-xs uppercase tracking-widest">Reading</div>
            </div>
          ) : (
            /* ── Feedback state ── */
            <div className="space-y-6">
              {/* BER-200: Confrontation trigger — user's own pre-committed question */}
              {resolvedCriterion && (
                <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                  <div className="text-[#858585] text-xs uppercase tracking-widest">Confrontation Trigger</div>
                  <div className="text-[#ababab] text-xs">{resolvedCriterion.dataSummary}</div>
                  <div className="border-l-2 border-[#3a3a3a] pl-3">
                    <div className="text-[#858585] text-[10px] uppercase tracking-widest mb-1">Your pre-committed question</div>
                    <div className="text-[#d1d1d1] text-sm leading-relaxed">{resolvedCriterion.criterion.question}</div>
                  </div>
                </div>
              )}

              {/* Oracle label. A local reading is marked here rather than left
                  to look like model output — see isLocal block below. */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${isLocal || isUnanswered ? 'bg-[#5a5a5a]' : 'bg-[#d1d1d1]'}`} />
                  <span className="text-[#858585] text-xs uppercase tracking-widest font-medium">
                    {isUnanswered ? 'Oracle · No reading' : isLocal ? 'Oracle · Local' : 'Oracle'}
                  </span>
                </div>
                <button
                  onClick={requestClose}
                  aria-label="Close Oracle"
                  className="text-[#858585] hover:text-[#ababab] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* BER-225/BER-229: Metacognitive depth — use local state so regen updates it */}
              {displayDepth && (
                <div className="text-[#858585] text-xs uppercase tracking-widest">
                  Depth: {displayDepth}
                </div>
              )}

              {/* Local-reading disclosure. Stated flatly, before the prose, so
                  the user reads it knowing what produced it. No warning colour
                  and no icon — this is a fact about the text, not an error. */}
              {isLocal && (
                <div className="border-l-2 border-[#5a5a5a] pl-3">
                  <p className="text-[#858585] text-xs leading-relaxed">
                    {isRateLimited
                      ? `${LIMIT_LINE} This reading was assembled locally.`
                      : 'The Oracle did not respond. This reading was assembled locally from this entry alone. It does not use your record.'}
                  </p>
                </div>
              )}

              {/* Feedback text */}
              <div className="text-[#e0e0e0] text-[15px] leading-[1.75] font-light">
                {currentFeedback || 'The Oracle awaits your query...'}
              </div>

              {/* He set this reading aside; it is back. */}
              {setAsideText && (
                <p className="text-[#858585] text-xs leading-relaxed">{setAsideText}</p>
              )}

              {/* The exchange, one column: his turns as indented quotes, the
                  Oracle's replies in the reading's own voice. The newest turn
                  scrolls into view. The question is shown once: as the heading
                  of the answer box while it is open, at the end of the reply
                  once the exchange has ended. */}
              {(arc.pushback || arc.reply || turnInFlight) && (
                <div className="space-y-5" aria-live="polite">
                  {(arc.pushback || (sentTurn !== null && arc.stage === 'pushback')) && (
                    <Quote text={arc.pushback || sentTurn} />
                  )}
                  {replyText && (
                    <div ref={!turnInFlight && (arc.stage === 'answer' || arc.stage === 'landed') ? latestTurnRef : null} className={PROSE_CLASS}>
                      {replyText}
                    </div>
                  )}
                  {(arc.answer || (sentTurn !== null && arc.stage === 'answer')) && (
                    <Quote text={arc.answer || sentTurn} />
                  )}
                  {arc.close && (
                    <div ref={arc.stage === 'closed' ? latestTurnRef : null}>
                      <div className={PROSE_CLASS}>{arc.close}</div>
                      {outcomeBadge && (
                        <div className="mt-2 text-[10px] uppercase tracking-widest" style={{ color: outcomeBadge.color }}>
                          {outcomeBadge.label}
                        </div>
                      )}
                    </div>
                  )}
                  {/* The commitment the exchange closed on, lifted out of the
                      prose server-side. The action opens the Ledger prefilled —
                      nothing is created until he signs it. */}
                  {arc.commitment?.text && (
                    <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                      <div className="text-[#858585] text-xs uppercase tracking-widest">{ARC_COPY.commitment}</div>
                      <div className="text-[#e0e0e0] text-sm leading-relaxed">{arc.commitment.text}</div>
                      {onMakeContract && (
                        <button
                          type="button"
                          onClick={() => onMakeContract(arc.commitment)}
                          className="w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#2a2a2a] text-[#ababab] hover:border-[#3a3a3a] hover:text-white transition-all"
                        >
                          Make it a Kill Contract
                        </button>
                      )}
                    </div>
                  )}
                  {arc.stage === 'left' && (
                    <p ref={latestTurnRef} className="text-[#858585] text-xs leading-relaxed">{leftLine}</p>
                  )}
                  {turnInFlight && <ReadingIndicator innerRef={latestTurnRef} />}
                </div>
              )}

              {sitText && (
                <p ref={latestTurnRef} className="text-[#858585] text-xs leading-relaxed" aria-live="polite">{sitText}</p>
              )}

              {/* The arc's input box: his pushback or direction (turn 1) or the answer (turn 2) */}
              {box && (
                <div className="space-y-3">
                  {box.question ? (
                    <div className="text-[#e0e0e0] text-[15px] leading-[1.75] font-light">{box.question}</div>
                  ) : (
                    <div className="text-[#858585] text-xs uppercase tracking-widest">{box.label}</div>
                  )}
                  {/* Pass 2 Finding 14 remediation: maxLength + visible counter
                      so the user sees the cap before the server truncates. */}
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={box.rows}
                    maxLength={box.maxLength}
                    disabled={followUpLoading}
                    className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#5a5a5a] focus:outline-none resize-none text-sm placeholder-[#828282] disabled:opacity-60"
                    placeholder={box.placeholder}
                  />
                  <div className="text-[#858585] text-xs text-right" aria-live="polite">
                    {draft.length} / {box.maxLength}
                  </div>
                  {limitReached && <p className="text-[#858585] text-xs leading-relaxed">{LIMIT_LINE}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={box.onSubmit}
                      disabled={!canSubmit}
                      className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-all bg-[#1a1a1a] border border-[#2a2a2a] text-[#ababab] hover:text-white disabled:opacity-40"
                    >
                      Submit
                    </button>
                    <button
                      onClick={box.onSecondary}
                      disabled={box.secondaryDisabled}
                      className="px-4 py-2.5 text-sm rounded-xl bg-transparent text-[#858585] hover:text-[#ababab] transition-colors disabled:opacity-40"
                    >
                      {box.secondaryLabel}
                    </button>
                  </div>
                </div>
              )}

              {/* The four responses to the reading (Journal). Push back and Go
                  further open the box; It landed is one call; Sit with this is
                  none. Gone once the exchange starts or a turn is in flight. */}
              {intentChoices && !arcStarted && !turnInFlight && !!currentFeedback && !isUnanswered && !isCurrentlyLoading && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setArc({ ...IDLE_ARC, stage: 'pushback', intent: ARC_INTENT.PUSH_BACK })}
                    disabled={!canFollowUp || followUpLoading}
                    className={CHOICE_CLASS}
                  >
                    Push back
                  </button>
                  <button
                    type="button"
                    onClick={() => setArc({ ...IDLE_ARC, stage: 'pushback', intent: ARC_INTENT.GO_FURTHER })}
                    disabled={!canFollowUp || followUpLoading}
                    className={CHOICE_CLASS}
                  >
                    Go further
                  </button>
                  <button
                    type="button"
                    onClick={handleLanded}
                    disabled={!canFollowUp || followUpLoading}
                    className={CHOICE_CLASS}
                  >
                    It landed
                  </button>
                  <button
                    type="button"
                    onClick={handleSit}
                    disabled={!canSit}
                    className={CHOICE_CLASS}
                  >
                    {pendingChoice === 'sit' ? 'Saving...' : 'Sit with this'}
                  </button>
                </div>
              )}

              {/* BER-136: Retry + Regenerate, and Go deeper where the four
                  responses are not offered — only before an exchange starts */}
              {currentFeedback && !arcStarted && !turnInFlight && (canRegen || (canFollowUp && !intentChoices) || showRetry) && (
                <div className="flex gap-2 flex-wrap">
                  {showRetry && (
                    <button
                      onClick={handleRetry}
                      disabled={!canRetry}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#2a2a2a] text-[#ababab] hover:border-[#3a3a3a] hover:text-white transition-all disabled:opacity-40"
                    >
                      {retryLoading ? 'Reaching the Oracle...' : 'Retry the Oracle'}
                    </button>
                  )}
                  {canRegen && (
                    <button
                      onClick={handleRegenerate}
                      disabled={regenLoading}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#1a1a1a] text-[#858585] hover:border-[#2a2a2a] hover:text-[#ababab] transition-all disabled:opacity-40"
                    >
                      {regenLoading ? 'Regenerating...' : `Regenerate · ${MAX_REGEN - regenCount} of ${MAX_REGEN} remaining`}
                    </button>
                  )}
                  {canFollowUp && !intentChoices && (
                    <button
                      onClick={() => setArc({ ...IDLE_ARC, stage: 'pushback', intent: ARC_INTENT.PUSH_BACK })}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#1a1a1a] text-[#858585] hover:border-[#2a2a2a] hover:text-[#ababab] transition-all"
                    >
                      Go deeper
                    </button>
                  )}
                </div>
              )}

              {/* The reaction row — every surface but Journal, where the four
                  responses above replace it. */}
              {!intentChoices && (
                <>
                  {/* Divider */}
                  <div className="border-t border-[#1a1a1a]" />

                  {/* Reactions — about the reading, not the last turn */}
                  {currentFeedback && (
                    <div>
                      <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">How did the reading land?</div>
                      <div className="flex flex-wrap gap-2">
                        {REACTIONS.map((r) => {
                          const isSelected = selectedReaction === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => handleReaction(r.id)}
                              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                                isSelected
                                  ? ''
                                  : 'bg-transparent border border-[#1a1a1a] text-[#858585] hover:border-[#2a2a2a] hover:text-[#ababab]'
                              }`}
                              style={isSelected ? {
                                backgroundColor: `${r.color}12`,
                                borderWidth: 1,
                                borderStyle: 'solid',
                                borderColor: `${r.color}40`,
                                color: r.color,
                              } : undefined}
                            >
                              <span className="text-[10px]">{r.icon}</span>
                              {r.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Close */}
              <button
                onClick={requestClose}
                className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 bg-[#111] border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a]"
              >
                {selectedReaction ? 'Done' : 'Close'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </InlineErrorBoundary>
  );
};

export default OracleModal;
