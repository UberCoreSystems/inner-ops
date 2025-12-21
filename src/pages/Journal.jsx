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
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-12 fade-in">
          <h1 className="text-2xl font-light text-gray-100 mb-2 tracking-wide">📝 Journal</h1>
          <p className="text-gray-500 text-sm font-light">Capture your thoughts and reflect on your journey</p>
          <div className="mt-4 text-sm text-green-300 font-light">
            ✍️ Each entry: +10 clarity points | 7-day streak: +50 bonus | 30-day streak: +200 bonus
          </div>
        </div>

        {/* Entry Form */}
        <div className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-8 mb-8 border border-gray-800/50 oura-card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Dynamic AI Insights */}
            {(aiInsights.reflections.length > 0 || aiInsights.isGenerating) && (
              <div className="mb-6 p-6 bg-gradient-to-br from-purple-900/20 to-purple-800/10 border border-purple-500/20 rounded-2xl glass-morphism">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-purple-300 font-light tracking-wide">🧠 Live Insights</h3>
                  {aiInsights.isGenerating && (
                    <div className="flex items-center text-purple-400 text-xs font-light">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-purple-400 mr-2"></div>
                      Analyzing...
                    </div>
                  )}
                </div>
              <div className="space-y-2">
                {aiInsights.isGenerating && aiInsights.reflections.length === 0 ? (
                  <div className="text-purple-200 text-sm bg-purple-800/20 p-2 rounded animate-pulse">
                    Generating contextual insights based on your writing...
                  </div>
                ) : (
                  aiInsights.reflections.map((insight, idx) => (
                    <div key={`${aiInsights.lastUpdated}-${idx}`} className="text-purple-200 text-sm bg-purple-800/20 p-2 rounded transition-all duration-300 ease-in-out">
                      {insight}
                    </div>
                  ))
                )}
              </div>
              {aiInsights.reflections.length > 0 && (
                <div className="mt-2 text-xs text-purple-400 opacity-75">
                  💡 Insights update as you write • Based on mood, content, and patterns
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-gray-400 mb-4 font-light tracking-wide">How are you feeling?</label>
            <div className="grid grid-cols-5 gap-3">
              {moodOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMood(option.value)}
                  className={`p-4 rounded-2xl border transition-all duration-300 oura-card ${
                    mood === option.value
                      ? 'border-blue-500/50 bg-gradient-to-br from-blue-500/20 to-blue-600/10 shadow-lg shadow-blue-500/20'
                      : 'border-gray-700/50 hover:border-gray-600/50 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="text-xl mb-1">{option.emoji}</div>
                  <div className="text-sm text-gray-300">{option.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-3">Intensity Level</label>
            <div className="space-y-6">
              {/* Fire icons row */}
              <div className="flex justify-between items-center px-4">
                {intensityLevels.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setIntensity(level.value)}
                    className="flex flex-col items-center transition-all duration-300 hover:scale-110 oura-card p-3 rounded-2xl"
                  >
                    <div className="text-2xl mb-2 opacity-80">{level.icon}</div>
                    <div className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${
                      intensity === level.value
                        ? 'bg-gradient-to-br from-orange-500 to-red-500 border-orange-400 shadow-lg shadow-orange-500/30'
                        : 'border-gray-600 hover:border-orange-400/50'
                    }`}></div>
                  </button>
                ))}
              </div>
              
              {/* Selected intensity description */}
              <div className="text-center">
                <div className="text-white font-medium">
                  {intensityLevels.find(level => level.value === intensity)?.label}
                </div>
                <div className="text-gray-400 text-sm">
                  {intensityLevels.find(level => level.value === intensity)?.description}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-gray-400 mb-3">What's on your mind?</label>

            <div className="mb-3">
              <label className="block text-gray-400 mb-2">Journal Prompt</label>
              <div className="mb-3 h-16 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const currentPrompt = journalPrompts[currentPromptIndex];
                    setEntry(prev => prev + (prev ? '\n\n' : '') + currentPrompt + '\n');
                  }}
                  className={`text-center p-4 bg-gradient-to-r from-purple-700 to-blue-700 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all duration-600 transform ${
                    promptVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                  } min-h-[4rem] flex items-center justify-center shadow-lg hover:shadow-xl max-w-2xl mx-auto`}
                  style={{
                    transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out'
                  }}
                >
                  <span className="text-center leading-relaxed">
                    {journalPrompts[currentPromptIndex]}
                  </span>
                </button>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-2">
                  Prompt {currentPromptIndex + 1} of {journalPrompts.length} • Click to add to your entry
                </p>
                <div className="flex justify-center space-x-1">
                  {journalPrompts.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                        index === currentPromptIndex ? 'bg-blue-500' : 'bg-gray-600'
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
                className="w-full p-6 pr-16 bg-gradient-to-br from-gray-800/50 to-gray-900/50 text-white rounded-2xl border border-gray-700/50 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none transition-all duration-300 backdrop-blur-sm"
                placeholder="Write about your day, thoughts, feelings, challenges, or victories..."
                required
              />
              <div className="absolute right-3 top-3">
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
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:from-gray-700 disabled:to-gray-800 text-white py-4 rounded-2xl transition-all duration-300 font-light tracking-wide shadow-lg hover:shadow-xl disabled:shadow-none transform hover:scale-[1.02] disabled:hover:scale-100"
          >
            {loading ? 'Saving...' : 'Save Entry'}
          </button>
        </form>
        </div>

        {/* Previous Entries */}
        <div>
          <h2 className="text-xl font-light text-white mb-6 tracking-wide">Previous Entries</h2>
          {entries.length > 0 ? (
            <div className="space-y-6">
              {entries.map((entry) => {
                const moodOption = moodOptions.find(m => m.value === entry.mood);
                const intensityLabel = intensityLevels.find(i => i.value === entry.intensity)?.label;

                return (
                  <div key={entry.id} className="bg-gradient-to-br from-gray-900/80 to-gray-950/80 backdrop-blur-sm rounded-3xl p-6 border border-gray-800/50 oura-card">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <span className="text-xl opacity-80">{moodOption?.emoji}</span>
                        <span className="text-gray-400 font-light">
                          {moodOption?.label} - {intensityLabel}
                        </span>
                      </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-sm text-gray-500">
                        {new Date(entry.createdAt).toLocaleDateString()} at {new Date(entry.createdAt).toLocaleTimeString()}
                      </span>
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="px-2 py-1 bg-red-600/80 text-white rounded text-xs hover:bg-red-600 transition-colors opacity-75 hover:opacity-100"
                        title="Delete this entry"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-300 leading-relaxed mb-4">{entry.content}</p>

                  {entry.oracleJudgment && (
                    <div className="mt-4 p-4 bg-gray-900/50 border border-gray-600 rounded-lg">
                      <h4 className="text-gray-300 font-medium mb-2">📜 Oracle's Judgment</h4>
                      <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                        {entry.oracleJudgment}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No journal entries yet. Start writing!</p>
          </div>
        )}
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
      />
      </div>
    </div>
  );
}
