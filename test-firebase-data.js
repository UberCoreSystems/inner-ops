// Test script to manually create some Firebase data for testing Dashboard
import { initializeApp } from 'firebase/app';
import { getFirestore, enableNetwork } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { writeData } from './src/utils/firebaseUtils.js';

// Import Firebase config from your app
const firebaseConfig = {
  apiKey: "AIzaSyC9xpJGzIEKJWZ7FKYnGQJ-VVdOxh0xYV4",
  authDomain: "inner-ops-25e4b.firebaseapp.com",
  projectId: "inner-ops-25e4b",
  storageBucket: "inner-ops-25e4b.firebasestorage.app",
  messagingSenderId: "372836821938",
  appId: "1:372836821938:web:ff1be7e5e08b36c81a6d0e"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function createTestData() {
  try {
    console.log("🧪 Starting Firebase test data creation...");
    
    // Sign in anonymously
    const userCredential = await signInAnonymously(auth);
    console.log("✅ Anonymous sign-in successful:", userCredential.user.uid);

    // Create test journal entry
    const journalEntry = await writeData('journalEntries', {
      content: "Test journal entry from manual script",
      mood: "🔥 Burning",
      intensity: 7,
      oracleJudgment: "The flames of transformation consume the old self. Embrace the burn."
    });
    console.log("✅ Created test journal entry:", journalEntry.id);

    // Create test relapse entry
    const relapseEntry = await writeData('relapseEntries', {
      reflection: "Test relapse reflection",
      mood: "struggling",
      intensity: 4,
      oracleJudgment: "Every fall is a lesson in gravity. Rise again."
    });
    console.log("✅ Created test relapse entry:", relapseEntry.id);

    // Create test kill target
    const killTarget = await writeData('killTargets', {
      name: "Social Media Scrolling",
      description: "Mindless scrolling that wastes time",
      urgency: 8,
      oracleJudgment: "The digital void feeds on attention. Starve it."
    });
    console.log("✅ Created test kill target:", killTarget.id);

    console.log("🎉 All test data created successfully!");
    
  } catch (error) {
    console.error("❌ Error creating test data:", error);
  }
}

createTestData();
