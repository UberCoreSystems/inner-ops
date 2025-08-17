// Data Migration Utility for Inner Ops
// Migrates data from localStorage to Firebase with proper user authentication

import { writeData, writeUserData, readUserData } from './firebaseUtils';
import { getLocalStorageDataSummary, exportLocalStorageData } from './dataRecovery';

export const migrateLocalStorageToFirebase = async (userId) => {
  console.log("🚀 Starting data migration from localStorage to Firebase...");
  console.log("👤 Target user ID:", userId);
  
  const migrationReport = {
    startTime: new Date().toISOString(),
    userId,
    success: [],
    failures: [],
    summary: {}
  };
  
  try {
    // First, check what data we have
    const dataSummary = getLocalStorageDataSummary();
    migrationReport.summary = dataSummary;
    
    if (!dataSummary.hasData) {
      console.log("❌ No data found in localStorage to migrate");
      return migrationReport;
    }
    
    console.log(`📦 Found ${dataSummary.totalEntries} entries to migrate`);
    
    // Export all data for backup
    const backupData = exportLocalStorageData();
    console.log("💾 Created backup of localStorage data");
    
    // Migrate each data type
    const dataTypes = [
      'journalEntries',
      'killTargets', 
      'relapseEntries',
      'compassChecks',
      'blackMirrorEntries',
      'userPreferences',
      'oracleFeedbacks'
    ];
    
    for (const dataType of dataTypes) {
      try {
        const localData = localStorage.getItem(dataType);
        
        if (localData) {
          const parsedData = JSON.parse(localData);
          
          // Check if we already have data in Firebase for this type
          const existingFirebaseData = await readUserData(dataType);
          
          if (existingFirebaseData && existingFirebaseData.length > 0) {
            console.log(`⚠️ Firebase already has ${existingFirebaseData.length} ${dataType} entries`);
            console.log("🔄 Merging with localStorage data...");
            
            // Merge localStorage data with Firebase data (avoid duplicates)
            const mergedData = mergeDataArrays(existingFirebaseData, parsedData, dataType);
            await writeUserData(dataType, mergedData);
            
            migrationReport.success.push({
              dataType,
              localCount: Array.isArray(parsedData) ? parsedData.length : 1,
              firebaseCount: existingFirebaseData.length,
              mergedCount: mergedData.length,
              action: 'merged'
            });
          } else {
            // No existing Firebase data, direct migration
            await writeUserData(dataType, parsedData);
            
            migrationReport.success.push({
              dataType,
              count: Array.isArray(parsedData) ? parsedData.length : 1,
              action: 'migrated'
            });
          }
          
          console.log(`✅ Migrated ${dataType} successfully`);
        }
      } catch (error) {
        console.error(`❌ Failed to migrate ${dataType}:`, error);
        migrationReport.failures.push({
          dataType,
          error: error.message
        });
      }
    }
    
    migrationReport.endTime = new Date().toISOString();
    migrationReport.success.length > 0 
      ? console.log("✅ Migration completed successfully!")
      : console.log("⚠️ Migration completed with issues");
    
    return migrationReport;
    
  } catch (error) {
    console.error("❌ Migration failed:", error);
    migrationReport.error = error.message;
    migrationReport.endTime = new Date().toISOString();
    return migrationReport;
  }
};

// Helper function to merge data arrays without duplicates
const mergeDataArrays = (firebaseData, localData, dataType) => {
  if (!Array.isArray(firebaseData) || !Array.isArray(localData)) {
    // Handle non-array data (like preferences)
    return { ...firebaseData, ...localData };
  }
  
  // For arrays, merge and remove duplicates based on ID or timestamp
  const merged = [...firebaseData];
  
  localData.forEach(localItem => {
    const isDuplicate = merged.some(firebaseItem => {
      // Check for duplicates by ID first
      if (localItem.id && firebaseItem.id) {
        return localItem.id === firebaseItem.id;
      }
      
      // Check for duplicates by timestamp and content
      if (localItem.timestamp && firebaseItem.timestamp) {
        return localItem.timestamp === firebaseItem.timestamp && 
               JSON.stringify(localItem) === JSON.stringify(firebaseItem);
      }
      
      return false;
    });
    
    if (!isDuplicate) {
      merged.push(localItem);
    }
  });
  
  // Sort by timestamp (newest first)
  return merged.sort((a, b) => {
    const timeA = new Date(a.timestamp || a.createdAt || 0);
    const timeB = new Date(b.timestamp || b.createdAt || 0);
    return timeB - timeA;
  });
};

// Create a backup of localStorage before migration
export const createLocalStorageBackup = () => {
  const backup = exportLocalStorageData();
  const backupKey = `innerOps_backup_${Date.now()}`;
  
  try {
    localStorage.setItem(backupKey, JSON.stringify(backup));
    console.log(`💾 Created backup at key: ${backupKey}`);
    return backupKey;
  } catch (error) {
    console.error("❌ Failed to create backup:", error);
    return null;
  }
};

// Restore from backup if needed
export const restoreFromBackup = (backupKey) => {
  try {
    const backupData = localStorage.getItem(backupKey);
    if (!backupData) {
      console.error("❌ Backup not found:", backupKey);
      return false;
    }
    
    const parsed = JSON.parse(backupData);
    
    Object.entries(parsed.userData).forEach(([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data));
    });
    
    console.log("✅ Restored from backup successfully");
    return true;
  } catch (error) {
    console.error("❌ Failed to restore from backup:", error);
    return false;
  }
};
