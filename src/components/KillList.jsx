import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getAuth } from 'firebase/auth';
import { readData, writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import OracleModal from './OracleModal';
import { debounce } from '../utils/debounce';
import VirtualizedList from './VirtualizedList';

const KillList = () => {
  const [targets, setTargets] = useState([]);
  const [newTarget, setNewTarget] = useState('');
  const [editingTarget, setEditingTarget] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [oracleModal, setOracleModal] = useState({ isOpen: false, content: '', isLoading: false });
  const [filterStatus, setFilterStatus] = useState('all');

  const auth = getAuth();
  const user = auth.currentUser;

  // Load targets from Firebase
  useEffect(() => {
    if (user) {
      loadTargets();
    }
  }, [user]);

  const loadTargets = async () => {
    try {
      const data = await readData('killTargets');
      setTargets(data || []);
    } catch (error) {
      console.error('Error loading targets:', error);
    }
  };

  const saveTargets = async (updatedTargets) => {
    try {
      await writeData('killTargets', updatedTargets);
      setTargets(updatedTargets);
    } catch (error) {
      console.error('Error saving targets:', error);
    }
  };

  const debouncedSave = useCallback(
    debounce((targets) => saveTargets(targets), 500),
    []
  );

  const addTarget = async () => {
    if (!newTarget.trim() || loading) return;

    setLoading(true);
    try {
      const target = {
        id: Date.now(),
        text: newTarget.trim(),
        progress: 0,
        createdAt: new Date().toISOString(),
        isCompleted: false
      };

      const updatedTargets = [...targets, target];
      await saveTargets(updatedTargets);
      setNewTarget('');

      // Generate Oracle feedback
      setOracleModal({ isOpen: true, content: '', isLoading: true });

      try {
        const feedback = await generateAIFeedback('killList', {
          action: 'targetAdded',
          target: target.text,
          totalTargets: updatedTargets.length
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

  const updateProgress = async (id, newProgress) => {
    const updatedTargets = targets.map(target => {
      if (target.id === id) {
        const isCompleted = newProgress >= 100;
        return { 
          ...target, 
          progress: newProgress,
          isCompleted,
          completedAt: isCompleted ? new Date().toISOString() : null
        };
      }
      return target;
    });

    debouncedSave(updatedTargets);

    // If target completed, show Oracle feedback
    if (newProgress >= 100) {
      const completedTarget = updatedTargets.find(t => t.id === id);
      setOracleModal({ isOpen: true, content: '', isLoading: true });

      try {
        const feedback = await generateAIFeedback('killList', {
          action: 'targetCompleted',
          target: completedTarget.text,
          completedTargets: updatedTargets.filter(t => t.isCompleted).length
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
  };

  const deleteTarget = async (id) => {
    const updatedTargets = targets.filter(target => target.id !== id);
    await saveTargets(updatedTargets);
  };

  const startEditing = (target) => {
    setEditingTarget(target.id);
    setEditValue(target.text);
  };

  const saveEdit = async () => {
    if (!editValue.trim()) return;

    const updatedTargets = targets.map(target => 
      target.id === editingTarget 
        ? { ...target, text: editValue.trim() }
        : target
    );

    await saveTargets(updatedTargets);
    setEditingTarget(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingTarget(null);
    setEditValue('');
  };

  const filteredTargets = useMemo(() => {
    switch (filterStatus) {
      case 'active':
        return targets.filter(target => !target.isCompleted);
      case 'completed':
        return targets.filter(target => target.isCompleted);
      default:
        return targets;
    }
  }, [targets, filterStatus]);

  const stats = useMemo(() => {
    const total = targets.length;
    const completed = targets.filter(t => t.isCompleted).length;
    const active = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, active, completionRate };
  }, [targets]);

  const getProgressColor = (progress) => {
    if (progress < 25) return 'bg-red-500';
    if (progress < 50) return 'bg-orange-500';
    if (progress < 75) return 'bg-yellow-500';
    if (progress < 100) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const renderTargetItem = useCallback(({ item: target, index }) => (
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
              <h3 className={`font-medium ${target.isCompleted ? 'line-through text-gray-400' : 'text-white'}`}>
                {target.text}
              </h3>
              <p className="text-sm text-gray-400">
                Created: {new Date(target.createdAt).toLocaleDateString()}
                {target.completedAt && (
                  <span className="ml-2 text-green-400">
                    • Completed: {new Date(target.completedAt).toLocaleDateString()}
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
            <span className="text-sm font-medium text-white">{target.progress}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(target.progress)}`}
              style={{ width: `${target.progress}%` }}
            ></div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={target.progress}
            onChange={(e) => updateProgress(target.id, parseInt(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            disabled={target.isCompleted}
          />
        </div>
      )}
    </div>
  ), [editingTarget, editValue, updateProgress, startEditing, saveEdit, cancelEdit, deleteTarget]);

  return (
    <div className="bg-gray-900 min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-red-400 mb-2">Kill List</h1>
          <p className="text-gray-400">Eliminate negative patterns and destructive habits</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <div className="text-sm text-gray-400">Completed</div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-400">{stats.completionRate}%</div>
            <div className="text-sm text-gray-400">Success Rate</div>
          </div>
        </div>

        {/* Add New Target */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-white mb-4">Add New Kill Contract</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newTarget}
              onChange={(e) => setNewTarget(e.target.value)}
              placeholder="What negative pattern will you eliminate?"
              className="flex-1 bg-gray-700 text-white p-3 rounded border border-gray-600 focus:border-red-500 focus:outline-none"
              onKeyPress={(e) => e.key === 'Enter' && addTarget()}
            />
            <button
              onClick={addTarget}
              disabled={loading || !newTarget.trim()}
              className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Adding...' : 'Add Contract'}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex space-x-1 mb-6">
          {[
            { key: 'all', label: 'All Contracts', count: stats.total },
            { key: 'active', label: 'Active', count: stats.active },
            { key: 'completed', label: 'Completed', count: stats.completed }
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