import React from 'react';
import { intensityLevels } from '../constants/moods';

// Compact intensity picker — 5 horizontal bars (h-2, flex-1) with the
// selected-level label inline in the header. Originated in
// TodaysReflectionModal; extracted so the Journal page matches.
function IntensityPicker({ value, onChange }) {
  const selected = intensityLevels.find((l) => l.value === value);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-[#ababab] text-xs uppercase tracking-wider">
          Intensity
        </label>
        <span className="text-[#858585] text-xs">{selected?.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {intensityLevels.map((l) => {
          const active = value >= l.value;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => onChange(l.value)}
              className="flex-1 h-2 rounded-full transition-all"
              style={{
                background: active ? '#a855f7' : '#1a1a1a',
                boxShadow:
                  active && value === l.value
                    ? '0 0 8px rgba(168, 85, 247, 0.35)'
                    : 'none',
              }}
              aria-label={`Intensity ${l.value}: ${l.label}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(IntensityPicker);
