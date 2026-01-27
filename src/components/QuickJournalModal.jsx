import React, { useState, useEffect, useCallback } from 'react';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

// Custom SVG mood icons - Oura-style geometric designs (matching Journal.jsx)
const MoodIcons = {
  electric: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  foggy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14h16M4 10h16M4 18h12" opacity="0.6" />
      <circle cx="12" cy="8" r="4" opacity="0.3" />
    </svg>
  ),
  sharp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7l2-7z" />
    </svg>
  ),
  hollow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" opacity="0.3" />
    </svg>
  ),
  chaotic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" />
      <path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10" opacity="0.5" />
      <path d="M2 12h20M12 2v20" opacity="0.3" />
    </svg>
  ),
  triumphant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6 1-4.5 4 1.5 6-6-3.5L6 19l1.5-6L3 9l6-1 3-6z" />
    </svg>
  ),
  heavy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12M12 12L6 6M12 12l6-6" />
      <circle cx="12" cy="22" r="2" fill="currentColor" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" opacity="0.5" />
    </svg>
  ),
  focused: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  radiant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
    </svg>
  ),
  steady: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16" />
      <path d="M8 8h8M8 16h8" opacity="0.5" />
    </svg>
  ),
  calm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-2 4-3 6-3s4 2 6 2 4-1 6-3" />
      <path d="M2 16c2-2 4-3 6-3s4 2 6 2 4-1 6-3" opacity="0.5" />
    </svg>
  ),
};

// Mood categories grouped by emotional valence (matching Journal.jsx)
const moodCategories = [
  {
    name: 'Energized',
    color: '#22c55e',
    bgColor: 'bg-[#22c55e]/10',
    borderColor: 'border-[#22c55e]',
    moods: [
      { label: 'Electric', value: 'electric', description: 'Charged and alive' },
      { label: 'Light', value: 'light', description: 'Unburdened and free' },
      { label: 'Radiant', value: 'radiant', description: 'Glowing from within' },
      { label: 'Triumphant', value: 'triumphant', description: 'Victorious and proud' },
    ]
  },
  {
    name: 'Grounded',
    color: '#4da6ff',
    bgColor: 'bg-[#4da6ff]/10',
    borderColor: 'border-[#4da6ff]',
    moods: [
      { label: 'Focused', value: 'focused', description: 'Clear and intentional' },
      { label: 'Sharp', value: 'sharp', description: 'Precise and alert' },
      { label: 'Steady', value: 'steady', description: 'Balanced and stable' },
      { label: 'Calm', value: 'calm', description: 'Peaceful and still' },
    ]
  },
  {
    name: 'Challenged',
    color: '#f59e0b',
    bgColor: 'bg-[#f59e0b]/10',
    borderColor: 'border-[#f59e0b]',
    moods: [
      { label: 'Heavy', value: 'heavy', description: 'Weighed down' },
      { label: 'Hollow', value: 'hollow', description: 'Empty inside' },
      { label: 'Foggy', value: 'foggy', description: 'Unclear and hazy' },
      { label: 'Chaotic', value: 'chaotic', description: 'Scattered energy' },
    ]
  }
];

// Flatten for easy lookup
const moodOptions = moodCategories.flatMap(cat => 
  cat.moods.map(m => ({ ...m, category: cat.name, color: cat.color }))
);

// Ring-based intensity levels (matching Journal.jsx)
const intensityLevels = [
  { value: 1, label: 'Subtle', description: 'A whisper in the background', rings: 1 },
  { value: 2, label: 'Present', description: 'Noticeable but manageable', rings: 2 },
  { value: 3, label: 'Strong', description: 'Commanding your attention', rings: 3 },
  { value: 4, label: 'Overwhelming', description: 'Hard to ignore', rings: 4 },
  { value: 5, label: 'Consuming', description: 'All-encompassing', rings: 5 },
];

// Intensity ring visualization component (matching Journal.jsx)
const IntensityRing = ({ level, selected, onClick }) => {
  const rings = intensityLevels.find(l => l.value === level)?.rings || 1;
  const isActive = selected >= level;
  
  // Color gradient from cool to warm
  const getColor = (lvl) => {
    const colors = ['#4da6ff', '#00d4aa', '#22c55e', '#f59e0b', '#ef4444'];
    return colors[lvl - 1];
  };
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center transition-all duration-300"
    >
      <div className="relative w-14 h-14 flex items-center justify-center">
        {[...Array(rings)].map((_, i) => (
          <div
            key={i}
            className={`absolute rounded-full border-2 transition-all duration-500 ${
              isActive 
                ? 'opacity-100' 
                : 'opacity-20 group-hover:opacity-40'
            }`}
            style={{
              width: `${28 + i * 10}px`,
              height: `${28 + i * 10}px`,
              borderColor: isActive ? getColor(level) : '#3a3a3a',
              animationDelay: `${i * 0.1}s`,
              boxShadow: isActive && selected === level ? `0 0 ${10 + i * 5}px ${getColor(level)}40` : 'none',
            }}
          />
        ))}
        <div 
          className={`w-3 h-3 rounded-full transition-all duration-300 ${
            isActive ? 'scale-100' : 'scale-50 opacity-30'
          }`}
          style={{ backgroundColor: isActive ? getColor(level) : '#3a3a3a' }}
        />
      </div>
    </button>
  );
};

const QuickJournalModal = React.memo(function QuickJournalModal({ isOpen, onClose, onSuccess }) {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState('focused');
  const [selectedCategory, setSelectedCategory] = useState('Grounded');
  const [intensity, setIntensity] = useState(3);
  const [saving, setSaving] = useState(false);
  const [showOracle, setShowOracle] = useState(false);
  const [oracleResponse, setOracleResponse] = useState('');
  const [oracleLoading, setOracleLoading] = useState(false);

  // Set initial mood and category on open
  useEffect(() => {
    if (isOpen) {
      setEntry('');
      setMood('focused');
      setSelectedCategory('Grounded');
      setIntensity(3);
      setShowOracle(false);
      setOracleResponse('');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSave = useCallback(async () => {
    if (!entry.trim()) return;

    setSaving(true);
    try {
      const journalEntry = {
        content: entry.trim(),
        mood: mood || 'focused',
        intensity: intensity,
        createdAt: new Date().toISOString(),
        isQuickEntry: true,
      };

      await writeData('journalEntries', journalEntry);
      
      ouraToast.success('Quick journal entry saved');
      
      // Generate Oracle feedback if entry is substantial
      if (entry.trim().split(/\s+/).length >= 10) {
        setOracleLoading(true);
        try {
          const feedback = await generateAIFeedback(entry, 'journal', {
            mood: mood || 'focused',
            intensity: intensity,
          });
          setOracleResponse(feedback);
          setShowOracle(true);
        } catch (error) {
          logger.error('Oracle feedback error:', error);
        }
        setOracleLoading(false);
      } else {
        // Quick close for short entries
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      logger.error('Error saving quick entry:', error);
    } finally {
      setSaving(false);
    }
  }, [entry, mood, intensity, onSuccess, onClose]);

  const handleDone = useCallback(() => {
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" />
                <path d="M8 8h8M8 12h8M8 16h4" opacity="0.7" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-light">Quick Entry</h2>
              <p className="text-[#5a5a5a] text-xs">Capture your thoughts quickly</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5a5a5a] hover:text-white hover:bg-[#1a1a1a] transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showOracle ? (
          <>
            {/* Mood Category Selection */}
            <div className="p-4 border-b border-[#1a1a1a]">
              <p className="text-[#5a5a5a] text-xs uppercase tracking-wider mb-3">How are you feeling?</p>
              <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                {moodCategories.map((category) => (
                  <button
                    key={category.name}
                    onClick={() => setSelectedCategory(category.name)}
                    className={`px-3 py-1 rounded-lg text-xs font-light whitespace-nowrap transition-all ${
                      selectedCategory === category.name
                        ? category.bgColor + ' border border-[#2a2a2a] text-white'
                        : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#5a5a5a] hover:border-[#2a2a2a]'
                    }`}
                    style={{ 
                      color: selectedCategory === category.name ? category.color : undefined,
                      borderColor: selectedCategory === category.name ? category.color : undefined,
                    }}
                  >
                    {category.name}
                  </button>
                ))}
              </div>

              {/* Mood options for selected category */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {moodCategories.find(c => c.name === selectedCategory)?.moods.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMood(m.value)}
                    className={`p-3 rounded-xl border-2 transition-all group ${
                      mood === m.value
                        ? `bg-[#1a1a1a] border-[${m.color}]`
                        : 'bg-[#0a0a0a] border-[#1a1a1a] hover:border-[#2a2a2a]'
                    }`}
                    style={{ 
                      borderColor: mood === m.value ? m.color : undefined,
                    }}
                  >
                    <div className={`w-6 h-6 mx-auto mb-2 text-white ${mood === m.value ? 'opacity-100' : 'opacity-60 group-hover:opacity-80'}`} style={{ color: m.color }}>
                      {MoodIcons[m.value]}
                    </div>
                    <p className={`text-xs font-light text-center ${mood === m.value ? 'text-white' : 'text-[#5a5a5a]'}`}>
                      {m.label}
                    </p>
                    <p className={`text-[10px] text-center mt-1 ${mood === m.value ? 'text-[#8a8a8a]' : 'text-[#3a3a3a]'}`}>
                      {m.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Intensity Selection */}
            <div className="p-4 border-b border-[#1a1a1a]">
              <p className="text-[#5a5a5a] text-xs uppercase tracking-wider mb-4">Intensity</p>
              <div className="flex gap-4 justify-between items-end mb-3">
                {intensityLevels.map((level) => (
                  <div key={level.value} className="flex flex-col items-center gap-2">
                    <IntensityRing 
                      level={level.value} 
                      selected={intensity} 
                      onClick={() => setIntensity(level.value)}
                    />
                    <div className="text-center">
                      <p className={`text-xs font-light ${intensity === level.value ? 'text-white' : 'text-[#5a5a5a]'}`}>
                        {level.label}
                      </p>
                      <p className={`text-[10px] ${intensity === level.value ? 'text-[#8a8a8a]' : 'text-[#3a3a3a]'}`}>
                        {level.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Text Input */}
            <div className="p-4">
              <textarea
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="Write what's on your mind..."
                className="w-full h-32 bg-transparent text-white placeholder-[#3a3a3a] resize-none outline-none text-base font-light leading-relaxed"
                autoFocus
              />
              
              {/* Character/Word count */}
              <div className="flex items-center justify-between mt-2 text-[#3a3a3a] text-xs">
                <span>{entry.trim().split(/\s+/).filter(w => w).length} words</span>
                <span className="text-[#5a5a5a]">Press ⌘+Enter to save</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t border-[#1a1a1a] bg-[#050505]">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[#5a5a5a] text-sm hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!entry.trim() || saving}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  entry.trim() && !saving
                    ? 'bg-[#a855f7] text-white hover:bg-[#9333ea] hover:shadow-lg hover:shadow-[#a855f7]/20'
                    : 'bg-[#1a1a1a] text-[#3a3a3a] cursor-not-allowed'
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    Save Entry
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Oracle Response */
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a855f7] to-[#6366f1] flex items-center justify-center">
                <span className="text-lg">🔮</span>
              </div>
              <div>
                <h3 className="text-white font-light">The Oracle Speaks</h3>
                <p className="text-[#5a5a5a] text-xs">Reflection on your entry</p>
              </div>
            </div>
            
            {oracleLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-[#a855f7]/30 border-t-[#a855f7] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-[#1a1a1a]/50 rounded-xl p-4 mb-6">
                <p className="text-[#8a8a8a] text-sm leading-relaxed italic">
                  "{oracleResponse}"
                </p>
              </div>
            )}
            
            <button
              onClick={handleDone}
              className="w-full py-3 rounded-xl bg-[#a855f7] text-white font-medium hover:bg-[#9333ea] transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default QuickJournalModal;
