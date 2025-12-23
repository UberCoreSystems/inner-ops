import React from 'react';

/**
 * Oura-style minimalist icons with optional glow effect
 * Consistent icon system for the entire app
 */

// Icon component wrapper with glow effect
export const GlowIcon = ({ 
  children, 
  color = 'currentColor', 
  size = 24, 
  glow = true,
  glowIntensity = 0.4,
  className = '' 
}) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ 
        color,
        filter: glow ? `drop-shadow(0 0 ${size/4}px ${color})` : 'none',
      }}
    >
      {/* Glow layer */}
      {glow && (
        <div 
          className="absolute inset-0 flex items-center justify-center"
          style={{ 
            filter: `blur(${size/3}px)`,
            opacity: glowIntensity,
          }}
        >
          {React.cloneElement(children, { style: { color } })}
        </div>
      )}
      {/* Main icon */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

// Individual icon SVGs - Oura-style minimalist design
export const Icons = {
  // Dashboard / Rings
  dashboard: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  ),

  // Journal / Writing
  journal: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" />
      <path d="M8 8h8M8 12h8M8 16h4" opacity="0.7" />
    </svg>
  ),

  // Kill List / Target
  target: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  ),

  // Hard Lessons / Star/Bolt
  hardLessons: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15,10 23,10 17,15 19,23 12,18 5,23 7,15 1,10 9,10" />
    </svg>
  ),

  // Black Mirror / Reflection
  mirror: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="4" opacity="0.5" />
    </svg>
  ),

  // Relapse / Warning
  relapse: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 22h20L12 2z" />
      <line x1="12" y1="9" x2="12" y2="14" opacity="0.7" />
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),

  // Profile / User
  profile: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 4-6 8-6s8 2 8 6" opacity="0.7" />
    </svg>
  ),

  // Streak / Shield
  streak: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v6c0 5.5 3.5 10 8 11 4.5-1 8-5.5 8-11V6l-8-4z" />
      <path d="M12 8v4M12 16h.01" opacity="0.7" />
    </svg>
  ),

  // Writing Streak / Pen
  writing: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3l4 4-12 12H5v-4L17 3z" />
      <line x1="13" y1="7" x2="17" y2="11" opacity="0.5" />
    </svg>
  ),

  // Activity / Pulse
  activity: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22,12 18,12 15,21 9,3 6,12 2,12" />
    </svg>
  ),

  // Clarity / Diamond
  clarity: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="6,3 18,3 22,9 12,21 2,9" />
      <line x1="2" y1="9" x2="22" y2="9" opacity="0.5" />
      <line x1="12" y1="3" x2="12" y2="9" opacity="0.5" />
      <line x1="12" y1="9" x2="12" y2="21" />
    </svg>
  ),

  // Fire / Flame (for intensity)
  fire: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22c4-2 7-6 7-11 0-3-2-5-4-6-1 2-2 3-3 3s-2-1-3-3c-2 1-4 3-4 6 0 5 3 9 7 11z" />
      <path d="M12 22c-2-1-3-3-3-5 0-2 1-3 2-4 .5 1 1 2 1 2s.5-1 1-2c1 1 2 2 2 4 0 2-1 4-3 5z" opacity="0.5" />
    </svg>
  ),

  // Calendar / Schedule
  calendar: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" opacity="0.5" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
    </svg>
  ),

  // Check / Complete
  check: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="8,12 11,15 16,9" opacity="0.9" />
    </svg>
  ),

  // Alert / Emergency
  emergency: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),

  // Compass / Direction
  compass: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none" opacity="0.7" />
    </svg>
  ),

  // Insight / Lightbulb
  insight: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4" opacity="0.5" />
      <path d="M12 2a7 7 0 0 1 4 12.7V17H8v-2.3A7 7 0 0 1 12 2z" />
    </svg>
  ),

  // Search / Eye (for self-awareness)
  search: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
      <circle cx="11" cy="11" r="2" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
  ),

  // Bolt / Energy (for action)
  bolt: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" fill="currentColor" opacity="0.15" />
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
    </svg>
  ),

  // Moon / Shadow (for shadow work)
  moon: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  ),

  // Heart / Gratitude
  heart: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),

  // Sunrise (for new day/prompt)
  sunrise: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 18a5 5 0 0 0-10 0" />
      <line x1="12" y1="9" x2="12" y2="3" />
      <line x1="4" y1="18" x2="2" y2="18" opacity="0.5" />
      <line x1="22" y1="18" x2="20" y2="18" opacity="0.5" />
      <line x1="6.34" y1="12.34" x2="4.93" y2="10.93" opacity="0.5" />
      <line x1="19.07" y1="10.93" x2="17.66" y2="12.34" opacity="0.5" />
      <line x1="2" y1="22" x2="22" y2="22" opacity="0.7" />
    </svg>
  ),

  // Shield (for recovery/protection) - already have streak, adding dedicated shield
  shield: (size = 24) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L4 6v6c0 5.5 3.5 10 8 11 4.5-1 8-5.5 8-11V6l-8-4z" />
      <polyline points="9,12 11,14 15,10" opacity="0.7" />
    </svg>
  ),
};

/**
 * Pre-styled icon component for common use cases
 */
export const AppIcon = ({ 
  name, 
  size = 24, 
  color = 'currentColor', 
  glow = true,
  glowIntensity = 0.4,
  className = '' 
}) => {
  const iconFn = Icons[name];
  if (!iconFn) {
    console.warn(`Icon "${name}" not found`);
    return null;
  }

  return (
    <GlowIcon 
      color={color} 
      size={size} 
      glow={glow} 
      glowIntensity={glowIntensity}
      className={className}
    >
      {iconFn(size)}
    </GlowIcon>
  );
};

// Mapping for ScoreCard compatibility - returns JSX instead of emoji
export const getScoreCardIcon = (iconName, size = 20, color = 'currentColor') => {
  return <AppIcon name={iconName} size={size} color={color} glow={true} glowIntensity={0.5} />;
};

export default Icons;
