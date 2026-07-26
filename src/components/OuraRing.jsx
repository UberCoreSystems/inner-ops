import React from 'react';

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
  onClick,
  glow = false
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
      className={`oura-card ${sizeClasses[size]} h-full flex flex-col justify-center${onClick ? ' cursor-pointer' : ''}${glow ? ' oura-card-accent-hover' : ''} group`}
      style={glow ? { '--card-accent-glow': `${color}4d` } : undefined}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[#ababab] text-sm font-medium uppercase tracking-wider">
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
        <p className="text-[#858585] text-sm mt-2">{sublabel}</p>
      )}
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
  color,
  onClick
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Lit card with a per-module accent — glows on hover (desktop) / at rest
      // (touch) exactly like the other dashboard cards. The whole row is the
      // tap target so review is one click from here.
      className="oura-card oura-card-lit flex gap-4 p-4 w-full text-left group cursor-pointer transition-all"
      style={{ '--lit-accent': color }}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-xs font-medium uppercase tracking-wider"
            style={{ color }}
          >
            {type}
          </span>
          <span className="text-[#858585] text-xs">{time}</span>
        </div>
        <p className="text-white text-sm truncate">{title}</p>
        {description && (
          <p className="text-[#858585] text-sm mt-1 line-clamp-2">{description}</p>
        )}
      </div>
    </button>
  );
});
