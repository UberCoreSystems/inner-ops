import logger from './logger';
import { writeData } from './firebaseUtils';
import { getAuth } from '../firebase';

/**
 * Comprehensive data migration from localStorage to Firestore
 * This migrates all old localStorage data to the current user's Firestore account
 */

export const dataMigration = {
  // Check localStorage for all possible old data patterns
  async findAllOldData() {
    logger.log("🔍 Scanning localStorage for old data...");
    
    const allKeys = Object.keys(localStorage);
    const oldData = {};
    
    // Map of possible old key patterns to current collection names
    const patterns = {
      'journal': 'journalEntries',
      'kill': 'killTargets',
      'lesson': 'hardLessons',
      'mirror': 'blackMirrorEntries',
      'relapse': 'relapseEntries',
      'black': 'blackMirrorEntries'
    };
    
    allKeys.forEach(key => {
      // Look for any key that matches our patterns
      for (const [pattern, collection] of Object.entries(patterns)) {
        if (key.toLowerCase().includes(pattern)) {
          try {
            const data = localStorage.getItem(key);
            const parsed = JSON.parse(data);
            
            if (!oldData[collection]) {
              oldData[collection] = [];
            }
            
            // If it's an array, add all items; if it's an object, add it
            if (Array.isArray(parsed)) {
              oldData[collection].push(...parsed);
            } else if (typeof parsed === 'object' && parsed !== null) {
              oldData[collection].push(parsed);
            }
            
            logger.log(`📦 Found ${collection} data in key: ${key}`, parsed);
          } catch (e) {
            logger.warn(`Could not parse ${key}:`, e.message);
          }
        }
      }
    });
    
    return oldData;
  },

  // Migrate all found data to Firestore for current user
  async migrateToFirestore() {
    try {
      const auth = await getAuth();
      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        logger.error("❌ No authenticated user found. Cannot migrate data.");
        throw new Error("User not authenticated");
      }
      
      logger.log("👤 Migrating data for user:", currentUser.uid);
      
      const oldData = await this.findAllOldData();
      const collections = Object.keys(oldData);
      
      if (collections.length === 0) {
        logger.log("✅ No old data found to migrate");
        return {
          success: true,
          message: "No old data found",
          migrated: 0,
          summary: {}
        };
      }
      
      logger.log(`📊 Found data in ${collections.length} collections`);
      
      const summary = {};
      let totalMigrated = 0;
      
      // Migrate each collection
      for (const collectionName of collections) {
        const items = oldData[collectionName];
        logger.log(`\n📤 Migrating ${items.length} items to ${collectionName}...`);
        
        let successCount = 0;
        let failureCount = 0;
        
        for (const item of items) {
          try {
            // Ensure the item has the current user ID
            const payload = {
              ...item,
              userId: currentUser.uid,
              migratedAt: new Date().toISOString(),
              isMigrated: true
            };
            
            // Only migrate if not already migrated
            if (!item.isMigrated) {
              await writeData(collectionName, payload);
              successCount++;
            }
          } catch (error) {
            logger.warn(`⚠️ Failed to migrate item:`, error.message);
            failureCount++;
          }
        }
        
        summary[collectionName] = {
          total: items.length,
          success: successCount,
          failed: failureCount
        };
        
        totalMigrated += successCount;
        logger.log(`✅ ${collectionName}: ${successCount}/${items.length} migrated`);
      }
      
      return {
        success: true,
        message: "Data migration completed",
        migrated: totalMigrated,
        summary: summary
      };
      
    } catch (error) {
      logger.error("❌ Migration failed:", error);
      return {
        success: false,
        error: error.message,
        migrated: 0
      };
    }
  },

  // Clear old localStorage data after successful migration (optional)
  clearOldLocalStorage(confirmed = false) {
    if (!confirmed) {
      logger.warn("⚠️ Clearing localStorage requires confirmation parameter: true");
      return false;
    }
    
    logger.log("🗑️  Clearing old localStorage data...");
    
    const patterns = ['journal', 'kill', 'lesson', 'mirror', 'relapse', 'black', 'inner_ops'];
    let clearedCount = 0;
    
    Object.keys(localStorage).forEach(key => {
      if (patterns.some(p => key.toLowerCase().includes(p))) {
        localStorage.removeItem(key);
        clearedCount++;
        logger.log(`🗑️  Cleared: ${key}`);
      }
    });
    
    logger.log(`✅ Cleared ${clearedCount} old localStorage keys`);
    return true;
  }
};

// Export individual functions for easy access
export const migrateOldDataToFirestore = () => dataMigration.migrateToFirestore();
export const findOldData = () => dataMigration.findAllOldData();
export const clearOldData = (confirmed) => dataMigration.clearOldLocalStorage(confirmed);
