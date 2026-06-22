import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth as getFirebaseAuth } from 'firebase/auth';
import { getUserProfile } from './userProfile.js';
import { getBehavioralContext } from './getBehavioralContext.js';
import { resolveTriggeredCriterion } from './confrontationCriteria.js';
import { track } from './analytics.js';
import { detectEvasionMarkers } from './detectEvasionMarkers.js';
import { PATTERN_TRUST_MIN_ENTRIES } from './schema.js';
import ouraToast from './toast.js';

const logger = {
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args)
};

const MAX_RECENT_FINGERPRINTS = 8;
const MIN_LENSES = 1;
const MAX_LENSES = 3;
const BANNED_TONE_REGEX = /\b(proud of you|you got this|safe space|healing journey|you deserve|be gentle with yourself|everything happens for a reason)\b/i;

// UXR-002 Spec 5: Oracle evasion-aware tone calibration thresholds.
// detectEvasionMarkers returns an integer `count` in [0,4] — the number of
// distinct marker categories (passiveVoice, externalization, hedging,
// lowSpecificity) present above their internal frequency bars. A single
// marker category is not a pattern; two categories is a credible signal;
// three or more is a strong signal that posture must harden.
// Conservative defaults — calibrate against production Oracle logs after
// 2+ weeks of data (Spec 5 validation deferred until live traffic exists).
const EVASION_THRESHOLD_LOW = 2;
const EVASION_THRESHOLD_HIGH = 3;

// Frame override for high-evasion entries. `stoic_drill_down` is the
// closest in-catalog equivalent of the "challenge" posture referenced by
// the cloud function's posture matching; it anchors the fallback template
// composer to direct confrontation rather than reframing.
export const HIGH_EVASION_FRAME = 'stoic_drill_down';

export const EVASION_THRESHOLDS = Object.freeze({
  low: EVASION_THRESHOLD_LOW,
  high: EVASION_THRESHOLD_HIGH
});

const EVASION_MARKER_LABELS = {
  passiveVoice: 'passive voice (actions without an actor)',
  externalization: 'externalization (circumstances framed as the cause)',
  hedging: 'hedged language (softeners, epistemic retreat)',
  lowSpecificity: 'abstraction without concrete detail'
};

const listActiveMarkers = (markers) => Object.keys(EVASION_MARKER_LABELS)
  .filter((key) => markers[key])
  .map((key) => EVASION_MARKER_LABELS[key]);

export const classifyEvasion = (markers) => {
  if (!markers || typeof markers.count !== 'number') return 'low';
  if (markers.count >= EVASION_THRESHOLD_HIGH) return 'high';
  if (markers.count >= EVASION_THRESHOLD_LOW) return 'moderate';
  return 'low';
};

export const buildEvasionNote = (markers, band) => {
  if (band === 'low') return '';
  const active = listActiveMarkers(markers).slice(0, 3);
  const markerList = active.length > 0 ? active.join('; ') : 'nonspecific avoidance patterning';
  if (band === 'high') {
    return `\n\nEVASION CALIBRATION (high): The entry shows linguistic markers of avoidance — specifically: ${markerList}. Name the evasion pattern directly by citing the user's own language. Do not offer reframes, do not build content, do not soften. Ask one specific question that cannot be answered without the user taking a position on what they actually did.`;
  }
  // moderate
  return `\n\nEVASION CALIBRATION (moderate): Evasion markers present — ${markerList}. Reference them if relevant to your feedback.`;
};

const RESPONSE_FRAMES = [
  'stoic_drill_down',
  'jung_shadow_mirror',
  'sun_tzu_tactical_map',
  'watts_perspective_flip',
  'musashi_training_cut',
  'tao_friction_scan',
  'power_incentive_map'
];

const FRAME_TEMPLATES = {
  stoic_drill_down: {
    opening: 'You are leaking force into what is not yours to control.',
    analysisLead: 'Stoic drill-down:',
    ruleStyle: 'Decision rule'
  },
  jung_shadow_mirror: {
    opening: 'The pattern is not random; it is a shadow contract repeating itself.',
    analysisLead: 'Shadow mirror:',
    ruleStyle: 'Integration rule'
  },
  sun_tzu_tactical_map: {
    opening: 'You are losing on terrain, not on effort.',
    analysisLead: 'Tactical map:',
    ruleStyle: 'Terrain rule'
  },
  watts_perspective_flip: {
    opening: 'You are gripping the story so hard that you become the knot.',
    analysisLead: 'Perspective flip:',
    ruleStyle: 'Grip-release rule'
  },
  musashi_training_cut: {
    opening: 'Your outcome is a direct printout of your daily training standard.',
    analysisLead: 'Training cut:',
    ruleStyle: 'Training rule'
  },
  tao_friction_scan: {
    opening: 'You are forcing in the wrong place and yielding in the wrong place.',
    analysisLead: 'Friction scan:',
    ruleStyle: 'Flow rule'
  },
  power_incentive_map: {
    opening: 'Behavior follows incentives, not declarations.',
    analysisLead: 'Incentive map:',
    ruleStyle: 'Power rule'
  }
};

const THEME_RULES = [
  { theme: 'fear_avoidance', re: /fear|afraid|avoid|stall|delay|hesitat|anxious|panic|freeze/i },
  { theme: 'resentment', re: /resent|bitter|unfair|angry|rage|irritat|frustrat/i },
  { theme: 'identity_drift', re: /not myself|lost|identity|who am i|drift|disconnected/i },
  { theme: 'discipline', re: /disciplin|routine|consisten|habit|system|structure|training/i },
  { theme: 'attachment', re: /cling|attach|need them|need this|can't let go|grip/i },
  { theme: 'ego', re: /ego|image|status|validation|approval|prove myself/i },
  { theme: 'meaning', re: /meaning|purpose|point|empty|hollow|worth/i },
  { theme: 'strategy', re: /strategy|plan|timing|position|move|option|leverage/i },
  { theme: 'relationships', re: /partner|wife|husband|friend|boss|team|family|relationship/i },
  { theme: 'impulse', re: /urge|impulse|compulsion|craving|temptation|binge/i },
  { theme: 'shame', re: /shame|guilt|disgust|embarrass|regret/i },
  { theme: 'relapse_risk', re: /relapse|slip|broke streak|back again|reset/i },
  { theme: 'physical_state', re: /sleep|tired|exhaust|body|sick|energy|fog|hormone/i },
  { theme: 'leadership', re: /lead|team|responsib|command|ownership|example/i },
  { theme: 'boundaries', re: /boundary|said yes|people pleasing|can't say no|overstep/i }
];

const THEME_TO_LENS = {
  fear_avoidance: ['Stoicism', 'Musashi', 'Sun Tzu'],
  resentment: ['Stoicism', 'Jung', 'Krishnamurti/Buddha'],
  identity_drift: ['Nietzsche', 'Jung', 'Alan Watts'],
  discipline: ['Musashi', 'Stoicism', 'Sun Tzu'],
  attachment: ['Krishnamurti/Buddha', 'Taoism', 'Alan Watts'],
  ego: ['Alan Watts', 'Krishnamurti/Buddha', 'Jung'],
  meaning: ['Nietzsche', 'Stoicism', 'Alan Watts'],
  strategy: ['Sun Tzu', 'Machiavelli/Greene', 'Musashi'],
  relationships: ['Jung', 'Machiavelli/Greene', 'Stoicism'],
  impulse: ['Krishnamurti/Buddha', 'Musashi', 'Stoicism'],
  shame: ['Jung', 'Krishnamurti/Buddha', 'Stoicism'],
  relapse_risk: ['Musashi', 'Stoicism', 'Krishnamurti/Buddha'],
  physical_state: ['Musashi', 'Taoism', 'Stoicism'],
  leadership: ['Sun Tzu', 'Machiavelli/Greene', 'Stoicism'],
  boundaries: ['Machiavelli/Greene', 'Stoicism', 'Jung']
};

const LENS_MICRO_NOTES = {
  Stoicism: 'control, duty, perception, endurance',
  Nietzsche: 'self-overcoming, becoming, anti-herd choices',
  'Sun Tzu': 'terrain, timing, deception, positioning',
  Taoism: 'non-forcing, flow, softness as leverage',
  'Alan Watts': 'ego loosening, paradox, perspective shift',
  Musashi: 'discipline, repetition, calm execution',
  'Machiavelli/Greene': 'incentives, reputation, power dynamics',
  'Krishnamurti/Buddha': 'attachment loops, craving, observation',
  Jung: 'shadow, projection, integration'
};

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'for', 'is', 'it', 'that', 'this', 'with', 'on', 'as', 'at', 'be', 'are', 'was', 'were', 'i', 'you']);

const memoryStore = new Map();

const normalizeWhitespace = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const tokenize = (text) => normalizeWhitespace(text)
  .toLowerCase()
  .split(/[^a-z0-9]+/)
  .filter(Boolean)
  .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

const hashString = (value) => {
  const input = String(value || '');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return `fp_${Math.abs(hash)}`;
};

const getUserKey = (userContext = {}) => {
  if (userContext?.userId) return String(userContext.userId);
  return 'local_user';
};

const getStorage = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      return {
        get: (key) => {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        },
        set: (key, value) => localStorage.setItem(key, JSON.stringify(value))
      };
    }
  } catch (error) {
    logger.warn('AI feedback storage unavailable, using memory fallback.', error);
  }

  return {
    get: (key) => memoryStore.get(key) || null,
    set: (key, value) => memoryStore.set(key, value)
  };
};

const getRecentFeedbackFingerprints = (userId) => {
  const storage = getStorage();
  const key = `inner_ops_feedback_fingerprints_${userId}`;
  const stored = storage.get(key);
  if (!Array.isArray(stored)) return [];
  return stored.slice(-MAX_RECENT_FINGERPRINTS);
};

const setRecentFeedbackFingerprints = (userId, records) => {
  const storage = getStorage();
  const key = `inner_ops_feedback_fingerprints_${userId}`;
  storage.set(key, records.slice(-MAX_RECENT_FINGERPRINTS));
};

const jaccardSimilarity = (tokensA = [], tokensB = []) => {
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach((token) => {
    if (setB.has(token)) intersection += 1;
  });

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
};

const normalizeEntryText = (userInput) => {
  if (typeof userInput === 'string') return userInput.trim();
  if (userInput && typeof userInput === 'object') {
    return normalizeWhitespace(
      userInput.entry
      || userInput.content
      || userInput.reflection
      || userInput.text
      || JSON.stringify(userInput)
    );
  }
  return '';
};

const getTouchpoints = (entryText) => {
  const sentences = entryText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 14);

  const ranked = sentences
    .map((sentence) => {
      const score =
        (/\b(i|my|me|you|because|when|after|before|trigger|urge|failed|again|always|never)\b/i.test(sentence) ? 2 : 0)
        + (/\b(work|team|sleep|phone|partner|money|discipline|habit|relapse|fear|anger|shame)\b/i.test(sentence) ? 2 : 0)
        + Math.min(sentence.length / 80, 2);
      return { sentence, score };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  return ranked.map((item) => {
    const words = item.sentence.split(/\s+/).slice(0, 10).join(' ');
    return words.length > 6 ? words : item.sentence;
  });
};

export const extractThemes = (entryText, moduleName = '') => {
  const text = normalizeWhitespace(entryText);
  const lower = text.toLowerCase();
  const module = String(moduleName || '').toLowerCase();

  const matched = THEME_RULES
    .filter((rule) => rule.re.test(lower))
    .map((rule) => rule.theme);

  if (module.includes('relapse')) {
    matched.push('relapse_risk', 'impulse');
  }
  if (module.includes('hard')) {
    matched.push('strategy', 'leadership');
  }
  if (module.includes('kill')) {
    matched.push('discipline', 'strategy');
  }
  if (module.includes('emergency')) {
    matched.push('impulse', 'fear_avoidance');
  }

  const uniq = Array.from(new Set(matched));
  return uniq.length > 0 ? uniq : ['discipline'];
};

export const selectLenses = (themes, userPreferences = {}) => {
  const scores = new Map();

  themes.forEach((theme) => {
    (THEME_TO_LENS[theme] || []).forEach((lens, index) => {
      const current = scores.get(lens) || 0;
      scores.set(lens, current + (3 - index));
    });
  });

  const preferred = userPreferences?.preferredLenses || [];
  preferred.forEach((lens) => {
    const current = scores.get(lens) || 0;
    scores.set(lens, current + 2);
  });

  const sorted = [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([lens]) => lens);

  const limited = sorted.slice(0, MAX_LENSES);
  return limited.length > 0 ? limited : ['Stoicism'];
};

const pickFrame = (lenses, recentFingerprints, noveltyMode) => {
  const recentFrames = recentFingerprints.map((item) => item.frame).filter(Boolean);
  const lensSeed = lenses.join('|');
  const baseIndex = Math.abs(hashString(lensSeed).length + lenses.length) % RESPONSE_FRAMES.length;

  if (!noveltyMode && !recentFrames.includes(RESPONSE_FRAMES[baseIndex])) {
    return RESPONSE_FRAMES[baseIndex];
  }

  const candidate = RESPONSE_FRAMES.find((frame) => !recentFrames.slice(-3).includes(frame));
  return candidate || RESPONSE_FRAMES[(baseIndex + 1) % RESPONSE_FRAMES.length];
};

const buildAntiRepetitionData = ({ userId, moduleName, entryText, themes, lenses }) => {
  const recentFingerprints = getRecentFeedbackFingerprints(userId);
  const entryTokens = tokenize(entryText).slice(0, 80);

  let maxSimilarity = 0;
  recentFingerprints.forEach((fingerprint) => {
    const score = jaccardSimilarity(entryTokens, fingerprint.entryTokens || []);
    maxSimilarity = Math.max(maxSimilarity, score);
  });

  const noveltyMode = maxSimilarity >= 0.45;
  const frame = pickFrame(lenses, recentFingerprints, noveltyMode);
  const fingerprint = hashString(`${moduleName}|${themes.join('|')}|${lenses.join('|')}|${entryText.slice(0, 220)}`);

  return {
    noveltyMode,
    similarity: Number(maxSimilarity.toFixed(2)),
    frame,
    fingerprint,
    recentFingerprints,
    entryTokens
  };
};

// NOTE: cross-module behavioral context is assembled SERVER-SIDE in the Oracle
// Cloud Function (functions/index.js buildBehavioralContextBlock) from the
// `behavioralContext` object forwarded in userPrompt below. The client does not
// author a system prompt — `callLLM` sends structured fields, not prose. The
// former client-side `buildCrossModuleInstruction`/`systemPrompt` were never
// sent and have been removed to prevent drift from the live server prompt.
export const buildPrompt = ({
  moduleName,
  entryText,
  themes,
  lenses,
  antiRepetitionData,
  userContext = {},
  priorFeedbackSummary = '',
  userGoals = [],
  behavioralContext = null,
}) => {
  const userPrompt = {
    moduleName,
    entryText,
    extractedThemes: themes,
    selectedLenses: lenses,
    behavioralContext: behavioralContext || undefined,
    antiRepetition: {
      noveltyMode: antiRepetitionData.noveltyMode,
      similarity: antiRepetitionData.similarity,
      frame: antiRepetitionData.frame,
      instruction: antiRepetitionData.noveltyMode
        ? 'Use a different angle and rhetorical structure than recent feedback. Avoid repeating prior framing.'
        : 'Stay precise and avoid repeated sentence patterns.'
    },
    userContext,
    userGoals,
    priorFeedbackSummary
  };

  return { userPrompt };
};

const ensureSentenceCount = (text, min, max) => {
  const sentences = normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);

  if (sentences.length >= min && sentences.length <= max) return normalizeWhitespace(text);

  if (sentences.length < min) {
    const extras = [
      'You already gave the evidence in your own words.',
      'The pattern is visible; now treat it as an operational problem.',
      'This is solvable if you commit to one measurable change.'
    ];
    while (sentences.length < min) {
      sentences.push(extras[(sentences.length - 1) % extras.length]);
    }
  }

  return sentences.slice(0, max).join(' ');
};

const composeFeedback = ({ moduleName, entryText, themes, lenses, antiRepetitionData, strictMode = false, entryCount = null }) => {
  // BER-194: data-depth calibration — null means unknown (treated as high data)
  const isHighData = entryCount === null || entryCount >= PATTERN_TRUST_MIN_ENTRIES;
  const frame = FRAME_TEMPLATES[antiRepetitionData.frame] || FRAME_TEMPLATES.stoic_drill_down;
  const touchpoints = getTouchpoints(entryText);
  const words = tokenize(entryText).length;

  const touchA = touchpoints[0] || entryText.slice(0, 80);
  const touchB = touchpoints[1] || touchpoints[0] || entryText.slice(-80);

  const summaryBase = [
    `You said "${touchA}" and also "${touchB}".`,
    `You are naming a real conflict, not a vague mood, and it shows in your language.`,
    `${frame.opening}`,
    `The pressure point sits in the moment right before your repeated choice.`
  ];

  if (touchpoints[2]) {
    summaryBase.push(`You also flagged "${touchpoints[2]}", which confirms the loop is consistent.`);
  }

  const summary_mirror = ensureSentenceCount(summaryBase.join(' '), 3, 6);

  // BER-194: low data — discrepancy-pointing, not pattern assertion
  const core_pattern = isHighData
    ? `Main loop: trigger pressure -> fast rationalization -> short-term relief -> identity tax. Theme focus: ${themes.slice(0, 3).join(', ')}.`
    : `Discrepancy flagged: ${themes.slice(0, 3).join(', ')}. Insufficient data to confirm repeating loop — single-instance observation only.`;

  const analysisParts = [
    `${frame.analysisLead} In ${moduleName}, your current approach rewards urgency and punishes clarity.`,
    `You frame it as circumstance, but the text shows a repeatable mechanism around "${touchA}".`,
    `Lens fit: ${lenses.map((lens) => `${lens} (${LENS_MICRO_NOTES[lens] || 'contextual depth'})`).join('; ')}.`,
    `Use these lenses to separate signal from story: what happened, what you told yourself, and what you did next.`,
    strictMode ? 'No abstraction: convert this into one measurable behavior shift today.' : 'Your leverage is not motivation; it is environment, timing, and rule design.'
  ];

  if (antiRepetitionData.noveltyMode) {
    analysisParts.push('Novelty override active: this angle intentionally avoids your recent framing pattern.');
  }

  if (words < 120) {
    analysisParts.push(`Because the entry is short, depth is built by pressure-testing your own phrases: "${touchA}" and "${touchB}".`);
  }

  const analysis = analysisParts.join(' ');

  const ruleLabel = frame.ruleStyle;
  const prescriptions = [
    `Within 24 hours, run a 10-minute debrief: trigger -> thought -> action -> cost, using your line "${touchA}" as the anchor.`,
    `Cut one friction point before your high-risk window (phone access, location, tab, or contact).`,
    `${ruleLabel}: if the old loop starts, execute a two-step interrupt (move body for 90 seconds, then write one sentence of intent).`,
    `Pick one external accountability checkpoint and set it now with timestamp.`
  ];

  if (themes.includes('relapse_risk') || moduleName.toLowerCase().includes('relapse')) {
    prescriptions.push('Relapse guard: no decision while activated; defer 20 minutes and run the interrupt protocol first.');
  }

  const journal_prompts = [
    `Which exact sentence in your entry sounds true but is actually a rationalization?`,
    `What did you protect in the short term, and what did it cost your long-term identity?`,
    `What is the smallest rule that would have changed yesterday's outcome?`
  ];

  // BER-194: low data — no pattern claims in closing
  const closing_charge = isHighData
    ? `You already exposed the pattern. Now close the gap between analysis and execution today. What rule are you enforcing before midnight?`
    : `You named something real. What does the data say versus what you told yourself? One decision rule before midnight.`;

  return {
    summary_mirror,
    core_pattern,
    chosen_lenses: lenses.slice(0, MAX_LENSES),
    analysis,
    prescriptions: prescriptions.slice(0, 7),
    journal_prompts: journal_prompts.slice(0, 5),
    closing_charge
  };
};

const parseLLMJsonSafely = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_error) {
      return null;
    }
  }

  return null;
};

export const callLLM = async (promptBundle, generationContext) => {
  const { userPrompt } = promptBundle;

  try {
    // Call real Claude API via secure Firebase Cloud Function proxy
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

    // Map the first selected lens to a tone string the Cloud Function understands
    const toneMap = {
      'Stoicism': 'stoic',
      'Jung': 'jungian',
      'Sun Tzu': 'sun-tzu',
      'Taoism': 'taoist',
      'Musashi': 'musashi',
      'Alan Watts': 'watts',
    };
    const tone = toneMap[userPrompt.selectedLenses?.[0]] || 'stoic';

    // Finding 11 remediation: profile is injected by the caller. `null` when
    // the caller omitted it or the profile fetch failed — we still proceed.
    const profile = generationContext?.userProfile ?? null;
    const userContext = {
      ...(userPrompt.userContext || {}),
      ...(profile?.primaryDriver && { primaryDriver: profile.primaryDriver }),
      ...(profile?.feedbackStyle && { feedbackStyle: profile.feedbackStyle }),
      ...(profile?.focusStatement && { focusStatement: profile.focusStatement }),
      // Personal context (added with onboarding/engagement layer). Forwarded
      // only when populated — Oracle Cloud Function renders these into the
      // system prompt so feedback can reference the user's actual situation.
      ...(Array.isArray(profile?.activeSituations) && profile.activeSituations.length
        && { activeSituations: profile.activeSituations }),
      ...(Array.isArray(profile?.knownTriggers) && profile.knownTriggers.length
        && { knownTriggers: profile.knownTriggers }),
      ...(typeof profile?.operatingContext === 'string' && profile.operatingContext.trim()
        && { operatingContext: profile.operatingContext.trim() }),
    };

    // BER-200: Oracle Reactance Architecture — request the server-side
    // reactance template with the user's own pre-committed question.
    // Finding 3 remediation: client no longer ships raw system prompt text.
    const triggeredCriterion = generationContext?.triggeredCriterion ?? null;
    const reactanceParams = triggeredCriterion
      ? {
          dataSummary: triggeredCriterion.dataSummary,
          question: triggeredCriterion.criterion?.question,
        }
      : null;

    // Server-side prompt-context template. An explicit promptContextKey from the
    // caller (e.g. 'relapse_forecast') takes precedence; reactance is the
    // implicit fallback when a confrontation criterion is triggered.
    const promptContext = generationContext?.promptContextKey
      ? { key: generationContext.promptContextKey, params: generationContext.promptContextParams || {} }
      : (reactanceParams ? { key: 'reactance', params: reactanceParams } : null);

    const result = await oracleFn({
      entryText: userPrompt.entryText,
      moduleName: userPrompt.moduleName,
      userContext,
      tone,
      ...(userPrompt.behavioralContext ? { behavioralContext: userPrompt.behavioralContext } : {}),
      // BER-167: pass behavioral record density for Oracle trust calibration
      entryCount: typeof userPrompt.behavioralContext?.totalEntryCount === 'number'
        ? userPrompt.behavioralContext.totalEntryCount
        : 0,
      // Server-side template: promptContextKey + params (reactance / forecast / …)
      ...(promptContext
        ? { promptContextKey: promptContext.key, promptContextParams: promptContext.params }
        : {}),
    });

    const { feedback, metacognitiveDepth = null, closingQuestion = null } = result.data;

    track('oracle_called', { module: userPrompt.moduleName, tone });

    // Claude returned real prose — skip the template formatter entirely
    return { _rawClaudeResponse: true, rawText: feedback || '', metacognitiveDepth, closingQuestion };
  } catch (error) {
    // Cloud Function unavailable (not yet deployed, network issue, rate limit) —
    // fall back to the local template system so the app stays functional.
    // Surface a distinct toast for the two failure modes that users care
    // about: rate-limit (Oracle is temporarily off) vs timeout/network
    // (Oracle is slow or unreachable). Generic errors fall back silently
    // to the templated response since a toast on every transient failure
    // would be noisy.
    const code = error?.code || '';
    if (code === 'resource-exhausted' || code === 'functions/resource-exhausted') {
      try { ouraToast.warning('Oracle daily limit reached — using local response.'); } catch { /* ignore */ }
    } else if (code === 'deadline-exceeded' || code === 'functions/deadline-exceeded') {
      try { ouraToast.warning('Oracle is slow — using local response.'); } catch { /* ignore */ }
    }
    logger.warn('Oracle Cloud Function unavailable, using local fallback:', error.message);

    const draft = composeFeedback({
      moduleName: userPrompt.moduleName,
      entryText: userPrompt.entryText,
      themes: userPrompt.extractedThemes,
      lenses: userPrompt.selectedLenses,
      antiRepetitionData: userPrompt.antiRepetition,
      strictMode: generationContext?.strictRetry || false,
      // BER-194: pass entry count for data-depth calibration in fallback path
      entryCount: typeof userPrompt.behavioralContext?.totalEntryCount === 'number'
        ? userPrompt.behavioralContext.totalEntryCount
        : null,
    });

    return parseLLMJsonSafely(draft);
  }
};

const countTouchpointReferences = (feedback, touchpoints) => {
  const combined = `${feedback.summary_mirror || ''} ${feedback.analysis || ''}`.toLowerCase();
  return touchpoints.reduce((count, point) => {
    const normalized = normalizeWhitespace(point).toLowerCase();
    if (!normalized) return count;
    return combined.includes(normalized) ? count + 1 : count;
  }, 0);
};

const buildFallbackFeedback = (moduleName, entryText) => {
  const touchpoints = getTouchpoints(entryText);
  const anchor = touchpoints[0] || 'your last line';

  return {
    summary_mirror: `You flagged "${anchor}" and that already gives enough signal to act. Right now the key issue is clarity under pressure, not motivation.`,
    core_pattern: 'Pattern uncertain due to generation failure: likely trigger -> reaction -> regret loop.',
    chosen_lenses: ['Stoicism'],
    analysis: `Generation failed cleanly, so here is the direct fallback: focus on one controllable variable today and remove one trigger before it hits. Keep the next move concrete and time-bound.`,
    prescriptions: [
      'Take one action in the next 30 minutes that reduces tomorrow\'s friction.',
      'Write one decision rule and keep it visible for 24 hours.',
      'Ping one accountability contact with your exact plan.'
    ],
    journal_prompts: [
      'What fact is missing from your entry that would change the decision?',
      'Which trigger is predictable enough to pre-empt today?'
    ],
    closing_charge: `No drift. Pick one action now, then answer this: what are you avoiding by delaying?`
  };
};

const hasBannedTone = (feedback) => {
  const combined = `${feedback.summary_mirror || ''} ${feedback.analysis || ''} ${feedback.closing_charge || ''}`;
  return BANNED_TONE_REGEX.test(combined);
};

const stripBannedTone = (text) => normalizeWhitespace(text)
  .replace(/\b(you got this|proud of you|you deserve)\b/gi, 'stay specific')
  .replace(/\b(healing journey|safe space)\b/gi, 'process');

const getFeedbackWordCount = (feedback) => {
  const body = [
    feedback.summary_mirror,
    feedback.core_pattern,
    feedback.analysis,
    ...(feedback.prescriptions || []),
    ...(feedback.journal_prompts || []),
    feedback.closing_charge
  ].join(' ');

  return tokenize(body).length;
};

export const validateAndFix = async (response, checks) => {
  const fixed = {
    summary_mirror: normalizeWhitespace(response?.summary_mirror || ''),
    core_pattern: normalizeWhitespace(response?.core_pattern || ''),
    chosen_lenses: Array.isArray(response?.chosen_lenses) ? response.chosen_lenses.filter(Boolean).slice(0, MAX_LENSES) : [],
    analysis: normalizeWhitespace(response?.analysis || ''),
    prescriptions: Array.isArray(response?.prescriptions) ? response.prescriptions.filter(Boolean).slice(0, 7) : [],
    journal_prompts: Array.isArray(response?.journal_prompts) ? response.journal_prompts.filter(Boolean).slice(0, 5) : [],
    closing_charge: normalizeWhitespace(response?.closing_charge || '')
  };

  if (fixed.chosen_lenses.length < MIN_LENSES) {
    fixed.chosen_lenses = checks.lenses.slice(0, MAX_LENSES);
  }

  if (fixed.prescriptions.length < 3) {
    fixed.prescriptions = [
      ...fixed.prescriptions,
      'Define one if/then decision rule for your highest-risk moment today.',
      'Remove one trigger from your environment before your vulnerable window.',
      'Set a timestamped check-in to confirm execution.'
    ].slice(0, 7);
  }

  if (fixed.journal_prompts.length < 2) {
    fixed.journal_prompts = [
      ...fixed.journal_prompts,
      'What exactly are you pretending not to know?',
      'Which single rule would have prevented the last repeat?'
    ].slice(0, 5);
  }

  if (!fixed.summary_mirror) {
    fixed.summary_mirror = `You wrote "${checks.touchpoints[0] || checks.entryText.slice(0, 90)}" and that gives a direct entry point.`;
  }

  if (!fixed.analysis) {
    fixed.analysis = `Your entry shows a repeatable loop around "${checks.touchpoints[0] || 'your described trigger'}". Treat it as a system problem and adjust the environment before the urge window.`;
  }

  if (!fixed.core_pattern) {
    fixed.core_pattern = `Main loop: trigger -> reaction -> cost. Active themes: ${checks.themes.slice(0, 3).join(', ')}.`;
  }

  const touchpointHits = countTouchpointReferences(fixed, checks.touchpoints.slice(0, 3));
  if (touchpointHits < 2) {
    fixed.analysis = `${fixed.analysis} Entry anchors: "${checks.touchpoints[0] || checks.entryText.slice(0, 80)}" and "${checks.touchpoints[1] || checks.touchpoints[0] || checks.entryText.slice(-80)}".`;
  }

  const hasRuleOrQuestion = /(\?|\bif\b.*\bthen\b|decision rule|rule:)/i.test(`${fixed.closing_charge} ${fixed.prescriptions.join(' ')}`);
  if (!hasRuleOrQuestion) {
    fixed.closing_charge = `${fixed.closing_charge} Rule: if the loop starts, pause 90 seconds, move, then choose deliberately.`;
  }

  if (hasBannedTone(fixed)) {
    fixed.summary_mirror = stripBannedTone(fixed.summary_mirror);
    fixed.analysis = stripBannedTone(fixed.analysis);
    fixed.closing_charge = stripBannedTone(fixed.closing_charge);
  }

  const entryWordCount = tokenize(checks.entryText).length;
  const feedbackWordCount = getFeedbackWordCount(fixed);
  if (entryWordCount <= 120 && feedbackWordCount < entryWordCount) {
    fixed.analysis = `${fixed.analysis} Depth add: map one decision window today from trigger to action, then prove the new rule with one concrete execution.`;
  }

  fixed.summary_mirror = ensureSentenceCount(fixed.summary_mirror, 3, 6);
  fixed.closing_charge = ensureSentenceCount(fixed.closing_charge, 1, 3);

  return fixed;
};

const formatFeedbackAsText = (feedback) => {
  return [
    `Mirror\n${feedback.summary_mirror}`,
    `\nCore Pattern\n${feedback.core_pattern}`,
    `\nChosen Lenses\n${feedback.chosen_lenses.join(', ')}`,
    `\nAnalysis\n${feedback.analysis}`,
    `\nPrescriptions\n${feedback.prescriptions.map((item) => `- ${item}`).join('\n')}`,
    `\nJournal Prompts\n${feedback.journal_prompts.map((item) => `- ${item}`).join('\n')}`,
    `\nClosing Charge\n${feedback.closing_charge}`
  ].join('\n');
};

export const generateFeedback = async ({
  moduleName,
  entryText,
  userContext = {},
  priorFeedbackSummary = '',
  userGoals = [],
  userPreferences = {},
  behavioralContext = null,
  triggeredCriterion = null,
  promptContextKey = null,
  promptContextParams = null,
}) => {
  const cleanEntry = normalizeWhitespace(entryText);
  const safeModuleName = normalizeWhitespace(moduleName || 'journal') || 'journal';

  if (!cleanEntry) {
    return buildFallbackFeedback(safeModuleName, 'No entry provided.');
  }

  // Finding 11 remediation: profile fetch lifted out of callLLM so the data
  // layer is the caller's responsibility. `null` on failure — callLLM tolerates.
  const userProfile = await getUserProfile().catch(() => null);

  const userId = getUserKey(userContext);
  const themes = extractThemes(cleanEntry, safeModuleName);
  const lenses = selectLenses(themes, userPreferences).slice(0, MAX_LENSES);
  const antiRepetitionData = buildAntiRepetitionData({
    userId,
    moduleName: safeModuleName,
    entryText: cleanEntry,
    themes,
    lenses
  });

  // UXR-002 Spec 5: evasion-aware tone calibration.
  // Runs for every module (Journal, Kill List, Hard Lessons, Relapse Radar,
  // Emergency) so confrontation precision scales with avoidance
  // density regardless of entry surface. detectEvasionMarkers short-circuits
  // entries under 20 chars internally, so this is safe for brief inputs.
  const evasionMarkers = detectEvasionMarkers(cleanEntry);
  const evasionBand = classifyEvasion(evasionMarkers);

  // High-evasion entries harden the fallback frame to the closest in-catalog
  // "challenge" posture. Moderate/low keep the frame chosen by pickFrame.
  if (evasionBand === 'high') {
    antiRepetitionData.frame = HIGH_EVASION_FRAME;
  }

  // Server-side only logging for threshold tuning. Never surfaced to the UI.
  if (evasionBand !== 'low') {
    logger.info('[aiFeedback] evasion', {
      module: safeModuleName,
      band: evasionBand,
      count: evasionMarkers.count,
      markers: listActiveMarkers(evasionMarkers)
    });
  }

  const promptBundle = buildPrompt({
    moduleName: safeModuleName,
    entryText: cleanEntry,
    themes,
    lenses,
    antiRepetitionData,
    userContext,
    priorFeedbackSummary,
    userGoals,
    behavioralContext,
  });

  try {
    const llmResponse = await callLLM(promptBundle, {
      moduleName: safeModuleName,
      entryText: cleanEntry,
      themes,
      lenses,
      antiRepetitionData,
      strictRetry: true,
      // BER-200: pass resolved criterion so callLLM can augment system prompt
      triggeredCriterion,
      // Explicit server-side prompt-context template (e.g. relapse_forecast)
      promptContextKey,
      promptContextParams,
      // Finding 11: profile is supplied by the caller so callLLM stays pure
      userProfile,
    });

    // Real Claude prose — skip validation/formatting entirely
    if (llmResponse._rawClaudeResponse) return llmResponse;

    const checked = await validateAndFix(llmResponse, {
      entryText: cleanEntry,
      themes,
      lenses,
      touchpoints: getTouchpoints(cleanEntry)
    });

    const recentFingerprints = antiRepetitionData.recentFingerprints || [];
    const updated = [
      ...recentFingerprints,
      {
        fingerprint: antiRepetitionData.fingerprint,
        frame: antiRepetitionData.frame,
        moduleName: safeModuleName,
        lenses: checked.chosen_lenses,
        createdAt: new Date().toISOString(),
        entryTokens: antiRepetitionData.entryTokens
      }
    ];

    setRecentFeedbackFingerprints(userId, updated);
    return checked;
  } catch (error) {
    logger.error('generateFeedback failed:', error);
    return buildFallbackFeedback(safeModuleName, cleanEntry);
  }
};

/**
 * Build the combined `content` string from the Journal's structured fields.
 * Used both when Journal calls with `{ event, attribution, expansion }` and
 * when downstream consumers read the saved entry's `content` field.
 */
export const composeJournalContent = ({ event = '', attribution = '', expansion = '' } = {}) => {
  const parts = [];
  if (event && event.trim()) parts.push(`[EVENT]\n${event.trim()}`);
  if (attribution && attribution.trim()) parts.push(`[ATTRIBUTION]\n${attribution.trim()}`);
  if (expansion && expansion.trim()) parts.push(expansion.trim());
  return parts.join('\n\n');
};

/**
 * generateAIFeedback supports two call shapes for backward compatibility:
 *
 *   Legacy: (moduleName: string, userInput: string, pastEntries?: any[], behavioralContext?: object)
 *   Structured: ({ moduleName, event, attribution, expansion, pastEntries?, behavioralContext? })
 *
 * The structured form is used by the retired-mood Journal entry flow
 * (Spec 3, UXR-002). Other modules (Kill List, Hard Lessons, Relapse Radar,
 * Emergency, OracleModal) continue to pass the legacy string form.
 */
export const generateAIFeedback = async (moduleNameOrArgs, userInput, pastEntries = [], behavioralContext = null) => {
  let moduleName;
  let resolvedInput;
  let resolvedPast = pastEntries;
  let resolvedContext = behavioralContext;
  let resolvedPromptContextKey = null;
  let resolvedPromptContextParams = null;

  if (moduleNameOrArgs && typeof moduleNameOrArgs === 'object' && !Array.isArray(moduleNameOrArgs)) {
    // Structured form — destructured object.
    const {
      moduleName: mod,
      event = '',
      attribution = '',
      expansion = '',
      content = '',
      pastEntries: pEntries = [],
      behavioralContext: bCtx = null,
      promptContextKey = null,
      promptContextParams = null,
    } = moduleNameOrArgs;
    moduleName = mod;
    // Prefer structured journal fields when provided; fall back to `content`
    // (mirrors downstream shape — see composeJournalContent).
    resolvedInput = (event || attribution || expansion)
      ? composeJournalContent({ event, attribution, expansion })
      : content;
    resolvedPast = pEntries;
    resolvedContext = bCtx;
    resolvedPromptContextKey = promptContextKey;
    resolvedPromptContextParams = promptContextParams;
  } else {
    // Legacy positional form — preserved exactly for non-Journal callers.
    moduleName = moduleNameOrArgs;
    resolvedInput = userInput;
  }

  try {
    const entryText = normalizeEntryText(resolvedInput);
    const priorFeedbackSummary = Array.isArray(resolvedPast)
      ? resolvedPast
          .slice(-3)
          .map((entry) => normalizeEntryText(entry))
          .filter(Boolean)
          .join(' | ')
      : '';

    // Auto-fetch behavioral context when not explicitly provided by caller.
    let uid = null;
    try {
      const auth = getFirebaseAuth();
      uid = auth.currentUser?.uid || null;
    } catch { /* no-op */ }

    if (!resolvedContext && uid) {
      try {
        resolvedContext = await getBehavioralContext(uid);
      } catch {
        resolvedContext = null;
      }
    }

    // BER-200: check user-defined confrontation criteria before generating Oracle output
    let triggeredCriterion = null;
    try {
      triggeredCriterion = await resolveTriggeredCriterion(uid);
    } catch { /* silently fail — do not block Oracle generation */ }

    const feedback = await generateFeedback({
      moduleName,
      entryText,
      priorFeedbackSummary,
      behavioralContext: resolvedContext,
      triggeredCriterion,
      promptContextKey: resolvedPromptContextKey,
      promptContextParams: resolvedPromptContextParams,
    });

    // Real Claude response — return structured object with prose, optional depth, and the
    // server-extracted closing question (or null when the model omitted tags and the heuristic
    // server-side fallback also failed).
    if (feedback._rawClaudeResponse) {
      return {
        text: feedback.rawText,
        metacognitiveDepth: feedback.metacognitiveDepth || null,
        closingQuestion: feedback.closingQuestion || null,
      };
    }

    return { text: formatFeedbackAsText(feedback), metacognitiveDepth: null, closingQuestion: null };
  } catch (error) {
    logger.error('Error generating AI feedback:', error);
    const fallback = buildFallbackFeedback(moduleName, normalizeEntryText(resolvedInput));
    return { text: formatFeedbackAsText(fallback), metacognitiveDepth: null, closingQuestion: null };
  }
};
