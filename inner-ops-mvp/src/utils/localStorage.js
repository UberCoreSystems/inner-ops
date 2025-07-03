export const localStorageUtils = {
  // User authentication
  setUser: (user) => {
    localStorage.setItem('inner_ops_user', JSON.stringify(user));
  },

  getUser: () => {
    const user = localStorage.getItem('inner_ops_user');
    return user ? JSON.parse(user) : null;
  },

  removeUser: () => {
    localStorage.removeItem('inner_ops_user');
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
    localStorage.setItem('inner_ops_kill_targets', JSON.stringify(targets));
    return newTarget;
  },

  getKillTargets: () => {
    const targets = localStorage.getItem('inner_ops_kill_targets');
    return targets ? JSON.parse(targets) : [];
  },

  updateKillTarget: (targetId, updates) => {
    const targets = localStorageUtils.getKillTargets();
    const index = targets.findIndex(t => t.id === targetId);
    if (index !== -1) {
      targets[index] = { ...targets[index], ...updates };
      localStorage.setItem('inner_ops_kill_targets', JSON.stringify(targets));
    }
  },

  deleteKillTarget: (targetId) => {
    const targets = localStorageUtils.getKillTargets();
    const filtered = targets.filter(t => t.id !== targetId);
    localStorage.setItem('inner_ops_kill_targets', JSON.stringify(filtered));
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