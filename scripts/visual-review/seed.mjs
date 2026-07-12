// Seeds the Firebase Auth + Firestore emulators with one populated operator and
// one empty operator, so the visual-review harness can capture populated AND
// empty states. Uses the Firebase web SDK (already a dependency) pointed at the
// local emulators — no firebase-admin required.
//
// Schema notes (verified against the read paths):
//  - every module collection is TOP-LEVEL, keyed by a `userId` field
//  - userProfiles is doc-id-keyed (userProfiles/{uid}); onboardingCompletedAt
//    being truthy is the ONLY thing that stops the /onboarding redirect
//  - journalEntries is read with orderBy('timestamp') — a doc without a real
//    Timestamp in `timestamp` silently vanishes from the list
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator,
  collection, addDoc, doc, setDoc, Timestamp,
} from 'firebase/firestore';

export const ACCOUNTS = {
  operator: { email: 'operator@inner.local', password: 'test-pass-123' },
  empty: { email: 'empty@inner.local', password: 'test-pass-123' },
};

const PROJECT_ID = process.env.VR_PROJECT_ID || 'inner-ops-8ce36';

const localDateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgo = (n) => Timestamp.fromDate(new Date(Date.now() - n * 86400000));
const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

function connect() {
  const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-emulator-key', appId: 'vr' });
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { auth, db };
}

async function ensureUser(auth, { email, password }) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user.uid;
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user.uid;
    }
    throw err;
  }
}

async function seedProfile(db, uid, populated) {
  await setDoc(doc(db, 'userProfiles', uid), {
    onboardingCompletedAt: isoDaysAgo(30),
    onboardingSkipped: false,
    primaryDriver: 'discipline',
    feedbackStyle: 'direct',
    focusStatement: 'Become someone who keeps his word to himself.',
    activeSituations: populated ? ['Launching a business', 'Rebuilding after a setback'] : [],
    knownTriggers: populated ? ['Late nights', 'Isolation'] : [],
    operatingContext: 'Solo founder, high autonomy, low external accountability.',
    updatedAt: isoDaysAgo(2),
  });
}

async function seedModules(db, uid) {
  const add = (name, data) => addDoc(collection(db, name), { userId: uid, ...data });

  // --- Journal ---
  const journal = [
    { content: 'Skipped the gym again. Told myself I was too tired. The tired was a story.', mood: 'foggy', intensity: 3, oracleJudgment: 'You keep negotiating with the version of you that loses. Name the trade you actually made.', oracleClosingQuestion: 'What did "too tired" actually cost you today?', category: 'Grounded', ts: 0 },
    { content: 'Shipped the auth refactor. Clean. Held the line on scope for once.', mood: 'sharp', intensity: 4, oracleJudgment: 'Competence is not the problem. Consistency is. One clean day is a sample, not a trend.', ts: 1 },
    { content: 'Stayed up until 3am scrolling. Knew it was avoidance by midnight and did it anyway.', mood: 'hollow', intensity: 2, oracleJudgment: 'You saw the exit at midnight and chose the maze. That is the pattern, not the scrolling.', category: 'Drift', ts: 2 },
    { content: 'Hard conversation with a co-founder. Said the thing I usually swallow.', mood: 'steady', intensity: 4, ts: 4 },
    { content: 'Woke early. Cold, quiet, no phone for the first hour. Clearest I have felt in a week.', mood: 'focused', intensity: 5, oracleJudgment: 'The clarity was not the morning. It was the absence of the thing you keep reaching for.', ts: 6 },
  ];
  for (const j of journal) {
    const { ts, ...rest } = j;
    await add('journalEntries', { ...rest, classification: { status: 'empty' }, timestamp: daysAgo(ts), createdAt: isoDaysAgo(ts) });
  }

  // --- General Ledger (killTargets) ---
  const today = localDateKey();
  const targets = [
    { title: 'Doomscrolling after 10pm', description: 'The nightly avoidance loop.', category: 'bad-habit', status: 'active', streak: 7, longestStreak: 12, totalTrackedDays: 41, consecutiveDaysRequired: 30, escapeData: [] },
    { title: 'Skipping training when it is inconvenient', description: 'Negotiating with resistance.', category: 'procrastination', status: 'active', streak: 3, longestStreak: 9, totalTrackedDays: 41, consecutiveDaysRequired: 30, escapeData: [] },
    { title: 'Checking metrics compulsively', description: 'Dopamine dressed as diligence.', category: 'addiction', status: 'escaped', streak: 0, longestStreak: 15, totalTrackedDays: 41, consecutiveDaysRequired: 30, escapeData: [{ date: isoDaysAgo(1), note: 'Refreshed the dashboard 40 times before noon.' }] },
  ];
  for (const t of targets) {
    await add('killTargets', {
      ...t,
      targetDate: today,
      checkIns: [],
      lastCheckIn: null,
      implementationIntention: { trigger: '', response: '' },
      reflectionNotes: '',
      createdAt: isoDaysAgo(41),
      lastUpdated: isoDaysAgo(1),
    });
  }

  // --- Hard Lessons ---
  const lessons = [
    { eventCategory: 'overconfidence', eventDescription: 'Signed the contract without reading the exit clause.', myAssumption: 'I assumed they would act in good faith.', signalIgnored: 'They dodged every direct question about terms.', costs: ['financial', 'time'], costDescription: 'Lost the deposit and six weeks of runway.', extractedLesson: 'Ambiguity in a contract is a decision already made against me.', ruleGoingForward: 'Never sign what I have not read in full, out loud.', isFinalized: true, finalizedAt: isoDaysAgo(20) },
    { eventCategory: 'people-pleasing', eventDescription: 'Said yes to a project I had no capacity for.', myAssumption: 'I assumed saying no would cost the relationship.', signalIgnored: 'My gut said no before they finished the sentence.', costs: ['time', 'focus'], costDescription: 'Two months of resentment and a mediocre result.', extractedLesson: 'A yes I resent is a no I was too weak to say.', ruleGoingForward: 'Delay every yes by 24 hours. No exceptions.', isFinalized: true, finalizedAt: isoDaysAgo(9) },
  ];
  for (const l of lessons) {
    await add('hardLessons', { ...l, isRuleViolation: false, violatedRuleId: null, violations: [], timestamp: daysAgo(20), createdAt: isoDaysAgo(20) });
  }

  // --- The Signal (relapseEntries) ---
  const signals = [
    { entryType: 'signal', selectedSelf: 'The Self-Saboteur', selectedHabits: ['Isolation', 'Overthinking'], substanceUse: [], reflection: 'Isolated all weekend. Started rationalizing skipping the launch call.', precursorConditions: ['Isolated', 'High stress'], entryProximityFlag: 'contemporaneous', oracleFeedback: 'You called it isolation. It was avoidance wearing a quieter name.', ts: 2 },
    { entryType: 'relapse', selectedSelf: 'The Addict', selectedHabits: ['Excessive social media scrolling'], substanceUse: [], reflection: 'Fell back into the 2am scroll after eight clean days.', precursorConditions: ['Late night', 'Bored'], entryProximityFlag: 'retrospective', ts: 5 },
    { entryType: 'signal', selectedSelf: 'The Procrastinator', selectedHabits: ['Avoiding responsibilities'], substanceUse: [], reflection: 'Reorganized my desk instead of doing the one hard task.', precursorConditions: ['Task ambiguity'], entryProximityFlag: 'contemporaneous', ts: 8 },
  ];
  for (const s of signals) {
    const { ts, ...rest } = s;
    await add('relapseEntries', { ...rest, timestamp: daysAgo(ts), createdAt: daysAgo(ts) });
  }

  // --- userSettings (exactly one) ---
  await add('userSettings', {
    identityDirection: 'A man who does what he said he would, whether or not anyone is watching.',
    notificationPreferences: {},
    bannerDismissals: {},
  });
}

export async function seed() {
  const { auth, db } = connect();

  const operatorUid = await ensureUser(auth, ACCOUNTS.operator);
  await seedProfile(db, operatorUid, true);
  await seedModules(db, operatorUid);
  console.log(`  seeded operator ${operatorUid} (populated)`);

  const emptyUid = await ensureUser(auth, ACCOUNTS.empty);
  await seedProfile(db, emptyUid, false);
  console.log(`  seeded empty ${emptyUid} (no module data)`);
}

// Allow standalone run: `node scripts/visual-review/seed.mjs`
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('seed.mjs')) {
  seed().then(() => { console.log('seed complete'); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
