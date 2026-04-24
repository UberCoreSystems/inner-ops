import React from 'react';

// Small pill that toggles between active and archive views.
// Mirrors the `Active (N) · Archive (M)` pattern from the archive plan.
export default function ArchiveToggle({ view, onChange, activeCount, archiveCount, className = '' }) {
  const btn = (value, label, count) => {
    const isOn = view === value;
    return (
      <button
        onClick={() => onChange(value)}
        className={`px-3 py-1.5 text-xs uppercase tracking-widest rounded-full transition-colors border ${
          isOn
            ? 'bg-white text-black border-white'
            : 'bg-transparent text-[#858585] border-transparent hover:text-white hover:border-[#2a2a2a]'
        }`}
      >
        <span>{label}</span>
        <span className="ml-1.5 text-[10px] opacity-70 tabular-nums">{count ?? 0}</span>
      </button>
    );
  };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {btn('active', 'Active', activeCount)}
      {btn('archive', 'Archive', archiveCount)}
    </div>
  );
}
