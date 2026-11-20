import { test } from 'node:test';
import assert from 'node:assert';

import {
  DEFAULT_REMINDER_TIME,
  readJournalReminderPreference,
  desiredReminders,
  planReminderChanges,
  syncJournalReminder,
  clearJournalReminder,
  readReminderPermission,
  requestReminderPermission,
  onJournalReminderTap,
} from './journalReminder.js';

const TITLE = 'Inner Ops';
const BODY = "No entry today. Write what's actually happening.";
const ALL_IDS = [101, 102, 103, 104, 105, 106, 107];

// Local-time dates, as the phone sees them. 2026-11-20 is a Friday.
const at = (day, hour, minute = 0) => new Date(2026, 10, day, hour, minute);
const FRIDAY_MORNING = at(20, 9);
const ON = { enabled: true, time: '21:00', granted: true };

const ids = (reminders) => reminders.map((reminder) => reminder.id);

// A reminder as getPending() hands it back: id, title, body and schedule.
const asPending = ({ id, title, body, schedule }) => ({ id, title, body, schedule });

// Stand-in for the plugin. `calls` records every bridge call in order; a test
// overrides a method by name.
function fakePlugin({ display = 'granted', pending = [], overrides = {} } = {}) {
  const calls = [];
  let listener = null;
  const run = (name, fallback) => async (options) => {
    calls.push(options === undefined ? [name] : [name, options]);
    return (overrides[name] ?? fallback)(options);
  };
  const LocalNotifications = {
    checkPermissions: run('checkPermissions', () => ({ display })),
    requestPermissions: run('requestPermissions', () => ({ display })),
    getPending: run('getPending', () => ({ notifications: pending })),
    cancel: run('cancel', () => undefined),
    schedule: run('schedule', () => ({ notifications: [] })),
    removeAllDeliveredNotifications: run('removeAllDeliveredNotifications', () => undefined),
    addListener: async (eventName, callback) => {
      calls.push(['addListener', eventName]);
      listener = callback;
      return { remove: async () => {} };
    },
  };
  return {
    calls,
    names: () => calls.map(([name]) => name),
    load: async () => ({ LocalNotifications }),
    emit: (event) => listener(event),
  };
}

// --- the stored preference -------------------------------------------------

test('a missing or malformed preference reads as off at the default time', () => {
  const off = { enabled: false, time: DEFAULT_REMINDER_TIME };

  assert.deepStrictEqual(readJournalReminderPreference(undefined), off);
  assert.deepStrictEqual(readJournalReminderPreference({}), off);
  assert.deepStrictEqual(readJournalReminderPreference({ journalReminder: { enabled: 'true', time: '9pm' } }), off);
  assert.deepStrictEqual(readJournalReminderPreference({ journalReminder: { enabled: 1, time: '24:00' } }), off);
  assert.strictEqual(DEFAULT_REMINDER_TIME, '21:00');
});

test('a stored preference reads as stored', () => {
  const stored = { enabled: true, time: '06:45' };

  assert.deepStrictEqual(readJournalReminderPreference({ journalReminder: stored }), stored);
});

// --- what should be pending ------------------------------------------------

test('nothing is wanted while the reminder is off or iOS has not granted permission', () => {
  const input = { ...ON, newestEntryAt: null, now: FRIDAY_MORNING };

  assert.deepStrictEqual(desiredReminders({ ...input, enabled: false }), []);
  assert.deepStrictEqual(desiredReminders({ ...input, granted: false }), []);
});

test('on with no entry today: one weekly notification per weekday at the chosen time', () => {
  const reminders = desiredReminders({ ...ON, time: '06:45', newestEntryAt: null, now: FRIDAY_MORNING });

  assert.deepStrictEqual(ids(reminders), ALL_IDS);
  assert.deepStrictEqual(
    reminders.map((reminder) => reminder.schedule),
    [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ on: { weekday, hour: 6, minute: 45 } })),
  );
});

test('a notification carries the fixed copy and nothing about the user', () => {
  const [reminder] = desiredReminders({ ...ON, newestEntryAt: at(19, 22), now: FRIDAY_MORNING });

  assert.deepStrictEqual(reminder, {
    id: 101,
    title: TITLE,
    body: BODY,
    sound: 'default',
    schedule: { on: { weekday: 1, hour: 21, minute: 0 } },
  });
});

test('an entry saved today, before the reminder time, removes only today', () => {
  const friday = desiredReminders({ ...ON, newestEntryAt: at(20, 8, 30), now: FRIDAY_MORNING });
  const sunday = desiredReminders({ ...ON, newestEntryAt: at(22, 0, 10), now: at(22, 9) });

  assert.deepStrictEqual(ids(friday), [101, 102, 103, 104, 105, 107]);
  assert.deepStrictEqual(ids(sunday), [102, 103, 104, 105, 106, 107]);
});

test('at or after the reminder time, today is wanted again', () => {
  const newestEntryAt = at(20, 8, 30);

  assert.deepStrictEqual(ids(desiredReminders({ ...ON, newestEntryAt, now: at(20, 20, 59) })).length, 6);
  assert.deepStrictEqual(ids(desiredReminders({ ...ON, newestEntryAt, now: at(20, 21, 0) })), ALL_IDS);
  assert.deepStrictEqual(ids(desiredReminders({ ...ON, newestEntryAt, now: at(20, 23, 30) })), ALL_IDS);
});

test("yesterday's entry does not count for today", () => {
  const reminders = desiredReminders({ ...ON, newestEntryAt: at(19, 23, 59), now: at(20, 0, 1) });

  assert.deepStrictEqual(ids(reminders), ALL_IDS);
});

test('an entry stamped slightly ahead of the phone clock still counts as today', () => {
  const reminders = desiredReminders({ ...ON, newestEntryAt: at(20, 9, 1), now: FRIDAY_MORNING });

  assert.deepStrictEqual(ids(reminders), [101, 102, 103, 104, 105, 107]);
});

// --- the difference to apply -----------------------------------------------

test('an identical pending set plans nothing', () => {
  const desired = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING });

  assert.deepStrictEqual(planReminderChanges(desired.map(asPending), desired), { cancel: [], schedule: [] });
});

test('a new time reschedules the same seven ids and cancels none', () => {
  const pending = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING }).map(asPending);
  const desired = desiredReminders({ ...ON, time: '07:15', newestEntryAt: null, now: FRIDAY_MORNING });

  const { cancel, schedule } = planReminderChanges(pending, desired);

  assert.deepStrictEqual(cancel, []);
  assert.deepStrictEqual(ids(schedule), ALL_IDS);
});

test("skipping today cancels only today's id; the next plan puts it back", () => {
  const all = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING });
  const six = desiredReminders({ ...ON, newestEntryAt: at(20, 8), now: FRIDAY_MORNING });

  assert.deepStrictEqual(planReminderChanges(all.map(asPending), six), { cancel: [{ id: 106 }], schedule: [] });

  const restored = planReminderChanges(six.map(asPending), all);
  assert.deepStrictEqual(restored.cancel, []);
  assert.deepStrictEqual(ids(restored.schedule), [106]);
});

test('notifications with other ids are never cancelled', () => {
  const foreign = [{ id: 5, title: 'x', body: 'y' }, { id: 108, title: 'x', body: 'y' }];

  assert.deepStrictEqual(planReminderChanges(foreign, []), { cancel: [], schedule: [] });
});

test('schedule numbers handed back as strings still match', () => {
  const desired = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING });
  const pending = desired.map((reminder) => ({
    ...asPending(reminder),
    schedule: { on: { weekday: String(reminder.schedule.on.weekday), hour: '21', minute: '0' } },
  }));

  assert.deepStrictEqual(planReminderChanges(pending, desired), { cancel: [], schedule: [] });
});

// --- talking to iOS --------------------------------------------------------

test('with permission granted, the seven are scheduled and delivered ones cleared', async () => {
  const { calls, names, load } = fakePlugin();

  await syncJournalReminder({ preference: { enabled: true, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING }, load);

  assert.deepStrictEqual(names(), ['checkPermissions', 'getPending', 'schedule', 'removeAllDeliveredNotifications']);
  assert.deepStrictEqual(ids(calls[2][1].notifications), ALL_IDS);
});

test('without permission, schedule is never reached and the prompt is never raised', async () => {
  for (const display of ['prompt', 'denied']) {
    const { names, load } = fakePlugin({ display });

    await syncJournalReminder({ preference: { enabled: true, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING }, load);

    assert.deepStrictEqual(names(), ['checkPermissions', 'getPending', 'removeAllDeliveredNotifications']);
  }
});

test('turning it off cancels what is pending and schedules nothing', async () => {
  const pending = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING }).map(asPending);
  const { calls, names, load } = fakePlugin({ pending });

  await syncJournalReminder({ preference: { enabled: false, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING }, load);

  assert.deepStrictEqual(names(), ['checkPermissions', 'getPending', 'cancel', 'removeAllDeliveredNotifications']);
  assert.deepStrictEqual(calls[2][1], { notifications: ALL_IDS.map((id) => ({ id })) });
});

test('permission withdrawn in iOS Settings cancels what is pending', async () => {
  const pending = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING }).map(asPending);
  const { names, load } = fakePlugin({ display: 'denied', pending });

  await syncJournalReminder({ preference: { enabled: true, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING }, load);

  assert.deepStrictEqual(names(), ['checkPermissions', 'getPending', 'cancel', 'removeAllDeliveredNotifications']);
});

test('a failed update is logged, not thrown, and the next one still runs', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const broken = fakePlugin({ overrides: { getPending: () => { throw new Error('bridge down'); } } });
  const working = fakePlugin();
  const input = { preference: { enabled: true, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING };

  await syncJournalReminder(input, broken.load);
  await syncJournalReminder(input, working.load);

  assert.strictEqual(logged.mock.callCount(), 1);
  assert.deepStrictEqual(broken.names(), ['checkPermissions', 'getPending']);
  assert.strictEqual(working.names().includes('schedule'), true);
});

test('updates requested together run one after the other, and the last one decides', async () => {
  const order = [];
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const slow = fakePlugin({ overrides: { getPending: async () => { await held; order.push('first'); return { notifications: [] }; } } });
  const pending = desiredReminders({ ...ON, newestEntryAt: null, now: FRIDAY_MORNING }).map(asPending);
  const fast = fakePlugin({ pending, overrides: { cancel: () => { order.push('second'); } } });

  const first = syncJournalReminder({ preference: { enabled: true, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING }, slow.load);
  const second = syncJournalReminder({ preference: { enabled: false, time: '21:00' }, newestEntryAt: null, now: FRIDAY_MORNING }, fast.load);
  assert.deepStrictEqual(fast.names(), []);

  release();
  await Promise.all([first, second]);

  assert.deepStrictEqual(order, ['first', 'second']);
  assert.strictEqual(slow.names().at(-1), 'removeAllDeliveredNotifications');
});

test('clearing cancels all seven and the delivered ones, without reading what is pending', async () => {
  const { calls, load } = fakePlugin();

  await clearJournalReminder(load);

  assert.deepStrictEqual(calls, [
    ['cancel', { notifications: ALL_IDS.map((id) => ({ id })) }],
    ['removeAllDeliveredNotifications'],
  ]);
});

test('permission reads as granted, denied, or prompt for anything else', async () => {
  assert.strictEqual(await readReminderPermission(fakePlugin({ display: 'granted' }).load), 'granted');
  assert.strictEqual(await readReminderPermission(fakePlugin({ display: 'denied' }).load), 'denied');
  assert.strictEqual(await readReminderPermission(fakePlugin({ display: 'prompt-with-rationale' }).load), 'prompt');
});

test('asking for permission is its own call and reports the answer', async () => {
  const { names, load } = fakePlugin({ display: 'denied' });

  assert.strictEqual(await requestReminderPermission(load), 'denied');
  assert.deepStrictEqual(names(), ['requestPermissions']);
});

test('the tap handler fires for a tapped reminder and for nothing else', async () => {
  const { calls, load, emit } = fakePlugin();
  let taps = 0;

  assert.strictEqual(await onJournalReminderTap(() => { taps += 1; }, load), undefined);
  assert.deepStrictEqual(calls, [['addListener', 'localNotificationActionPerformed']]);

  emit({ actionId: 'tap', notification: { id: 103 } });
  assert.strictEqual(taps, 1);

  emit({ actionId: 'tap', notification: { id: 5 } });
  emit({ actionId: 'dismiss', notification: { id: 103 } });
  emit({ actionId: 'tap' });
  assert.strictEqual(taps, 1);
});
