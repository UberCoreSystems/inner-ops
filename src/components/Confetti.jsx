import React, { useEffect, useState } from 'react';

/**
 * Confetti celebration animation component
 * Triggers a burst of confetti particles on mount
 */
export default function Confetti({ duration = 3000, particleCount = 50, onComplete }) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Generate particles
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
      color: ['#00d4aa', '#4da6ff', '#a855f7', '#f59e0b', '#ef4444', '#22c55e'][Math.floor(Math.random() * 6)],
      size: Math.random() * 8 + 4,
      rotation: Math.random() * 360,
      type: Math.random() > 0.5 ? 'circle' : 'square',
    }));
    setParticles(newParticles);

    // Clean up after animation
    const timer = setTimeout(() => {
      setParticles([]);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, particleCount, onComplete]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute animate-confetti"
          style={{
            left: `${particle.x}%`,
            top: '-20px',
            animationDelay: `${particle.delay}s`,
            animationDuration: `${duration / 1000}s`,
          }}
        >
          {particle.type === 'circle' ? (
            <div
              className="rounded-full"
              style={{
                width: particle.size,
                height: particle.size,
                backgroundColor: particle.color,
                transform: `rotate(${particle.rotation}deg)`,
              }}
            />
          ) : (
            <div
              style={{
                width: particle.size,
                height: particle.size,
                backgroundColor: particle.color,
                transform: `rotate(${particle.rotation}deg)`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Kill confirmation celebration overlay
 */
export function KillCelebration({ show, targetName, onComplete }) {
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (show) {
      setShowConfetti(true);
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <>
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
      <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none bg-black/60">
        <div className="animate-kill-celebration text-center">
          <div className="text-6xl mb-4 animate-bounce">⚔️</div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">
            TARGET <span className="text-[#22c55e]">ELIMINATED</span>
          </h2>
          <p className="text-[#8a8a8a] text-lg max-w-xs mx-auto">
            "{targetName}"
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
            <span className="text-[#22c55e] text-sm font-medium uppercase tracking-wider">
              Victory Secured
            </span>
            <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
          </div>
        </div>
      </div>
    </>
  );
}
