import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { writeData, readUserData, updateData } from '../utils/firebaseUtils';
import { archiveEntry, restoreEntry, deleteArchivedEntry, subscribeToArchive } from '../utils/archiveUtils';
import { redirectIfAuthLost } from '../utils/authErrorHandler';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import OracleModal from '../components/OracleModal';
import ArchiveToggle from '../components/ArchiveToggle';
import { AppIcon } from '../components/AppIcons';
import ouraToast from '../utils/toast';
import { useOracleModal } from '../hooks/useOracleModal';
import logger from '../utils/logger';
import { SkeletonList, SkeletonCard } from '../components/SkeletonLoader';

// Event categories for Hard Lessons
const eventCategories = [
  { value: 'relationship_misjudgment', label: 'Relationship Misjudgment', icon: '💔' },
  { value: 'leadership_error', label: 'Leadership Error', icon: '👑' },
  { value: 'boundary_failure', label: 'Boundary Failure', icon: '🚧' },
  { value: 'overconfidence', label: 'Overconfidence', icon: '🎯' },
  { value: 'underestimation', label: 'Underestimation', icon: '⚖️' },
  { value: 'ignored_intuition', label: 'Ignored Intuition', icon: '🔮' },
  { value: 'physiological_misread', label: 'Hormonal/Physiological Misread', icon: '🧬' },
  { value: 'trust_without_verification', label: 'Trust Given Without Verification', icon: '🤝' },
  { value: 'other', label: 'Other', icon: '⚡' }
];

// Cost categories for tracking real consequences
const costCategories = [
  { value: 'emotional', label: 'Emotional', icon: '💭' },
  { value: 'financial', label: 'Financial', icon: '💰' },
  { value: 'relational', label: 'Relational', icon: '👥' },
  { value: 'physical', label: 'Physical', icon: '🏥' },
  { value: 'professional', label: 'Professional', icon: '💼' },
  { value: 'time', label: 'Time/Opportunity', icon: '⏰' }
];

export default function HardLessons() {
  const navigate = useNavigate();
  // Form state for new lesson
  const [newLesson, setNewLesson] = useState({
    eventCategory: '',
    eventDescription: '',
    myAssumption: '',
    signalIgnored: '',
    costs: [],
    costDescription: '',
    extractedLesson: '',
    ruleGoingForward: '',
    isFinalized: false,
    isRuleViolation: false,
    violatedRuleId: null,
  });

  // Module state
  const [lessons, setLessons] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState(null);
  const { oracleModal, openLoading: openOracleLoading, openWithContent: openOracleWithContent, close: closeOracle } = useOracleModal();
  const [pendingOracleReaction, setPendingOracleReaction] = useState(null);
  const [pendingOracleWisdom, setPendingOracleWisdom] = useState('');
  const [pendingOracleClosingQuestion, setPendingOracleClosingQuestion] = useState(null);
  const autoOpenedIds = useRef(new Set());
  const submittingRef = useRef(false);

  // Scar Inventory state (first-time guided flow)
  const [scarInventory, setScarInventory] = useState(['', '', '']);
  const [showScarFlow, setShowScarFlow] = useState(false);
  const [savingScars, setSavingScars] = useState(false);

  // BER-131: Kill List bridge
  const [bridgePrompt, setBridgePrompt] = useState({ visible: false, ruleText: '', consecutiveDaysRequired: 30, lessonId: null });

  // BER-130: Rules Library + Rule Violation Detection
  const [showRulesLibrary, setShowRulesLibrary] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryFilterCost, setLibraryFilterCost] = useState('');
  const [libraryFilterCategory, setLibraryFilterCategory] = useState('');
  const [violationPrompt, setViolationPrompt] = useState({ visible: false, matchedRule: null });
  const [pendingViolation, setPendingViolation] = useState({ isRuleViolation: false, violatedRuleId: null });
  const [costPatternNarrative, setCostPatternNarrative] = useState('');
  const [loadingNarrative, setLoadingNarrative] = useState(false);
  const violationCheckedRef = useRef('');
  const [view, setView] = useState('active');
  const [archivedLessons, setArchivedLessons] = useState([]);

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

  useEffect(() => {
    loadHardLessons();
    // Cross-module prefill consumer. Originally added for the Kill List autopsy
    // bridge (eventDescription only, BER-131); now also receives the rich
    // Oracle-extracted payload from Journal's "Extract Lesson" flow so the
    // user lands on a fully prefilled draft and finalizes (or discards) it
    // themselves rather than having a draft auto-written behind the scenes.
    const prefill = sessionStorage.getItem('hl_bridge_prefill');
    if (prefill) {
      try {
        const data = JSON.parse(prefill);
        setNewLesson(prev => ({
          ...prev,
          ...(data.eventCategory ? { eventCategory: data.eventCategory } : {}),
          ...(data.eventDescription ? { eventDescription: data.eventDescription } : {}),
          ...(data.myAssumption ? { myAssumption: data.myAssumption } : {}),
          ...(data.signalIgnored ? { signalIgnored: data.signalIgnored } : {}),
          ...(Array.isArray(data.costs) ? { costs: data.costs } : {}),
          ...(data.costDescription ? { costDescription: data.costDescription } : {}),
          ...(data.extractedLesson ? { extractedLesson: data.extractedLesson } : {}),
          ...(data.ruleGoingForward ? { ruleGoingForward: data.ruleGoingForward } : {}),
          ...(data.sourceJournalId ? { sourceJournalId: data.sourceJournalId } : {}),
          ...(data.isOracleExtracted ? { isOracleExtracted: true } : {}),
          ...(data.isOracleFailed ? { isOracleFailed: true } : {}),
        }));
        setShowForm(true);
        sessionStorage.removeItem('hl_bridge_prefill');
      } catch {}
    }
  }, []);

  // Delay showing skeleton to prevent flicker
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (initialLoading) {
        setShowSkeleton(true);
      }
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

  const loadHardLessons = async () => {
    setInitialLoading(true);
    setLoadError(false);
    try {
      const savedLessons = await readUserData('hardLessons');
      const deduped = Array.from(new Map((savedLessons || []).map(l => [l.id, l])).values());
      setLessons(deduped);
    } catch (error) {
      logger.error('❌ Error loading hard lessons:', error);
      setLoadError(true);
    } finally {
      setInitialLoading(false);
    }
  };

  // Show scar flow when lessons load empty (first time), unless skipped this session
  useEffect(() => {
    if (!initialLoading && lessons.length === 0 && !sessionStorage.getItem('scar_flow_skipped')) {
      setShowScarFlow(true);
    }
  }, [initialLoading, lessons.length]);

  // Auto-open the form if we arrived with an Oracle-extracted draft (from Journal bridge)
  useEffect(() => {
    if (initialLoading || lessons.length === 0) return;
    const extracted = lessons.find(l => l.isOracleExtracted && !l.isFinalized && !autoOpenedIds.current.has(l.id));
    if (extracted) {
      // Track in a session ref so reloads of lessons state don't re-trigger the effect
      autoOpenedIds.current.add(extracted.id);
      setNewLesson({
        eventCategory: extracted.eventCategory || '',
        eventDescription: extracted.eventDescription || '',
        myAssumption: extracted.myAssumption || '',
        signalIgnored: extracted.signalIgnored || '',
        costs: Array.isArray(extracted.costs) ? extracted.costs : [],
        costDescription: extracted.costDescription || '',
        extractedLesson: extracted.extractedLesson || '',
        ruleGoingForward: extracted.ruleGoingForward || '',
        isFinalized: false,
      });
      setEditingLesson(extracted);
      setShowForm(true);
      setShowScarFlow(false);
      // Scroll to top after a tick so the form is visible
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }
  }, [initialLoading, lessons]);

  const submitScarInventory = async () => {
    const filled = scarInventory.filter(s => s.trim().length > 0);
    if (filled.length === 0) return;

    setSavingScars(true);
    try {
      const newLessons = [];
      for (const scar of filled) {
        const stub = await writeData('hardLessons', {
          eventCategory: '',
          eventDescription: scar.trim(),
          myAssumption: '',
          signalIgnored: '',
          costs: [],
          costDescription: '',
          extractedLesson: '',
          ruleGoingForward: '',
          isFinalized: false,
          isScarStub: true,
          createdAt: new Date().toISOString(),
        });
        newLessons.push(stub);
      }
      setLessons(prev => [...newLessons, ...prev]);
      setShowScarFlow(false);
      setScarInventory(['', '', '']);
      ouraToast.success(`${filled.length} scar${filled.length > 1 ? 's' : ''} recorded. Complete each record to lock in the lesson.`);
    } catch (error) {
      logger.error('Error saving scar inventory:', error);
      ouraToast.error('Failed to save scars');
    } finally {
      setSavingScars(false);
    }
  };

  const costFrequency = useMemo(() => {
    if (lessons.length === 0) return [];
    const counts = {};
    lessons.forEach(l => {
      (l.costs || []).forEach(cost => {
        counts[cost] = (counts[cost] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => {
        const def = costCategories.find(c => c.value === value);
        return { value, label: def?.label ?? value, icon: def?.icon ?? '⚡', count };
      });
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return lessons;

    return lessons.filter((lesson) => {
      const categoryLabel = eventCategories.find(cat => cat.value === lesson.eventCategory)?.label || '';
      const statusLabel = lesson.isFinalized ? 'finalized' : 'draft';
      const haystack = [
        categoryLabel,
        lesson.eventDescription,
        lesson.myAssumption,
        lesson.signalIgnored,
        lesson.costDescription,
        lesson.extractedLesson,
        lesson.ruleGoingForward,
        statusLabel
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [lessons, searchQuery, eventCategories]);

  // BER-130: finalized rules aggregated for the library
  const finalizedRules = useMemo(() => {
    const base = lessons
      .filter(l => l.isFinalized && l.ruleGoingForward?.trim())
      .map(l => {
        // Combine two violation sources: (1) legacy — separate lesson docs
        // tagged isRuleViolation pointing at this rule via violatedRuleId,
        // (2) direct — entries in this rule's own violations[] array,
        // populated by the "Rule broken" button + Weekly Rule Review.
        const legacyCount = lessons.filter(x => x.isRuleViolation && x.violatedRuleId === l.id).length;
        const directCount = Array.isArray(l.violations) ? l.violations.length : 0;
        return {
          id: l.id,
          rule: l.ruleGoingForward,
          lesson: l,
          violationCount: legacyCount + directCount,
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

  // Simple keyword-based rule violation detection (no ML — token overlap)
  const tokenizeSimple = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 3);

  const findMatchingRule = useCallback((description) => {
    const descTokens = new Set(tokenizeSimple(description));
    if (descTokens.size < 3) return null;
    const finalized = lessons.filter(l => l.isFinalized && l.ruleGoingForward?.trim());
    let bestMatch = null;
    let bestScore = 0;
    finalized.forEach(l => {
      const ruleTokens = tokenizeSimple(l.ruleGoingForward + ' ' + (l.extractedLesson || ''));
      const ruleSet = new Set(ruleTokens);
      let intersection = 0;
      descTokens.forEach(t => { if (ruleSet.has(t)) intersection++; });
      const score = intersection / Math.max(descTokens.size, ruleSet.size, 1);
      if (score > bestScore) { bestScore = score; bestMatch = l; }
    });
    return bestScore >= 0.12 ? bestMatch : null;
  }, [lessons]);

  const handleEventDescriptionBlur = useCallback(() => {
    const desc = newLesson.eventDescription.trim();
    if (desc.length < 30 || desc === violationCheckedRef.current) return;
    if (editingLesson?.id) return; // skip on edit of existing lesson
    violationCheckedRef.current = desc;
    const matched = findMatchingRule(desc);
    if (matched) {
      setViolationPrompt({ visible: true, matchedRule: matched });
    }
  }, [newLesson.eventDescription, findMatchingRule, editingLesson]);

  const handleViolationConfirm = (isViolation) => {
    if (isViolation && violationPrompt.matchedRule) {
      setPendingViolation({ isRuleViolation: true, violatedRuleId: violationPrompt.matchedRule.id });
      setNewLesson(prev => ({ ...prev, isRuleViolation: true, violatedRuleId: violationPrompt.matchedRule.id }));
    } else {
      setPendingViolation({ isRuleViolation: false, violatedRuleId: null });
      setNewLesson(prev => ({ ...prev, isRuleViolation: false, violatedRuleId: null }));
    }
    setViolationPrompt({ visible: false, matchedRule: null });
  };

  // Inline post-tap note panel — open after a successful "Rule broken" write
  // so the user can optionally add context for the violation just logged.
  // The violation is already committed to Firestore at this point; saving a
  // note is an enrichment, walking away is fine.
  const [ruleNotePanel, setRuleNotePanel] = useState({ ruleId: null, note: '', violationDate: null });
  const ruleBreakingRef = useRef(new Set()); // synchronous guard against rapid double-taps

  // Direct violation logger — fires when the user taps "Rule broken" on a
  // finalized rule card. Writes to the rule's own document via violations[]
  // (the shape the Mirror tile / clarityScore counter already reads).
  // Daily dedupe: at most one violation per rule per UTC day.
  const markRuleBroken = useCallback(async (rule) => {
    if (!rule?.id) return;
    if (ruleBreakingRef.current.has(rule.id)) return; // re-entry guard
    ruleBreakingRef.current.add(rule.id);
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const existing = Array.isArray(rule.violations) ? rule.violations : [];
      const alreadyToday = existing.some(v => {
        const d = v?.date || v?.timestamp;
        if (!d) return false;
        return new Date(d).toISOString().slice(0, 10) === todayKey;
      });
      if (alreadyToday) {
        ouraToast.info('Already logged a violation for this rule today');
        return;
      }
      const nowIso = new Date().toISOString();
      const violations = [...existing, { date: nowIso, source: 'direct' }];
      await updateData('hardLessons', rule.id, {
        violations,
        lastViolatedAt: nowIso,
      });
      await loadHardLessons();
      ouraToast.success('Rule broken — logged');
      setRuleNotePanel({ ruleId: rule.id, note: '', violationDate: nowIso });
    } catch (err) {
      logger.error('markRuleBroken failed:', err?.message);
      if (redirectIfAuthLost(err)) return;
      ouraToast.error('Failed to log violation');
    } finally {
      ruleBreakingRef.current.delete(rule.id);
    }
  }, []);

  // Attach the optional note to the violation entry just written. We match
  // by the ISO date stamp captured in ruleNotePanel.violationDate.
  const saveRuleBreakingNote = useCallback(async () => {
    const { ruleId, note, violationDate } = ruleNotePanel;
    if (!ruleId || !violationDate || !note.trim()) {
      setRuleNotePanel({ ruleId: null, note: '', violationDate: null });
      return;
    }
    try {
      const rule = lessons.find(l => l.id === ruleId);
      if (!rule) return;
      const violations = (Array.isArray(rule.violations) ? rule.violations : []).map(v => {
        const d = v?.date || v?.timestamp;
        if (d === violationDate) return { ...v, note: note.trim() };
        return v;
      });
      await updateData('hardLessons', ruleId, { violations });
      await loadHardLessons();
      ouraToast.success('Context saved');
    } catch (err) {
      logger.error('saveRuleBreakingNote failed:', err?.message);
      ouraToast.error('Failed to save context');
    } finally {
      setRuleNotePanel({ ruleId: null, note: '', violationDate: null });
    }
  }, [ruleNotePanel, lessons]);

  const dismissRuleBreakingNote = useCallback(() => {
    setRuleNotePanel({ ruleId: null, note: '', violationDate: null });
  }, []);

  // BER-131: send rule to the Kill List intake form. Per the cross-module
  // rule, no doc is written here — we stash the prefill and navigate so the
  // user reviews the target on the Ledger page and chooses to initiate.
  const addToKillListFromBridge = () => {
    if (!bridgePrompt.ruleText.trim()) return;
    const daysRaw = parseInt(bridgePrompt.consecutiveDaysRequired, 10);
    const days = Number.isFinite(daysRaw) && daysRaw >= 21 ? daysRaw : 30;
    try {
      sessionStorage.setItem('kl_extraction_prefill', JSON.stringify({
        targetTitle: bridgePrompt.ruleText.trim(),
        consecutiveDaysRequired: days,
        fromHardLessonId: bridgePrompt.lessonId,
      }));
    } catch { /* ignore storage errors */ }
    setBridgePrompt(prev => ({ ...prev, visible: false }));
    navigate('/ledger');
  };

  const addToKillListFromLesson = (lesson) => {
    if (!lesson.ruleGoingForward?.trim()) return;
    try {
      sessionStorage.setItem('kl_extraction_prefill', JSON.stringify({
        targetTitle: lesson.ruleGoingForward.trim(),
        fromHardLessonId: lesson.id,
      }));
    } catch { /* ignore storage errors */ }
    navigate('/ledger');
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
        .map(([type, rules]) => {
          const label = costCategories.find(c => c.value === type)?.label || type;
          return `${label}: ${rules.join('; ')}`;
        })
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

  const handleCostToggle = (costValue) => {
    setNewLesson(prev => ({
      ...prev,
      costs: prev.costs.includes(costValue)
        ? prev.costs.filter(c => c !== costValue)
        : [...prev.costs, costValue]
    }));
  };

  const validateLesson = () => {
    const fieldLabels = {
      eventCategory: 'Event Category',
      eventDescription: 'Event Description',
      myAssumption: 'My Assumption',
      signalIgnored: 'Signal Ignored',
      costDescription: 'Cost Description',
      extractedLesson: 'Extracted Lesson',
      ruleGoingForward: 'Rule Going Forward',
    };

    const required = [
      'eventCategory',
      'eventDescription',
      'myAssumption',
      'signalIgnored',
      'costDescription',
      'extractedLesson',
      'ruleGoingForward'
    ];

    for (const field of required) {
      if (!newLesson[field]?.trim()) {
        ouraToast.warning(`Please complete: ${fieldLabels[field] ?? field}`);
        return false;
      }
    }

    if (newLesson.costs.length === 0) {
      ouraToast.warning('Please select at least one cost category');
      return false;
    }

    return true;
  };

  const handleOracleReaction = (reactionId) => {
    setPendingOracleReaction(reactionId);
  };

  const seekOracleExtraction = async () => {
    if (!validateLesson()) return;

    setPendingOracleReaction(null);
    setPendingOracleWisdom('');
    setPendingOracleClosingQuestion(null);
    openOracleLoading();

    try {
      const extractionPrompt = `
Event: ${newLesson.eventDescription}
My Assumption: ${newLesson.myAssumption}
Signal Ignored: ${newLesson.signalIgnored}
Cost: ${newLesson.costDescription}
Category: ${eventCategories.find(cat => cat.value === newLesson.eventCategory)?.label}

Please help extract the core lesson and rule from this experience.
`;

      const { text: oracleWisdom, closingQuestion } = await generateAIFeedback('hardLessons', extractionPrompt, lessons.slice(-3));
      setPendingOracleWisdom(oracleWisdom);
      setPendingOracleClosingQuestion(closingQuestion || null);
      openOracleWithContent(oracleWisdom, getCachedTotalEntryCount(), null, newLesson.eventDescription, 'hard_lessons');

    } catch (error) {
      logger.error('Error seeking Oracle extraction:', error);
      openOracleWithContent('Oracle unavailable. Extract your own lesson from the data.');
    }
  };

  const submitLesson = async (finalize = false) => {
    if (!validateLesson()) return;
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);

    try {
      const lessonData = {
        ...newLesson,
        isFinalized: finalize,
        finalizedAt: finalize ? new Date().toISOString() : null,
        isRuleViolation: pendingViolation.isRuleViolation,
        violatedRuleId: pendingViolation.violatedRuleId,
        ...(pendingOracleReaction ? { oracleReaction: pendingOracleReaction } : {}),
        ...(pendingOracleWisdom ? { oracleWisdom: pendingOracleWisdom } : {}),
        ...(pendingOracleClosingQuestion ? { oracleClosingQuestion: pendingOracleClosingQuestion } : {})
      };

      if (editingLesson) {
        // Handle edits with immutability constraints
        if (editingLesson.isFinalized) {
          ouraToast.info('Finalized lessons cannot be edited. Create a new entry if the rule was violated again.');
          setLoading(false);
          return;
        }

        lessonData.originalCreatedAt = editingLesson.createdAt;
        await updateData('hardLessons', editingLesson.id, lessonData);
      } else {
        await writeData('hardLessons', lessonData);
      }

      await loadHardLessons();

      // BER-131: bridge trigger 1 — rule violation → Kill List prompt
      if (finalize && lessonData.isRuleViolation && lessonData.ruleGoingForward?.trim()) {
        const dismissKey = `bridge_dismissed_${editingLesson?.id || 'new'}`;
        const alreadyDismissed = sessionStorage.getItem(dismissKey);
        if (!alreadyDismissed) {
          const violationCount = lessons.filter(l => l.isRuleViolation && l.violatedRuleId === lessonData.violatedRuleId).length;
          const suggestedDays = violationCount >= 2 ? 60 : 30;
          setBridgePrompt({ visible: true, ruleText: lessonData.ruleGoingForward, consecutiveDaysRequired: suggestedDays, lessonId: editingLesson?.id || null });
        }
      }

      resetForm();

      if (finalize) {
        ouraToast.success('Hard Lesson finalized and locked');
      } else {
        ouraToast.success('Hard Lesson saved');
      }

    } catch (error) {
      logger.error('Error saving Hard Lesson:', error);
      if (redirectIfAuthLost(error)) return;
      ouraToast.error('Failed to save Hard Lesson');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const resetForm = () => {
    setNewLesson({
      eventCategory: '',
      eventDescription: '',
      myAssumption: '',
      signalIgnored: '',
      costs: [],
      costDescription: '',
      extractedLesson: '',
      ruleGoingForward: '',
      isFinalized: false,
      isRuleViolation: false,
      violatedRuleId: null,
    });
    setShowForm(false);
    setEditingLesson(null);
    setPendingOracleWisdom('');
    setPendingOracleReaction(null);
    setPendingOracleClosingQuestion(null);
    setPendingViolation({ isRuleViolation: false, violatedRuleId: null });
    setViolationPrompt({ visible: false, matchedRule: null });
    violationCheckedRef.current = '';
  };

  const editLesson = (lesson) => {
    if (lesson.isFinalized) {
      ouraToast.info('This lesson is finalized. Create a new entry if the rule was violated again.');
      return;
    }

    setNewLesson({ ...lesson, isScarStub: false, isWeeklyAutopsy: false });
    setEditingLesson(lesson);
    setShowForm(true);
  };

  const deleteLesson = async (lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId);
    const lessonIndex = lessons.findIndex(l => l.id === lessonId);

    if (lesson?.isFinalized) {
      ouraToast.info('Finalized lessons cannot be archived. They are permanent strategic assets.');
      return;
    }
    if (!lesson) return;

    setLessons(prev => prev.filter(l => l.id !== lessonId));
    try {
      await archiveEntry('hardLessons', lesson);
      ouraToast.success('Lesson archived');
    } catch (error) {
      logger.error('Error archiving Hard Lesson:', error);
      setLessons(prev => {
        if (prev.some(l => l.id === lessonId)) return prev;
        const next = [...prev];
        next.splice(Math.min(lessonIndex, next.length), 0, lesson);
        return next;
      });
      ouraToast.error('Failed to archive lesson');
    }
  };

  const restoreArchivedLesson = async (archived) => {
    try {
      await restoreEntry('hardLessons', archived);
      setLessons(prev => [{ ...archived, archivedAt: undefined }, ...prev]);
      ouraToast.success('Lesson restored');
    } catch (error) {
      logger.error('Error restoring Hard Lesson:', error);
      if (redirectIfAuthLost(error)) return;
      // Refresh from server so the active list reflects truth.
      loadHardLessons();
      ouraToast.error('Failed to restore lesson');
    }
  };

  const permanentlyDeleteArchivedLesson = async (archived) => {
    if (!window.confirm('Permanently delete this lesson? This cannot be undone.')) return;
    try {
      await deleteArchivedEntry('hardLessons', archived);
      ouraToast.success('Lesson permanently deleted');
    } catch (error) {
      logger.error('Error permanently deleting Hard Lesson:', error);
      ouraToast.error('Failed to delete lesson');
    }
  };

  // Derive which of the 7 form fields are complete
  const formSteps = [
    { key: 'eventCategory',    label: 'Category',   done: !!newLesson.eventCategory },
    { key: 'eventDescription', label: 'Event',       done: !!newLesson.eventDescription?.trim() },
    { key: 'myAssumption',     label: 'Assumption',  done: !!newLesson.myAssumption?.trim() },
    { key: 'signalIgnored',    label: 'Signal',      done: !!newLesson.signalIgnored?.trim() },
    { key: 'costs',            label: 'Cost',        done: newLesson.costs.length > 0 && !!newLesson.costDescription?.trim() },
    { key: 'extractedLesson',  label: 'Lesson',      done: !!newLesson.extractedLesson?.trim() },
    { key: 'ruleGoingForward', label: 'Rule',        done: !!newLesson.ruleGoingForward?.trim() },
  ];
  const completedSteps = formSteps.filter(s => s.done).length;

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
            Forensic extraction of irreversible signal from irreversible pain
          </p>
          <div className="oura-card p-4 border-l-4 border-[#f59e0b]">
            <p className="text-sm text-[#ababab]">
              <span className="text-[#f59e0b] font-semibold">Purpose:</span> Ensure the same lesson is never paid for twice. Memory with teeth.
            </p>
          </div>
          <p className="text-[#858585] text-xs mt-3">Lesson maps to active pattern → <Link to="/ledger" className="text-[#ababab] hover:text-white transition-colors">General Ledger</Link></p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="oura-card p-3 sm:p-6 text-center">
            <div className="text-[#858585] text-[10px] sm:text-xs uppercase tracking-widest mb-2">Total Lessons</div>
            <div className="oura-score text-white">{lessons.length}</div>
          </div>
          <div className="oura-card p-3 sm:p-6 text-center">
            <div className="text-[#858585] text-[10px] sm:text-xs uppercase tracking-widest mb-2">Finalized</div>
            <div className="oura-score text-[#22c55e]">{lessons.filter(l => l.isFinalized).length}</div>
          </div>
          <div className="oura-card p-3 sm:p-6 text-center">
            <div className="text-[#858585] text-[10px] sm:text-xs uppercase tracking-widest mb-2">Draft</div>
            <div className="oura-score text-[#f59e0b]">{lessons.filter(l => !l.isFinalized).length}</div>
          </div>
        </div>

        {/* Cost type distribution */}
        {costFrequency.length >= 2 && (
          <div className="oura-card p-5 mb-8 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <h3 className="text-xs text-[#858585] uppercase tracking-widest mb-4">Cost Distribution</h3>
            <div className="space-y-2.5">
              {costFrequency.map(({ value, label, icon, count }) => {
                const maxCount = costFrequency[0].count;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={value} className="flex items-center gap-3">
                    <div className="text-sm w-4 shrink-0">{icon}</div>
                    <div className="text-[#ababab] text-xs w-28 shrink-0 truncate">{label}</div>
                    <div className="flex-1 bg-[#1a1a1a] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-[#f59e0b] transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[#858585] text-xs w-4 text-right shrink-0">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mb-8 animate-fade-in-up flex flex-wrap gap-3" style={{ animationDelay: '0.2s' }}>
          <button
            onClick={() => { setShowForm(!showForm); setShowRulesLibrary(false); }}
            className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] text-white rounded-2xl transition-all duration-300 font-medium"
          >
            {showForm ? 'Cancel' : '⚡ Extract New Lesson'}
          </button>
          {lessons.some(l => l.isFinalized && l.ruleGoingForward) && (
            <button
              onClick={() => { setShowRulesLibrary(!showRulesLibrary); setShowForm(false); }}
              className={`px-6 py-3 rounded-2xl transition-all duration-300 font-medium border ${showRulesLibrary ? 'bg-white text-black border-white' : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#f59e0b] hover:text-white'}`}
            >
              📋 Rules Library ({lessons.filter(l => l.isFinalized && l.ruleGoingForward).length})
            </button>
          )}
        </div>

      {/* Lesson Extraction Form */}
      {showForm && (
        <div className="oura-card p-8 mb-8 border-l-4 border-[#f59e0b] animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-white">
              {editingLesson ? 'Edit Hard Lesson (Draft)' : 'Extract Hard Lesson'}
            </h2>
            <span className="text-sm text-[#858585] font-light tabular-nums">
              <span className={completedSteps === 7 ? 'text-[#22c55e]' : 'text-[#f59e0b]'}>
                {completedSteps}
              </span>
              <span>/7 complete</span>
            </span>
          </div>

          {/* Step progress bar */}
          <div className="mb-8">
            <div className="flex items-center gap-1.5 mb-2">
              {formSteps.map((step, i) => (
                <div key={step.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                    step.done ? 'bg-[#f59e0b]' : 'bg-[#1a1a1a]'
                  }`} />
                  <span className={`text-[9px] uppercase tracking-wide leading-none transition-colors duration-200 ${
                    step.done ? 'text-[#f59e0b]' : 'text-[#858585]'
                  }`}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          {newLesson.isOracleFailed && (
            <div className="mb-6 px-4 py-3 rounded-xl border border-[#ef4444]/30 bg-[#ef4444]/5 text-sm text-[#ef4444]">
              Oracle extraction failed. The event description below is raw journal content — edit it before finalizing.
            </div>
          )}

          <div className="space-y-6">
            {/* Event Category */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-4">
                <span className={newLesson.eventCategory ? 'text-[#f59e0b]' : 'text-[#ababab]'}>Event Category</span>
                {newLesson.eventCategory && <span className="text-[#22c55e] text-xs">✓</span>}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {eventCategories.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setNewLesson(prev => ({ ...prev, eventCategory: cat.value }))}
                    className={`p-4 rounded-2xl border transition-all duration-300 text-left ${
                      newLesson.eventCategory === cat.value
                        ? 'border-[#f59e0b] bg-[#f59e0b]/10 scale-105'
                        : 'border-[#1a1a1a] hover:border-[#2a2a2a] bg-[#0a0a0a]'
                    }`}
                  >
                    <div className="text-xl mb-2">{cat.icon}</div>
                    <div className="text-xs text-[#ababab]">{cat.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* The Event */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.eventDescription?.trim() ? 'text-[#f59e0b]' : 'text-[#ababab]'}>The Event</span>
                {newLesson.eventDescription?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#858585] mb-3">What actually happened (no interpretation, just facts)</p>
              {newLesson.isRuleViolation && newLesson.violatedRuleId && (
                <div className="mb-3 px-4 py-2 rounded-xl bg-red-900/20 border border-red-500/30 text-red-400 text-xs">
                  Rule violation flagged — this event will be marked as a repeated breach.
                </div>
              )}
              <textarea
                id="hard-lessons-event"
                value={newLesson.eventDescription}
                onChange={(e) => setNewLesson(prev => ({ ...prev, eventDescription: e.target.value }))}
                onBlur={handleEventDescriptionBlur}
                rows={3}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="Describe the concrete event that occurred..."
              />
            </div>

            {/* My Assumption */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.myAssumption?.trim() ? 'text-[#f59e0b]' : 'text-[#ababab]'}>My Assumption</span>
                {newLesson.myAssumption?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#858585] mb-3">What you believed that turned out to be false</p>
              <textarea
                value={newLesson.myAssumption}
                onChange={(e) => setNewLesson(prev => ({ ...prev, myAssumption: e.target.value }))}
                rows={2}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="I assumed that..."
              />
            </div>

            {/* The Signal I Ignored */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.signalIgnored?.trim() ? 'text-[#f59e0b]' : 'text-[#ababab]'}>The Signal I Ignored</span>
                {newLesson.signalIgnored?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#858585] mb-3">The warning you noticed but discounted</p>
              <textarea
                value={newLesson.signalIgnored}
                onChange={(e) => setNewLesson(prev => ({ ...prev, signalIgnored: e.target.value }))}
                rows={2}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="I ignored the signal that..."
              />
            </div>

            {/* The Cost */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={(newLesson.costs.length > 0 && newLesson.costDescription?.trim()) ? 'text-[#f59e0b]' : 'text-[#ababab]'}>The Cost</span>
                {(newLesson.costs.length > 0 && newLesson.costDescription?.trim()) ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#858585] mb-3">Real consequences (select all that apply)</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {costCategories.map(cost => (
                  <button
                    key={cost.value}
                    type="button"
                    onClick={() => handleCostToggle(cost.value)}
                    className={`p-3 rounded-xl border text-left text-sm transition-all duration-300 ${
                      newLesson.costs.includes(cost.value)
                        ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-white scale-105'
                        : 'border-[#1a1a1a] hover:border-[#2a2a2a] text-[#ababab] bg-[#0a0a0a]'
                    }`}
                  >
                    <span className="mr-2">{cost.icon}</span>
                    {cost.label}
                  </button>
                ))}
              </div>

              <textarea
                value={newLesson.costDescription}
                onChange={(e) => setNewLesson(prev => ({ ...prev, costDescription: e.target.value }))}
                rows={2}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors resize-none"
                placeholder="Describe the specific costs you paid..."
              />
            </div>

            {/* The Lesson */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.extractedLesson?.trim() ? 'text-[#f59e0b]' : 'text-[#ababab]'}>The Lesson</span>
                {newLesson.extractedLesson?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#858585] mb-3">One sentence. Brutally precise.</p>
              <input
                type="text"
                value={newLesson.extractedLesson}
                onChange={(e) => setNewLesson(prev => ({ ...prev, extractedLesson: e.target.value }))}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
                placeholder="The core lesson is..."
              />
            </div>

            {/* The Rule Going Forward */}
            <div>
              <label className="flex items-center gap-2 text-sm uppercase tracking-wider mb-3">
                <span className={newLesson.ruleGoingForward?.trim() ? 'text-[#f59e0b]' : 'text-[#ababab]'}>The Rule Going Forward</span>
                {newLesson.ruleGoingForward?.trim() ? <span className="text-[#22c55e] text-xs">✓</span> : <span className="text-[#f59e0b]">*</span>}
              </label>
              <p className="text-xs text-[#858585] mb-3">An enforceable constraint, not advice</p>
              <input
                type="text"
                value={newLesson.ruleGoingForward}
                onChange={(e) => setNewLesson(prev => ({ ...prev, ruleGoingForward: e.target.value }))}
                className="w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
                placeholder='If... then... / Always... / Never...'
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-3 pt-6 border-t border-[#1a1a1a] max-sm:sticky max-sm:bottom-16 max-sm:bg-black/95 max-sm:backdrop-blur-sm max-sm:z-10 max-sm:pb-3">
              <button
                onClick={() => submitLesson(false)}
                disabled={loading}
                className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-white rounded-2xl transition-all duration-300 font-medium"
              >
                {loading ? 'Saving...' : 'Save Draft'}
              </button>

              <button
                onClick={() => submitLesson(true)}
                disabled={loading}
                className="px-6 py-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-white rounded-2xl transition-all duration-300 font-medium"
              >
                {loading ? 'Finalizing...' : 'Finalize Lesson'}
              </button>

              <button
                onClick={seekOracleExtraction}
                disabled={loading}
                className="px-6 py-3 bg-[#a855f7] hover:bg-[#9333ea] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-white rounded-2xl transition-all duration-300 font-medium"
              >
                🔮 Ask Oracle to Extract Lesson & Rule
              </button>

              <button
                onClick={resetForm}
                className="px-6 py-3 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-[#ababab] rounded-2xl transition-all duration-300 font-medium border border-[#1a1a1a]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BER-131: Kill List Bridge Prompt */}
      {bridgePrompt.visible && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl max-w-lg w-full p-8">
            <h3 className="text-white text-lg font-light mb-2">Rule violated. Add it to the Ledger?</h3>
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-5">A rule in writing that doesn't produce behavioral warfare is decoration.</p>
            <input
              type="text"
              value={bridgePrompt.ruleText}
              onChange={(e) => setBridgePrompt(prev => ({ ...prev, ruleText: e.target.value }))}
              className="w-full p-4 bg-[#0f0f0f] text-white rounded-xl border border-[#2a2a2a] focus:border-[#f59e0b] focus:outline-none transition-colors text-sm mb-4"
            />
            <div className="mb-6">
              <label className="block text-[#ababab] text-xs uppercase tracking-widest mb-2">Consecutive Days Required</label>
              <input
                type="number"
                min={21}
                step={1}
                value={bridgePrompt.consecutiveDaysRequired}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') { setBridgePrompt(prev => ({ ...prev, consecutiveDaysRequired: '' })); return; }
                  const n = parseInt(raw, 10);
                  setBridgePrompt(prev => ({ ...prev, consecutiveDaysRequired: Number.isFinite(n) ? n : '' }));
                }}
                onBlur={() => {
                  const n = parseInt(bridgePrompt.consecutiveDaysRequired, 10);
                  if (!Number.isFinite(n) || n < 21) setBridgePrompt(prev => ({ ...prev, consecutiveDaysRequired: 21 }));
                }}
                className="w-full p-3 bg-[#0f0f0f] text-white rounded-xl border border-[#2a2a2a] focus:border-[#f59e0b] focus:outline-none transition-colors text-sm tabular-nums"
              />
              <p className="text-[#858585] text-xs mt-2">
                Kill requires {Number.isFinite(parseInt(bridgePrompt.consecutiveDaysRequired, 10)) ? Math.max(21, parseInt(bridgePrompt.consecutiveDaysRequired, 10)) : 21} consecutive days of held execution. Minimum 21.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={addToKillListFromBridge} className="flex-1 px-5 py-3 bg-[#f59e0b] hover:bg-[#ea580c] text-white rounded-xl font-medium transition-colors">Add to Ledger</button>
              <button onClick={() => {
                if (bridgePrompt.lessonId) sessionStorage.setItem(`bridge_dismissed_${bridgePrompt.lessonId}`, '1');
                setBridgePrompt(prev => ({ ...prev, visible: false }));
              }} className="px-5 py-3 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#ababab] hover:text-white rounded-xl font-medium transition-colors">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Rule Violation Overlay */}
      {violationPrompt.visible && violationPrompt.matchedRule && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl max-w-lg w-full p-8">
            <h3 className="text-white text-lg font-light mb-2">Rule match detected</h3>
            <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">You have a prior rule that may apply to this event</p>
            <div className="bg-[#0f0f0f] border-l-4 border-[#f59e0b] rounded-r-xl p-4 mb-6">
              <p className="text-[#fbbf24] text-sm leading-relaxed">{violationPrompt.matchedRule.ruleGoingForward}</p>
              <p className="text-[#858585] text-xs mt-2">From: {violationPrompt.matchedRule.extractedLesson}</p>
            </div>
            <p className="text-white text-base mb-6">Was this rule in effect when this happened?</p>
            <div className="flex gap-3">
              <button
                onClick={() => handleViolationConfirm(true)}
                className="flex-1 px-5 py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-xl font-medium transition-colors"
              >
                Yes — rule violated
              </button>
              <button
                onClick={() => handleViolationConfirm(false)}
                className="flex-1 px-5 py-3 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#ababab] hover:text-white rounded-xl font-medium transition-colors"
              >
                No — different situation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Library */}
      {showRulesLibrary && (
        <div className="mb-8 animate-fade-in-up">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
            <h2 className="text-2xl font-light text-white tracking-tight flex-1">Rules Library</h2>
            <input
              type="search"
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
              placeholder="Search rules..."
              className="w-full sm:w-64 px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors text-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setLibraryFilterCost('')} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${!libraryFilterCost ? 'bg-[#f59e0b] text-black font-medium' : 'bg-[#1a1a1a] text-[#ababab] hover:text-white'}`}>All Costs</button>
            {costCategories.map(c => (
              <button key={c.value} onClick={() => setLibraryFilterCost(libraryFilterCost === c.value ? '' : c.value)} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${libraryFilterCost === c.value ? 'bg-[#f59e0b] text-black font-medium' : 'bg-[#1a1a1a] text-[#ababab] hover:text-white'}`}>{c.icon} {c.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setLibraryFilterCategory('')} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${!libraryFilterCategory ? 'bg-[#2a2a2a] text-white' : 'bg-[#1a1a1a] text-[#ababab] hover:text-white'}`}>All Categories</button>
            {eventCategories.map(c => (
              <button key={c.value} onClick={() => setLibraryFilterCategory(libraryFilterCategory === c.value ? '' : c.value)} className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${libraryFilterCategory === c.value ? 'bg-[#2a2a2a] text-white' : 'bg-[#1a1a1a] text-[#ababab] hover:text-white'}`}>{c.icon} {c.label}</button>
            ))}
          </div>

          {/* Cost Pattern Narrative */}
          <div className="oura-card p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs text-[#858585] uppercase tracking-widest">Cost Pattern Analysis</h4>
              <button
                onClick={generateCostPatternNarrative}
                disabled={loadingNarrative}
                className="px-4 py-1.5 text-xs bg-[#1a1a1a] text-[#a855f7] border border-[#a855f7]/30 rounded-lg hover:bg-[#a855f7]/10 transition-colors disabled:opacity-40"
              >
                {loadingNarrative ? 'Analyzing...' : '🔮 Generate Pattern'}
              </button>
            </div>
            {costPatternNarrative ? (
              <p className="text-[#ababab] text-sm leading-relaxed">{costPatternNarrative}</p>
            ) : (
              <p className="text-[#858585] text-sm">Pattern identification across all finalized rules, grouped by cost type.</p>
            )}
          </div>

          {/* Rules List */}
          {finalizedRules.length === 0 ? (
            <div className="oura-card p-8 text-center">
              <p className="text-[#858585] text-sm">No rules match the current filter.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {finalizedRules.map(({ id, rule, lesson, violationCount }) => {
                const category = eventCategories.find(c => c.value === lesson.eventCategory);
                const lessonCosts = costCategories.filter(c => lesson.costs?.includes(c.value));
                const noteOpen = ruleNotePanel.ruleId === id;
                return (
                  <div key={id} className={`oura-card p-5 ${violationCount > 0 ? 'border-red-500/40' : 'border-[#f59e0b]/20'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-[#fbbf24] font-medium leading-relaxed border-l-4 border-[#f59e0b] pl-3">{rule}</p>
                        <p className="text-[#858585] text-xs mt-2">{lesson.extractedLesson}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          {category && <span className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">{category.icon} {category.label}</span>}
                          {lessonCosts.map(c => <span key={c.value} className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">{c.icon} {c.label}</span>)}
                          <span className="text-[10px] text-[#858585]">{new Date(lesson.finalizedAt || lesson.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      {violationCount > 0 && (
                        <div className="shrink-0 text-center">
                          <div className="text-red-400 text-xl font-light tabular-nums">{violationCount}</div>
                          <div className="text-red-500/60 text-[10px] uppercase tracking-wider">violation{violationCount !== 1 ? 's' : ''}</div>
                        </div>
                      )}
                    </div>

                    {/* Direct violation logger. Single-tap commits the
                        violation to violations[] + lastViolatedAt; the note
                        panel below is an optional add-on. */}
                    <div className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center justify-end">
                      <button
                        onClick={() => markRuleBroken(lesson)}
                        disabled={noteOpen}
                        className="px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Rule broken
                      </button>
                    </div>

                    {noteOpen && (
                      <div className="mt-3 p-3 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl">
                        <div className="text-[#858585] text-[10px] uppercase tracking-widest mb-2">
                          Logged at {new Date(ruleNotePanel.violationDate).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Add context?
                        </div>
                        <textarea
                          value={ruleNotePanel.note}
                          onChange={(e) => setRuleNotePanel(prev => ({ ...prev, note: e.target.value }))}
                          rows={2}
                          placeholder="What broke it? Optional."
                          className="w-full p-2 bg-[#050505] text-white rounded-lg border border-[#1a1a1a] focus:border-[#b45309] focus:outline-none resize-none text-sm placeholder-[#555555]"
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button
                            onClick={dismissRuleBreakingNote}
                            className="px-3 py-1.5 text-xs text-[#858585] hover:text-[#ababab] transition-colors"
                          >
                            Skip
                          </button>
                          <button
                            onClick={saveRuleBreakingNote}
                            disabled={!ruleNotePanel.note.trim()}
                            className="px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Save context
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
              {view === 'archive' ? 'Archive' : 'Extracted Lessons'}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search lessons..."
                className="w-full px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#858585] hover:text-white text-xs"
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
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{l.eventDescription || 'Untitled lesson'}</p>
                    {l.extractedLesson && <p className="text-[#858585] text-xs mt-2">{l.extractedLesson}</p>}
                    <p className="text-[#858585] text-xs mt-2">
                      Archived {l.archivedAt ? new Date(l.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => restoreArchivedLesson(l)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/10 transition-colors"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => permanentlyDeleteArchivedLesson(l)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors"
                    >
                      Delete permanently
                    </button>
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
                <p className="text-[#ef4444] mb-4 text-sm">Failed to load hard lessons. Please check your connection.</p>
                <button
                  onClick={loadHardLessons}
                  className="px-5 py-2.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            ) : filteredLessons.length > 0 ? (
              <div className="space-y-4">
                {filteredLessons.map((lesson) => {
                  const category = eventCategories.find(cat => cat.value === lesson.eventCategory);
                  const selectedCosts = costCategories.filter(cost => lesson.costs?.includes(cost.value));

                  // Weekly autopsy stubs get a compact card with "Expand Autopsy" CTA
                  if (lesson.isWeeklyAutopsy && !lesson.isFinalized) {
                    return (
                      <div key={lesson.id} className="oura-card p-5 border-dashed border-[#6366f1]/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#6366f1] text-xs uppercase tracking-widest font-medium">Weekly Autopsy</span>
                              <span className="text-[#858585] text-xs">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-[#d1d1d1] text-sm leading-relaxed truncate">{lesson.eventDescription}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <button
                              onClick={() => editLesson(lesson)}
                              className="px-4 py-2 text-xs font-medium bg-[#6366f1]/10 text-[#6366f1] border border-[#6366f1]/30 rounded-xl hover:bg-[#6366f1]/20 transition-colors"
                            >
                              Expand Autopsy
                            </button>
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              className="w-8 h-8 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors text-xs"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Scar stubs get a compact card
                  if (lesson.isScarStub && !lesson.extractedLesson) {
                    return (
                      <div key={lesson.id} className="oura-card p-5 border-dashed border-[#f59e0b]/30">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[#f59e0b] text-xs uppercase tracking-widest font-medium">Scar</span>
                              <span className="text-[#858585] text-xs">{new Date(lesson.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-[#d1d1d1] text-sm leading-relaxed truncate">{lesson.eventDescription}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-4 shrink-0">
                            <button
                              onClick={() => editLesson(lesson)}
                              className="px-4 py-2 text-xs font-medium bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30 rounded-xl hover:bg-[#f59e0b]/20 transition-colors"
                            >
                              Extract Lesson
                            </button>
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              className="w-8 h-8 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors text-xs"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={lesson.id} className={`oura-card p-6 ${
                      lesson.isFinalized
                        ? 'border-[#f59e0b]/50'
                        : 'border-[#f59e0b]/20'
                    }`}>
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center">
                            <span className="text-2xl">{category?.icon || '⚡'}</span>
                          </div>
                          <div>
                            <h3 className="text-white font-medium">{category?.label || 'Uncategorized'}</h3>
                            <div className="flex items-center space-x-3 text-xs text-[#858585] mt-1">
                              <span>{new Date(lesson.createdAt).toLocaleDateString()}</span>
                              <span className={`px-2 py-1 rounded-lg ${
                                lesson.isFinalized
                                  ? 'bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/30'
                                  : 'bg-[#8a8a8a]/10 text-[#ababab] border border-[#2a2a2a]'
                              }`}>
                                {lesson.isFinalized ? '🔒 FINALIZED' : '📝 DRAFT'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex space-x-2 items-center">
                          {!lesson.isFinalized && (
                            <button
                              onClick={() => editLesson(lesson)}
                              className="w-8 h-8 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-full bg-[#f59e0b]/10 text-[#f59e0b] hover:bg-[#f59e0b]/20 transition-colors"
                            >
                              ✏️
                            </button>
                          )}
                          {!lesson.isFinalized && (
                            <button
                              onClick={() => deleteLesson(lesson.id)}
                              className="w-8 h-8 max-sm:w-11 max-sm:h-11 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
                            >
                              🗑️
                            </button>
                          )}
                          {lesson.isFinalized && (
                            <span className="text-[#ababab] text-xs">Permanent record. Create a new entry if the rule was violated again.</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div>
                          <h4 className="text-[#ababab] text-xs uppercase tracking-wider mb-2">The Event</h4>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.eventDescription}</p>
                        </div>

                        <div>
                          <h4 className="text-[#ababab] text-xs uppercase tracking-wider mb-2">My Assumption</h4>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.myAssumption}</p>
                        </div>

                        <div>
                          <h4 className="text-[#ababab] text-xs uppercase tracking-wider mb-2">The Signal I Ignored</h4>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.signalIgnored}</p>
                        </div>

                        <div>
                          <h4 className="text-[#ababab] text-xs uppercase tracking-wider mb-2">The Cost</h4>
                          <div className="flex items-center gap-2 mb-3">
                            {selectedCosts.map(cost => (
                              <span key={cost.value} className="px-2 py-1 bg-[#0a0a0a] text-[#ababab] rounded-lg text-xs border border-[#1a1a1a]">
                                {cost.icon} {cost.label}
                              </span>
                            ))}
                          </div>
                          <p className="text-[#d1d1d1] leading-relaxed">{lesson.costDescription}</p>
                        </div>

                        <div className="border-t border-[#1a1a1a] pt-5">
                          <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wider">The Lesson</h4>
                          <p className="text-[#f59e0b] font-medium leading-relaxed">{lesson.extractedLesson}</p>
                        </div>

                        <div>
                          <h4 className="text-white font-medium mb-2 text-sm uppercase tracking-wider">The Rule Going Forward</h4>
                          <p className="text-[#fbbf24] font-medium border-l-4 border-[#f59e0b] pl-4 bg-[#f59e0b]/10 py-3 rounded-r-xl leading-relaxed">
                            {lesson.ruleGoingForward}
                          </p>
                        </div>

                        {/* BER-131: Add to Ledger */}
                        {lesson.isFinalized && lesson.ruleGoingForward?.trim() && (
                          <button
                            onClick={() => addToKillListFromLesson(lesson)}
                            className="w-full px-4 py-2.5 bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 text-[#fbbf24] border border-[#f59e0b]/30 rounded-xl text-xs font-medium transition-colors text-left"
                          >
                            + Add to Ledger
                          </button>
                        )}

                        {/* Rule violation indicator */}
                        {lesson.isRuleViolation && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-red-900/20 border border-red-500/30 rounded-xl">
                            <span className="text-red-400 text-xs font-medium uppercase tracking-wider">Rule Violation</span>
                          </div>
                        )}

                        {/* Oracle wisdom — saved from extraction */}
                        {lesson.oracleWisdom && typeof lesson.oracleWisdom === 'string' && (
                          <div className="border-t border-[#1a1a1a] pt-5">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" />
                              <h4 className="text-[#858585] font-medium text-xs uppercase tracking-wider">Oracle</h4>
                            </div>
                            <p className="text-[#ababab] text-sm leading-relaxed">{lesson.oracleWisdom}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div>
                {searchQuery.trim() ? (
                  <div className="oura-card p-12 text-center">
                    <h3 className="text-lg font-light text-white mb-2">{`No matches for "${searchQuery.trim()}"`}</h3>
                    <p className="text-[#858585] mb-6 text-sm">Try a different keyword or clear the search.</p>
                    <button
                      onClick={() => setSearchQuery('')}
                      className="px-6 py-3 bg-transparent border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                    >
                      Clear Search
                    </button>
                  </div>
                ) : showScarFlow ? (
                  /* ── Scar Inventory: first-time guided flow ── */
                  <div className="oura-card p-8 border-l-4 border-[#f59e0b] animate-fade-in-up">
                    <h2 className="text-2xl font-light text-white mb-2">Before you extract your first lesson, name 3 events that left you scarred.</h2>
                    <p className="text-[#858585] text-sm mb-8">No analysis. No explanation. Just name the events. You can extract the full lesson later.</p>

                    <div className="space-y-4">
                      {scarInventory.map((scar, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[#f59e0b] text-sm font-medium tabular-nums w-5 shrink-0">{i + 1}.</span>
                          <input
                            type="text"
                            value={scar}
                            onChange={(e) => setScarInventory(prev => {
                              const next = [...prev];
                              next[i] = e.target.value;
                              return next;
                            })}
                            placeholder={
                              i === 0 ? 'The trust I gave that was used against me...' :
                              i === 1 ? 'The warning I ignored that cost me...' :
                              'The decision I made that changed everything...'
                            }
                            className="flex-1 p-4 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors placeholder-[#555555]"
                            autoFocus={i === 0}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3 mt-8">
                      <button
                        onClick={submitScarInventory}
                        disabled={savingScars || scarInventory.every(s => !s.trim())}
                        className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-white rounded-2xl transition-all duration-300 font-medium"
                      >
                        {savingScars ? 'Saving...' : 'Record These Scars'}
                      </button>
                      <button
                        onClick={() => {
                          sessionStorage.setItem('scar_flow_skipped', 'true');
                          setShowScarFlow(false);
                          setShowForm(true);
                          setTimeout(() => {
                            document.getElementById('hard-lessons-event')?.focus();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }, 0);
                        }}
                        className="px-6 py-3 bg-transparent border border-[#1a1a1a] text-[#858585] hover:text-white hover:border-[#2a2a2a] rounded-2xl transition-all duration-300 font-medium"
                      >
                        Skip — I'll extract a full lesson now
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Standard empty state (after scar flow dismissed or skipped) ── */
                  <div className="oura-card p-12 text-center">
                    <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center text-2xl">
                      ⚡
                    </div>
                    <h3 className="text-lg font-light text-white mb-2">No Hard Lessons Extracted Yet</h3>
                    <p className="text-[#858585] mb-6 text-sm">Turn a painful event into an enforceable rule you never pay for twice.</p>
                    <button
                      onClick={() => {
                        setShowForm(true);
                        setTimeout(() => {
                          document.getElementById('hard-lessons-event')?.focus();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }, 0);
                      }}
                      className="px-6 py-3 bg-[#f59e0b] hover:bg-[#ea580c] text-white rounded-2xl transition-all duration-300 font-medium"
                    >
                      Extract Your First Lesson
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </section>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={closeOracle}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        title="Oracle's Extraction Wisdom"
        onReaction={handleOracleReaction}
        entryCount={oracleModal.entryCount}
        entryText={oracleModal.entryText}
        entryModuleName={oracleModal.entryModuleName}
      />
      </div>
    </div>
  );
}
