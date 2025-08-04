// Data Recovery Utility for Inner Ops
// This utility helps recover data from localStorage and migrate it to Firebase

export const inspectLocalStorageData = () => {
  console.log("🔍 Inspecting localStorage for Inner Ops data...");
  
  const dataKeys = [
    'journalEntries',
    'killTargets', 
    'relapseEntries',
    'compassChecks',
    'blackMirrorEntries',
    'userPreferences',
    'oracleFeedbacks'
  ];
  
  const foundData = {};
  let totalEntries = 0;
  
  dataKeys.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        foundData[key] = {
          exists: true,
          count: Array.isArray(parsed) ? parsed.length : (typeof parsed === 'object' ? Object.keys(parsed).length : 1),
          sample: Array.isArray(parsed) ? parsed.slice(0, 2) : parsed,
          lastModified: parsed.length > 0 && parsed[0]?.timestamp ? new Date(parsed[0].timestamp).toLocaleDateString() : 'Unknown'
        };
        totalEntries += foundData[key].count;
        console.log(`✅ Found ${key}: ${foundData[key].count} entries`);
      } else {
        foundData[key] = { exists: false, count: 0 };
        console.log(`❌ No data found for ${key}`);
      }
    } catch (error) {
      console.error(`❌ Error parsing ${key}:`, error);
      foundData[key] = { exists: false, count: 0, error: error.message };
    }
  });
  
  console.log(`📊 Total entries found: ${totalEntries}`);
  return foundData;
};

export const getLocalStorageDataSummary = () => {
  const data = inspectLocalStorageData();
  
  const summary = {
    hasData: false,
    totalEntries: 0,
    dataTypes: [],
    details: data
  };
  
  Object.entries(data).forEach(([key, info]) => {
    if (info.exists && info.count > 0) {
      summary.hasData = true;
      summary.totalEntries += info.count;
      summary.dataTypes.push(key);
    }
  });
  
  return summary;
};

export const exportLocalStorageData = () => {
  console.log("📦 Exporting all localStorage data for backup...");
  
  const dataKeys = [
    'journalEntries',
    'killTargets', 
    'relapseEntries',
    'compassChecks',
    'blackMirrorEntries',
    'userPreferences',
    'oracleFeedbacks'
  ];
  
  const exportData = {
    exportDate: new Date().toISOString(),
    userData: {}
  };
  
  dataKeys.forEach(key => {
    try {
      const data = localStorage.getItem(key);
      if (data) {
        exportData.userData[key] = JSON.parse(data);
      }
    } catch (error) {
      console.error(`Error exporting ${key}:`, error);
    }
  });
  
  return exportData;
};

// Add to window for easy browser console access
if (typeof window !== 'undefined') {
  window.dataRecovery = {
    inspect: inspectLocalStorageData,
    summary: getLocalStorageDataSummary,
    export: exportLocalStorageData
  };
}
