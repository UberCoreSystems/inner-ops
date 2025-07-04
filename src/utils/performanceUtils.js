
import { useState, useEffect } from 'react';

export const throttleInput = (func, delay = 100) => {
  let timeoutId;
  let lastExecTime = 0;
  
  return function (...args) {
    const currentTime = Date.now();
    
    if (currentTime - lastExecTime > delay) {
      func.apply(this, args);
      lastExecTime = currentTime;
    } else {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        func.apply(this, args);
        lastExecTime = Date.now();
      }, delay - (currentTime - lastExecTime));
    }
  };
};

export const memoizeWithExpiry = (func, expiryTime = 5000) => {
  const cache = new Map();
  
  return function (...args) {
    const key = JSON.stringify(args);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < expiryTime) {
      return cached.value;
    }
    
    const result = func.apply(this, args);
    cache.set(key, { value: result, timestamp: Date.now() });
    
    // Clean old entries
    if (cache.size > 10) {
      const oldestKey = cache.keys().next().value;
      cache.delete(oldestKey);
    }
    
    return result;
  };
};

// Aggressive memoization for expensive calculations
export const deepMemoize = (func, maxCacheSize = 50) => {
  const cache = new Map();
  
  return function (...args) {
    const key = JSON.stringify(args);
    
    if (cache.has(key)) {
      // Move to end (LRU)
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return value;
    }
    
    const result = func.apply(this, args);
    
    // Remove oldest if cache is full
    if (cache.size >= maxCacheSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    cache.set(key, result);
    return result;
  };
};

// Optimized virtual scrolling helper
export const calculateVisibleRange = (scrollTop, containerHeight, itemHeight, totalItems, overscan = 3) => {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const endIndex = Math.min(totalItems - 1, startIndex + visibleCount + overscan * 2);
  
  return { startIndex, endIndex, visibleCount };
};

// Debounced state updater for heavy computations
export const useDebouncedMemo = (factory, deps, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(() => factory());
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(factory());
    }, delay);
    
    return () => clearTimeout(handler);
  }, [...deps, delay]);
  
  return debouncedValue;
};

// Memory-efficient list operations
export const chunkArray = (array, chunkSize = 50) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
};

export const batchUpdates = (func, delay = 50) => {
  let pending = [];
  let timeoutId;
  
  return function (update) {
    pending.push(update);
    
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(pending);
      pending = [];
    }, delay);
  };
};

// React hook for throttled input handling
export const useThrottledInput = (callback, delay = 100) => {
  const [throttledCallback] = useState(() => throttleInput(callback, delay));
  return throttledCallback;
};
