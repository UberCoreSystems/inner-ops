import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  collection, 
  addDoc, 
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { authService } from '../utils/authService';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from '../components/OracleModal';
import { debounce } from '../utils/debounce';
import VirtualizedList from '../components/VirtualizedList';

const KillList = () => {
  const [targets, setTargets] = useState([]);
  const [newTarget, setNewTarget] = useState('');
  const [newTargetCategory, setNewTargetCategory] = useState('bad-habit');
  const [editingTarget, setEditingTarget] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const [filterStatus, setFilterStatus] = useState('all');
  
  // Reflection notes state
  const [reflectionNotes, setReflectionNotes] = useState({});
  const [showReflection, setShowReflection] = useState({});
  const [updatingReflection, setUpdatingReflection] = useState({});
  const [user, setUser] = useState(null);

  // Kill target categories
  const categories = [
    { value: 'bad-habit', label: '🚬 Bad Habit', color: 'text-red-400' },
    { value: 'negative-thought', label: '🧠 Negative Thought Pattern', color: 'text-purple-400' },
    { value: 'addiction', label: '⚡ Addiction', color: 'text-orange-400' },
    { value: 'toxic-behavior', label: '☠️ Toxic Behavior', color: 'text-yellow-400' },
    { value: 'fear', label: '😨 Fear/Anxiety', color: 'text-blue-400' },
    { value: 'procrastination', label: '⏰ Procrastination', color: 'text-green-400' },
    { value: 'other', label: '🎯 Other', color: 'text-gray-400' }
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

  // Load targets from Firebase with real-time updates
  const loadTargets = () => {
    if (!user) {
      console.log("⏳ Waiting for user authentication...");
      return;
    }

    console.log("📡 Setting up real-time listener for user:", user.uid);

    const q = query(
      collection(db, 'killTargets'),
      where('userId', '==', user.uid || 'anonymous'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const targetsData = [];
      querySnapshot.forEach((doc) => {
        targetsData.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() || new Date(doc.data().createdAt)
        });
      });
      console.log(`📋 Loaded ${targetsData.length} kill targets for user ${user.uid}`);
      setTargets(targetsData);
    }, (error) => {
      console.error('❌ Error loading targets:', error);
    });

    return () => unsubscribe();
  };

  // Set up real-time listener when user changes
  useEffect(() => {
    if (user) {
      const unsubscribe = loadTargets();
      return unsubscribe;
    }
  }, [user]);

  const addTarget = async () => {
    if (!newTarget.trim() || loading) return;

    setLoading(true);
    try {
      const targetData = {
        title: newTarget.trim(),
        description: `Eliminate this ${categories.find(c => c.value === newTargetCategory)?.label.split(' ')[1] || 'target'}`,
        category: newTargetCategory,
        status: 'active',
        priority: 'medium',
        progress: 0,
        userId: user?.uid || 'anonymous',
        targetDate: getTodaysDate(),
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'killTargets'), targetData);
      console.log('✅ Kill target added:', docRef.id);
      
      setNewTarget('');
      setNewTargetCategory('bad-habit');

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
      console.error('Error adding target:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateProgress = async (targetId, newProgress) => {
    try {
      const targetRef = doc(db, 'killTargets', targetId);
      const updateData = {
        progress: newProgress,
        lastUpdated: serverTimestamp()
      };

      // If progress reaches 100%, mark as killed
      if (newProgress >= 100) {
        updateData.status = 'killed';
        updateData.completedAt = serverTimestamp();
      }

      await updateDoc(targetRef, updateData);

      // Show Oracle feedback for completion
      if (newProgress >= 100) {
        const completedTarget = targets.find(t => t.id === targetId);
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
      await deleteDoc(doc(db, 'killTargets', targetId));
      console.log('✅ Target deleted:', targetId);
    } catch (error) {
      console.error('Error deleting target:', error);
    }
  };

  const startEditing = (target) => {
    setEditingTarget(target.id);
    setEditValue(target.title);
  };

  const saveEdit = async () => {
    if (!editValue.trim()) return;

    try {
      const targetRef = doc(db, 'killTargets', editingTarget);
      await updateDoc(targetRef, {
        title: editValue.trim(),
        lastUpdated: serverTimestamp()
      });

      setEditingTarget(null);
      setEditValue('');
    } catch (error) {
      console.error('Error updating target:', error);
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
      const targetRef = doc(db, 'killTargets', targetId);
      await updateDoc(targetRef, {
        reflectionNotes: notes.trim(),
        lastUpdated: serverTimestamp()
      });

      console.log(`✅ Reflection notes saved for target: ${targetId}`);
    } catch (error) {
      console.error("Error saving reflection notes:", error);
    } finally {
      setUpdatingReflection(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const clearReflectionNote = async (targetId) => {
    setUpdatingReflection(prev => ({ ...prev, [targetId]: true }));

    try {
      const targetRef = doc(db, 'killTargets', targetId);
      await updateDoc(targetRef, {
        reflectionNotes: '',
        lastUpdated: serverTimestamp()
      });

      setReflectionNotes(prev => ({ ...prev, [targetId]: '' }));
      console.log(`✅ Reflection notes cleared for target: ${targetId}`);
    } catch (error) {
      console.error("Error clearing reflection notes:", error);
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
    
    return (
      <div key={target.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-red-500/30 transition-all duration-200">
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
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={`font-medium ${target.status === 'killed' ? 'line-through text-gray-400' : 'text-white'}`}>
                    {target.title}
                  </h3>
                  <span className={`text-sm px-2 py-1 rounded ${category.color} bg-gray-700`}>
                    {category.label}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded uppercase font-medium ${
                    target.status === 'killed' ? 'bg-green-900/30 text-green-400' :
                    target.status === 'escaped' ? 'bg-red-900/30 text-red-400' :
                    'bg-yellow-900/30 text-yellow-400'
                  }`}>
                    {target.status}
                  </span>
                </div>
                <p className="text-sm text-gray-300 mb-1">{target.description}</p>
                <p className="text-xs text-gray-400">
                  Created: {target.createdAt instanceof Date ? target.createdAt.toLocaleDateString() : new Date(target.createdAt).toLocaleDateString()}
                  {target.targetDate && (
                    <span className="ml-2">
                      • Target Date: {new Date(target.targetDate).toLocaleDateString()}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEditing(target)}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Edit
                </button>
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Progress</span>
              <span className="text-sm font-medium text-white">{target.progress || 0}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(target.progress || 0)}`}
                style={{ width: `${target.progress || 0}%` }}
              ></div>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={target.progress || 0}
              onChange={(e) => updateProgress(target.id, parseInt(e.target.value))}
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              disabled={target.status === 'killed'}
            />

            {/* Reflection Notes Section */}
            <div className="border-t border-gray-600 pt-3 mt-3">
              <button
                onClick={() => setShowReflection(prev => ({ 
                  ...prev, 
                  [target.id]: !prev[target.id] 
                }))}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-2"
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
                    className="w-full h-16 p-2 bg-gray-600 text-white border border-gray-500 rounded text-sm resize-none focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveReflectionNote(target.id)}
                      disabled={updatingReflection[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updatingReflection[target.id] ? '⏳' : '💾'} Save
                    </button>
                    <button
                      onClick={() => clearReflectionNote(target.id)}
                      disabled={updatingReflection[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
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
  }, [editingTarget, editValue, updateProgress, startEditing, saveEdit, cancelEdit, deleteTarget, categories, 
      reflectionNotes, showReflection, updatingReflection, saveReflectionNote, clearReflectionNote]);

  return (
    <div className="bg-gray-900 min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-red-400 mb-2">Kill List</h1>
          <p className="text-gray-400">Eliminate negative patterns and destructive habits</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-gray-400">Total Contracts</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
            <div className="text-sm text-gray-400">Active</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{stats.completed}</div>
            <div className="text-sm text-gray-400">Killed</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-400">{stats.escaped}</div>
            <div className="text-sm text-gray-400">Escaped</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats.completionRate}%</div>
            <div className="text-sm text-gray-400">Success Rate</div>
          </div>
        </div>

        {/* Add New Target */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Add New Kill Contract</h2>
          <div className="space-y-4">
            {/* Target Name Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Target Name
              </label>
              <input
                type="text"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="What negative pattern will you eliminate?"
                className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
                onKeyPress={(e) => e.key === 'Enter' && addTarget()}
              />
            </div>

            {/* Category Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Category
              </label>
              <select
                value={newTargetCategory}
                onChange={(e) => setNewTargetCategory(e.target.value)}
                className="w-full bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
              >
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                onClick={addTarget}
                disabled={loading || !newTarget.trim()}
                className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Adding Contract...' : 'Add Kill Contract'}
              </button>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 mb-6">
          {[
            { key: 'all', label: 'All Contracts', count: stats.total },
            { key: 'active', label: 'Active', count: stats.active },
            { key: 'completed', label: 'Killed', count: stats.completed },
            { key: 'escaped', label: 'Escaped', count: stats.escaped }
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterStatus === key
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Targets List */}
        {filteredTargets.length > 0 ? (
          <VirtualizedList
            items={filteredTargets}
            renderItem={renderTargetItem}
            itemHeight={150}
            maxHeight={600}
          />
        ) : (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-gray-400 mb-2">
              {filterStatus === 'completed' ? 'No completed contracts yet' :
               filterStatus === 'active' ? 'No active contracts' :
               'No kill contracts yet'}
            </h3>
            <p className="text-gray-500">
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
      </div>
    </div>
  );
};

export default KillList;