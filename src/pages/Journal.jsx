import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { writeData, readUserData, deleteData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';
import ouraToast from '../utils/toast';
import { SkeletonList, SkeletonJournalEntry } from '../components/SkeletonLoader';
import logger from '../utils/logger';

// Custom SVG mood icons - Oura-style geometric designs
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

// Mood categories grouped by emotional valence
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

// Flatten for backward compatibility
const moodOptions = moodCategories.flatMap(cat => 
  cat.moods.map(m => ({ ...m, category: cat.name, color: cat.color }))
);

// Ring-based intensity levels
const intensityLevels = [
  { value: 1, label: 'Subtle', description: 'A whisper in the background', rings: 1 },
  { value: 2, label: 'Present', description: 'Noticeable but manageable', rings: 2 },
  { value: 3, label: 'Strong', description: 'Commanding your attention', rings: 3 },
  { value: 4, label: 'Overwhelming', description: 'Hard to ignore', rings: 4 },
  { value: 5, label: 'Consuming', description: 'All-encompassing', rings: 5 },
];

// Intensity ring visualization component
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

export default function Journal() {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState('focused');
  const [selectedCategory, setSelectedCategory] = useState('Grounded');
  const [intensity, setIntensity] = useState(3);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [aiInsights, setAiInsights] = useState({ reflections: [], isGenerating: false, lastUpdated: null });
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const [currentEntryInput, setCurrentEntryInput] = useState(''); // Track original input for oracle follow-up
  const [currentEntryId, setCurrentEntryId] = useState(null); // Track which entry is being answered
  
  // State for rotating prompts
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);

  const journalPrompts = [
    "What am I most grateful for today?",
    "What challenged me and how did I handle it?",
    "What patterns am I noticing in my behavior?",
    "What triggered strong emotions today?",
    "What would I do differently if I could replay today?",
    "What small win can I celebrate today?",
    "What fear held me back today?",
    "What am I learning about myself?"
  ];

  useEffect(() => {
    loadJournalEntries();
  }, []);

  // Delay showing skeleton to prevent flicker
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (initialLoading) {
        setShowSkeleton(true);
      }
    }, 200);

    return () => clearTimeout(skeletonTimer);
  }, [initialLoading]);

  // Keep skeleton visible briefly once shown to avoid blink on fast completion
  useEffect(() => {
    let dwellTimer;
    if (!initialLoading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [initialLoading, showSkeleton]);

  // Effect for rotating prompts
  useEffect(() => {
    const interval = setInterval(() => {
      // Fade out
      setPromptVisible(false);
      
      // After fade out completes, change prompt and fade in
      setTimeout(() => {
        setCurrentPromptIndex((prev) => (prev + 1) % journalPrompts.length);
        setPromptVisible(true);
      }, 300); // Half of the transition duration
      
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, [journalPrompts.length]);

  // Dynamic AI insights generation
  useEffect(() => {
    const generateDynamicInsights = async () => {
      // Only generate if we have meaningful content and haven't generated recently
      if (entry.length < 50 || 
          (aiInsights.lastUpdated && Date.now() - aiInsights.lastUpdated < 5000)) {
        return;
      }

      setAiInsights(prev => ({ ...prev, isGenerating: true }));

      try {
        // Create context from current entry state
        const currentContext = {
          mood: moodOptions.find(m => m.value === mood)?.label || mood,
          intensity,
          content: entry,
          wordCount: entry.trim().split(/\s+/).length
        };

        // Get recent entries for pattern analysis
        const recentEntries = entries.slice(0, 3);
        
        // Generate contextual insights
        const insights = await generateContextualInsights(currentContext, recentEntries);
        
        setAiInsights({
          reflections: insights,
          isGenerating: false,
          lastUpdated: Date.now()
        });
      } catch (error) {
        logger.error('Error generating dynamic insights:', error);
        setAiInsights(prev => ({ 
          ...prev, 
          isGenerating: false,
          reflections: ['Insights are temporarily unavailable. Continue writing to explore your thoughts.']
        }));
      }
    };

    // Debounce the insight generation
    const timeoutId = setTimeout(generateDynamicInsights, 2000);
    return () => clearTimeout(timeoutId);
  }, [entry, mood, intensity, entries]);

  // Generate contextual insights based on current writing
  const generateContextualInsights = async (currentContext, recentEntries) => {
    const { mood, intensity, content, wordCount } = currentContext;
    
    // Analyze writing patterns
    const insights = [];
    
    // Content-based insights
    if (content.toLowerCase().includes('stress') || content.toLowerCase().includes('overwhelm')) {
      insights.push("Consider: What specific stressors can you control vs. accept?");
    }
    
    if (content.toLowerCase().includes('angry') || content.toLowerCase().includes('frustrated')) {
      insights.push("Reflection: What boundary or value might have been crossed?");
    }
    
    if (content.toLowerCase().includes('grateful') || content.toLowerCase().includes('thankful')) {
      insights.push("Expansion: How can you build on this gratitude throughout your day?");
    }
    
    // Mood and intensity insights
    if (mood === 'chaotic' && intensity >= 4) {
      insights.push("High chaos energy detected. Consider grounding techniques or channeling this into creative work.");
    }
    
    if (mood === 'hollow' || mood === 'heavy') {
      insights.push("These feelings often signal unmet needs. What might your soul be asking for?");
    }
    
    // Pattern analysis with recent entries
    if (recentEntries.length > 0) {
      const recentMoods = recentEntries.map(e => e.mood);
      const isRepeatingPattern = recentMoods.filter(m => m === mood).length >= 2;
      
      if (isRepeatingPattern) {
        insights.push(`Pattern notice: This is your ${recentMoods.filter(m => m === mood).length + 1}rd time feeling ${mood} recently. What's the common thread?`);
      }
    }
    
    // Writing depth insights
    if (wordCount > 200) {
      insights.push("Deep dive detected. You're processing something significant. Trust the writing process.");
    } else if (wordCount < 50 && content.length > 0) {
      insights.push("Short and sweet. Sometimes the most powerful insights come in few words.");
    }
    
    // Default insight if none triggered
    if (insights.length === 0) {
      const moodInsights = {
        electric: "This energy is powerful. How can you direct it toward your goals?",
        foggy: "Clarity will come. Sometimes we need to sit in the fog to appreciate the sunshine.",
        sharp: "Your focus is cutting through noise. What truth is emerging?",
        hollow: "Empty spaces create room for new growth. What wants to fill this space?",
        chaotic: "Chaos precedes creation. What is trying to be born from this turbulence?",
        triumphant: "Victory tastes sweet. How will you build on this success?",
        heavy: "Heavy feelings often carry important messages. What is yours telling you?",
        light: "Lightness is a gift. How can you share this feeling with others?",
        focused: "Your concentration is a superpower. What deserves this level of attention?",
        radiant: "Your inner light is shining. Let others feel this warmth."
      };
      
      insights.push(moodInsights[mood] || "What patterns are you noticing in your inner world today?");
    }
    
    return insights.slice(0, 3); // Limit to 3 insights max
  };

  const loadJournalEntries = async () => {
    setInitialLoading(true);
    const savedEntries = await readUserData('journalEntries');
    setEntries(savedEntries);
    setInitialLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!entry.trim()) return;

    setLoading(true);

    try {
      // Generate AI feedback first
      const moodLabel = moodOptions.find(m => m.value === mood)?.label || mood;
      const inputText = `Mood: ${moodLabel} (${intensity}/5)\n${entry}`;
      const pastEntries = entries.slice(-3).map(e => e.content);
      
      // Store the original input for oracle follow-up
      setCurrentEntryInput(inputText);
      
      // Show Oracle modal with loading state
      setOracleModal({ isOpen: true, content: '', isLoading: true });

      const feedback = await generateAIFeedback('journal', inputText, pastEntries);
      
      // Show Oracle feedback in modal
      setOracleModal({ isOpen: true, content: feedback, isLoading: false });

      // Save entry with Oracle feedback
      const newEntry = await writeData('journalEntries', {
        content: entry,
        mood,
        intensity,
        oracleJudgment: feedback,
        oracleFollowUp: null // Initialize for potential follow-up
      });
      setEntries(prev => [newEntry, ...prev]);
      setCurrentEntryId(newEntry.id); // Track the entry ID for follow-up
      
      ouraToast.success('Journal entry saved');

      // Clear form
      setEntry('');
      setMood(moodOptions[0].value);
      setIntensity(3);
      setAiInsights({ reflections: [], isGenerating: false, lastUpdated: null });

    } catch (error) {
      logger.error("Error saving journal entry:", error);
      setOracleModal({ 
        isOpen: true, 
        content: "The Oracle encounters interference in the cosmic currents... Your thoughts are still sacred. Please try again in a moment.", 
        isLoading: false 
      });
    } finally {
      setLoading(false);
    }
  };

  // Delete journal entry
  const deleteEntry = async (entryId) => {
    if (!window.confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
      return;
    }

    try {
      logger.log("🗑️ Journal: Deleting entry:", entryId);
      await deleteData('journalEntries', entryId);
      logger.log('✅ Journal: Entry deleted successfully');
      
      // Update local state immediately
      setEntries(prev => prev.filter(entry => entry.id !== entryId));
      
      ouraToast.success('Journal entry deleted');
    } catch (error) {
      logger.error('❌ Journal: Error deleting entry:', error);
      ouraToast.error('Failed to delete journal entry');
    }
  };

  // Save oracle follow-up response
  const handleOracleFollowUpSaved = async (followUpResponse) => {
    if (!currentEntryId) return;

    try {
      // Update the entry with the oracle follow-up
      const updatedEntry = {
        ...entries.find(e => e.id === currentEntryId),
        oracleFollowUp: followUpResponse
      };

      // Write to database - use the updateData pattern if available, otherwise re-write
      await writeData('journalEntries', updatedEntry);

      // Update local state
      setEntries(prev => 
        prev.map(e => e.id === currentEntryId ? updatedEntry : e)
      );

      logger.log('✅ Oracle follow-up saved successfully');
    } catch (error) {
      logger.error('❌ Error saving oracle follow-up:', error);
      ouraToast.error('Could not save oracle follow-up response');
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Oura-style Header */}
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#5a5a5a] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">Journal</h1>
          <p className="text-[#8a8a8a]">Capture your thoughts and reflect on your journey</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-[#5a5a5a]">
            <span className="px-2 py-1 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">+2 pts per entry</span>
            <span className="px-2 py-1 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">7-day: +15 pts</span>
            <span className="px-2 py-1 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">30-day: +40 pts</span>
          </div>
        </header>

        {/* Entry Form */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="oura-card p-6 mb-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dynamic AI Insights */}
              {(aiInsights.reflections.length > 0 || aiInsights.isGenerating) && (
                <div className="mb-6 p-5 bg-[#0a0a0a] border border-[#a855f7]/20 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[#a855f7] font-medium text-sm uppercase tracking-wider">🧠 Live Insights</h3>
                    {aiInsights.isGenerating && (
                      <div className="flex items-center text-[#a855f7] text-xs">
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-[#a855f7] mr-2"></div>
                        Analyzing...
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {aiInsights.isGenerating && aiInsights.reflections.length === 0 ? (
                      <div className="text-[#d8b4fe] text-sm bg-[#a855f7]/10 p-3 rounded-xl animate-pulse">
                        Generating contextual insights based on your writing...
                      </div>
                    ) : (
                      aiInsights.reflections.map((insight, idx) => (
                        <div key={`${aiInsights.lastUpdated}-${idx}`} className="text-[#d8b4fe] text-sm bg-[#a855f7]/10 p-3 rounded-xl transition-all duration-300 ease-in-out">
                          {insight}
                        </div>
                      ))
                    )}
                  </div>
                  {aiInsights.reflections.length > 0 && (
                    <div className="mt-3 text-xs text-[#8a8a8a]">
                      💡 Insights update as you write • Based on mood, content, and patterns
                </div>
              )}
            </div>
          )}

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">How are you feeling?</label>
                
                {/* Mood History Mini-visualization */}
                {entries.length > 0 && (
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-[#5a5a5a] text-xs">Recent:</span>
                    <div className="flex gap-1">
                      {entries.slice(0, 5).map((e, i) => {
                        const moodData = moodOptions.find(m => m.value === e.mood);
                        return (
                          <div 
                            key={i}
                            className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
                            style={{ 
                              backgroundColor: `${moodData?.color || '#5a5a5a'}20`,
                              color: moodData?.color || '#5a5a5a'
                            }}
                            title={`${moodData?.label || e.mood} - ${e.timestamp?.toDate ? e.timestamp.toDate().toLocaleDateString() : e.createdAt ? new Date(e.createdAt).toLocaleDateString() : new Date(e.timestamp).toLocaleDateString()}`}
                          >
                            <div className="w-3 h-3">
                              {MoodIcons[e.mood] || <div className="w-2 h-2 rounded-full bg-current" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Category Tabs */}
                <div className="flex gap-2 mb-5">
                  {moodCategories.map((cat) => (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => setSelectedCategory(cat.name)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        selectedCategory === cat.name
                          ? `${cat.bgColor} border-2 ${cat.borderColor}`
                          : 'bg-[#0a0a0a] text-[#5a5a5a] border border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#8a8a8a]'
                      }`}
                      style={{ color: selectedCategory === cat.name ? cat.color : undefined }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Mood Options Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {moodCategories.find(c => c.name === selectedCategory)?.moods.map((option) => {
                    const category = moodCategories.find(c => c.name === selectedCategory);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMood(option.value)}
                        className={`group relative p-4 rounded-2xl border-2 transition-all duration-300 ${
                          mood === option.value
                            ? `${category.borderColor} ${category.bgColor} scale-[1.02]`
                            : 'border-transparent bg-[#0a0a0a] hover:bg-[#111] hover:border-[#2a2a2a]'
                        }`}
                        style={{ 
                          boxShadow: mood === option.value ? `0 0 20px ${category.color}30` : 'none'
                        }}
                      >
                        <div 
                          className={`w-8 h-8 mx-auto mb-2 transition-transform duration-300 ${mood === option.value ? 'scale-110' : 'group-hover:scale-105'}`}
                          style={{ color: mood === option.value ? category.color : '#5a5a5a' }}
                        >
                          {MoodIcons[option.value]}
                        </div>
                        <div className={`text-xs font-medium tracking-wide transition-colors duration-300 text-center ${
                          mood === option.value ? '' : 'text-[#8a8a8a] group-hover:text-white'
                        }`} style={{ color: mood === option.value ? category.color : undefined }}>
                          {option.label}
                        </div>
                        <div className="text-[10px] text-[#5a5a5a] mt-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {option.description}
                        </div>
                        {mood === option.value && (
                          <div 
                            className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-widest mb-6 font-medium">Intensity Level</label>
                <div className="space-y-5">
                  {/* Ring-based intensity visualization */}
                  <div className="flex justify-between items-center px-4">
                    {intensityLevels.map((level) => (
                      <IntensityRing
                        key={level.value}
                        level={level.value}
                        selected={intensity}
                        onClick={() => setIntensity(level.value)}
                      />
                    ))}
                  </div>
                  
                  {/* Progress line with gradient */}
                  <div className="relative h-1 mx-4 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ 
                        width: `${((intensity - 1) / 4) * 100}%`,
                        background: `linear-gradient(90deg, #4da6ff, #00d4aa, #22c55e, #f59e0b, #ef4444)`,
                        backgroundSize: '400% 100%',
                        backgroundPosition: `${((intensity - 1) / 4) * 100}% 0`
                      }}
                    />
                  </div>
                  
                  {/* Selected intensity card */}
                  <div className="text-center p-5 bg-gradient-to-b from-[#0a0a0a] to-black rounded-2xl border border-[#1a1a1a]">
                    <div className="text-white text-lg font-light tracking-wide mb-1">
                      {intensityLevels.find(level => level.value === intensity)?.label}
                    </div>
                    <div className="text-[#5a5a5a] text-sm font-light">
                      {intensityLevels.find(level => level.value === intensity)?.description}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-4">What's on your mind?</label>

                <div className="mb-6">
                  <div className="mb-4 h-20 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const currentPrompt = journalPrompts[currentPromptIndex];
                        setEntry(prev => prev + (prev ? '\n\n' : '') + currentPrompt + '\n');
                      }}
                      className={`text-center p-5 bg-gradient-to-r from-[#a855f7] to-[#4da6ff] hover:from-[#9333ea] hover:to-[#3b82f6] text-white rounded-2xl text-sm font-medium transition-all duration-600 transform ${
                        promptVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                      } min-h-[5rem] flex items-center justify-center shadow-lg hover:shadow-xl max-w-2xl mx-auto w-full`}
                      style={{
                        transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out'
                      }}
                    >
                      <span className="text-center leading-relaxed px-4">
                        {journalPrompts[currentPromptIndex]}
                      </span>
                    </button>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-[#5a5a5a] mb-2">
                      Prompt {currentPromptIndex + 1} of {journalPrompts.length} • Click to add to your entry
                    </p>
                    <div className="flex justify-center space-x-1">
                      {journalPrompts.map((_, index) => (
                        <div
                          key={index}
                          className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                            index === currentPromptIndex ? 'bg-[#4da6ff]' : 'bg-[#2a2a2a]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    rows={6}
                    className="w-full p-4 pr-14 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#00d4aa] focus:outline-none resize-none transition-colors"
                    placeholder="Write about your day, thoughts, feelings, challenges, or victories..."
                    required
                  />
                  <div className="absolute right-2 top-2">
                    <VoiceInputButton
                      onTranscript={(transcript) => {
                        setEntry(prev => prev + (prev ? ' ' : '') + transcript);
                      }}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !entry.trim()}
                className="w-full bg-[#00d4aa] hover:bg-[#00e6b8] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-black font-medium py-3 rounded-2xl transition-all duration-300"
              >
                {loading ? 'Saving...' : 'Save Entry'}
              </button>
            </form>
          </div>
        </section>

        {/* Previous Entries */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Previous Entries</h3>
          <div className="relative">
            <div className={`fade-pane ${initialLoading && showSkeleton ? 'visible' : 'hidden'}`}>
              <SkeletonList count={3} ItemComponent={SkeletonJournalEntry} />
            </div>

            <div className={`fade-pane ${initialLoading || showSkeleton ? 'hidden' : 'visible'}`}>
              {entries.length > 0 ? (
                <div className="space-y-4">
                  {entries.map((entry) => {
                    const moodOption = moodOptions.find(m => m.value === entry.mood);
                    const intensityLabel = intensityLevels.find(i => i.value === entry.intensity)?.label;

                    return (
                      <div key={entry.id} className="oura-card p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center">
                              <span className="text-xl">{moodOption?.emoji}</span>
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">{moodOption?.label}</p>
                              <p className="text-[#5a5a5a] text-xs">{intensityLabel}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className="text-xs text-[#5a5a5a]">
                              {entry.timestamp?.toDate ? 
                                entry.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
                                entry.createdAt?.toDate ? 
                                  entry.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
                                  entry.timestamp ? 
                                    new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
                                    entry.createdAt ? 
                                      new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
                                      'Unknown date'
                              }
                            </span>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
                              title="Delete this entry"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <p className="text-[#d1d1d1] leading-relaxed mb-4">{entry.content}</p>

                        {entry.oracleJudgment && (
                          <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#a855f7]/20 rounded-2xl">
                            <h4 className="text-[#a855f7] font-medium text-sm mb-3 uppercase tracking-wider">📜 Oracle's Judgment</h4>
                            <div className="text-[#d8b4fe] text-sm leading-relaxed whitespace-pre-line">
                              {entry.oracleJudgment}
                            </div>
                            
                            {entry.oracleFollowUp && (
                              <div className="mt-4 pt-4 border-t border-[#a855f7]/20">
                                <h5 className="text-[#d8b4fe] font-medium text-sm mb-2 uppercase tracking-wider">✨ Oracle's Deeper Reflection</h5>
                                <div className="text-[#d8b4fe] text-sm leading-relaxed whitespace-pre-line italic">
                                  {entry.oracleFollowUp}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="oura-card p-12 text-center">
                  <div className="text-4xl mb-4 opacity-30">📝</div>
                  <p className="text-[#5a5a5a]">No journal entries yet</p>
                  <p className="text-[#3a3a3a] text-sm mt-1">Start writing to track your journey</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => {
          setOracleModal({ isOpen: false, content: '', isLoading: false });
          setCurrentEntryInput('');
          setCurrentEntryId(null);
        }}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        onFollowUpSaved={handleOracleFollowUpSaved}
      />
    </div>
  );
}
