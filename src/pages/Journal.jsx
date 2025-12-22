import React, { useState, useEffect } from 'react';
import { writeData, readUserData, deleteData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';

const moodOptions = [
  { emoji: '⚡', label: 'Electric', value: 'electric' },
  { emoji: '�️', label: 'Foggy', value: 'foggy' },
  { emoji: '🗡️', label: 'Sharp', value: 'sharp' },
  { emoji: '🕳️', label: 'Hollow', value: 'hollow' },
  { emoji: '🌪️', label: 'Chaotic', value: 'chaotic' },
  { emoji: '�', label: 'Triumphant', value: 'triumphant' },
  { emoji: '🪨', label: 'Heavy', value: 'heavy' },
  { emoji: '🦋', label: 'Light', value: 'light' },
  { emoji: '🎯', label: 'Focused', value: 'focused' },
  { emoji: '💎', label: 'Radiant', value: 'radiant' }
];

const intensityLevels = [
  { value: 1, label: 'Flickering', icon: '🕯️', description: 'Barely there' },
  { value: 2, label: 'Glowing', icon: '🔥', description: 'Gentle warmth' },
  { value: 3, label: 'Burning', icon: '🔥🔥', description: 'Steady flame' },
  { value: 4, label: 'Blazing', icon: '🔥🔥🔥', description: 'Intense heat' },
  { value: 5, label: 'Inferno', icon: '🔥🔥🔥🔥', description: 'White hot' }
];

export default function Journal() {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState(moodOptions[0].value);
  const [intensity, setIntensity] = useState(3);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState({ reflections: [], isGenerating: false, lastUpdated: null });
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  
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
        console.error('Error generating dynamic insights:', error);
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
    const savedEntries = await readUserData('journalEntries');
    setEntries(savedEntries);
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
        oracleJudgment: feedback
      });
      setEntries(prev => [newEntry, ...prev]);

      // Clear form
      setEntry('');
      setMood(moodOptions[0].value);
      setIntensity(3);
      setAiInsights({ reflections: [], isGenerating: false, lastUpdated: null });

    } catch (error) {
      console.error("Error saving journal entry:", error);
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
      console.log("🗑️ Journal: Deleting entry:", entryId);
      await deleteData('journalEntries', entryId);
      console.log('✅ Journal: Entry deleted successfully');
      
      // Update local state immediately
      setEntries(prev => prev.filter(entry => entry.id !== entryId));
      
      // Show success message
      alert('Journal entry deleted successfully.');
    } catch (error) {
      console.error('❌ Journal: Error deleting entry:', error);
      alert('Failed to delete journal entry. Please try again.');
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
                <label className="block text-gray-500 text-xs uppercase tracking-widest mb-6 font-medium">How are you feeling?</label>
                <div className="grid grid-cols-5 gap-4">
                  {moodOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setMood(option.value)}
                      className={`group relative p-5 rounded-3xl border-2 transition-all duration-300 ${
                        mood === option.value
                          ? 'border-oura-cyan bg-gradient-to-b from-oura-cyan/15 to-transparent scale-[1.02] shadow-oura-glow'
                          : 'border-transparent bg-oura-card hover:bg-oura-darker hover:border-oura-border'
                      }`}
                    >
                      <div className={`text-3xl mb-3 transition-transform duration-300 ${mood === option.value ? 'scale-110' : 'group-hover:scale-105'}`}>
                        {option.emoji}
                      </div>
                      <div className={`text-xs font-light tracking-wide transition-colors duration-300 ${
                        mood === option.value ? 'text-oura-cyan' : 'text-gray-500 group-hover:text-gray-300'
                      }`}>
                        {option.label}
                      </div>
                      {mood === option.value && (
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-1 bg-oura-cyan rounded-full"></div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-widest mb-6 font-medium">Intensity Level</label>
                <div className="space-y-6">
                  {/* Intensity slider track */}
                  <div className="relative px-4">
                    <div className="flex justify-between items-center">
                      {intensityLevels.map((level, index) => (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() => setIntensity(level.value)}
                          className="group flex flex-col items-center transition-all duration-300 z-10"
                        >
                          <div className={`text-2xl mb-3 transition-all duration-300 ${
                            intensity === level.value ? 'scale-125' : intensity > level.value ? 'opacity-80' : 'opacity-40 group-hover:opacity-70'
                          }`}>
                            {level.icon}
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 transition-all duration-300 flex items-center justify-center ${
                            intensity === level.value
                              ? 'bg-oura-amber border-oura-amber shadow-oura-glow-amber'
                              : intensity > level.value
                                ? 'bg-oura-amber/60 border-oura-amber/60'
                                : 'bg-transparent border-oura-border group-hover:border-oura-amber/40'
                          }`}>
                            {intensity === level.value && (
                              <div className="w-2 h-2 bg-black rounded-full"></div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                    {/* Progress line */}
                    <div className="absolute top-[3.25rem] left-4 right-4 h-0.5 bg-oura-border -z-0">
                      <div 
                        className="h-full bg-gradient-to-r from-oura-amber/60 to-oura-amber transition-all duration-500 rounded-full"
                        style={{ width: `${((intensity - 1) / 4) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {/* Selected intensity card */}
                  <div className="text-center p-5 bg-gradient-to-b from-oura-card to-black rounded-2xl border border-oura-border">
                    <div className="text-white text-lg font-light tracking-wide mb-1">
                      {intensityLevels.find(level => level.value === intensity)?.label}
                    </div>
                    <div className="text-gray-500 text-sm font-light">
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
                          {entry.createdAt?.toDate ? 
                            entry.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 
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
        </section>
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
      />
    </div>
  );
}
