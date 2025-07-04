export const debounce = (func, delay = 300) => {
  let timeoutId;

  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
};

export const throttle = (func, limit = 100) => {
  let inThrottle;

  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Aggressive debouncing for heavy operations
export const heavyDebounce = (func, delay = 500, immediate = false) => {
  let timeoutId;
  let lastArgs;

  return function (...args) {
    lastArgs = args;

    const callNow = immediate && !timeoutId;

    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (!immediate) func.apply(this, lastArgs);
    }, delay);

    if (callNow) func.apply(this, args);
  };
};

// Smart debouncing that adjusts delay based on frequency
export const adaptiveDebounce = (func, baseDelay = 300, maxDelay = 1000) => {
  let timeoutId;
  let callCount = 0;
  let lastCallTime = 0;

  return function (...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    if (timeSinceLastCall < 100) {
      callCount++;
    } else {
      callCount = 0;
    }

    lastCallTime = now;

    // Increase delay if calls are frequent
    const adaptiveDelay = Math.min(baseDelay + (callCount * 50), maxDelay);

    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
      callCount = 0;
    }, adaptiveDelay);
  };
};