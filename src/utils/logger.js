/**
 * Logger utility - Only logs in development mode
 * Prevents console pollution in production
 */

const isDev = import.meta.env.DEV;

export const logger = {
  // Debug logs - only in development
  log: (...args) => {
    if (isDev) {
      console.log(...args);
    }
  },

  // Warnings - only in development
  warn: (...args) => {
    if (isDev) {
      console.warn(...args);
    }
  },

  // Errors - always show (critical for debugging production issues)
  error: (...args) => {
    console.error(...args);
  },

  // Info - only in development
  info: (...args) => {
    if (isDev) {
      console.info(...args);
    }
  },

  // Group logs - only in development
  group: (...args) => {
    if (isDev) {
      console.group(...args);
    }
  },

  groupEnd: () => {
    if (isDev) {
      console.groupEnd();
    }
  },
};

export default logger;
