import React, { useState, useEffect } from 'react';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  setDoc, 
  serverTimestamp,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import { db, auth, enableAnonymousAuth, enableDevMode, checkFirebaseConnection } from '../firebase';
import { writeTestDataNoAuth } from '../utils/firebaseUtils';

const FirestoreTest = () => {
  const [status, setStatus] = useState('Initializing...');
  const [testResults, setTestResults] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);

  useEffect(() => {
    initializeTests();
  }, []);

  const addTestResult = (test, success, message, data = null) => {
    const result = {
      test,
      success,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    setTestResults(prev => [...prev, result]);
    console.log(`${success ? '✅' : '❌'} ${test}: ${message}`, data || '');
  };

  const initializeTests = async () => {
    setLoading(true);
    setStatus('Running Firebase connectivity tests...');
    
    try {
      // Test 1: Check Firebase connection
      const connStatus = checkFirebaseConnection();
      setConnectionStatus(connStatus);
      addTestResult(
        'Firebase Connection', 
        connStatus.isConfigured,
        connStatus.isConfigured ? 'Firebase is properly configured' : 'Firebase configuration issues detected',
        connStatus
      );

      // Test 2: Enable anonymous authentication for testing
      try {
        const user = await enableAnonymousAuth();
        addTestResult(
          'Anonymous Authentication', 
          true,
          `Anonymous user authenticated: ${user.uid}`,
          { uid: user.uid, isAnonymous: user.isAnonymous }
        );
      } catch (error) {
        if (error.code === 'auth/admin-restricted-operation') {
          console.warn("⚠️ Anonymous auth disabled, using mock user for testing");
          const mockUser = enableDevMode();
          addTestResult(
            'Anonymous Authentication', 
            false,
            `Anonymous auth disabled. Using mock user: ${mockUser.uid}`,
            { 
              error: 'Anonymous authentication disabled in Firebase Console',
              solution: 'Go to Firebase Console → Authentication → Sign-in method → Enable Anonymous',
              mockUser: mockUser.uid,
              usingMockUser: true
            }
          );
        } else {
          addTestResult(
            'Anonymous Authentication', 
            false,
            `Authentication failed: ${error.message}`,
            { error: error.message, code: error.code }
          );
        }
      }

      // Test 3: Firestore Write Test (with auth)
      await testFirestoreWrite();

      // Test 4: Firestore Write Test (no auth required)
      await testFirestoreWriteNoAuth();

      // Test 5: Firestore Read Test
      await testFirestoreRead();

      setStatus('Tests completed');
    } catch (error) {
      addTestResult(
        'Initialization', 
        false,
        `Failed to initialize tests: ${error.message}`,
        { error: error.message }
      );
      setStatus('Tests failed');
    } finally {
      setLoading(false);
    }
  };

  const testFirestoreWrite = async () => {
    try {
      // Get current user or mock user
      let currentUser = auth.currentUser;
      
      if (!currentUser) {
        console.log("🚧 No authenticated user, using mock user for testing");
        currentUser = enableDevMode();
      }

      const testData = {
        message: 'Hello from FirestoreTest component!',
        timestamp: serverTimestamp(),
        testNumber: Math.floor(Math.random() * 1000),
        user: currentUser.uid,
        userType: currentUser.isMock ? 'mock' : (currentUser.isAnonymous ? 'anonymous' : 'authenticated'),
        environment: 'development'
      };

      // Try to write to testCollection
      const docRef = await addDoc(collection(db, 'testCollection'), testData);
      
      addTestResult(
        'Firestore Write', 
        true,
        `Successfully wrote document with ID: ${docRef.id}`,
        { docId: docRef.id, userType: testData.userType, ...testData }
      );

      // Also try writing a document with a specific ID
      const specificDocRef = doc(db, 'testCollection', 'test-doc-' + Date.now());
      await setDoc(specificDocRef, {
        ...testData,
        specificId: true,
        docId: specificDocRef.id
      });

      addTestResult(
        'Firestore Write (Specific ID)', 
        true,
        `Successfully wrote document with specific ID: ${specificDocRef.id}`,
        { docId: specificDocRef.id, userType: testData.userType }
      );

    } catch (error) {
      addTestResult(
        'Firestore Write', 
        false,
        `Write failed: ${error.message}`,
        { 
          error: error.message,
          code: error.code,
          hint: error.code === 'permission-denied' ? 'Check Firestore security rules - they may not allow writes without proper authentication' : 'Check Firebase configuration'
        }
      );
    }
  };

  const testFirestoreWriteNoAuth = async () => {
    try {
      const testData = {
        message: 'Test write without authentication',
        testNumber: Math.floor(Math.random() * 1000),
        environment: 'development',
        authMode: 'none'
      };

      const result = await writeTestDataNoAuth('testCollection', testData);
      
      addTestResult(
        'Firestore Write (No Auth)', 
        true,
        `Successfully wrote document without auth: ${result.id}`,
        { docId: result.id, authMode: 'none', ...testData }
      );

    } catch (error) {
      addTestResult(
        'Firestore Write (No Auth)', 
        false,
        `No-auth write failed: ${error.message}`,
        { 
          error: error.message,
          code: error.code,
          hint: error.code === 'permission-denied' ? 
            'Firestore rules require authentication. Deploy the updated rules that allow "if true" for testCollection' : 
            'Check Firebase configuration'
        }
      );
    }
  };

  const testFirestoreRead = async () => {
    try {
      // Read from testCollection
      const q = query(
        collection(db, 'testCollection'), 
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || 'Invalid timestamp'
      }));

      setDocuments(docs);
      
      addTestResult(
        'Firestore Read', 
        true,
        `Successfully read ${docs.length} documents from testCollection`,
        { documentCount: docs.length, documents: docs }
      );

    } catch (error) {
      addTestResult(
        'Firestore Read', 
        false,
        `Read failed: ${error.message}`,
        { 
          error: error.message,
          code: error.code,
          hint: error.code === 'permission-denied' ? 'Check Firestore security rules' : 'Check Firebase configuration'
        }
      );
    }
  };

  const clearTestData = async () => {
    setLoading(true);
    try {
      // Note: Deleting documents requires additional imports and logic
      // For now, we'll just refresh the test
      await initializeTests();
    } catch (error) {
      console.error('Failed to clear test data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-800 rounded-lg shadow-lg max-w-4xl mx-auto mt-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">🔥 Firebase & Firestore Connection Test</h2>
        <p className="text-gray-300">
          This component tests Firebase connectivity, authentication, and Firestore read/write operations.
        </p>
        <div className="mt-2 text-sm">
          <span className={`px-2 py-1 rounded ${loading ? 'bg-yellow-600' : 'bg-green-600'} text-white`}>
            Status: {status}
          </span>
        </div>
      </div>

      {/* Connection Status */}
      {connectionStatus && (
        <div className="mb-6 p-4 bg-gray-700 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-2">📊 Connection Status</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Project ID: </span>
              <span className="text-white font-mono">{connectionStatus.projectId}</span>
            </div>
            <div>
              <span className="text-gray-400">Firebase App: </span>
              <span className={connectionStatus.app ? 'text-green-400' : 'text-red-400'}>
                {connectionStatus.app ? '✅ Connected' : '❌ Not Connected'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Auth: </span>
              <span className={connectionStatus.auth ? 'text-green-400' : 'text-red-400'}>
                {connectionStatus.auth ? '✅ Ready' : '❌ Not Ready'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Firestore: </span>
              <span className={connectionStatus.db ? 'text-green-400' : 'text-red-400'}>
                {connectionStatus.db ? '✅ Ready' : '❌ Not Ready'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Test Results */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white">🧪 Test Results</h3>
          <button
            onClick={initializeTests}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Re-run Tests'}
          </button>
        </div>

        <div className="space-y-2">
          {testResults.map((result, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg border-l-4 ${
                result.success 
                  ? 'bg-green-900 border-green-400 text-green-100' 
                  : 'bg-red-900 border-red-400 text-red-100'
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">{result.test}</span>
                <span className="text-xs text-gray-400">{result.timestamp.split('T')[1].split('.')[0]}</span>
              </div>
              <p className="text-sm mt-1">{result.message}</p>
              {result.data && (
                <details className="mt-2">
                  <summary className="text-xs text-gray-400 cursor-pointer">View details</summary>
                  <pre className="text-xs mt-1 bg-gray-800 p-2 rounded overflow-auto">
                    {JSON.stringify(result.data, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Documents Display */}
      {documents.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-4">📄 Test Documents ({documents.length})</h3>
          <div className="bg-gray-700 rounded-lg p-4 max-h-60 overflow-auto">
            {documents.map((doc, index) => (
              <div key={doc.id} className="mb-3 p-2 bg-gray-600 rounded text-sm">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-green-400">{doc.id}</span>
                  <span className="text-gray-400 text-xs">
                    {doc.timestamp instanceof Date ? doc.timestamp.toLocaleString() : doc.timestamp}
                  </span>
                </div>
                <p className="text-white">{doc.message}</p>
                <div className="text-xs text-gray-400 mt-1">
                  User: {doc.user} | Test #: {doc.testNumber}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 p-4 bg-blue-900 rounded-lg border border-blue-700">
        <h4 className="text-white font-semibold mb-2">📋 Troubleshooting Guide</h4>
        <div className="text-blue-100 text-sm space-y-2">
          <div>
            <strong>Anonymous Auth Error (admin-restricted-operation):</strong>
            <ul className="ml-4 mt-1 space-y-1">
              <li>• Go to Firebase Console → Authentication → Sign-in method</li>
              <li>• Enable "Anonymous" provider and save</li>
              <li>• OR: The code will automatically use mock users for testing</li>
            </ul>
          </div>
          <div>
            <strong>Permission Denied Errors:</strong>
            <ul className="ml-4 mt-1 space-y-1">
              <li>• Deploy updated Firestore rules using: <code className="bg-gray-800 px-1 rounded">firebase deploy --only firestore:rules</code></li>
              <li>• OR: Copy rules from firestore.rules to Firebase Console</li>
              <li>• Ensure testCollection allows "read, write: if true"</li>
            </ul>
          </div>
          <div>
            <strong>Configuration Issues:</strong>
            <ul className="ml-4 mt-1 space-y-1">
              <li>• Check .env file has all VITE_FIREBASE_* variables</li>
              <li>• Verify project ID matches your Firebase project</li>
              <li>• Check browser console for detailed error messages</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirestoreTest;
