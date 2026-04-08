import { useState, useEffect } from 'react';

const PHASES = ['inhale', 'hold1', 'exhale', 'hold2'];
const TOTAL_CYCLES = 3;

export const useBreathing = () => {
  const [breathPhase, setBreathPhase] = useState('ready');
  const [breathCount, setBreathCount] = useState(0);

  useEffect(() => {
    if (breathPhase === 'ready' || breathPhase === 'complete') return;

    const currentIndex = PHASES.indexOf(breathPhase);
    const timer = setTimeout(() => {
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
