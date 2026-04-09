import React, { useEffect } from 'react';

/**
 * Kill completion acknowledgment — sparse, weight-appropriate.
 * Not a celebration. Closing a case file.
 */
export function KillConfirmation({ show, targetName, onComplete }) {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none bg-black/70">
      <div className="text-center px-8">
        <p className="text-[#8a8a8a] text-xs uppercase tracking-widest mb-3">Target closed</p>
        <p className="text-white text-lg font-medium">"{targetName}"</p>
      </div>
    </div>
  );
}
