import React, { useEffect, useState } from 'react';

/**
 * Oura-style Circular Progress Ring Component
 * Creates the signature stacked ring visualization
 */
export const CircularProgressRing = React.memo(function CircularProgressRing({ 
  progress = 0, 
  size = 120, 
  strokeWidth = 8, 
  color = '#00d4aa',
  trackColor = '#1a1a1a',
  showGlow = true,
  animateOnMount = true,
  children 
}) {
  const [animatedProgress, setAnimatedProgress] = useState(animateOnMount ? 0 : progress);
  
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (animatedProgress / 100) * circumference;
  
  useEffect(() => {
    if (animateOnMount) {
      const timer = setTimeout(() => {
        setAnimatedProgress(progress);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setAnimatedProgress(progress);
    }
  }, [progress, animateOnMount]);

  return (
    <div className="oura-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        {/* Glow effect layer */}
        {showGlow && (
          <circle
            className="oura-ring-glow"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth + 4}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            fill="none"
            style={{ 
              filter: 'blur(8px)',
              opacity: 0.4,
              transition: 'stroke-dashoffset 1s ease-out'
            }}
          />
        )}
        
        {/* Track */}
        <circle
          className="oura-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={trackColor}
        />
        
        {/* Progress */}
        <circle
          className="oura-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      
      {/* Center content */}
      {children && (
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {children}
        </div>
      )}
    </div>
  );
});

/**
 * Stacked Triple Ring - Like Oura's main readiness display
 */
export const TripleRing = React.memo(function TripleRing({
  rings = [
    { progress: 75, color: '#00d4aa', label: 'Clarity' },
    { progress: 60, color: '#4da6ff', label: 'Activity' },
    { progress: 85, color: '#a855f7', label: 'Focus' }
  ],
  size = 200,
  centerContent
}) {
  const baseStrokeWidth = 10;
  const gap = 14;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {rings.map((ring, index) => {
        const ringSize = size - (index * gap * 2);
        const offset = index * gap;
        
        return (
          <div
            key={index}
            className="absolute"
            style={{ 
              top: offset, 
              left: offset,
              width: ringSize,
              height: ringSize
            }}
          >
            <CircularProgressRing
              progress={ring.progress}
              size={ringSize}
              strokeWidth={baseStrokeWidth}
              color={ring.color}
              showGlow={true}
            />
          </div>
        );
      })}
      
      {/* Center content */}
      {centerContent && (
        <div className="absolute inset-0 flex items-center justify-center">
          {centerContent}
        </div>
      )}
    </div>
  );
});

/**
 * Score Card - Oura-style metric display
 */
export const ScoreCard = React.memo(function ScoreCard({ 
  score, 
  label, 
  sublabel,
  color = '#00d4aa',
  icon,
  trend,
  size = 'medium',
  onClick
}) {
  const sizeClasses = {
    small: 'p-4',
    medium: 'p-6',
    large: 'p-8'
  };

  const scoreSizes = {
    small: 'text-2xl',
    medium: 'text-4xl',
    large: 'text-5xl'
  };

  return (
    <div 
      className={`oura-card ${sizeClasses[size]} cursor-pointer group`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#8a8a8a] text-sm font-medium uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className="text-xl opacity-60 group-hover:opacity-100 transition-opacity">
            {icon}
          </span>
        )}
      </div>
      
      <div className="flex items-end gap-2">
        <span 
          className={`oura-score ${scoreSizes[size]} font-bold`}
          style={{ color }}
        >
          {score}
        </span>
        {trend && (
          <span className={`text-sm mb-1 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      
      {sublabel && (
        <p className="text-[#5a5a5a] text-sm mt-2">{sublabel}</p>
      )}
    </div>
  );
});

/**
 * Insight Card - For AI insights and recommendations
 */
export const InsightCard = React.memo(function InsightCard({ 
  title, 
  description, 
  icon = '💡',
  accentColor = '#00d4aa',
  action
}) {
  return (
    <div 
      className="oura-card p-5 group hover:border-[#2a2a2a] transition-all duration-300"
      style={{ 
        borderLeft: `3px solid ${accentColor}`,
        background: `linear-gradient(90deg, ${accentColor}08 0%, transparent 30%)`
      }}
    >
      <div className="flex gap-4">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <span className="text-lg">{icon}</span>
        </div>
        <div className="flex-1">
          <h4 className="text-white font-medium mb-1">{title}</h4>
          <p className="text-[#8a8a8a] text-sm leading-relaxed">{description}</p>
          {action && (
            <button 
              className="mt-3 text-sm font-medium transition-colors"
              style={{ color: accentColor }}
              onClick={action.onClick}
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

/**
 * Activity Item - For recent activity feed
 */
export const ActivityItem = React.memo(function ActivityItem({ 
  type, 
  title, 
  description, 
  time, 
  icon,
  color 
}) {
  return (
    <div className="flex gap-4 p-4 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#2a2a2a] transition-all duration-300">
      <div 
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <span className="text-lg">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span 
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color }}
          >
            {type}
          </span>
          <span className="text-[#5a5a5a] text-xs">{time}</span>
        </div>
        <p className="text-white text-sm truncate">{title}</p>
        {description && (
          <p className="text-[#5a5a5a] text-sm mt-1 line-clamp-2">{description}</p>
        )}
      </div>
    </div>
  );
});

export default CircularProgressRing;
