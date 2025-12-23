import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authService } from '../utils/authService';
import { writeData, readUserData, updateData, deleteData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';
import { debounce } from '../utils/debounce';
import VirtualizedList from '../components/VirtualizedList';
import { KillCelebration } from '../components/Confetti';

const KillList = () => {
  const [targets, setTargets] = useState([]);
  const [newTarget, setNewTarget] = useState('');
  const [newTargetCategory, setNewTargetCategory] = useState('bad-habit');
  const [newTargetPriority, setNewTargetPriority] = useState('medium');
  const [editingTarget, setEditingTarget] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedTargets, setSelectedTargets] = useState(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);
  
  // Celebration state
  const [celebration, setCelebration] = useState({ show: false, targetName: '' });
  
  // Reflection notes state
  const [reflectionNotes, setReflectionNotes] = useState({});
  const [showReflection, setShowReflection] = useState({});
  const [updatingReflection, setUpdatingReflection] = useState({});
  const [user, setUser] = useState(null);

  // Priority levels configuration
  const priorityLevels = [
    { value: 'high', label: 'High', color: 'text-[#ef4444]', bgColor: 'bg-[#ef4444]/10', borderColor: 'border-[#ef4444]/40', icon: '🔥' },
    { value: 'medium', label: 'Medium', color: 'text-[#f59e0b]', bgColor: 'bg-[#f59e0b]/10', borderColor: 'border-[#f59e0b]/30', icon: '⚡' },
    { value: 'low', label: 'Low', color: 'text-[#22c55e]', bgColor: 'bg-[#22c55e]/10', borderColor: 'border-[#22c55e]/30', icon: '🌱' },
  ];

  // Oura-style category icons
  const CategoryIcons = {
    'bad-habit': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    'negative-thought': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8M8 8h8M8 16h4" opacity="0.6" />
      </svg>
    ),
    'addiction': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    'toxic-behavior': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 22h20L12 2z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
    'fear': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" opacity="0.5" />
        <circle cx="12" cy="12" r="2" opacity="0.3" />
      </svg>
    ),
    'procrastination': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    'other': (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" opacity="0.5" />
        <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      </svg>
    ),
  };

  // Kill target categories
  const categories = [
    { value: 'bad-habit', label: 'Bad Habit', color: 'text-[#ef4444]', bgColor: 'bg-[#ef4444]/10' },
    { value: 'negative-thought', label: 'Negative Thought', color: 'text-[#a855f7]', bgColor: 'bg-[#a855f7]/10' },
    { value: 'addiction', label: 'Addiction', color: 'text-[#f59e0b]', bgColor: 'bg-[#f59e0b]/10' },
    { value: 'toxic-behavior', label: 'Toxic Behavior', color: 'text-[#eab308]', bgColor: 'bg-[#eab308]/10' },
    { value: 'fear', label: 'Fear/Anxiety', color: 'text-[#4da6ff]', bgColor: 'bg-[#4da6ff]/10' },
    { value: 'procrastination', label: 'Procrastination', color: 'text-[#22c55e]', bgColor: 'bg-[#22c55e]/10' },
    { value: 'other', label: 'Other', color: 'text-[#8a8a8a]', bgColor: 'bg-[#8a8a8a]/10' }
  ];

  // Get current user from auth service
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    console.log("👤 KillList: Current user:", currentUser?.uid);
    
    if (currentUser) {
      loadTargets();
    }
  }, []);

  // Get today's date in YYYY-MM-DD format
  const getTodaysDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Load targets from Firebase
  const loadTargets = async () => {
    if (!user) {
      console.log("⏳ KillList: Waiting for user authentication...");
      return;
    }

    try {
      console.log("📡 KillList: Loading targets for user:", user.uid);
      const targetsData = await readUserData('killTargets');
      console.log(`📋 KillList: Loaded ${targetsData.length} kill targets`);
      setTargets(targetsData);
    } catch (error) {
      console.error('❌ KillList: Error loading targets:', error);
      setTargets([]);
    }
  };

  // Set up real-time listener when user changes
  useEffect(() => {
    if (user) {
      loadTargets();
    }
  }, [user]);

  const addTarget = async () => {
    if (!newTarget.trim() || loading) return;

    setLoading(true);
    console.log("🎯 Adding new kill target:", newTarget.trim());
    
    try {
      const targetData = {
        title: newTarget.trim(),
        description: `Eliminate this ${categories.find(c => c.value === newTargetCategory)?.label.split(' ').slice(1).join(' ') || 'target'}`,
        category: newTargetCategory,
        priority: newTargetPriority,
        status: 'active',
        progress: 0,
        targetDate: getTodaysDate(),
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        reflectionNotes: ''
      };

      console.log("📝 Target data to save:", targetData);

      // Use writeData from firebaseUtils for consistent saving
      const savedTarget = await writeData('killTargets', targetData);
      console.log('✅ Kill target saved successfully:', savedTarget.id);
      
      // Update local state immediately for better UX
      setTargets(prev => [savedTarget, ...prev]);
      
      setNewTarget('');
      setNewTargetCategory('bad-habit');
      setNewTargetPriority('medium');

      // Generate Oracle feedback
      setOracleModal({ isOpen: true, content: '', isLoading: true });

      try {
        const feedback = await generateAIFeedback('killList', {
          action: 'targetAdded',
          target: targetData.title,
          category: targetData.category,
          totalTargets: targets.length + 1
        }, targets);

        setOracleModal({ isOpen: true, content: feedback, isLoading: false });
      } catch (error) {
        console.error('Oracle feedback error:', error);
        setOracleModal({ 
          isOpen: true, 
          content: "The Oracle's wisdom flows through ancient channels. Your contract has been sealed in the ethereal realm. Pursue your target with unwavering focus.", 
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('❌ Error adding target:', error);
      alert(`Failed to save kill target: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const updateProgress = async (targetId, newProgress) => {
    try {
      console.log("📊 KillList: Updating progress for target:", targetId, "to", newProgress);
      
      const targetUpdate = {
        progress: newProgress,
        lastUpdated: new Date()
      };

      // If progress reaches 100%, mark as killed
      if (newProgress >= 100) {
        targetUpdate.status = 'killed';
        targetUpdate.completedAt = new Date();
      }

      await updateData('killTargets', targetId, targetUpdate);
      console.log("✅ KillList: Progress updated successfully");

      // Update local state immediately
      setTargets(prev => prev.map(target => 
        target.id === targetId 
          ? { ...target, ...targetUpdate }
          : target
      ));

      // Show celebration and Oracle feedback for completion
      if (newProgress >= 100) {
        const completedTarget = targets.find(t => t.id === targetId);
        
        // Trigger celebration animation
        setCelebration({ show: true, targetName: completedTarget?.title || 'Target' });
        
        // Auto-hide celebration after 3 seconds
        setTimeout(() => {
          setCelebration({ show: false, targetName: '' });
        }, 3000);
        
        setOracleModal({ isOpen: true, content: '', isLoading: true });

        try {
          const feedback = await generateAIFeedback('killList', {
            action: 'targetCompleted',
            target: completedTarget?.title || 'target',
            category: completedTarget?.category,
            completedTargets: targets.filter(t => t.status === 'killed').length + 1
          }, targets);

          setOracleModal({ isOpen: true, content: feedback, isLoading: false });
        } catch (error) {
          console.error('Oracle feedback error:', error);
          setOracleModal({ 
            isOpen: true, 
            content: "The Oracle witnesses your triumph. Another chain of limitation has been shattered. The path of self-mastery grows clearer with each victory.", 
            isLoading: false 
          });
        }
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  const deleteTarget = async (targetId) => {
    try {
      console.log("🗑️ KillList: Deleting target:", targetId);
      await deleteData('killTargets', targetId);
      console.log('✅ KillList: Target deleted successfully');
      
      // Update local state immediately
      setTargets(prev => prev.filter(target => target.id !== targetId));
    } catch (error) {
      console.error('❌ KillList: Error deleting target:', error);
      alert('Failed to delete target. Please try again.');
    }
  };

  const markAsEscaped = async (targetId) => {
    try {
      console.log("🏃 KillList: Marking target as escaped:", targetId);
      
      const targetUpdate = {
        status: 'escaped',
        escapedAt: new Date(),
        lastUpdated: new Date()
      };

      await updateData('killTargets', targetId, targetUpdate);
      console.log("✅ KillList: Target marked as escaped");

      // Update local state immediately
      setTargets(prev => prev.map(target => 
        target.id === targetId 
          ? { ...target, ...targetUpdate }
          : target
      ));

      // Show Oracle feedback for escaped target
      const escapedTarget = targets.find(t => t.id === targetId);
      setOracleModal({ isOpen: true, content: '', isLoading: true });
      
      try {
        const feedback = await generateAIFeedback('killList', {
          action: 'targetEscaped',
          target: escapedTarget?.title || 'target',
          category: escapedTarget?.category,
          escapedTargets: targets.filter(t => t.status === 'escaped').length + 1
        }, targets);
        setOracleModal({ isOpen: true, content: feedback, isLoading: false });
      } catch (error) {
        console.error('Oracle feedback error:', error);
        setOracleModal({ 
          isOpen: true, 
          content: "The Oracle recognizes the strategic value of retreat. Sometimes the warrior must withdraw to fight another day. Study your patterns and return stronger.", 
          isLoading: false 
        });
      }
    } catch (error) {
      console.error('❌ KillList: Error marking target as escaped:', error);
      alert('Failed to mark target as escaped. Please try again.');
    }
  };

  const reactivateTarget = async (targetId) => {
    try {
      console.log("🎯 KillList: Reactivating escaped target:", targetId);
      
      const targetUpdate = {
        status: 'active',
        reactivatedAt: new Date(),
        lastUpdated: new Date()
      };

      await updateData('killTargets', targetId, targetUpdate);
      console.log("✅ KillList: Target reactivated successfully");

      // Update local state immediately
      setTargets(prev => prev.map(target => 
        target.id === targetId 
          ? { ...target, ...targetUpdate }
          : target
      ));
    } catch (error) {
      console.error('❌ KillList: Error reactivating target:', error);
      alert('Failed to reactivate target. Please try again.');
    }
  };

  const startEditing = (target) => {
    setEditingTarget(target.id);
    setEditValue(target.title);
  };

  const saveEdit = async () => {
    if (!editValue.trim()) return;

    try {
      console.log("✏️ KillList: Saving edit for target:", editingTarget);
      await updateData('killTargets', editingTarget, {
        title: editValue.trim(),
        lastUpdated: new Date()
      });

      // Update local state immediately
      setTargets(prev => prev.map(target => 
        target.id === editingTarget 
          ? { ...target, title: editValue.trim(), lastUpdated: new Date() }
          : target
      ));

      setEditingTarget(null);
      setEditValue('');
      console.log("✅ KillList: Target title updated successfully");
    } catch (error) {
      console.error('❌ KillList: Error updating target:', error);
      alert('Failed to update target. Please try again.');
    }
  };

  const cancelEdit = () => {
    setEditingTarget(null);
    setEditValue('');
  };

  // Reflection notes functions
  const saveReflectionNote = async (targetId) => {
    const notes = reflectionNotes[targetId];
    if (!notes || notes.trim() === '') return;

    setUpdatingReflection(prev => ({ ...prev, [targetId]: true }));

    try {
      await updateData('killTargets', targetId, {
        reflectionNotes: notes.trim(),
        lastUpdated: new Date()
      });

      console.log(`✅ Reflection notes saved for target: ${targetId}`);
    } catch (error) {
      console.error("Error saving reflection notes:", error);
      alert('Failed to save reflection notes. Please try again.');
    } finally {
      setUpdatingReflection(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const clearReflectionNote = async (targetId) => {
    setUpdatingReflection(prev => ({ ...prev, [targetId]: true }));

    try {
      await updateData('killTargets', targetId, {
        reflectionNotes: '',
        lastUpdated: new Date()
      });

      setReflectionNotes(prev => ({ ...prev, [targetId]: '' }));
      console.log(`✅ Reflection notes cleared for target: ${targetId}`);
    } catch (error) {
      console.error("Error clearing reflection notes:", error);
      alert('Failed to clear reflection notes. Please try again.');
    } finally {
      setUpdatingReflection(prev => ({ ...prev, [targetId]: false }));
    }
  };

  // Initialize reflection notes when targets load
  useEffect(() => {
    const notes = {};
    targets.forEach(target => {
      if (target.reflectionNotes) {
        notes[target.id] = target.reflectionNotes;
      }
    });
    setReflectionNotes(notes);
  }, [targets]);

  const filteredTargets = useMemo(() => {
    switch (filterStatus) {
      case 'active':
        return targets.filter(target => target.status === 'active');
      case 'completed':
        return targets.filter(target => target.status === 'killed');
      case 'escaped':
        return targets.filter(target => target.status === 'escaped');
      default:
        return targets;
    }
  }, [targets, filterStatus]);

  const stats = useMemo(() => {
    const total = targets.length;
    const completed = targets.filter(t => t.status === 'killed').length;
    const active = targets.filter(t => t.status === 'active').length;
    const escaped = targets.filter(t => t.status === 'escaped').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, escaped, completionRate };
  }, [targets]);

  const getProgressColor = (progress) => {
    if (progress < 25) return 'bg-red-500';
    if (progress < 50) return 'bg-orange-500';
    if (progress < 75) return 'bg-yellow-500';
    if (progress < 100) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const renderTargetItem = useCallback(({ item: target, index }) => {
    const category = categories.find(c => c.value === target.category) || categories[0];
    const priority = priorityLevels.find(p => p.value === target.priority) || priorityLevels[1];
    
    // Priority-based card styling
    const priorityCardClass = target.status !== 'killed' && target.status !== 'escaped'
      ? target.priority === 'high' 
        ? 'priority-high' 
        : target.priority === 'low' 
          ? 'priority-low' 
          : 'priority-medium'
      : '';
    
    return (
      <div key={target.id} className={`oura-card p-5 hover:border-[#ef4444]/30 transition-all duration-300 ${priorityCardClass}`}>
        <div className="flex items-center justify-between mb-3">
          {editingTarget === target.id ? (
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 bg-gray-700 text-white p-2 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                autoFocus
              />
              <button
                onClick={saveEdit}
                className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Save
              </button>
              <button
                onClick={cancelEdit}
                className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className={`font-medium ${target.status === 'killed' ? 'line-through text-[#5a5a5a]' : 'text-white'}`}>
                    {target.title}
                  </h3>
                  {/* Priority Badge */}
                  {target.status !== 'killed' && target.status !== 'escaped' && (
                    <span className={`text-xs px-2 py-0.5 rounded-lg flex items-center gap-1 ${priority.color} ${priority.bgColor} ${target.priority === 'high' ? 'animate-priority-pulse' : ''}`}>
                      {priority.icon} {priority.label}
                    </span>
                  )}
                  <span className={`text-xs px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${category.color} ${category.bgColor}`}>
                    {CategoryIcons[target.category]}
                    {category.label}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-lg uppercase font-medium ${
                    target.status === 'killed' ? 'bg-[#22c55e]/10 text-[#22c55e]' :
                    target.status === 'escaped' ? 'bg-[#ef4444]/10 text-[#ef4444]' :
                    'bg-[#f59e0b]/10 text-[#f59e0b]'
                  }`}>
                    {target.status}
                  </span>
                </div>
                <p className="text-sm text-[#8a8a8a] mb-1">{target.description}</p>
                <p className="text-xs text-gray-400">
                  Created: {target.createdAt instanceof Date ? target.createdAt.toLocaleDateString() : new Date(target.createdAt).toLocaleDateString()}
                  {target.targetDate && (
                    <span className="ml-2">
                      • Target Date: {new Date(target.targetDate).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => startEditing(target)}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Edit
                </button>
                {target.status !== 'killed' && target.status !== 'escaped' && (
                  <>
                    <button
                      onClick={() => updateProgress(target.id, 100)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 font-medium"
                    >
                      ⚡ Kill Now
                    </button>
                    <button
                      onClick={() => markAsEscaped(target.id)}
                      className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                    >
                      🏃 Escaped
                    </button>
                  </>
                )}
                {target.status === 'escaped' && (
                  <button
                    onClick={() => reactivateTarget(target.id)}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                  >
                    🎯 Reactivate
                  </button>
                )}
                <button
                  onClick={() => deleteTarget(target.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>

        {editingTarget !== target.id && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Progress</span>
              <span className="text-sm font-medium text-white">{target.progress || 0}%</span>
            </div>
            
            {/* Visual Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-3 border border-gray-600">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${getProgressColor(target.progress || 0)}`}
                style={{ width: `${target.progress || 0}%` }}
              ></div>
            </div>
            
            {/* Interactive Range Slider */}
            {target.status !== 'killed' && (
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={target.progress || 0}
                  onChange={(e) => updateProgress(target.id, parseInt(e.target.value))}
                  className="w-full h-3 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #ef4444 0%, #ef4444 ${target.progress || 0}%, #374151 ${target.progress || 0}%, #374151 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>
            )}

            {/* Killed Status Message */}
            {target.status === 'killed' && (
              <div className="text-center p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                <span className="text-green-400 font-medium">🎯 TARGET ELIMINATED</span>
                {target.completedAt && (
                  <div className="text-xs text-green-300 mt-1">
                    Completed: {new Date(target.completedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}

            {/* Escaped Status Message */}
            {target.status === 'escaped' && (
              <div className="text-center p-3 bg-yellow-900/20 border border-yellow-500/30 rounded-lg">
                <span className="text-yellow-400 font-medium">🏃 TARGET ESCAPED</span>
                {target.escapedAt && (
                  <div className="text-xs text-yellow-300 mt-1">
                    Escaped: {new Date(target.escapedAt).toLocaleDateString()}
                  </div>
                )}
                <div className="text-xs text-yellow-200 mt-1">
                  Sometimes strategic retreat is necessary. Regroup and try again when ready.
                </div>
              </div>
            )}

            {/* Reflection Notes Section */}
            <div className="border-t border-[#1a1a1a] pt-4 mt-4">
              <button
                onClick={() => setShowReflection(prev => ({ 
                  ...prev, 
                  [target.id]: !prev[target.id] 
                }))}
                className="flex items-center gap-2 text-sm text-[#8a8a8a] hover:text-white transition-colors mb-3"
              >
                📝 Reflection Notes
                <span className="text-xs">
                  {showReflection[target.id] ? '▼' : '▶'}
                </span>
              </button>

              {showReflection[target.id] && (
                <div className="space-y-3">
                  <textarea
                    value={reflectionNotes[target.id] || ''}
                    onChange={(e) => setReflectionNotes(prev => ({
                      ...prev,
                      [target.id]: e.target.value
                    }))}
                    placeholder="How did this target challenge you? What did you learn?"
                    className="w-full h-20 p-3 bg-[#0a0a0a] text-white border border-[#1a1a1a] rounded-xl text-sm resize-none focus:outline-none focus:border-[#a855f7] transition-colors"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveReflectionNote(target.id)}
                      disabled={updatingReflection[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-4 py-2 text-sm bg-[#00d4aa] text-black rounded-xl hover:bg-[#00e6b8] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] transition-colors font-medium"
                    >
                      {updatingReflection[target.id] ? '⏳' : '💾'} Save
                    </button>
                    <button
                      onClick={() => clearReflectionNote(target.id)}
                      disabled={updatingReflection[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-4 py-2 text-sm bg-[#ef4444]/10 text-[#ef4444] rounded-xl hover:bg-[#ef4444]/20 disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] transition-colors font-medium"
                    >
                      {updatingReflection[target.id] ? '⏳' : '🗑️'} Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }, [editingTarget, editValue, updateProgress, startEditing, saveEdit, cancelEdit, deleteTarget, markAsEscaped, reactivateTarget, categories, priorityLevels,
      reflectionNotes, showReflection, updatingReflection, saveReflectionNote, clearReflectionNote]);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Oura-style Header */}
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#5a5a5a] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">Kill List</h1>
          <p className="text-[#8a8a8a]">Eliminate negative patterns and destructive habits</p>
        </header>

        {/* Stats */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Your Progress</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-white oura-score">{stats.total}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Total Contracts</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#4da6ff] oura-score">{stats.active}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Active</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#22c55e] oura-score">{stats.completed}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Killed</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#f59e0b] oura-score">{stats.escaped}</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Escaped</div>
            </div>
            <div className="oura-card p-5 text-center">
              <div className="text-3xl font-bold text-[#00d4aa] oura-score">{stats.completionRate}%</div>
              <div className="text-xs text-[#8a8a8a] mt-2 uppercase tracking-wider">Success Rate</div>
            </div>
          </div>
        </section>

        {/* Add New Target */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="oura-card p-6">
            <h2 className="text-white font-semibold mb-6 text-lg">Add New Kill Contract</h2>
            <div className="space-y-6">
              {/* Target Name Input */}
              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                  Target Name
                </label>
                <input
                  type="text"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  placeholder="What negative pattern will you eliminate?"
                  className="w-full bg-[#0a0a0a] text-white p-4 rounded-2xl border border-[#1a1a1a] focus:border-[#ef4444] focus:outline-none transition-colors"
                  onKeyPress={(e) => e.key === 'Enter' && addTarget()}
                />
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                  Category
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {categories.map((category) => (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setNewTargetCategory(category.value)}
                      className={`p-3 rounded-xl border transition-all duration-200 flex items-center gap-2 text-sm ${
                        newTargetCategory === category.value
                          ? `${category.bgColor} ${category.color} border-current`
                          : 'bg-[#0a0a0a] text-[#5a5a5a] border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#8a8a8a]'
                      }`}
                    >
                      <span className={newTargetCategory === category.value ? category.color : 'text-[#5a5a5a]'}>
                        {CategoryIcons[category.value]}
                      </span>
                      <span className="truncate">{category.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority Level */}
              <div>
                <label className="block text-[#8a8a8a] text-sm uppercase tracking-wider mb-3">
                  Priority Level
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {priorityLevels.map((priority) => (
                    <button
                      key={priority.value}
                      type="button"
                      onClick={() => setNewTargetPriority(priority.value)}
                      className={`p-4 rounded-xl border transition-all duration-200 flex flex-col items-center gap-2 ${
                        newTargetPriority === priority.value
                          ? `${priority.bgColor} ${priority.color} ${priority.borderColor} border-2 scale-105`
                          : 'bg-[#0a0a0a] text-[#5a5a5a] border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#8a8a8a]'
                      }`}
                    >
                      <span className="text-2xl">{priority.icon}</span>
                      <span className="text-sm font-medium">{priority.label}</span>
                      <span className="text-xs opacity-70">
                        {priority.value === 'high' && 'Urgent - tackle first'}
                        {priority.value === 'medium' && 'Important - steady focus'}
                        {priority.value === 'low' && 'Minor - when ready'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  onClick={addTarget}
                  disabled={loading || !newTarget.trim()}
                  className="px-8 py-3 bg-[#ef4444] text-white rounded-2xl hover:bg-[#dc2626] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] transition-all duration-300 font-medium"
                >
                  {loading ? 'Adding Contract...' : 'Add Kill Contract'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Filter Tabs */}
        <section className="mb-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Contracts', count: stats.total },
              { key: 'active', label: 'Active', count: stats.active },
              { key: 'completed', label: 'Killed', count: stats.completed },
              { key: 'escaped', label: 'Escaped', count: stats.escaped }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilterStatus(key)}
                className={`px-5 py-2.5 rounded-2xl font-medium transition-all duration-300 text-sm ${
                  filterStatus === key
                    ? 'bg-[#ef4444] text-white scale-105'
                    : 'bg-[#0a0a0a] text-[#8a8a8a] hover:bg-[#1a1a1a] border border-[#1a1a1a]'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </section>

        {/* Targets List */}
        {filteredTargets.length > 0 ? (
          <VirtualizedList
            items={filteredTargets}
            renderItem={renderTargetItem}
            itemHeight={220}
            maxHeight={600}
          />
        ) : (
          <div className="oura-card p-12 text-center animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <div className="text-6xl mb-4 opacity-30">🎯</div>
            <h3 className="text-xl font-semibold text-[#8a8a8a] mb-2">
              {filterStatus === 'completed' ? 'No completed contracts yet' :
               filterStatus === 'active' ? 'No active contracts' :
               'No kill contracts yet'}
            </h3>
            <p className="text-[#5a5a5a] text-sm">
              {filterStatus === 'all' ? 'Add your first contract to begin eliminating negative patterns' :
               filterStatus === 'active' ? 'All your contracts have been completed!' :
               'Complete some contracts to see them here'}
            </p>
          </div>
        )}

        {/* Oracle Modal */}
        <OracleModal
          isOpen={oracleModal.isOpen}
          onClose={() => setOracleModal({ isOpen: false, content: '', isLoading: false })}
          content={oracleModal.content}
          isLoading={oracleModal.isLoading}
        />
        
        {/* Kill Celebration Animation */}
        <KillCelebration 
          show={celebration.show} 
          targetName={celebration.targetName}
          onComplete={() => setCelebration({ show: false, targetName: '' })}
        />
      </div>
    </div>
  );
};

export default KillList;