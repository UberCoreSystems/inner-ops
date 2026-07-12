// Orchestrator for the visual-review harness. Intended to run INSIDE a
// `firebase emulators:exec` lifecycle so Auth+Firestore emulators are already
// up and are torn down automatically when this exits.
//
//   firebase emulators:exec --only auth,firestore --project inner-ops-8ce36 \
//     "node scripts/visual-review/run.mjs"
//
// Steps: seed emulator → boot Vite (mode=emulator) → capture populated + empty
// → kill Vite. Screenshots land in scripts/visual-review/shots/.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seed, ACCOUNTS } from './seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASE_URL = 'http://127.0.0.1:5173';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never came up at ${url}`);
}

async function main() {
  console.log('→ seeding emulator');
  await seed();

  console.log('→ booting vite (mode=emulator)');
  // --strictPort: fail loudly instead of drifting to 5174 if 5173 is occupied,
  // so capture can never silently hit a stale server on a different port.
  const vite = spawn(npx, ['vite', '--mode', 'emulator', '--port', '5173', '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: 'inherit', shell: true,
  });

  try {
    await waitForServer(BASE_URL);
    console.log('→ dev server up; capturing');

    const cap = join(HERE, 'capture.mjs');
    await sh('node', [cap, ACCOUNTS.operator.email, ACCOUNTS.operator.password, 'populated']);
    await sh('node', [cap, ACCOUNTS.empty.email, ACCOUNTS.empty.password, 'empty']);
    console.log('→ capture complete; shots in scripts/visual-review/shots/');
  } finally {
    vite.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
