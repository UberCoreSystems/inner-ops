import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { writeData, readUserData, updateData } from '../utils/firebaseUtils';
import { updateMemory } from '../utils/updateMemory';
import { archiveEntry, restoreEntry, deleteArchivedEntry, subscribeToArchive } from '../utils/archiveUtils';
import { redirectIfAuthLost } from '../utils/authErrorHandler';
import { generateAIFeedback } from '../utils/aiFeedback';
import { extractHardLessonDirect } from '../utils/crossModuleExtraction';
import { clearBehavioralContextCache } from '../utils/getBehavioralContext';
import ArchiveToggle from '../components/ArchiveToggle';
import { AppIcon } from '../components/AppIcons';
import ModuleIntro from '../components/help/ModuleIntro';
import { getModuleIntro } from '../config/moduleIntros';
import LessonForm, { ORACLE_MIN_CHARS, fieldId } from '../components/hardLessons/LessonForm';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { track } from '../utils/analytics';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { SkeletonList, SkeletonCard } from '../components/SkeletonLoader';
import { isUnderReview, getHeldStreakDays, getMostRecentBreak } from '../utils/ruleState';
import { toMs, localDateKey } from '../utils/dateUtils';
import {
  EVENT_CATEGORIES,
  COST_CATEGORIES,
  categoryLabel,
  costLabel,
  emptyDraft,
  canSaveDraft,
  missingForFinalize,
  lessonFromPrefill,
  draftFromLesson,
  applyEdit,
  takeSuggestion,
  mergeExtraction,
  buildLessonPayload,
  draftsEqual,
  lessonSource,
  findMatchingRule,
  findLinkedRule,
  linkLessonBreak,
  closeLessonBreak,
  readLocalDraft,
  writeLocalDraft,
  clearLocalDraft,
} from '../utils/lessonDraft';

const PREFILL_KEY = 'hl_bridge_prefill';

const currentUid = () => {
  try { return getAuth().currentUser?.uid || null; } catch { return null; }
};

const peekPrefill = () => {
  try {
    const raw = sessionStorage.getItem(PREFILL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const dropPrefill = () => {
  try { sessionStorage.removeItem(PREFILL_KEY); } catch { /* noop */ }
};

const stubLabel = (lesson) => (lesson.isWeeklyAutopsy ? 'Sunday autopsy' : lesson.isScarStub ? 'Scar' : null);

// BER-131: after a lesson that broke a rule is locked, offer to carry the rule
// to the General Ledger. No doc is written here — the prefill is stashed and
// the user reviews the contract on the Ledger page.
function LedgerBridgePrompt({ prompt, onChange, onAdd, onDismiss }) {
  const trapRef = useFocusTrap(true);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);
  const days = parseInt(prompt.consecutiveDaysRequired, 10);
  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="hl-bridge-title" tabIndex={-1} className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl max-w-lg w-full p-8">
        <h3 id="hl-bridge-title" className="text-white text-lg font-light mb-2">Rule violated. Add it to the Ledger?</h3>
        <p className="text-[#858585] text-xs uppercase tracking-widest mb-5">A rule in writing that doesn't produce behavioral warfare is decoration.</p>
        <label htmlFor="hl-bridge-rule" className="sr-only">Rule</label>
        <input
          id="hl-bridge-rule"
          type="text"
          value={prompt.ruleText}
          onChange={(e) => onChange({ ruleText: e.target.value })}
          className="w-full p-4 bg-[#0f0f0f] text-white rounded-xl border border-[#2a2a2a] focus:border-[#f59e0b] focus:outline-none transition-colors text-sm mb-4"
        />
        <div className="mb-6">
          <label htmlFor="hl-bridge-days" className="block text-[#ababab] text-xs uppercase tracking-widest mb-2">Consecutive Days Required</label>
          <input
            id="hl-bridge-days"
            type="number"
            min={21}
            step={1}
            value={prompt.consecutiveDaysRequired}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onChange({ consecutiveDaysRequired: e.target.value === '' || !Number.isFinite(n) ? '' : n });
            }}
            onBlur={() => { if (!Number.isFinite(days) || days < 21) onChange({ consecutiveDaysRequired: 21 }); }}
            className="w-full p-3 bg-[#0f0f0f] text-white rounded-xl border border-[#2a2a2a] focus:border-[#f59e0b] focus:outline-none transition-colors text-sm tabular-nums"
          />
          <p className="text-[#858585] text-xs mt-2">
            Kill requires {Number.isFinite(days) ? Math.max(21, days) : 21} consecutive days of held execution. Minimum 21.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onAdd} className="flex-1 px-5 min-h-11 bg-[#f59e0b] hover:bg-[#ea580c] text-black rounded-xl font-medium transition-colors">Add to Ledger</button>
          <button onClick={onDismiss} className="px-5 min-h-11 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#ababab] hover:text-white rounded-xl font-medium transition-colors">Dismiss</button>
        </div>
      </div>
    </div>
  );
}

export default function HardLessons() {
  const navigate = useNavigate();
  const location = useLocation();

  // Deep-link from the Dashboard's Recent Activity: scroll to a lesson's card
  // and flash a highlight ring. The id rides in router state; capture it into
  // pendingFocusId and clear the state so a refresh does not re-fire.
  const [pendingFocusId, setPendingFocusId] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const arrivedByDeepLink = useRef(false);

  useEffect(() => {
    track('hl_viewed');
    const focusId = location.state?.focusLessonId;
    if (!focusId) return;
    arrivedByDeepLink.current = true;
    setPendingFocusId(focusId);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The open draft lives here, not in the form: Collapse and the Rules Library
  // toggle hide the form, and the text must survive both.
  const [draft, setDraft] = useState(emptyDraft);
  const [baseline, setBaseline] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oracle, setOracle] = useState({ pending: false, message: null });
  const [ruleMatch, setRuleMatch] = useState(null);
  // An unsaved draft that something else wants to replace (an arriving prefill,
  // or Edit on another lesson). Nothing is written until the user picks.
  const [conflict, setConflict] = useState(null);
  // Bumped whenever a different draft is loaded, so the form's own UI state
  // (missing markers, review sheet) starts clean — but not when the same draft
  // merely gains an id.
  const [formKey, setFormKey] = useState(0);
  const submittingRef = useRef(false);
  const autosaveReady = useRef(false);
  const dismissedMatches = useRef(new Set());

  // Module state
  const [lessons, setLessons] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [view, setView] = useState('active');
  const [archivedLessons, setArchivedLessons] = useState([]);

  const [bridgePrompt, setBridgePrompt] = useState({ visible: false, ruleText: '', consecutiveDaysRequired: 30, lessonId: null });

  // BER-130: Rules Library
  const [showRulesLibrary, setShowRulesLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilterCost, setLibraryFilterCost] = useState('');
  const [libraryFilterCategory, setLibraryFilterCategory] = useState('');
  const [costPatternNarrative, setCostPatternNarrative] = useState('');
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const [breakConfirmId, setBreakConfirmId] = useState(null);

  // Once the deep-linked lesson is loaded and rendered, scroll to its card and
  // flash the ring for ~1.8s.
  useEffect(() => {
    if (!pendingFocusId) return;
    if (!lessons.some(l => l.id === pendingFocusId)) return;
    const id = pendingFocusId;
    const raf = requestAnimationFrame(() => {
      document.getElementById(`lesson-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setHighlightId(id);
    setPendingFocusId(null);
    const timer = setTimeout(() => setHighlightId(null), 1800);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [pendingFocusId, lessons]);

  useEffect(() => {
    let unsub = null;
    let mounted = true;
    subscribeToArchive('hardLessons', (data) => {
      if (mounted) setArchivedLessons(data);
    }).then(u => {
      if (mounted) unsub = u;
      else try { u(); } catch {}
    });
    return () => { mounted = false; if (unsub) try { unsub(); } catch {} };
  }, []);

  const loadHardLessons = useCallback(async () => {
    setLoadError(false);
    try {
      const savedLessons = await readUserData('hardLessons');
      const deduped = Array.from(new Map((savedLessons || []).map(l => [l.id, l])).values());
      setLessons(deduped);
      return deduped;
    } catch (error) {
      logger.error('Error loading hard lessons:', error);
      setLoadError(true);
      return null;
    } finally {
      setInitialLoading(false);
    }
  }, []);

  // Delay showing skeleton to prevent flicker
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (initialLoading) setShowSkeleton(true);
    }, 250);
    return () => clearTimeout(skeletonTimer);
  }, [initialLoading]);

  // Keep skeleton visible briefly once data arrives to avoid blink
  useEffect(() => {
    let dwellTimer;
    if (!initialLoading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [initialLoading, showSkeleton]);

  const clearOracleContext = () => clearBehavioralContextCache(currentUid());

  // ── Rule match ───────────────────────────────────────────────────────────
  // Runs when a draft arrives, when the Oracle is asked and when the review
  // sheet opens — never on a field blur or on Save draft.
  const runRuleMatch = useCallback((d, lessonId, list) => {
    const linked = findLinkedRule(list, lessonId);
    if (linked) { setRuleMatch({ rule: linked, answer: 'broke', linking: false }); return; }
    const text = (d?.eventDescription || '').trim();
    if (text.length < ORACLE_MIN_CHARS || dismissedMatches.current.has(text)) { setRuleMatch(null); return; }
    const rule = findMatchingRule(text, list, { beforeMs: Date.now(), excludeId: lessonId });
    setRuleMatch(rule ? { rule, answer: null, linking: false } : null);
  }, []);

  const openDraft = useCallback((d, { id = null, base = emptyDraft(), list, open = true }) => {
    setDraft(d);
    setBaseline(base);
    setEditingId(id);
    setFormKey(k => k + 1);
    setOracle({ pending: false, message: null });
    runRuleMatch(d, id, list);
    if (open) {
      setShowForm(true);
      setShowRulesLibrary(false);
      requestAnimationFrame(() => document.getElementById('hl-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }, [runRuleMatch]);

  const consumePrefill = useCallback((list) => {
    const prefill = peekPrefill();
    dropPrefill();
    if (!prefill) return false;
    openDraft(lessonFromPrefill(prefill), { list });
    return true;
  }, [openDraft]);

  // Mount order: a bridge prefill (Signal, Journal, Ledger) and an unsaved
  // local draft can both be waiting. The local draft is never overwritten or
  // written to Firestore without a tap.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadHardLessons();
      if (cancelled) return;
      const known = list || [];
      const local = readLocalDraft(currentUid());
      const localLive = local && canSaveDraft(local.draft);
      const prefill = peekPrefill();
      if (localLive && prefill) {
        setConflict({ draft: local.draft, editingId: local.editingId, next: { type: 'prefill' } });
      } else if (localLive) {
        const target = known.find(l => l.id === local.editingId && !l.isFinalized);
        openDraft(local.draft, {
          id: target ? target.id : null,
          base: target ? draftFromLesson(target) : emptyDraft(),
          list: known,
          open: !arrivedByDeepLink.current,
        });
      } else if (prefill) {
        consumePrefill(known);
      }
      autosaveReady.current = true;
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = canSaveDraft(draft) && !draftsEqual(draft, baseline);

  // Keep the unsaved form on this device so leaving the page loses nothing.
  useEffect(() => {
    if (!autosaveReady.current || conflict) return;
    const uid = currentUid();
    const timer = setTimeout(() => {
      if (dirty) writeLocalDraft(uid, { draft, editingId });
      else clearLocalDraft(uid);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, editingId, dirty, conflict]);

  const resetForm = useCallback(() => {
    setDraft(emptyDraft());
    setBaseline(emptyDraft());
    setEditingId(null);
    setFormKey(k => k + 1);
    setShowForm(false);
    setOracle({ pending: false, message: null });
    setRuleMatch(null);
    clearLocalDraft(currentUid());
  }, []);

  // ── Writes ───────────────────────────────────────────────────────────────
  const persist = async (d, id, { finalize = false } = {}) => {
    const payload = buildLessonPayload(d, { finalize });
    const target = id ? lessons.find(l => l.id === id && !l.isFinalized) : null;
    if (target) {
      await updateData('hardLessons', target.id, payload);
      return target.id;
    }
    const saved = await writeData('hardLessons', payload);
    return saved?.id || null;
  };

  const saveDraft = async () => {
    if (!canSaveDraft(draft) || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    try {
      const isNew = !editingId;
      await persist(draft, editingId);
      if (isNew) track('lesson_saved', { finalized: false, source: lessonSource(draft), oracleUsed: !!draft.isOracleExtracted, brokeRule: false });
      resetForm();
      await loadHardLessons();
      ouraToast.success('Draft saved.');
    } catch (error) {
      logger.error('Error saving Hard Lesson draft:', error);
      if (redirectIfAuthLost(error)) return;
      ouraToast.error('Draft not saved. Your text is kept.');
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  const lockLesson = async () => {
    if (missingForFinalize(draft).length > 0 || submittingRef.current) return false;
    submittingRef.current = true;
    setSaving(true);
    try {
      const savedId = await persist(draft, editingId, { finalize: true });
      const linked = findLinkedRule(lessons, savedId);
      if (linked) {
        const closed = closeLessonBreak(linked, savedId, draft);
        if (closed) await updateData('hardLessons', linked.id, closed);
      }
      // Long-term memory — finalized lessons only. Fire-and-forget; the CF
      // re-checks isFinalized on the stored doc.
      if (savedId) updateMemory('hardLessons', savedId);
      clearOracleContext();
      track('lesson_saved', { finalized: true, source: lessonSource(draft), oracleUsed: !!draft.isOracleExtracted, brokeRule: !!linked });

      if (linked && savedId) {
        let dismissed = false;
        try { dismissed = !!sessionStorage.getItem(`bridge_dismissed_${savedId}`); } catch { /* noop */ }
        if (!dismissed) {
          const breaks = Array.isArray(linked.violations) ? linked.violations.length : 0;
          setBridgePrompt({ visible: true, ruleText: draft.ruleGoingForward.trim(), consecutiveDaysRequired: breaks >= 2 ? 60 : 30, lessonId: savedId });
        }
      }
      resetForm();
      await loadHardLessons();
      ouraToast.success('Lesson locked.');
      return true;
    } catch (error) {
      logger.error('Error locking Hard Lesson:', error);
      if (redirectIfAuthLost(error)) return false;
      ouraToast.error('Lesson not locked. Your text is kept.');
      return false;
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  // "It broke" writes at once: the draft is saved to get an id, then the break
  // goes on the matched rule's own violations[] — the one shape every reader
  // counts. No unwritten break ever sits in local storage.
  const answerMatch = async (answer) => {
    if (!ruleMatch?.rule || ruleMatch.linking) return;
    if (answer === 'different') {
      dismissedMatches.current.add(draft.eventDescription.trim());
      setRuleMatch(null);
      return;
    }
    if (!canSaveDraft(draft)) return;
    setRuleMatch(m => ({ ...m, linking: true }));
    try {
      const lessonId = await persist(draft, editingId);
      if (!lessonId) throw new Error('draft save returned no id');
      setEditingId(lessonId);
      setBaseline(draft);
      const fresh = (await loadHardLessons()) || lessons;
      const rule = fresh.find(l => l.id === ruleMatch.rule.id) || ruleMatch.rule;
      const patch = linkLessonBreak(rule, lessonId);
      if (patch) {
        await updateData('hardLessons', rule.id, patch);
        track('rule_broken', { source: 'lesson' });
      }
      clearOracleContext();
      await loadHardLessons();
      setRuleMatch({ rule, answer: 'broke', linking: false });
    } catch (error) {
      logger.error('Error recording break from lesson:', { code: error?.code, message: error?.message });
      if (redirectIfAuthLost(error)) return;
      setRuleMatch(m => (m ? { ...m, linking: false } : m));
      ouraToast.error('Break not recorded. Try again.');
    }
  };

  const askOracle = async () => {
    const description = draft.eventDescription.trim();
    if (description.length < ORACLE_MIN_CHARS || oracle.pending) return;
    runRuleMatch(draft, editingId, lessons);
    setOracle({ pending: true, message: null });
    const { status, extraction } = await extractHardLessonDirect(description, { tone: 'stoic' });
    track('lesson_extract', { outcome: status });
    if (status === 'ok') {
      setDraft(d => mergeExtraction(d, extraction));
      setOracle({ pending: false, message: null });
    } else if (status === 'empty') {
      setOracle({ pending: false, message: 'Oracle found no lesson in this. Add what it cost you.' });
    } else {
      setOracle({ pending: false, message: 'Oracle unavailable. Your text is kept.' });
    }
  };

  const focusForm = (d) => {
    requestAnimationFrame(() => {
      document.getElementById('hl-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const first = missingForFinalize(d)[0] || 'eventDescription';
      document.getElementById(fieldId(first))?.focus?.({ preventScroll: true });
    });
  };

  const openEdit = (lesson, list = lessons) => {
    const d = draftFromLesson(lesson);
    openDraft(d, { id: lesson.id, base: d, list });
    focusForm(d);
  };

  const editLesson = (lesson) => {
    if (lesson.isFinalized) return;
    if (editingId === lesson.id) { setShowForm(true); setShowRulesLibrary(false); focusForm(draft); return; }
    if (dirty) {
      setConflict({ draft, editingId, next: { type: 'edit', lessonId: lesson.id } });
      return;
    }
    openEdit(lesson);
  };

  const startNew = () => {
    setShowForm(true);
    setShowRulesLibrary(false);
  };

  const resolveConflict = async (save) => {
    if (!conflict || submittingRef.current) return;
    submittingRef.current = true;
    let list = lessons;
    try {
      if (save) {
        setSaving(true);
        const isNew = !conflict.editingId;
        await persist(conflict.draft, conflict.editingId);
        if (isNew) track('lesson_saved', { finalized: false, source: lessonSource(conflict.draft), oracleUsed: !!conflict.draft.isOracleExtracted, brokeRule: false });
        list = (await loadHardLessons()) || lessons;
        ouraToast.success('Draft saved.');
      }
    } catch (error) {
      logger.error('Error saving unsaved lesson:', error);
      setSaving(false);
      submittingRef.current = false;
      if (redirectIfAuthLost(error)) return;
      ouraToast.error('Draft not saved. Your text is kept.');
      return;
    }
    setSaving(false);
    submittingRef.current = false;
    const next = conflict.next;
    setConflict(null);
    clearLocalDraft(currentUid());
    if (next?.type === 'edit') {
      const target = list.find(l => l.id === next.lessonId && !l.isFinalized);
      if (target) openEdit(target, list);
      else resetForm();
    } else if (!consumePrefill(list)) {
      resetForm();
    }
  };

  // ── Rules ────────────────────────────────────────────────────────────────
  const costFrequency = useMemo(() => {
    const counts = {};
    lessons.filter(l => l.isFinalized).forEach(l => {
      (l.costs || []).forEach(cost => { counts[cost] = (counts[cost] || 0) + 1; });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: costLabel(value), count }));
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return lessons;
    return lessons.filter((lesson) => {
      const haystack = [
        categoryLabel(lesson.eventCategory),
        lesson.eventDescription,
        lesson.myAssumption,
        lesson.signalIgnored,
        lesson.costDescription,
        lesson.extractedLesson,
        lesson.ruleGoingForward,
        lesson.isFinalized ? 'locked finalized' : 'draft',
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [lessons, searchQuery]);

  const finalizedRuleCount = useMemo(
    () => lessons.filter(l => l.isFinalized && l.ruleGoingForward?.trim()).length,
    [lessons]
  );

  // BER-130: finalized rules aggregated for the library
  const finalizedRules = useMemo(() => {
    const now = Date.now();
    const base = lessons
      .filter(l => l.isFinalized && l.ruleGoingForward?.trim())
      .map(l => {
        // Two break sources: legacy sibling docs tagged isRuleViolation that
        // point here via violatedRuleId (no longer written), and this rule's
        // own violations[].
        const legacyCount = lessons.filter(x => x.isRuleViolation && x.violatedRuleId === l.id).length;
        const directCount = Array.isArray(l.violations) ? l.violations.length : 0;
        const reaffirmedAt = (Array.isArray(l.violations) ? l.violations : [])
          .reduce((latest, v) => Math.max(latest, toMs(v?.resolvedAt)), 0);
        return {
          id: l.id,
          rule: l.ruleGoingForward,
          lesson: l,
          violationCount: legacyCount + directCount,
          underReview: isUnderReview(l),
          heldStreakDays: getHeldStreakDays(l, now),
          reaffirmedAt: reaffirmedAt || null,
        };
      })
      .sort((a, b) => new Date(b.lesson.finalizedAt || b.lesson.createdAt) - new Date(a.lesson.finalizedAt || a.lesson.createdAt));

    const q = librarySearch.trim().toLowerCase();
    return base.filter(r => {
      if (libraryFilterCost && !r.lesson.costs?.includes(libraryFilterCost)) return false;
      if (libraryFilterCategory && r.lesson.eventCategory !== libraryFilterCategory) return false;
      if (q && !r.rule.toLowerCase().includes(q) && !r.lesson.extractedLesson?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lessons, librarySearch, libraryFilterCost, libraryFilterCategory]);

  // After-action review panel — opens on a fresh break (the rule is now under
  // review) and on demand for an already-breached rule. Completing it stamps
  // the break with cause/correction/resolvedAt, which re-affirms the rule and
  // restarts its held streak. Skipping leaves the rule under review.
  const [aarPanel, setAarPanel] = useState({ ruleId: null, cause: '', correction: '', violationDate: null });
  const [savingAar, setSavingAar] = useState(false);
  const ruleBreakingRef = useRef(new Set());

  // Writes an unresolved entry to the rule's own violations[] → the rule goes
  // under review. Reached only through the inline confirm. One per rule per
  // local day.
  const markRuleBroken = async (rule) => {
    if (!rule?.id || ruleBreakingRef.current.has(rule.id)) return;
    ruleBreakingRef.current.add(rule.id);
    try {
      const todayKey = localDateKey();
      const existing = Array.isArray(rule.violations) ? rule.violations : [];
      const alreadyToday = existing.some(v => {
        const d = v?.date || v?.timestamp;
        return d ? localDateKey(d) === todayKey : false;
      });
      if (alreadyToday) {
        ouraToast.info('A break is already logged for this rule today.');
        return;
      }
      const nowIso = new Date().toISOString();
      await updateData('hardLessons', rule.id, {
        violations: [...existing, { date: nowIso, source: 'direct' }],
        lastViolatedAt: nowIso,
      });
      track('rule_broken', { source: 'direct' });
      clearOracleContext();
      await loadHardLessons();
      ouraToast.info('Break logged. Rule under review.');
      setAarPanel({ ruleId: rule.id, cause: '', correction: '', violationDate: nowIso });
    } catch (err) {
      logger.error('markRuleBroken failed:', { code: err?.code, message: err?.message });
      ouraToast.error('Break not logged. Try again.');
    } finally {
      ruleBreakingRef.current.delete(rule.id);
      setBreakConfirmId(null);
    }
  };

  const openAfterAction = useCallback((rule) => {
    const b = getMostRecentBreak(rule);
    if (!b?.date) return;
    setAarPanel({ ruleId: rule.id, cause: '', correction: '', violationDate: b.date });
  }, []);

  const saveAfterAction = async () => {
    const { ruleId, cause, correction, violationDate } = aarPanel;
    if (!ruleId || !violationDate || !cause.trim() || !correction.trim()) return;
    setSavingAar(true);
    try {
      const rule = lessons.find(l => l.id === ruleId);
      if (!rule) return;
      const resolvedAt = new Date().toISOString();
      const violations = (Array.isArray(rule.violations) ? rule.violations : []).map(v => {
        const d = v?.date || v?.timestamp;
        return d === violationDate ? { ...v, cause: cause.trim(), correction: correction.trim(), resolvedAt } : v;
      });
      await updateData('hardLessons', ruleId, { violations });
      track('after_action_completed');
      clearOracleContext();
      await loadHardLessons();
      ouraToast.success('Rule re-affirmed.');
      setAarPanel({ ruleId: null, cause: '', correction: '', violationDate: null });
    } catch (err) {
      logger.error('saveAfterAction failed:', { code: err?.code, message: err?.message });
      ouraToast.error('After-action review not saved. Try again.');
    } finally {
      setSavingAar(false);
    }
  };

  const dismissAfterAction = () => setAarPanel({ ruleId: null, cause: '', correction: '', violationDate: null });

  // After-action handoff from the Weekly Rule Review: open the library with the
  // breached rule's after-action panel ready.
  const aarPrefillRef = useRef(false);
  useEffect(() => {
    if (aarPrefillRef.current || lessons.length === 0) return;
    let raw = null;
    try { raw = sessionStorage.getItem('hl_aar_open'); } catch {}
    aarPrefillRef.current = true;
    if (!raw) return;
    try {
      const { ruleId } = JSON.parse(raw);
      const rule = lessons.find(l => l.id === ruleId);
      if (rule) {
        setShowRulesLibrary(true);
        setShowForm(false);
        openAfterAction(rule);
      }
    } catch {}
    try { sessionStorage.removeItem('hl_aar_open'); } catch {}
  }, [lessons, openAfterAction]);

  const stashLedgerPrefill = (payload) => {
    try { sessionStorage.setItem('kl_extraction_prefill', JSON.stringify(payload)); } catch { /* ignore storage errors */ }
    navigate('/ledger');
  };

  const addToKillListFromBridge = () => {
    if (!bridgePrompt.ruleText.trim()) return;
    const daysRaw = parseInt(bridgePrompt.consecutiveDaysRequired, 10);
    setBridgePrompt(prev => ({ ...prev, visible: false }));
    stashLedgerPrefill({
      targetTitle: bridgePrompt.ruleText.trim(),
      consecutiveDaysRequired: Number.isFinite(daysRaw) && daysRaw >= 21 ? daysRaw : 30,
      fromHardLessonId: bridgePrompt.lessonId,
    });
  };

  const dismissBridge = useCallback(() => {
    setBridgePrompt(prev => {
      if (prev.lessonId) {
        try { sessionStorage.setItem(`bridge_dismissed_${prev.lessonId}`, '1'); } catch { /* noop */ }
      }
      return { ...prev, visible: false };
    });
  }, []);

  const addToKillListFromLesson = (lesson) => {
    if (!lesson.ruleGoingForward?.trim()) return;
    stashLedgerPrefill({ targetTitle: lesson.ruleGoingForward.trim(), fromHardLessonId: lesson.id });
  };

  const generateCostPatternNarrative = async () => {
    if (loadingNarrative) return;
    setLoadingNarrative(true);
    try {
      const byType = {};
      lessons.filter(l => l.isFinalized && l.ruleGoingForward).forEach(l => {
        (l.costs || []).forEach(c => {
          if (!byType[c]) byType[c] = [];
          byType[c].push(l.ruleGoingForward);
        });
      });
      const grouped = Object.entries(byType)
        .map(([type, rules]) => `${costLabel(type)}: ${rules.join('; ')}`)
        .join('\n');
      const prompt = `The following are the user's finalized behavioral rules, grouped by cost type they emerged from:\n\n${grouped}\n\nIdentify the dominant cost pattern in 2-3 sentences. Pattern identification only — no advice, no affirmation, no suggestions.`;
      const { text: result } = await generateAIFeedback('hardLessons', prompt, []);
      setCostPatternNarrative(result || '');
    } catch {
      setCostPatternNarrative('Pattern generation unavailable.');
    } finally {
      setLoadingNarrative(false);
    }
  };

  // ── Archive ──────────────────────────────────────────────────────────────
  const archiveLesson = async (lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId);
    const lessonIndex = lessons.findIndex(l => l.id === lessonId);
    if (!lesson || lesson.isFinalized) return;

    setLessons(prev => prev.filter(l => l.id !== lessonId));
    try {
      await archiveEntry('hardLessons', lesson);
      track('lesson_archived');
      if (editingId === lessonId) resetForm();
      ouraToast.success('Lesson archived.');
    } catch (error) {
      logger.error('Error archiving Hard Lesson:', error);
      setLessons(prev => {
        if (prev.some(l => l.id === lessonId)) return prev;
        const next = [...prev];
        next.splice(Math.min(lessonIndex, next.length), 0, lesson);
        return next;
      });
      ouraToast.error('Lesson not archived.');
    }
  };

  const restoreArchivedLesson = async (archived) => {
    try {
      await restoreEntry('hardLessons', archived);
      setLessons(prev => [{ ...archived, archivedAt: undefined }, ...prev]);
      ouraToast.success('Lesson restored.');
    } catch (error) {
      logger.error('Error restoring Hard Lesson:', error);
      if (redirectIfAuthLost(error)) return;
      loadHardLessons();
      ouraToast.error('Lesson not restored.');
    }
  };

  const permanentlyDeleteArchivedLesson = async (archived) => {
    if (!window.confirm('Permanently delete this lesson? This cannot be undone.')) return;
    try {
      await deleteArchivedEntry('hardLessons', archived);
      ouraToast.success('Lesson permanently deleted.');
    } catch (error) {
      logger.error('Error permanently deleting Hard Lesson:', error);
      ouraToast.error('Lesson not deleted.');
    }
  };

  const smallAction = 'px-3 py-1.5 max-sm:min-h-11 text-xs rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const filterChip = (on, onClass) => `px-3 py-1.5 max-sm:min-h-11 rounded-lg text-xs transition-colors ${on ? onClass : 'bg-[#1a1a1a] text-[#ababab] hover:text-white'}`;

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center shrink-0">
              <AppIcon name="hardLessons" size={22} color="#f59e0b" glow={false} />
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-white">Hard Lessons</h1>
          </div>
          <p className="text-[#ababab] text-lg mb-4">
            {getModuleIntro('hardlessons').definition}
          </p>
          <ModuleIntro moduleId="hardlessons" onAction={startNew} />
          <p className="text-[#858585] text-xs mt-3">Lesson maps to active pattern → <Link to="/ledger" className="inline-flex items-center max-sm:min-h-11 text-[#ababab] hover:text-white transition-colors">General Ledger</Link></p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="oura-card p-3 sm:p-6 text-center">
            <div className="text-[#858585] text-[10px] sm:text-xs uppercase tracking-widest mb-2">Total Lessons</div>
            <div className="oura-score text-white">{lessons.length}</div>
          </div>
          <div className="oura-card p-3 sm:p-6 text-center">
            <div className="text-[#858585] text-[10px] sm:text-xs uppercase tracking-widest mb-2">Locked</div>
            <div className="oura-score text-[#22c55e]">{lessons.filter(l => l.isFinalized).length}</div>
          </div>
          <div className="oura-card p-3 sm:p-6 text-center">
            <div className="text-[#858585] text-[10px] sm:text-xs uppercase tracking-widest mb-2">Draft</div>
            <div className="oura-score text-[#f59e0b]">{lessons.filter(l => !l.isFinalized).length}</div>
          </div>
        </div>

        {/* Cost type distribution — locked lessons only */}
        {costFrequency.length >= 2 && (
          <div className="oura-card p-5 mb-8 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-xs text-[#858585] uppercase tracking-widest mb-4">Cost Distribution</h3>
            <div className="space-y-2.5">
              {costFrequency.map(({ value, label, count }) => {
                const pct = Math.round((count / costFrequency[0].count) * 100);
                return (
                  <div key={value} className="flex items-center gap-3">
                    <div className="text-[#ababab] text-xs w-32 shrink-0 truncate">{label}</div>
                    <div className="flex-1 bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-[#f59e0b] transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[#858585] text-xs w-4 text-right shrink-0">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Entry point + Rules Library toggle */}
        <div className="mb-8 animate-fade-in-up space-y-3" style={{ animationDelay: '0.2s' }}>
          {!showForm && !conflict && (
            <button
              type="button"
              onClick={startNew}
              className="oura-card w-full p-4 flex items-center justify-between text-left hover:border-[#2a2a2a] transition-all"
            >
              <span className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/20 flex items-center justify-center text-[#f59e0b] text-xl leading-none">+</span>
                <span className="text-white font-medium">{dirty ? 'Continue unsaved lesson' : 'Record a lesson'}</span>
              </span>
              <span className="text-[#858585] text-xs uppercase tracking-widest">Open</span>
            </button>
          )}
          {finalizedRuleCount > 0 && (
            <button
              onClick={() => { setShowRulesLibrary(!showRulesLibrary); setShowForm(false); }}
              aria-pressed={showRulesLibrary}
              className={`px-6 min-h-11 rounded-2xl transition-all duration-300 font-medium border ${showRulesLibrary ? 'bg-white text-black border-white' : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#f59e0b] hover:text-white'}`}
            >
              Rules Library ({finalizedRuleCount})
            </button>
          )}
        </div>

        {conflict && (
          <div className="oura-card p-5 mb-8 border-l-4 border-[#b45309]" role="group" aria-label="Unsaved lesson">
            <p className="text-xs uppercase tracking-widest text-[#858585] mb-1">Unsaved lesson</p>
            <p className="text-[#d1d1d1] text-sm leading-relaxed mb-4">
              "{conflict.draft.eventDescription.trim().slice(0, 60)}{conflict.draft.eventDescription.trim().length > 60 ? '…' : ''}"
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => resolveConflict(true)}
                disabled={saving}
                className="px-4 min-h-11 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-black rounded-xl text-sm font-medium transition-colors"
              >
                {saving ? 'Saving...' : 'Save it and continue'}
              </button>
              <button
                onClick={() => resolveConflict(false)}
                disabled={saving}
                className="px-4 min-h-11 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#ababab] hover:text-white rounded-xl text-sm font-medium transition-colors"
              >
                Discard it
              </button>
            </div>
          </div>
        )}

        {showForm && !conflict && (
          <LessonForm
            key={formKey}
            draft={draft}
            onChange={(patch) => setDraft(d => applyEdit(d, patch))}
            isEdit={!!editingId}
            oracle={oracle}
            ruleMatch={ruleMatch}
            onAnswerMatch={answerMatch}
            onAskOracle={askOracle}
            onUseSuggestion={(field) => setDraft(d => takeSuggestion(d, field))}
            onSaveDraft={saveDraft}
            onReview={() => runRuleMatch(draft, editingId, lessons)}
            onLock={lockLesson}
            onDiscard={resetForm}
            onCollapse={() => setShowForm(false)}
            saving={saving}
          />
        )}

        {bridgePrompt.visible && (
          <LedgerBridgePrompt
            prompt={bridgePrompt}
            onChange={(patch) => setBridgePrompt(prev => ({ ...prev, ...patch }))}
            onAdd={addToKillListFromBridge}
            onDismiss={dismissBridge}
          />
        )}

        {/* Rules Library */}
        {showRulesLibrary && (
          <div className="mb-8 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
              <h2 className="text-2xl font-light text-white tracking-tight flex-1">Rules Library</h2>
              <input
                type="search"
                aria-label="Search rules"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                placeholder="Search rules..."
                className="w-full sm:w-64 px-4 min-h-11 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter by cost">
              <button onClick={() => setLibraryFilterCost('')} aria-pressed={!libraryFilterCost} className={filterChip(!libraryFilterCost, 'bg-[#f59e0b] text-black font-medium')}>All costs</button>
              {COST_CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setLibraryFilterCost(libraryFilterCost === c.value ? '' : c.value)} aria-pressed={libraryFilterCost === c.value} className={filterChip(libraryFilterCost === c.value, 'bg-[#f59e0b] text-black font-medium')}>{c.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter by category">
              <button onClick={() => setLibraryFilterCategory('')} aria-pressed={!libraryFilterCategory} className={filterChip(!libraryFilterCategory, 'bg-[#2a2a2a] text-white')}>All categories</button>
              {EVENT_CATEGORIES.map(c => (
                <button key={c.value} onClick={() => setLibraryFilterCategory(libraryFilterCategory === c.value ? '' : c.value)} aria-pressed={libraryFilterCategory === c.value} className={filterChip(libraryFilterCategory === c.value, 'bg-[#2a2a2a] text-white')}>{c.label}</button>
              ))}
            </div>

            {/* Cost Pattern Narrative */}
            <div className="oura-card p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs text-[#858585] uppercase tracking-widest">Cost Pattern Analysis</h4>
                <button
                  onClick={generateCostPatternNarrative}
                  disabled={loadingNarrative}
                  className="px-4 py-1.5 max-sm:min-h-11 text-xs bg-[#1a1a1a] text-[#4da6ff] border border-[#4da6ff]/30 rounded-lg hover:bg-[#4da6ff]/10 transition-colors disabled:opacity-40"
                >
                  {loadingNarrative ? 'Analyzing…' : 'Generate Pattern'}
                </button>
              </div>
              {costPatternNarrative ? (
                <p className="text-[#ababab] text-sm leading-relaxed">{costPatternNarrative}</p>
              ) : (
                <p className="text-[#858585] text-sm">Pattern identification across all finalized rules, grouped by cost type.</p>
              )}
            </div>

            {finalizedRules.length === 0 ? (
              <div className="oura-card p-8 text-center">
                <p className="text-[#858585] text-sm">No rules match the current filter.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {finalizedRules.map(({ id, rule, lesson, violationCount, underReview, heldStreakDays, reaffirmedAt }) => {
                  const aarOpen = aarPanel.ruleId === id;
                  const confirming = breakConfirmId === id;
                  return (
                    <div key={id} className={`oura-card p-5 hover:shadow-oura-glow-amber transition-shadow duration-300 ${underReview ? 'border-[#b45309]/50' : violationCount > 0 ? 'border-red-500/40' : 'border-[#f59e0b]/20'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-[#fbbf24] font-medium leading-relaxed border-l-4 border-[#f59e0b] pl-3">{rule}</p>
                          <p className="text-[#858585] text-xs mt-2">{lesson.extractedLesson}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-3">
                            {categoryLabel(lesson.eventCategory) && <span className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">{categoryLabel(lesson.eventCategory)}</span>}
                            {(lesson.costs || []).map(c => <span key={c} className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">{costLabel(c)}</span>)}
                            <span className="text-[10px] text-[#858585]">{new Date(lesson.finalizedAt || lesson.createdAt).toLocaleDateString()}</span>
                            {underReview ? (
                              <span className="text-[10px] px-2 py-0.5 bg-[#b45309]/10 text-[#d97706] rounded-lg border border-[#b45309]/40 uppercase tracking-wider">Under review — after-action required</span>
                            ) : (
                              <span className="text-[10px] text-[#00d4aa]">Held {heldStreakDays}d{reaffirmedAt ? ` · re-affirmed ${new Date(reaffirmedAt).toLocaleDateString()}` : ''}</span>
                            )}
                          </div>
                        </div>
                        {violationCount > 0 && (
                          <div className="shrink-0 text-center">
                            <div className="text-red-400 text-xl font-light tabular-nums">{violationCount}</div>
                            <div className="text-red-400/80 text-[10px] uppercase tracking-wider">break{violationCount !== 1 ? 's' : ''}</div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex flex-wrap items-center justify-end gap-2">
                        {underReview ? (
                          <button onClick={() => openAfterAction(lesson)} disabled={aarOpen} className={`${smallAction} border-[#b45309]/40 text-[#d97706] hover:bg-[#b45309]/10`}>
                            Complete after-action review
                          </button>
                        ) : confirming ? (
                          <>
                            <span className="text-xs text-[#ababab] mr-1">Log a break for this rule?</span>
                            <button onClick={() => markRuleBroken(lesson)} className={`${smallAction} border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/10`}>Log break</button>
                            <button onClick={() => setBreakConfirmId(null)} className={`${smallAction} border-[#2a2a2a] text-[#ababab] hover:text-white`}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setBreakConfirmId(id)} disabled={aarOpen} className={`${smallAction} border-[#b45309]/40 text-[#d97706] hover:bg-[#b45309]/10`}>
                            Rule broken
                          </button>
                        )}
                      </div>

                      {aarOpen && (
                        <div className="mt-3 p-4 bg-[#0a0a0a] border border-[#b45309]/30 rounded-xl">
                          <div className="text-[#d97706] text-[10px] uppercase tracking-widest mb-3">
                            After-action review{aarPanel.violationDate ? ` · break ${new Date(aarPanel.violationDate).toLocaleDateString()}` : ''}
                          </div>
                          <label htmlFor={`aar-cause-${id}`} className="block text-[#858585] text-xs mb-1">Why did it break?</label>
                          <textarea
                            id={`aar-cause-${id}`}
                            value={aarPanel.cause}
                            onChange={(e) => setAarPanel(prev => ({ ...prev, cause: e.target.value }))}
                            rows={2}
                            placeholder="The conditions, the assumption, the moment it gave way."
                            className="w-full p-2 mb-3 bg-[#050505] text-white rounded-lg border border-[#1a1a1a] focus:border-[#b45309] focus:outline-none resize-none text-sm placeholder-[#828282]"
                          />
                          <label htmlFor={`aar-correction-${id}`} className="block text-[#858585] text-xs mb-1">What changes so it holds?</label>
                          <textarea
                            id={`aar-correction-${id}`}
                            value={aarPanel.correction}
                            onChange={(e) => setAarPanel(prev => ({ ...prev, correction: e.target.value }))}
                            rows={2}
                            placeholder="The specific change that makes the next outcome different."
                            className="w-full p-2 bg-[#050505] text-white rounded-lg border border-[#1a1a1a] focus:border-[#b45309] focus:outline-none resize-none text-sm placeholder-[#828282]"
                          />
                          <div className="flex justify-end gap-2 mt-3">
                            <button onClick={dismissAfterAction} className={`${smallAction} border-transparent text-[#858585] hover:text-[#ababab]`}>Later</button>
                            <button
                              onClick={saveAfterAction}
                              disabled={!aarPanel.cause.trim() || !aarPanel.correction.trim() || savingAar}
                              className={`${smallAction} border-[#00d4aa]/40 text-[#00d4aa] hover:bg-[#00d4aa]/10`}
                            >
                              {savingAar ? 'Saving...' : 'Re-affirm rule'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Lessons List */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-[#858585] text-xs uppercase tracking-widest">
                {view === 'archive' ? 'Archive' : 'Lessons'}
                {searchQuery.trim() && view === 'active' && (
                  <span className="text-[#858585] ml-2">({filteredLessons.length}/{lessons.length})</span>
                )}
              </h3>
              <ArchiveToggle
                view={view}
                onChange={setView}
                activeCount={lessons.length}
                archiveCount={archivedLessons.length}
              />
            </div>
            {view === 'active' && (
              <div className="relative w-full sm:w-80">
                <input
                  type="search"
                  aria-label="Search lessons"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search lessons..."
                  className="w-full px-4 min-h-11 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 px-3 min-h-11 text-[#858585] hover:text-white text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {view === 'archive' && (
            <div className="space-y-3">
              {archivedLessons.length === 0 ? (
                <div className="oura-card p-10 text-center">
                  <p className="text-[#858585] text-sm">No archived lessons.</p>
                </div>
              ) : archivedLessons.map(l => (
                <div key={l.id} className="oura-card p-5 opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium">{l.eventDescription || 'Untitled lesson'}</p>
                      {l.extractedLesson && <p className="text-[#858585] text-xs mt-2">{l.extractedLesson}</p>}
                      <p className="text-[#858585] text-xs mt-2">
                        Archived {l.archivedAt ? new Date(l.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => restoreArchivedLesson(l)} className={`${smallAction} border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/10`}>Restore</button>
                      <button onClick={() => permanentlyDeleteArchivedLesson(l)} className={`${smallAction} border-[#b45309]/40 text-[#d97706] hover:bg-[#b45309]/10`}>Delete permanently</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'active' && (
            <div className="relative">
              <div className={`fade-pane ${initialLoading && showSkeleton ? 'visible' : 'hidden'}`}>
                <SkeletonList count={3} ItemComponent={SkeletonCard} />
              </div>

              <div className={`fade-pane ${initialLoading || showSkeleton ? 'hidden' : 'visible'}`}>
                {loadError ? (
                  <div className="oura-card p-12 text-center">
                    <p className="text-[#ef4444] mb-4 text-sm">Lessons did not load. Check the connection.</p>
                    <button
                      onClick={loadHardLessons}
                      className="px-5 min-h-11 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredLessons.length > 0 ? (
                  <div className="space-y-4">
                    {filteredLessons.map((lesson) => {
                      const sections = [
                        ['The event', lesson.eventDescription],
                        ['My assumption', lesson.myAssumption],
                        ['The signal I ignored', lesson.signalIgnored],
                      ].filter(([, value]) => (value || '').trim());
                      const costs = (lesson.costs || []).filter(Boolean);
                      const hasCost = costs.length > 0 || (lesson.costDescription || '').trim();
                      const label = stubLabel(lesson);

                      return (
                        <div key={lesson.id} id={`lesson-${lesson.id}`} style={{ '--lit-accent': '#f59e0b' }} className={`oura-card p-5 sm:p-6 hover:shadow-oura-glow-amber transition-shadow duration-300 ${
                          lesson.isFinalized ? 'border-[#f59e0b]/50' : 'border-dashed border-[#f59e0b]/30'
                        }${highlightId === lesson.id ? ' entry-focus' : ''}`}>
                          <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
                            <div>
                              <h3 className="text-white font-medium">{categoryLabel(lesson.eventCategory) || (lesson.isFinalized ? 'Lesson' : 'Draft')}</h3>
                              <div className="flex items-center flex-wrap gap-2 text-xs text-[#858585] mt-1">
                                <span>{new Date(lesson.createdAt).toLocaleDateString()}</span>
                                <span className={`px-2 py-1 rounded-lg uppercase tracking-wider ${
                                  lesson.isFinalized
                                    ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                                    : 'bg-[#8a8a8a]/10 text-[#ababab] border border-[#2a2a2a]'
                                }`}>
                                  {lesson.isFinalized ? 'Locked' : 'Draft'}
                                </span>
                                {!lesson.isFinalized && label && <span className="uppercase tracking-wider">{label}</span>}
                              </div>
                            </div>

                            {lesson.isFinalized ? (
                              <span className="text-[#ababab] text-xs max-w-[16rem] sm:text-right">Locked. Log breaks on the rule in the Rules Library.</span>
                            ) : (
                              <div className="flex gap-2 items-center">
                                <button onClick={() => editLesson(lesson)} className={`${smallAction} border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/10`}>
                                  {sections.length > 1 || hasCost ? 'Edit' : 'Continue'}
                                </button>
                                <button onClick={() => archiveLesson(lesson.id)} className={`${smallAction} border-[#2a2a2a] text-[#ababab] hover:text-white`}>
                                  Archive
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-5">
                            {sections.map(([heading, value]) => (
                              <div key={heading}>
                                <h4 className="text-[#ababab] text-xs uppercase tracking-wider mb-2">{heading}</h4>
                                <p className="text-[#d1d1d1] leading-relaxed">{value}</p>
                              </div>
                            ))}

                            {hasCost && (
                              <div>
                                <h4 className="text-[#ababab] text-xs uppercase tracking-wider mb-2">The cost</h4>
                                {costs.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    {costs.map(c => (
                                      <span key={c} className="px-2 py-1 bg-[#0a0a0a] text-[#ababab] rounded-lg text-xs border border-[#1a1a1a]">{costLabel(c)}</span>
                                    ))}
                                  </div>
                                )}
                                {(lesson.costDescription || '').trim() && <p className="text-[#d1d1d1] leading-relaxed">{lesson.costDescription}</p>}
                              </div>
                            )}

                            {(lesson.extractedLesson || '').trim() && (
                              <div className="border-t border-[#1a1a1a] pt-5">
                                <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wider">The lesson</h4>
                                <p className="text-[#f59e0b] font-medium leading-relaxed">{lesson.extractedLesson}</p>
                              </div>
                            )}

                            {(lesson.ruleGoingForward || '').trim() && (
                              <div>
                                <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wider">The rule going forward</h4>
                                <p className="text-[#fbbf24] font-medium border-l-4 border-[#f59e0b] pl-4 bg-[#f59e0b]/10 py-3 rounded-r-xl leading-relaxed">
                                  {lesson.ruleGoingForward}
                                </p>
                              </div>
                            )}

                            {/* BER-131: Add to Ledger */}
                            {lesson.isFinalized && lesson.ruleGoingForward?.trim() && (
                              <button
                                onClick={() => addToKillListFromLesson(lesson)}
                                className="w-full px-4 min-h-11 bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/30 rounded-xl text-xs font-medium transition-colors text-left"
                              >
                                + Add to Ledger
                              </button>
                            )}

                            {/* Legacy: a lesson flagged as a violation before breaks moved onto the rule. */}
                            {lesson.isRuleViolation && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/30 rounded-xl">
                                <span className="text-red-400 text-xs font-medium uppercase tracking-wider">Rule Violation</span>
                              </div>
                            )}

                            {/* Legacy: Oracle text stored with older lessons. */}
                            {lesson.oracleWisdom && typeof lesson.oracleWisdom === 'string' && (
                              <div className="border-t border-[#1a1a1a] pt-5">
                                <h4 className="text-[#858585] font-medium text-xs uppercase tracking-wider mb-2">Oracle</h4>
                                <p className="text-[#ababab] text-sm leading-relaxed whitespace-pre-line">{lesson.oracleWisdom}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="oura-card p-12 text-center">
                    <h3 className="text-lg font-light text-white mb-2">{`No matches for "${searchQuery.trim()}"`}</h3>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="mt-4 px-6 min-h-11 bg-transparent border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <div className="oura-card p-10 text-center">
                    <h3 className="text-lg font-light text-white mb-2">No lessons recorded.</h3>
                    <p className="text-[#858585] text-sm">A lesson starts with one event. The rest can wait.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
