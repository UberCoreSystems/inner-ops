/**
 * Logger utility - Only logs in development mode
 * Prevents console pollution in production
 *
 * Finding 26 remediation: branch on the Vite-defined __INNER_OPS_IS_DEV__
 * constant. In production builds Terser resolves this to `false`, which lets
 * dead_code elimination strip every branch body — only the empty arrow
 * shells remain and mangle-away to near-nothing in the minified output.
 */

// Fallback for environments where the compile-time constant is not defined
// (e.g. node test runner). Resolves to the runtime Vite DEV flag there.
const isDev = (typeof __INNER_OPS_IS_DEV__ !== 'undefined')
  ? __INNER_OPS_IS_DEV__
  : (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.DEV : true);

export const logger = {
  log: (...args) => { if (isDev) console.log(...args); },
  warn: (...args) => { if (isDev) console.warn(...args); },
  // Errors are always emitted — production diagnostics need them.
  error: (...args) => { console.error(...args); },
  info: (...args) => { if (isDev) console.info(...args); },
  debug: (...args) => { if (isDev) console.debug(...args); },
  group: (...args) => { if (isDev) console.group(...args); },
  groupEnd: () => { if (isDev) console.groupEnd(); },
};

export default logger;
