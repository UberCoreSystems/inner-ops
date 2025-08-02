export const localStorageUtils = {
  // Helper function to safely parse JSON from localStorage
  safeGetItem: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.warn(`Failed to read ${key} from localStorage:`, error);
      // Clear corrupted data
      try {
        localStorage.removeItem(key);
      } catch (clearError) {
        console.warn(`Failed to clear corrupted key ${key}:`, clearError);
      }
      return defaultValue;
    }
  },

  // Helper function to safely set items in localStorage
  safeSetItem: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Failed to write ${key} to localStorage:`, error);
      return false;
    }
  },

  // User authentication
  setUser: (user) => {
    return localStorageUtils.safeSetItem('inner_ops_user', user);
  },

  getUser: () => {
    return localStorageUtils.safeGetItem('inner_ops_user', null);
  },

  removeUser: () => {
    try {
      localStorage.removeItem('inner_ops_user');
    } catch (error) {
      console.warn('Failed to remove user from localStorage:', error);
    }
  },

  // Kill targets
  saveKillTarget: (target) => {
    const targets = localStorageUtils.getKillTargets();
    const newTarget = {
      ...target,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: 'local_user'
    };
    targets.push(newTarget);
    const success = localStorageUtils.safeSetItem('inner_ops_kill_targets', targets);
    return success ? newTarget : null;
  },

  getKillTargets: () => {
    return localStorageUtils.safeGetItem('inner_ops_kill_targets', []);
  },

  updateKillTarget: (targetId, updates) => {
    const targets = localStorageUtils.getKillTargets();
    const index = targets.findIndex(t => t.id === targetId);
    if (index !== -1) {
      targets[index] = { ...targets[index], ...updates };
      return localStorageUtils.safeSetItem('inner_ops_kill_targets', targets);
    }
    return false;
  },

  deleteKillTarget: (targetId) => {
    const targets = localStorageUtils.getKillTargets();
    const filtered = targets.filter(t => t.id !== targetId);
    return localStorageUtils.safeSetItem('inner_ops_kill_targets', filtered);
  },

  // Journal entries
  saveJournalEntry: (entry) => {
    const entries = localStorageUtils.getJournalEntries();
    const newEntry = {
      ...entry,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: 'local_user'
    };
    entries.unshift(newEntry);
    localStorage.setItem('inner_ops_journal_entries', JSON.stringify(entries));
    return newEntry;
  },

  getJournalEntries: () => {
    const entries = localStorage.getItem('inner_ops_journal_entries');
    return entries ? JSON.parse(entries) : [];
  },

  // Relapse entries
  saveRelapseEntry: (entry) => {
    const entries = localStorageUtils.getRelapseEntries();
    const newEntry = {
      ...entry,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: 'local_user'
    };
    entries.unshift(newEntry);
    localStorage.setItem('inner_ops_relapse_entries', JSON.stringify(entries));
    return newEntry;
  },

  getRelapseEntries: () => {
    const entries = localStorage.getItem('inner_ops_relapse_entries');
    return entries ? JSON.parse(entries) : [];
  },

  // Compass checks
  getCompassChecks: () => {
    const checks = localStorage.getItem('inner_ops_compass_checks');
    return checks ? JSON.parse(checks) : [];
  },

  saveCompassCheck: (check) => {
    const checks = localStorageUtils.getCompassChecks();
    const newCheck = {
      ...check,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: 'local_user'
    };
    checks.unshift(newCheck);
    localStorage.setItem('inner_ops_compass_checks', JSON.stringify(checks));
    return newCheck;
  },

  // Black Mirror methods
  getBlackMirrorEntries: () => {
    const entries = localStorage.getItem('inner_ops_black_mirror_entries');
    return entries ? JSON.parse(entries) : [];
  },

  saveBlackMirrorEntry: (data) => {
    const entries = localStorageUtils.getBlackMirrorEntries();
    const newEntry = {
      ...data,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      userId: 'local_user'
    };

    const updatedEntries = [newEntry, ...entries];
    localStorage.setItem('inner_ops_black_mirror_entries', JSON.stringify(updatedEntries));

    return newEntry;
  },
};