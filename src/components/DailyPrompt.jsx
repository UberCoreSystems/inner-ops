import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from './AppIcons';

// Curated prompt library organized by category
const promptLibrary = {
  selfAwareness: [
    "What pattern keeps showing up in your life that you've been ignoring?",
    "What lie do you keep telling yourself to avoid change?",
    "What would your future self thank you for doing today?",
    "What are you pretending not to know about yourself?",
    "What emotion have you been avoiding feeling?",
    "Where in your life are you settling for less than you deserve?",
    "What old story about yourself needs to die?",
    "What part of yourself have you been hiding from others?",
  ],
  actionOriented: [
    "What's one small win you can secure before the day ends?",
    "What have you been procrastinating on that would take less than 10 minutes?",
    "What boundary do you need to set or reinforce today?",
    "What would you do today if you weren't afraid of failing?",
    "What's the most important thing you can do for your future self today?",
    "What habit have you been meaning to start? Start it now, imperfectly.",
    "Who do you need to have an honest conversation with?",
    "What would make today feel like a victory?",
  ],
  shadowWork: [
    "What triggers you most in others? What does that reveal about you?",
    "What do you judge in others that you secretly fear exists in yourself?",
    "What wound from your past are you still protecting?",
    "What part of yourself have you been at war with?",
    "What failure are you still carrying shame about?",
    "What do you fear others would think if they knew the real you?",
    "Where are you still seeking approval you don't need?",
    "What anger are you holding that's actually protecting deeper pain?",
  ],
  gratitude: [
    "What strength got you through your hardest moment this week?",
    "What challenge has secretly been a gift in disguise?",
    "Who in your life has believed in you when you didn't believe in yourself?",
    "What part of your journey are you proud of that others don't see?",
    "What lesson have you learned that you wouldn't trade for anything?",
    "What simple thing brought you unexpected peace recently?",
    "What ability do you take for granted that others would treasure?",
    "What past version of you would be amazed by who you are now?",
  ],
  clarity: [
    "What do you actually want? Not what you think you should want.",
    "If you couldn't fail, what would you be doing with your life?",
    "What needs to end for something new to begin?",
    "What's the difference between who you are and who you're becoming?",
    "What are you tolerating that's draining your energy?",
    "What decision have you been avoiding because you already know the answer?",
    "What would your life look like if you stopped people-pleasing?",
    "What does your ideal day look like? How far is today from that?",
  ],
  recovery: [
    "What trigger have you been blind to that keeps catching you off guard?",
    "What void are you trying to fill with destructive behavior?",
    "What would you tell someone you love who's in your exact situation?",
    "What moment of strength can you draw from when the urge hits?",
    "What are you running from when you reach for your vice?",
    "What has your addiction cost you that you're ready to reclaim?",
    "What small promise to yourself can you keep today to rebuild trust?",
    "What would 'one year sober you' say to you right now?",
  ]
};

// Get all prompts as a flat array with categories
const getAllPrompts = () => {
  const allPrompts = [];
  Object.entries(promptLibrary).forEach(([category, prompts]) => {
    prompts.forEach(prompt => {
      allPrompts.push({ text: prompt, category });
    });
  });
  return allPrompts;
};

// Get prompt for today based on date (consistent throughout the day)
const getTodaysPrompt = () => {
  const allPrompts = getAllPrompts();
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const index = dayOfYear % allPrompts.length;
  return allPrompts[index];
};

// Category display info
const categoryMeta = {
  selfAwareness: { icon: 'search', label: 'Self-Awareness', color: '#a855f7' },
  actionOriented: { icon: 'bolt', label: 'Take Action', color: '#22c55e' },
  shadowWork: { icon: 'moon', label: 'Shadow Work', color: '#6366f1' },
  gratitude: { icon: 'heart', label: 'Gratitude', color: '#f59e0b' },
  clarity: { icon: 'clarity', label: 'Clarity', color: '#00d4aa' },
  recovery: { icon: 'shield', label: 'Recovery', color: '#ef4444' },
};

const DailyPrompt = React.memo(function DailyPrompt({ onJournalClick }) {
  const [todaysPrompt, setTodaysPrompt] = useState(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setTodaysPrompt(getTodaysPrompt());
  }, []);

  if (!todaysPrompt) return null;

  const meta = categoryMeta[todaysPrompt.category] || categoryMeta.selfAwareness;

  return (
    <div 
      className="oura-card p-6 relative overflow-hidden group transition-all duration-300 hover:border-[#2a2a2a]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background glow effect */}
      <div 
        className="absolute inset-0 opacity-5 group-hover:opacity-10 transition-opacity duration-500"
        style={{ 
          background: `radial-gradient(circle at top right, ${meta.color}, transparent 70%)` 
        }}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: `${meta.color}15` }}
          >
            <AppIcon name={meta.icon} size={22} color={meta.color} glow={true} glowIntensity={0.5} />
          </div>
          <div>
            <p className="text-[#5a5a5a] text-xs uppercase tracking-widest">Today's Reflection</p>
            <p className="text-sm" style={{ color: meta.color }}>{meta.label}</p>
          </div>
        </div>
        
        {/* Refresh hint */}
        <div className="flex items-center gap-2 text-[#3a3a3a] text-xs">
          <AppIcon name="sunrise" size={16} color="#f59e0b" glow={true} glowIntensity={0.3} />
          <span>New prompt daily</span>
        </div>
      </div>

      {/* Prompt Text */}
      <blockquote className="relative z-10 mb-6">
        <p className="text-white text-lg md:text-xl font-light leading-relaxed">
          "{todaysPrompt.text}"
        </p>
      </blockquote>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 relative z-10">
        <button
          onClick={onJournalClick}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:scale-105"
          style={{ 
            backgroundColor: `${meta.color}20`,
            color: meta.color,
            border: `1px solid ${meta.color}40`
          }}
        >
          <AppIcon name="journal" size={16} color={meta.color} glow={true} glowIntensity={0.4} />
          <span>Journal This</span>
        </button>
        
        <Link
          to="/killlist"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] text-[#8a8a8a] rounded-xl text-sm font-medium border border-[#2a2a2a] hover:border-[#ef4444]/50 hover:text-[#ef4444] transition-all duration-200 hover:scale-105 group"
        >
          <AppIcon name="target" size={16} color="currentColor" glow={false} />
          <span>Add to Kill List</span>
        </Link>
        
        <Link
          to="/hardlessons"
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1a1a1a] text-[#8a8a8a] rounded-xl text-sm font-medium border border-[#2a2a2a] hover:border-[#f59e0b]/50 hover:text-[#f59e0b] transition-all duration-200 hover:scale-105 group"
        >
          <AppIcon name="bolt" size={16} color="currentColor" glow={false} />
          <span>Extract Lesson</span>
        </Link>
      </div>

      {/* Subtle animation element */}
      <div 
        className={`absolute bottom-0 left-0 h-1 transition-all duration-700 ease-out`}
        style={{ 
          backgroundColor: meta.color,
          width: isHovered ? '100%' : '0%',
          opacity: 0.6
        }}
      />
    </div>
  );
});

export default DailyPrompt;
