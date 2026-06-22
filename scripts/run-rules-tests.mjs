/**
 * Launcher for the Firestore rules proof suite.
 *
 * The Firestore emulator is a JVM app, so `firebase emulators:exec` spawns
 * `java`. This wrapper guarantees a JDK is reachable by the spawned emulator
 * WITHOUT depending on the parent shell's PATH/JAVA_HOME — so the suite runs
 * even from a terminal that was opened before Java was installed (a common
 * VS Code integrated-terminal gotcha: new tabs inherit the editor's stale env
 * and don't re-read the registry).
 *
 * Resolution order for Java:
 *   1. A valid JAVA_HOME already in the environment → use it (CI, other devs).
 *   2. The no-admin Temurin JDK the security audit installed under
 *      %LOCALAPPDATA%/inner-ops-jdk → auto-detect and inject.
 *   3. Neither → fall through and let `java` resolve from PATH (clear error
 *      from firebase-tools if it genuinely isn't installed anywhere).
 *
 * Nothing here is machine-specific or committed-path-specific beyond the
 * audit's documented install location, so it stays portable.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';

const hasJava = (home) => Boolean(home) && existsSync(join(home, 'bin', javaExe));

function findLocalJdk() {
  const base = join(
    process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
    'inner-ops-jdk',
  );
  if (!existsSync(base)) return null;
  for (const entry of readdirSync(base)) {
    const home = join(base, entry);
    if (hasJava(home)) return home;
  }
  return null;
}

let javaHome = process.env.JAVA_HOME;
if (!hasJava(javaHome)) {
  const found = findLocalJdk();
  if (found) {
    javaHome = found;
    process.env.JAVA_HOME = found;
    process.env.PATH = join(found, 'bin') + delimiter + (process.env.PATH || '');
    console.log(`[test:rules] Injected local JDK for the emulator: ${found}`);
  } else {
    console.log('[test:rules] No JAVA_HOME and no local JDK found — relying on `java` from PATH.');
  }
}

// The rules suites (client-SDK, via rules-unit-testing) call clearFirestore()
// between collections, so they must NOT run concurrently with the admin-SDK
// deletion-receipt test. `&&` sequences them: rules first, then the erase test
// seeds fresh data into the same emulator with no race.
const command =
  'firebase emulators:exec --only firestore,storage --project=inner-ops-8ce36 ' +
  '"node --test rules-tests/firestore.rules.test.mjs rules-tests/storage.rules.test.mjs ' +
  '&& node --test functions/eraseUserData.emulator.test.js"';

const result = spawnSync(command, { stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
