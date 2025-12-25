import React from 'react';

/**
 * Base Skeleton Pulse Animation Component
 * Creates the shimmer effect for loading states
 */
export function SkeletonBox({ width = '100%', height = '1rem', className = '' }) {
  return (
    <div 
      className={`skeleton-pulse bg-[#1a1a1a] rounded ${className}`}
      style={{ width, height }}
    />
  );
}

/**
 * Skeleton Circle - For avatars, circular progress rings
 */
export function SkeletonCircle({ size = '3rem', className = '' }) {
  return (
    <div 
      className={`skeleton-pulse bg-[#1a1a1a] rounded-full ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Skeleton Ring - Mimics Oura-style circular progress rings
 */
export function SkeletonRing({ size = 120, strokeWidth = 8, className = '' }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="animate-pulse">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke="#1a1a1a"
          fill="none"
          strokeDasharray={`${circumference * 0.7} ${circumference * 0.3}`}
          style={{ 
            transition: 'stroke-dasharray 1.5s ease-in-out',
            animation: 'skeletonRingRotate 2s linear infinite'
          }}
        />
      </svg>
    </div>
  );
}

/**
 * Skeleton Triple Ring - For Dashboard's main ring display
 */
export function SkeletonTripleRing({ size = 200 }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {[0, 1, 2].map((i) => (
        <SkeletonRing 
          key={i}
          size={size - (i * 40)} 
          strokeWidth={8}
          className="absolute"
        />
      ))}
      <div className="text-center z-10">
        <SkeletonBox width="3rem" height="2rem" className="mx-auto mb-2" />
        <SkeletonBox width="4rem" height="0.75rem" className="mx-auto" />
      </div>
    </div>
  );
}

/**
 * Skeleton Card - For dashboard stats cards
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <SkeletonBox width="60%" height="1.25rem" />
        <SkeletonCircle size="2rem" />
      </div>
      <SkeletonBox width="40%" height="2rem" className="mb-2" />
      <SkeletonBox width="80%" height="0.75rem" />
    </div>
  );
}

/**
 * Skeleton Score Card - For Oura-style score cards
 */
export function SkeletonScoreCard({ className = '' }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <SkeletonBox width="50%" height="1rem" />
        <SkeletonCircle size="1.5rem" />
      </div>
      <div className="flex items-center gap-4 mb-4">
        <SkeletonCircle size="4rem" />
        <div className="flex-1">
          <SkeletonBox width="60%" height="1.5rem" className="mb-2" />
          <SkeletonBox width="80%" height="0.875rem" />
        </div>
      </div>
      <SkeletonBox width="100%" height="0.75rem" className="mb-2" />
      <SkeletonBox width="90%" height="0.75rem" />
    </div>
  );
}

/**
 * Skeleton Insight Card - For AI insights/action steps
 */
export function SkeletonInsightCard({ className = '' }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6 ${className}`}>
      <div className="flex items-start gap-3 mb-3">
        <SkeletonCircle size="2rem" />
        <div className="flex-1">
          <SkeletonBox width="70%" height="1rem" className="mb-2" />
          <SkeletonBox width="100%" height="0.75rem" className="mb-1" />
          <SkeletonBox width="90%" height="0.75rem" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton Activity Item - For recent activity list
 */
export function SkeletonActivityItem({ className = '' }) {
  return (
    <div className={`flex items-center gap-4 p-4 border-b border-[#2a2a2a] ${className}`}>
      <SkeletonCircle size="2.5rem" />
      <div className="flex-1">
        <SkeletonBox width="70%" height="1rem" className="mb-2" />
        <SkeletonBox width="50%" height="0.75rem" />
      </div>
      <SkeletonBox width="4rem" height="0.75rem" />
    </div>
  );
}

/**
 * Skeleton Journal Entry - For journal list
 */
export function SkeletonJournalEntry({ className = '' }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <SkeletonCircle size="2.5rem" />
          <div>
            <SkeletonBox width="8rem" height="1rem" className="mb-2" />
            <SkeletonBox width="6rem" height="0.75rem" />
          </div>
        </div>
        <SkeletonBox width="5rem" height="0.75rem" />
      </div>
      <SkeletonBox width="100%" height="0.875rem" className="mb-2" />
      <SkeletonBox width="95%" height="0.875rem" className="mb-2" />
      <SkeletonBox width="85%" height="0.875rem" className="mb-4" />
      <div className="flex gap-2">
        <SkeletonBox width="4rem" height="1.5rem" className="rounded-full" />
        <SkeletonBox width="4rem" height="1.5rem" className="rounded-full" />
      </div>
    </div>
  );
}

/**
 * Skeleton Kill Target - For kill list items
 */
export function SkeletonKillTarget({ className = '' }) {
  return (
    <div className={`bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <SkeletonCircle size="2rem" />
          <SkeletonBox width="60%" height="1.25rem" />
        </div>
        <SkeletonBox width="4rem" height="1.5rem" className="rounded-full" />
      </div>
      <div className="flex items-center gap-4 mb-3">
        <SkeletonBox width="5rem" height="0.75rem" className="rounded-full" />
        <SkeletonBox width="4rem" height="0.75rem" className="rounded-full" />
      </div>
      <SkeletonBox width="100%" height="0.5rem" className="rounded-full" />
    </div>
  );
}

/**
 * Skeleton List - Generic list of skeleton items
 */
export function SkeletonList({ count = 3, ItemComponent = SkeletonActivityItem, className = '' }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <ItemComponent key={i} className="mb-4 last:mb-0" />
      ))}
    </div>
  );
}

/**
 * Skeleton Dashboard - Full dashboard loading state
 */
export function SkeletonDashboard() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Triple Ring */}
        <div className="lg:col-span-1">
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6">
            <SkeletonBox width="50%" height="1.25rem" className="mb-6" />
            <div className="flex justify-center mb-6">
              <SkeletonTripleRing size={200} />
            </div>
            <SkeletonBox width="100%" height="0.75rem" className="mb-2" />
            <SkeletonBox width="80%" height="0.75rem" />
          </div>
        </div>

        {/* Middle Column - Insights */}
        <div className="lg:col-span-1">
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6">
            <SkeletonBox width="60%" height="1.25rem" className="mb-6" />
            <SkeletonList count={3} ItemComponent={SkeletonInsightCard} />
          </div>
        </div>

        {/* Right Column - Activity */}
        <div className="lg:col-span-1">
          <div className="bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl p-6">
            <SkeletonBox width="60%" height="1.25rem" className="mb-6" />
            <SkeletonList count={4} ItemComponent={SkeletonActivityItem} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton Journal Page - Full journal loading state
 */
export function SkeletonJournalPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <SkeletonBox width="40%" height="2rem" className="mb-8" />
      
      {/* Journal Entries */}
      <SkeletonList count={3} ItemComponent={SkeletonJournalEntry} />
    </div>
  );
}

/**
 * Skeleton KillList Page - Full kill list loading state
 */
export function SkeletonKillListPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <SkeletonBox width="15rem" height="2rem" />
        <SkeletonBox width="8rem" height="2.5rem" className="rounded-lg" />
      </div>
      
      {/* Filter Tabs */}
      <div className="flex gap-4 mb-6">
        <SkeletonBox width="5rem" height="2rem" className="rounded-lg" />
        <SkeletonBox width="5rem" height="2rem" className="rounded-lg" />
        <SkeletonBox width="5rem" height="2rem" className="rounded-lg" />
      </div>
      
      {/* Kill Targets */}
      <SkeletonList count={4} ItemComponent={SkeletonKillTarget} />
    </div>
  );
}

export default {
  Box: SkeletonBox,
  Circle: SkeletonCircle,
  Ring: SkeletonRing,
  TripleRing: SkeletonTripleRing,
  Card: SkeletonCard,
  ScoreCard: SkeletonScoreCard,
  InsightCard: SkeletonInsightCard,
  ActivityItem: SkeletonActivityItem,
  JournalEntry: SkeletonJournalEntry,
  KillTarget: SkeletonKillTarget,
  List: SkeletonList,
  Dashboard: SkeletonDashboard,
  JournalPage: SkeletonJournalPage,
  KillListPage: SkeletonKillListPage
};
