import { useEffect, useRef, useState } from 'react';

/**
 * One-second countdown for the Protocol's timed tools.
 *   { remaining, running, done, start(seconds), reset() }
 * The tick is functional pacing, not decoration, so like useBreathing it is
 * not gated by prefers-reduced-motion.
 */
export const useCountdown = () => {
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      if (remaining <= 1) {
        setRemaining(0);
        setRunning(false);
        setDone(true);
      } else {
        setRemaining((prev) => prev - 1);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [running, remaining]);

  const start = (seconds) => {
    setRemaining(seconds);
    setDone(false);
    setRunning(seconds > 0);
  };

  const reset = () => {
    setRemaining(0);
    setRunning(false);
    setDone(false);
  };

  return { remaining, running, done, start, reset };
};
