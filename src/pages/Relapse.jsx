
import React, { useState, useEffect } from 'react';
import RelapseRadar from '../components/RelapseRadar';
import { SkeletonBox } from '../components/SkeletonLoader';
import { AppIcon } from '../components/AppIcons';

export default function Relapse() {
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);

  // Delay showing skeleton to prevent flicker on fast loads
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (loading) {
        setShowSkeleton(true);
      }
    }, 250);

    return () => clearTimeout(skeletonTimer);
  }, [loading]);

  // Keep skeleton visible briefly to avoid flicker on completion
  useEffect(() => {
    let dwellTimer;
    if (!loading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [loading, showSkeleton]);

  // Initialize component
  useEffect(() => {
    // Simulate a brief initialization delay
    const timer = setTimeout(() => {
      setLoading(false);
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-black py-8">
      <div className="max-w-4xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-[#4da6ff]/10 border border-[#4da6ff]/20 flex items-center justify-center shrink-0">
              <AppIcon name="relapse" size={22} color="#4da6ff" glow={false} />
            </div>
            <h1 className="text-4xl md:text-5xl font-light text-white tracking-tight">
              The Signal
            </h1>
          </div>
          <div className="border-l-4 border-[#4da6ff] pl-4 py-1">
            <p className="text-[#ababab]">Catch the drift before it compounds.</p>
          </div>
        </div>
        
        <div className="relative">
          <div className={`fade-pane ${loading || showSkeleton ? 'visible' : 'hidden'}`}>
            <div className="space-y-4">
              <SkeletonBox width="100%" height="3rem" />
              <SkeletonBox width="100%" height="8rem" />
              <SkeletonBox width="100%" height="3rem" />
              <SkeletonBox width="100%" height="8rem" />
            </div>
          </div>

          <div className={`fade-pane ${loading || showSkeleton ? 'hidden' : 'visible'}`}>
            <RelapseRadar />
          </div>
        </div>
      </div>
    </div>
  );
}
