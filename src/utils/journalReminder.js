import { USER_SETTINGS_FIELDS } from './schema.js';
import logger from './logger.js';

// The daily journal reminder: an iOS local notification, scheduled on the
// phone. The plugin loads on demand, so only the app ever requests it.
const loadPlugin = async () => {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  // Wrapped in an object on purpose: a plugin proxy answers `then`, so one
  // returned bare from an async function is taken for a promise.
  return { LocalNotifications };
};

export const DEFAULT_REMINDER_TIME = '21:00';
export const REMINDER_ROUTE = '/journal';

const TITLE = 'Inner Ops';
// Fixed copy only. It shows on the lock screen: never entry text or context.
const BODY = "No entry today. Write what's actually happening.";
// Not a bundled file, so iOS plays its default notification sound.
const SOUND = 'default';

// A repeating iOS trigger cannot skip one day, so the daily reminder is seven
// weekly ones, one per weekday, and a day is skipped by removing its own.
// Ids 101-107, Sunday first, as the plugin counts weekdays.
const ID_BASE = 100;
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
const REMINDER_IDS = WEEKDAYS.map((weekday) => ({ id: ID_BASE + weekday }));
const isReminderId = (id) => Number.isInteger(id) && id > ID_BASE && id <= ID_BASE + 7;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isReminderTime = (value) => typeof value === 'string' && TIME_PATTERN.test(value);

/** @returns {{ enabled: boolean, time: string }} off unless stored as exactly `true` */
export const readJournalReminderPreference = (settings) => {
  const stored = settings?.[USER_SETTINGS_FIELDS.JOURNAL_REMINDER];
  return {
    enabled: stored?.enabled === true,
    time: isReminderTime(stored?.time) ? stored.time : DEFAULT_REMINDER_TIME,
  };
};

/**
 * What should be pending right now. Nothing unless the reminder is on and iOS
 * has granted permission. Today's weekday is left out while an entry saved
 * today exists and the reminder time has not passed.
 */
export const desiredReminders = ({ enabled, time, granted, newestEntryAt, now }) => {
  if (!enabled || !granted) return [];
  const [hour, minute] = time.split(':').map(Number);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const reminderToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
  const wroteToday = newestEntryAt instanceof Date && newestEntryAt >= startOfToday;
  const skipped = wroteToday && now < reminderToday ? now.getDay() + 1 : null;
  return WEEKDAYS.filter((weekday) => weekday !== skipped).map((weekday) => ({
    id: ID_BASE + weekday,
    title: TITLE,
    body: BODY,
    sound: SOUND,
    schedule: { on: { weekday, hour, minute } },
  }));
};

const isSameReminder = (pending, wanted) => {
  const on = pending.schedule?.on;
  const want = wanted.schedule.on;
  return pending.title === wanted.title
    && pending.body === wanted.body
    && Number(on?.weekday) === want.weekday
    && Number(on?.hour) === want.hour
    && Number(on?.minute) === want.minute;
};

/** The difference between what iOS holds and what it should hold. Other ids are never touched. */
export const planReminderChanges = (pending, desired) => {
  const ours = pending.filter((reminder) => isReminderId(reminder.id));
  const wantedIds = new Set(desired.map((reminder) => reminder.id));
  return {
    cancel: ours.filter((reminder) => !wantedIds.has(reminder.id)).map(({ id }) => ({ id })),
    schedule: desired.filter(
      (wanted) => !ours.some((reminder) => reminder.id === wanted.id && isSameReminder(reminder, wanted)),
    ),
  };
};

const applySync = async ({ preference, newestEntryAt, now = new Date() }, load) => {
  const { LocalNotifications } = await load();
  const { display } = await LocalNotifications.checkPermissions();
  const desired = desiredReminders({ ...preference, granted: display === 'granted', newestEntryAt, now });
  const { notifications } = await LocalNotifications.getPending();
  const { cancel, schedule } = planReminderChanges(notifications, desired);
  // The plugin rejects an empty cancel list.
  if (cancel.length) await LocalNotifications.cancel({ notifications: cancel });
  // Reached only with permission granted: since 8.3.0 schedule() asks for it
  // by itself, and nothing but the Settings switch may raise that prompt.
  if (schedule.length) await LocalNotifications.schedule({ notifications: schedule });
  // The app is open, which is what a delivered reminder asked for.
  await LocalNotifications.removeAllDeliveredNotifications();
};

const applyClear = async (load) => {
  const { LocalNotifications } = await load();
  await LocalNotifications.cancel({ notifications: REMINDER_IDS });
  await LocalNotifications.removeAllDeliveredNotifications();
};

// One change at a time, in the order requested, so the last request decides.
// A failure is logged and never reaches the caller: the next request repairs it.
let queue = Promise.resolve();
const enqueue = (run) => {
  queue = queue.then(run).catch((err) => {
    logger.error('Journal reminder update failed:', err?.message || err);
  });
  return queue;
};

/** Brings what iOS holds in line with the preference and the newest entry. */
export const syncJournalReminder = (input, load = loadPlugin) => enqueue(() => applySync(input, load));

/** Removes every reminder, pending and delivered: nobody is signed in. */
export const clearJournalReminder = (load = loadPlugin) => enqueue(() => applyClear(load));

const toPermission = (display) => (display === 'granted' || display === 'denied' ? display : 'prompt');

/** @returns {Promise<'granted'|'denied'|'prompt'>} `prompt` when iOS has never asked */
export async function readReminderPermission(load = loadPlugin) {
  const { LocalNotifications } = await load();
  const { display } = await LocalNotifications.checkPermissions();
  return toPermission(display);
}

/** Raises the iOS prompt if the user has never decided. */
export async function requestReminderPermission(load = loadPlugin) {
  const { LocalNotifications } = await load();
  const { display } = await LocalNotifications.requestPermissions();
  return toPermission(display);
}

/** Calls `handler` each time a reminder is tapped, including the tap that launched the app. */
export async function onJournalReminderTap(handler, load = loadPlugin) {
  const { LocalNotifications } = await load();
  await LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
    if (actionId === 'tap' && isReminderId(notification?.id)) handler();
  });
}
