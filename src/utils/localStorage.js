import logger from './logger';

export const localStorageUtils = {
  // Helper function to safely parse JSON from localStorage
  safeGetItem: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      logger.warn(`Failed to read ${key} from localStorage:`, error);
      // Clear corrupted data
      try {
        localStorage.removeItem(key);
      } catch (clearError) {
        logger.warn(`Failed to clear corrupted key ${key}:`, clearError);
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
      logger.warn(`Failed to write ${key} to localStorage:`, error);
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
      logger.warn('Failed to remove user from localStorage:', error);
    }
  },

};