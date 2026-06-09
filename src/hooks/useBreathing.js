import { useState, useEffect, useRef } from 'react';

const PHASES = ['inhale', 'hold1', 'exhale', 'hold2'];
const TOTAL_CYCLES = 3;

export const useBreathing = () => {
  const [breathPhase, setBreathPhase] = useState('ready');
  const [breathCount, setBreathCount] = useState(0);

  // Pass 3 New Finding 10 remediation: the chained-setTimeout pattern is
  // already safe under React's effect cleanup (clearTimeout prevents the
  // callback from running after unmount), but a mountedRef gives us a hard
  // guarantee that no state setter fires after unmount even if the timer
  // chain is ever refactored to setInterval or to a longer-lived structure.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Note on reduced-motion: this 4s phase cadence is FUNCTIONAL — it paces the
  // guided box-breathing exercise — so it is intentionally not gated by
  // `prefers-reduced-motion`. The decorative circle-scale animation in the UI
  // is already neutralized by the global reduced-motion guard in index.css, so
  // a reduced-motion user still gets the timed instructions without the easing.
  useEffect(() => {
    if (breathPhase === 'ready' || breathPhase === 'complete') return;

    const currentIndex = PHASES.indexOf(breathPhase);
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      if (breathPhase === 'hold2') {
        if (breathCount >= TOTAL_CYCLES) {
          setBreathPhase('complete');
        } else {
          setBreathPhase('inhale');
          setBreathCount((prev) => prev + 1);
        }
      } else {
        setBreathPhase(PHASES[currentIndex + 1]);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [breathPhase, breathCount]);

  const start = () => {
    setBreathPhase('inhale');
    setBreathCount(0);
  };

  const reset = () => {
    setBreathPhase('ready');
    setBreathCount(0);
  };

  const getInstruction = () => {
    switch (breathPhase) {
      case 'inhale': return 'Breathe In...';
      case 'hold1': return 'Hold...';
      case 'exhale': return 'Breathe Out...';
      case 'hold2': return 'Hold...';
      case 'complete': return 'Well Done';
      default: return 'Ready';
    }
  };

  const getColor = () => {
    switch (breathPhase) {
      case 'inhale': return 'bg-blue-500';
      case 'hold1':
      case 'hold2': return 'bg-purple-500';
      case 'exhale': return 'bg-green-500';
      case 'complete': return 'bg-oura-cyan';
      default: return 'bg-gray-500';
    }
  };

  return { breathPhase, breathCount, start, reset, getInstruction, getColor };
};
