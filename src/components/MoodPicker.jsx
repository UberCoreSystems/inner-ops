import React from 'react';
import { moodCategories } from '../constants/moods';

// Compact mood picker — 3 rows (one per valence category), all 12 moods
// visible at once as pill buttons. Originated in TodaysReflectionModal;
// extracted so the Journal page and the modal stay visually identical.
function MoodPicker({ value, onChange }) {
  return (
    <div className="space-y-2">
      {moodCategories.map((cat) => (
        <div key={cat.name} className="flex items-center gap-2">
          <span
            className="text-[10px] uppercase tracking-widest w-20 shrink-0"
            style={{ color: `${cat.color}99` }}
          >
            {cat.name}
          </span>
          <div className="flex flex-wrap gap-1.5 flex-1">
            {cat.moods.map((m) => {
              const active = value === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChange(m.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
                    active
                      ? 'text-white border-transparent'
                      : 'text-[#858585] border-[#1a1a1a] hover:text-white hover:border-[#2a2a2a]'
                  }`}
                  style={
                    active
                      ? {
                          backgroundColor: `${cat.color}1a`,
                          borderColor: `${cat.color}66`,
                          color: cat.color,
                        }
                      : {}
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default React.memo(MoodPicker);
